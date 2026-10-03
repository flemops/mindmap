// Toute l'authentification est geree en amont par Cloudflare Access, en
// path-policy sur /edit* et /api/write/* (voir ETAT-CHANTIERS.md du depot
// atelier-claude pour la configuration exacte). Ce serveur n'implemente et
// ne doit JAMAIS implementer de logique de mot de passe : Access garantit
// que ces routes ne sont atteintes que par une session deja authentifiee.
import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  getNoteOrRoot,
  getChildren,
  createNote,
  updateNote,
  updatePosition,
  deleteNote,
} from './db.js'
import { synchroniserSite, etat as etatSynchro, SOURCES_PAR_DEFAUT, INTERVALLE_MS } from './sync-site.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3020

const app = express()
app.disable('x-powered-by')

// Les en-tetes de securite sont poses en PREMIER : montes plus bas, ils
// manqueraient aux reponses d'erreur emises avant le routage.
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'"
  )
  next()
})

// Le parseur JSON est monte UNIQUEMENT sur le prefixe d'ecriture, jamais
// globalement. Monte en `app.use(...)` global, il s'executait avant le routage
// sur n'importe quel chemin : un visiteur non authentifie pouvait, depuis une
// route publique, declencher une erreur de parsing dont le message recopie le
// debut de son propre corps de requete -- donc ecrire dans le journal systeme
// a volonte, et y forger des lignes. Aucun chemin public n'a besoin de lire un
// corps JSON : restreindre le parseur supprime le vecteur a la racine.
app.use('/api/write', express.json({ limit: '256kb' }))

// --- Lecture : publique, toujours ------------------------------------------

function serializeNote(note) {
  if (!note) return null
  return {
    id: note.id,
    parent_id: note.parent_id,
    x: note.x,
    y: note.y,
    titre: note.titre,
    contenu: note.contenu,
    // Notes issues du site (sync-site.js) : identifiant de source et page d'origine.
    source: note.source ?? null,
    lien: note.lien ?? null,
  }
}

// Etat de la derniere synchro avec le site, sans message d'erreur brut (une
// erreur reseau peut contenir une adresse) : de quoi verifier la prod d'un curl.
app.get('/api/synchro.json', (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(etatSynchro)
})

app.get('/api/notes/:id', (req, res) => {
  const id = req.params.id === 'root' ? null : Number(req.params.id)
  if (id !== null && !Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' })

  const note = getNoteOrRoot(id)
  if (!note) return res.status(404).json({ error: 'note introuvable' })

  const children = getChildren(id).map(serializeNote)
  res.json({ note: serializeNote(note), children })
})

// --- Ecriture : jamais atteinte sans une session Access valide -------------
// (le prefixe /api/write/ est le contrat avec la path-policy Cloudflare Access)

// La branche « Sur le site » appartient a la synchro : titre, contenu et
// existence s'y modifient sur le site, pas ici (ils seraient ecrases ou
// recrees au passage suivant, et une note manuelle glissee dedans disparaitrait
// avec elle). Seule la position reste libre (PATCH .../position).
const issueDuSite = (id) => Boolean(id !== null && getNoteOrRoot(id)?.source)
const refusSite = (res) => res.status(409).json({ error: 'note issue du site : à modifier sur hamdy-tabsissi.com' })

app.post('/api/write/notes', (req, res) => {
  const { parent_id, titre, contenu, x, y } = req.body ?? {}
  if (!titre || typeof titre !== 'string') {
    return res.status(400).json({ error: 'titre requis' })
  }
  const parentId = parent_id === null || parent_id === undefined ? null : Number(parent_id)
  if (issueDuSite(parentId)) return refusSite(res)
  const note = createNote({
    parent_id: parentId,
    titre,
    contenu: typeof contenu === 'string' ? contenu : '',
    x: Number(x) || 0,
    y: Number(y) || 0,
  })
  res.status(201).json(serializeNote(note))
})

app.put('/api/write/notes/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' })

  if (issueDuSite(id)) return refusSite(res)
  const { titre, contenu, x, y } = req.body ?? {}
  const note = updateNote(id, { titre, contenu, x, y })
  if (!note) return res.status(404).json({ error: 'note introuvable' })
  res.json(serializeNote(note))
})

app.patch('/api/write/notes/:id/position', (req, res) => {
  const id = Number(req.params.id)
  const { x, y } = req.body ?? {}
  if (!Number.isInteger(id) || typeof x !== 'number' || typeof y !== 'number') {
    return res.status(400).json({ error: 'id/x/y invalides' })
  }
  const note = updatePosition(id, x, y)
  if (!note) return res.status(404).json({ error: 'note introuvable' })
  res.json(serializeNote(note))
})

app.delete('/api/write/notes/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalide' })
  if (issueDuSite(id)) return refusSite(res)
  const ok = deleteNote(id)
  if (!ok) return res.status(404).json({ error: 'note introuvable' })
  res.status(204).end()
})

// --- Pages -------------------------------------------------------------

// Vendor monte AVANT /static : le dossier porte sa version dans son nom
// (three-0.185.1, camera-controls-3.1.2), une montee de version = un nouveau
// dossier -- l'ancien n'est jamais reecrit en place -- donc `immutable` est sur.
app.use(
  '/static/vendor',
  express.static(join(__dirname, 'public', 'vendor'), { maxAge: '7d', immutable: true })
)

// `maxAge: 0` + ETag : le navigateur revalide a chaque chargement et recoit un
// 304 tant que le fichier n'a pas bouge. Sur les fichiers de public/, cela coute
// moins qu'un schema de versionnage d'URL -- et surtout, cela evite le piege
// classique : un asset modifie mais servi depuis le cache, qui fait croire
// qu'un correctif n'a pas pris.
app.use('/static', express.static(join(__dirname, 'public'), { maxAge: 0, etag: true }))

app.get('/edit', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'))
})

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'))
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Gestionnaire d'erreur applicatif. Sans lui, Express passe la main a
// finalhandler, qui journalise `err.stack` -- et le message d'une erreur de
// parsing JSON contient le debut du corps envoye par le client, retours a la
// ligne compris. On ne journalise donc QUE des champs que le serveur maitrise,
// et on ne renvoie ni pile ni message d'origine. Cette protection ne depend pas
// de NODE_ENV : elle tient meme si l'unite systemd perd sa variable un jour.
app.use((err, req, res, next) => {
  const statut = Number.isInteger(err?.status) ? err.status : 500
  console.error(
    JSON.stringify({ evenement: 'erreur_requete', methode: req.method, chemin: req.path, statut, type: err?.type ?? err?.name ?? 'inconnu' })
  )
  if (res.headersSent) return next(err)
  res.status(statut).json({ error: statut === 400 ? 'requete invalide' : 'erreur serveur' })
})

// Synchro avec le site : au demarrage puis toutes les 10 min. SITE_SYNC=off la
// coupe (tests, verificateur) ; SITE_CONTENUS_URL force une source unique.
if (process.env.SITE_SYNC !== 'off') {
  const sources = process.env.SITE_CONTENUS_URL ? [process.env.SITE_CONTENUS_URL] : SOURCES_PAR_DEFAUT
  const passage = () =>
    synchroniserSite({ sources }).catch((erreur) =>
      console.error(JSON.stringify({ evenement: 'synchro_site', statut: 'erreur', type: erreur?.name ?? 'inconnu' }))
    )
  passage()
  setInterval(passage, INTERVALLE_MS).unref()
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`mindmap listening on 127.0.0.1:${PORT}`)
})
