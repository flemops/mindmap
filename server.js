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
app.use(express.json({ limit: '256kb' }))

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

app.get('/edit', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'))
})

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'))
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`mindmap listening on 127.0.0.1:${PORT}`)
})
