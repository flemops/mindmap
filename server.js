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
  }
}

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

app.post('/api/write/notes', (req, res) => {
  const { parent_id, titre, contenu, x, y } = req.body ?? {}
  if (!titre || typeof titre !== 'string') {
    return res.status(400).json({ error: 'titre requis' })
  }
  const note = createNote({
    parent_id: parent_id === null || parent_id === undefined ? null : Number(parent_id),
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
  const ok = deleteNote(id)
  if (!ok) return res.status(404).json({ error: 'note introuvable' })
  res.status(204).end()
})

// --- Pages -------------------------------------------------------------

// `maxAge: 0` + ETag : le navigateur revalide a chaque chargement et recoit un
// 304 tant que le fichier n'a pas bouge. Sur trois fichiers, cela coute moins
// qu'un schema de versionnage d'URL -- et surtout, cela evite le piege
// classique : un asset modifie mais servi depuis le cache, qui fait croire
// qu'un correctif n'a pas pris.
app.use('/static', express.static(join(__dirname, 'public'), { maxAge: 0, etag: true }))

// Three.js est servi depuis node_modules plutot que recopie dans le depot :
// la version reste pilotee par package-lock.json, et rien n'est charge depuis
// un CDN -- la CSP `script-src 'self'` l'interdit de toute facon.
// `three.module.min.js` importe `./three.core.min.js` : les deux vivent dans
// ce meme dossier, ce montage suffit donc.
app.use(
  '/vendor',
  express.static(join(__dirname, 'node_modules', 'three', 'build'), { maxAge: '7d', immutable: true })
)

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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`mindmap listening on 127.0.0.1:${PORT}`)
})
