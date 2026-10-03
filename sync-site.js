// Synchronisation de la branche « Sur le site » avec les contenus publics de
// hamdy-tabsissi.com (route /api/contenus.json du portfolio : fiches publiees +
// documents SMSI).
//
// Qui possede quoi : le site possede le titre, le resume, le lien et l'existence
// des notes synchronisees ; leur position, posee une fois a la creation,
// appartient ensuite a Hamdy (deplacable dans /edit, jamais reecrite). Une note
// sans `source` est manuelle : la synchro n'y touche jamais.
//
// Garde-fou : source injoignable, en erreur, mal formee ou vide → rien n'est
// modifie ni supprime. Une panne du site ne vide jamais la carte.
import {
  getChildren,
  deleteNote,
  notesSynchronisees,
  creerNoteSynchro,
  majNoteSynchro,
  enTransaction,
} from './db.js'

export const SITE = 'https://hamdy-tabsissi.com'
// Sur la VM, le portfolio ecoute en local (nginx → 127.0.0.1:3000) : on le lit
// sans passer par Cloudflare. Ailleurs (poste de dev), l'adresse publique prend le relais.
export const SOURCES_PAR_DEFAUT = ['http://127.0.0.1:3000/api/contenus.json', `${SITE}/api/contenus.json`]
export const INTERVALLE_MS = 10 * 60_000

const TITRE_MAX = 120
const RESUME_MAX = 600
// Titres courts : le titre d'une note ouverte s'affiche en grand au centre et ne
// doit pas recouvrir ses filles (ni doubler le titre de l'accueil du SMSI).
const GROUPES = {
  pro: { titre: 'Projets pro', contenu: 'Projets professionnels publiés sur hamdy-tabsissi.com.', lien: `${SITE}/` },
  perso: { titre: 'Projets perso', contenu: 'Projets personnels publiés sur hamdy-tabsissi.com.', lien: `${SITE}/` },
  autre: { titre: 'Autres projets', contenu: 'Projets publiés sans catégorie pro ou perso.', lien: `${SITE}/` },
  smsi: { titre: 'SMSI', contenu: 'Documents publics du SMSI (ISO/IEC 27001 + RGPD).', lien: `${SITE}/smsi/` },
}
const RACINE = {
  source: 'site:racine',
  titre: 'Sur le site',
  contenu: 'Ce que hamdy-tabsissi.com publie, tenu à jour automatiquement.',
  lien: `${SITE}/`,
}

/** Dernier passage, expose (sans message d'erreur brut) par GET /api/synchro.json. */
export const etat = { derniere: null, statut: 'jamais', raison: null, stats: null }

const couper = (texte, max) => (texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte)

/**
 * Contenus valides de la reponse, ou exception si la reponse ne peut pas servir
 * de reference (format inattendu, aucun contenu exploitable). Un contenu isole
 * invalide (lien hors du site, identifiant douteux) est ecarte, pas bloquant.
 */
export function validerContenus(json, site = SITE) {
  if (!json || !Array.isArray(json.contenus)) throw new Error('format')
  const valides = []
  const vus = new Set()
  for (const c of json.contenus) {
    if (!c || typeof c !== 'object') continue
    if (typeof c.id !== 'string' || !/^(projet|smsi):[a-z0-9][a-z0-9-]{0,80}$/.test(c.id) || vus.has(c.id)) continue
    if (!Object.hasOwn(GROUPES, c.groupe)) continue
    if (typeof c.titre !== 'string' || !c.titre.trim()) continue
    if (typeof c.lien !== 'string' || !c.lien.startsWith(`${site}/`)) continue
    vus.add(c.id)
    valides.push({
      id: c.id,
      groupe: c.groupe,
      titre: couper(c.titre.trim(), TITRE_MAX),
      resume: couper(typeof c.resume === 'string' ? c.resume.trim() : '', RESUME_MAX),
      lien: c.lien,
      ordre: Number.isFinite(c.ordre) ? c.ordre : valides.length,
    })
  }
  if (!valides.length) throw new Error('vide')
  return valides
}

// --- Placement des nouvelles notes ------------------------------------------

/** (lon, lat) en degres → vecteur unite (meme convention que scene.js#pointUnite). */
function versVecteur(lon, lat) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = (lon * Math.PI) / 180
  return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)]
}

// Points candidats : spirale de Fibonacci (repartition quasi uniforme), latitude
// bornee a ±55° pour garder les titres lisibles. Calcules une fois.
const CANDIDATS = []
for (let i = 0, n = 80; i < n; i++) {
  const lat = (Math.asin(1 - (2 * (i + 0.5)) / n) * 180) / Math.PI
  if (Math.abs(lat) > 55) continue
  const lon = ((i * 137.508) % 360) - 180
  CANDIDATS.push({ x: Math.round(lon * 10) / 10, y: Math.round(lat * 10) / 10, v: versVecteur(lon, lat) })
}

/**
 * Place la plus eloignee des soeurs deja posees (manuelles comprises) : un
 * contenu publie apparait toujours dans un coin libre du globe. Deterministe.
 */
function positionLibre(parentId) {
  const soeurs = getChildren(parentId).map((n) => versVecteur(n.x, n.y))
  if (!soeurs.length) return { x: CANDIDATS[0].x, y: CANDIDATS[0].y }
  let meilleur = CANDIDATS[0]
  let meilleurEcart = -Infinity
  for (const c of CANDIDATS) {
    // Ecart = distance a la soeur la plus proche (1 - cosinus, croissant avec l'angle).
    const ecart = Math.min(...soeurs.map((s) => 1 - (c.v[0] * s[0] + c.v[1] * s[1] + c.v[2] * s[2])))
    if (ecart > meilleurEcart) {
      meilleurEcart = ecart
      meilleur = c
    }
  }
  return { x: meilleur.x, y: meilleur.y }
}

// --- Application -------------------------------------------------------------

function appliquer(contenus) {
  return enTransaction(() => {
    const existantes = new Map(notesSynchronisees().map((n) => [n.source, n]))
    const voulues = new Set()
    const stats = { creees: 0, maj: 0, retirees: 0 }

    const poser = (source, parentId, { titre, contenu, lien }) => {
      voulues.add(source)
      const n = existantes.get(source)
      if (!n) {
        const { x, y } = positionLibre(parentId)
        stats.creees++
        return creerNoteSynchro({ parent_id: parentId, x, y, titre, contenu, source, lien }).id
      }
      if (n.parent_id !== parentId || n.titre !== titre || n.contenu !== contenu || n.lien !== lien) {
        majNoteSynchro(n.id, { parent_id: parentId, titre, contenu, lien })
        stats.maj++
      }
      return n.id
    }

    const racine = poser(RACINE.source, null, RACINE)
    for (const groupe of Object.keys(GROUPES)) {
      const items = contenus.filter((c) => c.groupe === groupe).sort((a, b) => a.ordre - b.ordre)
      if (!items.length) continue
      const parent = poser(`site:groupe:${groupe}`, racine, GROUPES[groupe])
      for (const c of items) poser(`site:${c.id}`, parent, { titre: c.titre, contenu: c.resume, lien: c.lien })
    }

    // Retire du site → retire de la carte. Une note deja partie avec son parent
    // (ON DELETE CASCADE) n'est simplement pas recomptee.
    for (const [source, n] of existantes) {
      if (!voulues.has(source) && deleteNote(n.id)) stats.retirees++
    }
    return stats
  })
}

/**
 * Un passage : lit la premiere source qui repond, applique, journalise une ligne.
 * Renvoie les compteurs, ou null si rien n'a ete applique (garde-fou).
 */
export async function synchroniserSite({ sources = SOURCES_PAR_DEFAUT, site = SITE, fetch = globalThis.fetch, journal = console } = {}) {
  let contenus = null
  let raison = 'reseau'
  for (const url of sources) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } })
      if (!r.ok) {
        raison = 'http'
        continue
      }
      contenus = validerContenus(await r.json(), site)
      break
    } catch (erreur) {
      // Categorie seulement : un message d'erreur reseau peut contenir une adresse IP.
      raison = erreur?.message === 'format' || erreur?.message === 'vide' ? erreur.message : erreur?.name === 'SyntaxError' ? 'format' : 'reseau'
    }
  }
  etat.derniere = new Date().toISOString()
  if (!contenus) {
    Object.assign(etat, { statut: 'ignoree', raison, stats: null })
    journal.warn(JSON.stringify({ evenement: 'synchro_site', statut: 'ignoree', raison }))
    return null
  }
  const stats = appliquer(contenus)
  Object.assign(etat, { statut: 'ok', raison: null, stats })
  journal.log(JSON.stringify({ evenement: 'synchro_site', statut: 'ok', ...stats }))
  return stats
}
