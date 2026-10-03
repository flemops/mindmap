// Verification navigateur de bout en bout, a lancer apres toute modification de
// public/ : demarre server.js sur une base jetable, joue les parcours essentiels
// dans un vrai Chrome (headless, WebGL logiciel) au doigt (319 et 390 px) et a la
// souris (1440 px), et echoue sur toute erreur console ou attente non tenue.
//
//   npm run verifier                       jeu de donnees fixe (3 niveaux), 3 formats
//   npm run verifier -- --prod             copie locale de l'arbre public de la prod
//   npm run verifier -- --exemple          donnees d'exemple de db.js (base neuve)
//   npm run verifier -- --url https://...  serveur deja lance (ex. la prod), rien n'est demarre
//   npm run verifier -- --formats 390      formats au choix : 319, 390, 1440
//   npm run verifier -- --comparer .verif/empreinte-avant.json
//
// Sorties dans .verif/ (ignore par git) : <format>-<etape>.png a relire, et
// empreinte.json = etat numerique de chaque noeud (role, visibilite, echelle,
// couleur, opacites) a chaque etape. --comparer echoue si cet etat a change :
// filet de securite pour remanier scene.js sans changer le rendu.
//
// Chrome : celui du systeme (CHROME_PATH sinon emplacements usuels). Aucun
// navigateur n'est telecharge (playwright-core seul).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { chromium } from 'playwright-core'
import { signatureModifs } from './hooks/etat-git.mjs'

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SORTIE = path.join(RACINE, '.verif')
const PROD = 'https://mindmap.hamdy-tabsissi.com'
const args = process.argv.slice(2)
const option = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null }
const drapeau = (nom) => args.includes(nom)

const FORMATS = {
  319: { viewport: { width: 319, height: 884 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
}
const formats = (option('--formats') ?? '319,390,1440').split(',').filter((f) => FORMATS[f])
const PAUSE_VOL = 2600 // ms : vol (600 ms) + amorti camera (~2 s) avant de mesurer

const CHROME = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(existsSync)
if (!CHROME) {
  console.error('Chrome introuvable : definir CHROME_PATH.')
  process.exit(2)
}

// --- Serveur jetable --------------------------------------------------------

let serveur = null
let travail = null

// Jeu de donnees par defaut : fixe, a trois niveaux (calque sur la prod), pour que
// le parcours exerce tous les roles (ouverte, enfant, petit, voisin, ancetre) et
// que l'empreinte couvre tous les reglages de apparence.js#ROLES.
const ARBRE_FIXE = [
  ['Accueil', 20, 12, 'Chaque note est posée sur un globe et contient ses propres notes.', [
    ['Guide', -60, 25, 'Comment naviguer.', [['Naviguer', 30, 10, ''], ['Structure', -40, -20, '']]],
    ['Projets', 70, -10, 'Une sélection de projets.', [['Portfolio', 0, 30, ''], ['EventMap', 120, -15, '']]],
    ['À propos', 180, 5, ''],
  ]],
  ['Seconde racine', -120, -30, '', [['Note A', 10, 10, '']]],
]

function creerBase(fichier) {
  const db = new DatabaseSync(fichier)
  db.exec(`CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER REFERENCES notes(id) ON DELETE CASCADE, x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0, titre TEXT NOT NULL, contenu TEXT NOT NULL DEFAULT '');`)
  return db
}

function creerFixe(fichier) {
  const db = creerBase(fichier)
  const inserer = db.prepare('INSERT INTO notes (parent_id, x, y, titre, contenu) VALUES (?, ?, ?, ?, ?)')
  const poser = (parent, [titre, x, y, contenu, filles = []]) => {
    const { lastInsertRowid } = inserer.run(parent, x, y, titre, contenu)
    for (const f of filles) poser(Number(lastInsertRowid), f)
  }
  for (const racine of ARBRE_FIXE) poser(null, racine)
  db.close()
}

/** Copie l'arbre public de la prod (lecture seule, memes ids et positions). */
async function copierProd(fichier) {
  const db = creerBase(fichier)
  const inserer = db.prepare('INSERT INTO notes (id, parent_id, x, y, titre, contenu) VALUES (?, ?, ?, ?, ?, ?)')
  const copier = async (id) => {
    const { children } = await (await fetch(`${PROD}/api/notes/${id ?? 'root'}`)).json()
    for (const n of children) {
      inserer.run(n.id, n.parent_id, n.x, n.y, n.titre, n.contenu)
      await copier(n.id)
    }
  }
  await copier(null)
  db.close()
}

async function demarrerServeur() {
  travail = mkdtempSync(path.join(tmpdir(), 'mindmap-verif-'))
  const base = path.join(travail, 'verif.db')
  // --exemple : base neuve, server.js y pose ses donnees d'exemple (db.js#seed).
  if (drapeau('--prod')) await copierProd(base)
  else if (!drapeau('--exemple')) creerFixe(base)
  const port = Number(process.env.VERIF_PORT ?? 3998)
  serveur = spawn(process.execPath, ['server.js'], {
    cwd: RACINE,
    env: { ...process.env, PORT: String(port), MINDMAP_DB_PATH: base },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let journal = ''
  serveur.stdout.on('data', (d) => (journal += d))
  serveur.stderr.on('data', (d) => (journal += d))
  const url = `http://127.0.0.1:${port}`
  for (const limite = Date.now() + 20_000; Date.now() < limite; await new Promise((r) => setTimeout(r, 200))) {
    if (serveur.exitCode !== null) throw new Error(`server.js arrete (code ${serveur.exitCode}) :\n${journal}`)
    try {
      if ((await fetch(`${url}/health`)).ok) return url
    } catch {}
  }
  throw new Error(`/health muet apres 20 s :\n${journal}`)
}

async function arreterServeur() {
  // Windows garde la base verrouillee tant que le processus vit : attendre sa fin.
  if (serveur && serveur.exitCode === null) {
    const fin = new Promise((r) => serveur.once('exit', r))
    serveur.kill()
    await fin
  }
  if (travail) rmSync(travail, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

// --- Verifications ----------------------------------------------------------

const echecs = []
const empreinte = {}
function verifier(condition, libelle) {
  console.log(`${condition ? '  ✔' : '  ✘'} ${libelle}`)
  if (!condition) echecs.push(libelle)
}

/** Etat numerique de chaque noeud cree : ce qu'appliquerEtat a ecrit, sans le bruit de camera. */
const lireEmpreinte = (page) => page.evaluate(async () => {
  const s = await import('/static/scene.js')
  const r = (x) => Math.round(x * 1000) / 1000
  const ids = [null, ...[...document.querySelectorAll('.etiquette')].map((e) => Number(e.dataset.id))]
  const etat = {}
  for (const id of ids) {
    const n = s.noeud(id)
    if (!n) continue
    etat[id ?? 'racine'] = {
      role: n.role,
      visible: n.ancre ? n.ancre.visible : true,
      bille: n.bille ? [n.bille.visible, r(n.bille.scale.x), n.bille.material.color.getHexString()] : null,
      halo: n.halo ? r(n.halo.material.opacity) : null,
      trait: n.trait ? r(n.trait.material.opacity) : null,
      globe: n.grille ? [n.grille.visible, r(n.grille.material.opacity), r(n.grille.scale.x), r(n.verre.material.opacity)] : null,
      tier: n.etiquette ? [...n.etiquette.element.classList].find((c) => /--(ouverte|enfant|petit|cachee)$/.test(c)) : null,
    }
  }
  return etat
})

const filAriane = (page) => page.evaluate(() => [...document.querySelectorAll('#fil-ariane li')].map((l) => l.textContent.trim()))
const debordement = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

/** Centre a l'ecran de l'etiquette ou de la bille d'une note (ids : robustes aux titres en double). */
const positionEtiquette = (page, id) => page.waitForFunction((id) => {
  const e = document.querySelector(`.etiquette[data-id="${id}"]`)
  const r = e?.getBoundingClientRect()
  return r && r.width && getComputedStyle(e).opacity > 0.05 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
}, id, { timeout: 10_000 }).then((h) => h.jsonValue())

const positionBille = (page, id) => page.evaluate(async (id) => {
  const s = await import('/static/scene.js')
  const v = s.noeud(id).bille.getWorldPosition(s.camera.position.clone()).project(s.camera)
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }
}, id)

async function parcours(navigateur, nom, url, arbre) {
  const f = FORMATS[nom]
  const tactile = Boolean(f.hasTouch)
  console.log(`\n${nom} px (${tactile ? 'doigt' : 'souris'})`)
  const ctx = await navigateur.newContext(f)
  const page = await ctx.newPage()
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()))
  const viser = (p) => (tactile ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y))
  const etape = async (titre) => {
    await page.screenshot({ path: path.join(SORTIE, `${nom}-${titre}.png`) })
    empreinte[`${nom}/${titre}`] = await lireEmpreinte(page)
    verifier((await debordement(page)) <= 0, `${titre} : pas de debordement horizontal`)
  }
  const { R, C } = arbre

  await page.goto(url)
  await positionEtiquette(page, R.id)
  await page.waitForTimeout(800)
  verifier(await page.isVisible('#aide'), 'racine : aide de premiere visite affichee')
  const bloom = await page.evaluate(async () => (await import('/static/scene.js')).BLOOM_ACTIF)
  verifier(bloom === !tactile, `bloom ${bloom ? 'actif' : 'coupe'} (attendu : ${tactile ? 'coupe sur telephone' : 'actif sur bureau'})`)
  await etape('1-racine')

  await viser(await positionEtiquette(page, R.id))
  await page.waitForTimeout(PAUSE_VOL)
  let fil = await filAriane(page)
  verifier(fil.at(-1) === R.titre, `ouvrir « ${R.titre} » par son etiquette (fil : ${fil.join(' › ')})`)
  verifier(!(await page.isVisible('#aide')), 'aide masquee une fois une note ouverte')
  const roles = await page.evaluate(async ([r, filles]) => {
    const s = await import('/static/scene.js')
    return { ouverte: s.noeud(r).role, filles: filles.map((id) => s.noeud(id)?.role) }
  }, [R.id, arbre.fillesR])
  verifier(roles.ouverte === 'ouverte' && roles.filles.every((x) => x === 'enfant'), `roles apres ouverture : ouverte + ${roles.filles.length} enfant(s)`)
  await etape('2-ouverte')

  if (C) {
    // Doigt : 8 px a cote de la bille (tolerance de visee). Souris : en plein centre.
    const b = await positionBille(page, C.id)
    await viser(tactile ? { x: b.x + 8, y: b.y + 5 } : b)
    await page.waitForTimeout(PAUSE_VOL)
    fil = await filAriane(page)
    verifier(fil.at(-1) === C.titre, `ouvrir « ${C.titre} » par sa bille${tactile ? ' (8 px a cote)' : ''}`)
    const anc = await page.evaluate(async (r) => { const n = (await import('/static/scene.js')).noeud(r); return [n.role, n.bille.visible] }, R.id)
    verifier(anc[0] === 'ancetre' && anc[1] === false, 'ancetre sans bille (pas de grand disque)')
    await etape('3-fille')

    if (tactile) await page.tap('#bouton-remonter')
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(PAUSE_VOL)
    fil = await filAriane(page)
    verifier(fil.at(-1) === R.titre, `remonter (${tactile ? 'bouton' : 'Echap'})`)
  }

  if (f.viewport.width <= 560) {
    const hauteur = () => page.evaluate(() => document.querySelector('#panneau-note').getBoundingClientRect().height)
    const avant = await hauteur()
    await page.tap('#bouton-replier')
    await page.waitForTimeout(1200)
    const apres = await hauteur()
    verifier(apres < avant / 2 && (await page.getAttribute('#bouton-replier', 'aria-expanded')) === 'false', `replier le panneau (${Math.round(avant)} → ${Math.round(apres)} px)`)
    await etape('4-replie')
    await page.tap('#bouton-replier')
    await page.waitForTimeout(600)
  }

  if (C) {
    await (tactile ? page.tap('#champ-recherche') : page.click('#champ-recherche'))
    await page.keyboard.type(C.titre)
    const resultat = await page.waitForSelector('#resultats li[data-i]', { timeout: 10_000 })
    if (tactile) await resultat.tap()
    else await page.keyboard.press('Enter')
    await page.waitForTimeout(PAUSE_VOL)
    fil = await filAriane(page)
    verifier(fil.at(-1) === C.titre, `recherche « ${C.titre} » (${tactile ? 'tap' : 'Entree'})`)
    await etape('5-recherche')
  }

  verifier(erreurs.length === 0, `aucune erreur console${erreurs.length ? ' : ' + erreurs.join(' | ') : ''}`)
  await ctx.close()
}

/**
 * Une racine R et une de ses filles C, de preference une C qui a elle-meme des
 * filles : le parcours exerce alors tous les roles (ouverte, enfant, petit,
 * voisin, ancetre), donc l'empreinte couvre tous les reglages de apparence.js#ROLES.
 */
async function lireArbre(url) {
  const enfants = async (id) => (await (await fetch(`${url}/api/notes/${id ?? 'root'}`)).json()).children
  let repli = null
  for (const R of await enfants(null)) {
    const filles = await enfants(R.id)
    if (!filles.length) continue
    const arbre = { R, C: filles[0], fillesR: filles.map((n) => n.id) }
    repli ??= arbre
    for (const C of filles) if ((await enfants(C.id)).length) return { ...arbre, C }
  }
  if (repli) return repli
  const [R] = await enfants(null)
  return { R, C: null, fillesR: [] }
}

function comparer(fichier) {
  const avant = JSON.parse(readFileSync(fichier, 'utf8'))
  const diffs = []
  // Seulement les etapes jouees cette fois : --formats peut en restreindre la liste.
  for (const cle of Object.keys(empreinte)) {
    const a = JSON.stringify(avant[cle]), b = JSON.stringify(empreinte[cle])
    if (a === b) continue
    for (const id of new Set([...Object.keys(avant[cle] ?? {}), ...Object.keys(empreinte[cle] ?? {})])) {
      const x = JSON.stringify(avant[cle]?.[id]), y = JSON.stringify(empreinte[cle]?.[id])
      if (x !== y) diffs.push(`${cle} note ${id} : ${x} → ${y}`)
    }
  }
  verifier(diffs.length === 0, `empreinte identique a ${path.basename(fichier)}${diffs.length ? ' :\n      ' + diffs.slice(0, 12).join('\n      ') : ''}`)
}

// --- Principal ---------------------------------------------------------------

mkdirSync(SORTIE, { recursive: true })
let navigateur
try {
  const url = option('--url') ?? (await demarrerServeur())
  const arbre = await lireArbre(url)
  console.log(`Serveur : ${url} · note testee : « ${arbre.R.titre} »${arbre.C ? ` › « ${arbre.C.titre} »` : ''}`)
  navigateur = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  for (const nom of formats) await parcours(navigateur, nom, url, arbre)
  writeFileSync(path.join(SORTIE, 'empreinte.json'), JSON.stringify(empreinte, null, 1))
  if (option('--comparer')) comparer(option('--comparer'))
  // Tampon lu par le hook de fin de tache : cet etat de public/ a ete verifie en
  // local. Pas pour --url : ce serait le code de la cible, pas celui-ci.
  if (!echecs.length && !option('--url')) writeFileSync(path.join(SORTIE, 'verifie'), signatureModifs(['public']) ?? '')
} catch (erreur) {
  echecs.push(String(erreur?.stack ?? erreur))
  console.error(erreur)
} finally {
  await navigateur?.close()
  await arreterServeur()
}
console.log(echecs.length ? `\n✘ ${echecs.length} echec(s). Captures : .verif/` : '\n✔ Tout est vert. Captures : .verif/')
process.exit(echecs.length ? 1 : 0)
