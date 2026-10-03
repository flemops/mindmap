// Synchronisation « Sur le site » (sync-site.js) : d'abord dans le processus,
// avec une fausse source, sur une base jetable ; puis de bout en bout, un vrai
// server.js alimente par un faux /api/contenus.json, pour les blocages d'ecriture.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const travail = mkdtempSync(path.join(tmpdir(), 'mindmap-synchro-'))
// AVANT l'import : db.js ouvre sa base au chargement du module.
process.env.MINDMAP_DB_PATH = path.join(travail, 'unitaire.db')
const { synchroniserSite, etat } = await import('../sync-site.js')
const { db, updatePosition } = await import('../db.js')

const SITE = 'https://hamdy-tabsissi.com'
const BASE = [
  { id: 'projet:alpha', groupe: 'pro', titre: 'Alpha', resume: 'Projet alpha', lien: `${SITE}/projet/alpha`, ordre: 0 },
  { id: 'projet:beta', groupe: 'perso', titre: 'Beta', resume: '', lien: `${SITE}/projet/beta`, ordre: 1 },
  { id: 'projet:gamma', groupe: 'autre', titre: 'Gamma', resume: '', lien: `${SITE}/projet/gamma`, ordre: 2 },
  { id: 'smsi:politique-ssi', groupe: 'smsi', titre: 'Politique SSI', resume: 'Résumé', lien: `${SITE}/smsi/politique-ssi.html`, ordre: 0 },
]
const source = (contenus) => async () => ({ ok: true, status: 200, json: async () => ({ contenus }) })
const silencieux = { log() {}, warn() {} }
const passer = (fetch, sources = ['fausse']) => synchroniserSite({ sources, fetch, journal: silencieux })
const parSource = (s) => db.prepare('SELECT * FROM notes WHERE source = ?').get(s)
const instantane = () => JSON.stringify(db.prepare('SELECT * FROM notes ORDER BY id').all())
const manuelles = () => JSON.stringify(db.prepare('SELECT * FROM notes WHERE source IS NULL ORDER BY id').all())

let manuellesAvant
before(() => {
  manuellesAvant = manuelles()
})

test('création : racine « Sur le site », groupes, contenus avec leur lien', async () => {
  const stats = await passer(source(BASE))
  assert.deepEqual(stats, { creees: 9, maj: 0, retirees: 0 }) // 1 racine + 4 groupes + 4 contenus
  const racine = parSource('site:racine')
  assert.equal(racine.titre, 'Sur le site')
  assert.equal(racine.parent_id, null)
  const alpha = parSource('site:projet:alpha')
  assert.equal(alpha.parent_id, parSource('site:groupe:pro').id)
  assert.equal(alpha.lien, `${SITE}/projet/alpha`)
  assert.equal(alpha.contenu, 'Projet alpha')
  assert.equal(parSource('site:groupe:pro').parent_id, racine.id)
  assert.equal(manuelles(), manuellesAvant, 'aucune note manuelle touchée')
})

test('placement : chaque groupe à 55-90° de son plus proche voisin (ni collé, ni au dos du globe)', () => {
  const vecteur = ({ x, y }) => {
    const phi = ((90 - y) * Math.PI) / 180, theta = (x * Math.PI) / 180
    return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)]
  }
  const angle = (a, b) => (Math.acos(Math.min(1, a.reduce((s, v, i) => s + v * b[i], 0))) * 180) / Math.PI
  const groupes = db.prepare("SELECT x, y FROM notes WHERE source LIKE 'site:groupe:%'").all().map(vecteur)
  assert.equal(groupes.length, 4)
  for (const g of groupes) {
    const voisin = Math.min(...groupes.filter((h) => h !== g).map((h) => angle(g, h)))
    assert.ok(voisin >= 55 && voisin <= 90, `plus proche voisin à ${voisin.toFixed(0)}°`)
  }
})

test('relance sans changement : rien ne bouge', async () => {
  const avant = instantane()
  assert.deepEqual(await passer(source(BASE)), { creees: 0, maj: 0, retirees: 0 })
  assert.equal(instantane(), avant)
})

test('mise à jour du titre : la position choisie par Hamdy est gardée', async () => {
  const alpha = parSource('site:projet:alpha')
  updatePosition(alpha.id, 42, 7)
  const modifie = BASE.map((c) => (c.id === 'projet:alpha' ? { ...c, titre: 'Alpha 2' } : c))
  assert.deepEqual(await passer(source(modifie)), { creees: 0, maj: 1, retirees: 0 })
  const apres = parSource('site:projet:alpha')
  assert.equal(apres.titre, 'Alpha 2')
  assert.equal(apres.x, 42)
  assert.equal(apres.y, 7)
})

test('changement de groupe : la note suit, le groupe vidé disparaît', async () => {
  const contenus = BASE.map((c) => (c.id === 'projet:gamma' ? { ...c, groupe: 'pro' } : c))
  const stats = await passer(source(contenus))
  assert.equal(stats.retirees, 1)
  assert.equal(parSource('site:projet:gamma').parent_id, parSource('site:groupe:pro').id)
  assert.equal(parSource('site:groupe:autre'), undefined)
})

test('contenu retiré du site : retiré de la carte (et son groupe s’il est vide)', async () => {
  const contenus = BASE.filter((c) => c.id !== 'projet:beta').map((c) => (c.id === 'projet:gamma' ? { ...c, groupe: 'pro' } : c))
  const stats = await passer(source(contenus))
  assert.equal(parSource('site:projet:beta'), undefined)
  assert.equal(parSource('site:groupe:perso'), undefined)
  assert.ok(stats.retirees >= 1)
  assert.equal(manuelles(), manuellesAvant, 'aucune note manuelle touchée')
})

test('garde-fous : panne, erreur, format inattendu ou source vide ne changent rien', async () => {
  const avant = instantane()
  const cas = [
    [async () => { throw new TypeError('fetch failed 10.0.0.1') }, 'reseau'],
    [async () => ({ ok: false, status: 500 }), 'http'],
    [async () => ({ ok: true, status: 200, json: async () => ({}) }), 'format'],
    [async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('json') } }), 'format'],
    [source([]), 'vide'],
    [source([{ ...BASE[0], lien: 'https://ailleurs.example/x' }]), 'vide'],
  ]
  for (const [fetch, raison] of cas) {
    assert.equal(await passer(fetch), null)
    assert.equal(etat.statut, 'ignoree')
    assert.equal(etat.raison, raison)
    assert.ok(!JSON.stringify(etat).includes('10.0.0.1'), "jamais d'adresse dans l'état exposé")
  }
  assert.equal(instantane(), avant)
})

test('contenu douteux écarté, les autres passent ; titre trop long coupé', async () => {
  const contenus = [
    ...BASE,
    { id: 'projet:intrus', groupe: 'pro', titre: 'Intrus', resume: '', lien: 'https://ailleurs.example/x', ordre: 9 },
    { id: 'projet:../../x', groupe: 'pro', titre: 'Chemin', resume: '', lien: `${SITE}/x`, ordre: 10 },
    { id: 'projet:long', groupe: 'pro', titre: 'T'.repeat(300), resume: '', lien: `${SITE}/projet/long`, ordre: 11 },
  ]
  await passer(source(contenus))
  assert.equal(parSource('site:projet:intrus'), undefined)
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notes WHERE source LIKE '%..%'").get().n, 0)
  assert.equal(parSource('site:projet:long').titre.length, 120)
})

test('première source en panne : la suivante prend le relais', async () => {
  const appels = []
  const fetch = async (url) => {
    appels.push(url)
    if (url === 'interne') throw new TypeError('ECONNREFUSED')
    return source(BASE)()
  }
  assert.notEqual(await passer(fetch, ['interne', 'publique']), null)
  assert.deepEqual(appels, ['interne', 'publique'])
  assert.equal(etat.statut, 'ok')
})

// --- De bout en bout ------------------------------------------------------------

const PORT = Number(process.env.SYNCHRO_PORT || 3996)
let fausseSource
let serveur
let journal = ''
const url = (chemin) => `http://127.0.0.1:${PORT}${chemin}`

test('bout en bout : server.js synchronise au démarrage et protège la branche', async () => {
  fausseSource = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ contenus: BASE }))
  })
  await new Promise((r) => fausseSource.listen(0, '127.0.0.1', r))
  serveur = spawn(process.execPath, ['server.js'], {
    cwd: RACINE,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(PORT),
      MINDMAP_DB_PATH: path.join(travail, 'bout-en-bout.db'),
      SITE_CONTENUS_URL: `http://127.0.0.1:${fausseSource.address().port}/contenus.json`,
      SITE_SYNC: 'on',
    },
  })
  serveur.stdout.on('data', (d) => (journal += d))
  serveur.stderr.on('data', (d) => (journal += d))

  let synchro = null
  for (const limite = Date.now() + 20_000; Date.now() < limite; await new Promise((r) => setTimeout(r, 200))) {
    try {
      synchro = await (await fetch(url('/api/synchro.json'))).json()
      if (synchro.statut === 'ok') break
    } catch {}
  }
  assert.equal(synchro?.statut, 'ok', `synchro non faite :\n${journal}`)
  assert.deepEqual(synchro.stats, { creees: 9, maj: 0, retirees: 0 })

  const racine = await (await fetch(url('/api/notes/root'))).json()
  const surLeSite = racine.children.find((n) => n.source === 'site:racine')
  assert.ok(surLeSite, 'racine « Sur le site » absente')
  assert.equal(surLeSite.lien, `${SITE}/`)
  assert.equal(racine.children.filter((n) => !n.source).length, 6, 'les six racines du seed restent')

  const groupes = (await (await fetch(url(`/api/notes/${surLeSite.id}`))).json()).children
  const pro = groupes.find((g) => g.source === 'site:groupe:pro')
  const alpha = (await (await fetch(url(`/api/notes/${pro.id}`))).json()).children[0]
  assert.equal(alpha.lien, `${SITE}/projet/alpha`)

  const ecrire = (methode, chemin, corps) =>
    fetch(url(chemin), { method: methode, headers: { 'Content-Type': 'application/json' }, body: corps && JSON.stringify(corps) })
  assert.equal((await ecrire('PUT', `/api/write/notes/${alpha.id}`, { titre: 'X', contenu: '' })).status, 409)
  assert.equal((await ecrire('DELETE', `/api/write/notes/${alpha.id}`)).status, 409)
  assert.equal((await ecrire('POST', '/api/write/notes', { parent_id: pro.id, titre: 'Glissée' })).status, 409)
  assert.equal((await ecrire('PATCH', `/api/write/notes/${alpha.id}/position`, { x: 10, y: 5 })).status, 200)
  assert.equal((await ecrire('POST', '/api/write/notes', { parent_id: null, titre: 'Manuelle' })).status, 201)
})

after(async () => {
  db.close()
  fausseSource?.close()
  if (serveur && serveur.exitCode === null) {
    const fin = new Promise((r) => serveur.once('exit', r))
    serveur.kill()
    await Promise.race([fin, new Promise((r) => setTimeout(r, 3000))])
  }
  try {
    rmSync(travail, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {}
})
