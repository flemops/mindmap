// Couche de donnees : notes recursives (parent_id -> notes filles).
// node:sqlite est experimental (Node 22+) mais suffisant pour ce volume de
// donnees et evite une dependance externe pour une piece de portfolio.
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.MINDMAP_DB_PATH || join(__dirname, 'mindmap.db')
const isNewDb = !existsSync(DB_PATH)

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS notes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    x         REAL NOT NULL DEFAULT 0,
    y         REAL NOT NULL DEFAULT 0,
    titre     TEXT NOT NULL,
    contenu   TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id);
`)

const queries = {
  getNote: db.prepare('SELECT * FROM notes WHERE id = ?'),
  getChildren: db.prepare('SELECT * FROM notes WHERE parent_id IS ? ORDER BY id'),
  insertNote: db.prepare(
    'INSERT INTO notes (parent_id, x, y, titre, contenu) VALUES (?, ?, ?, ?, ?)'
  ),
  updateNote: db.prepare(
    'UPDATE notes SET titre = ?, contenu = ?, x = ?, y = ? WHERE id = ?'
  ),
  updatePosition: db.prepare('UPDATE notes SET x = ?, y = ? WHERE id = ?'),
  deleteNote: db.prepare('DELETE FROM notes WHERE id = ?'),
}

/** Une note "racine" virtuelle (id null) : ses filles sont les notes de premier niveau. */
export function getNoteOrRoot(id) {
  if (id === null) return { id: null, parent_id: null, titre: 'Racine', contenu: '', x: 0, y: 0 }
  return queries.getNote.get(id) ?? null
}

export function getChildren(parentId) {
  return queries.getChildren.all(parentId)
}

export function createNote({ parent_id, titre, contenu, x, y }) {
  const result = queries.insertNote.run(parent_id, x ?? 0, y ?? 0, titre, contenu ?? '')
  return queries.getNote.get(result.lastInsertRowid)
}

export function updateNote(id, { titre, contenu, x, y }) {
  const existing = queries.getNote.get(id)
  if (!existing) return null
  queries.updateNote.run(
    titre ?? existing.titre,
    contenu ?? existing.contenu,
    x ?? existing.x,
    y ?? existing.y,
    id
  )
  return queries.getNote.get(id)
}

export function updatePosition(id, x, y) {
  const existing = queries.getNote.get(id)
  if (!existing) return null
  queries.updatePosition.run(x, y, id)
  return queries.getNote.get(id)
}

export function deleteNote(id) {
  const existing = queries.getNote.get(id)
  if (!existing) return false
  queries.deleteNote.run(id)
  return true
}

if (isNewDb) {
  seed()
}

function seed() {
  const bienvenue = createNote({
    parent_id: null,
    titre: 'Bienvenue',
    contenu:
      "Chaque note peut contenir d'autres notes. Cliquez sur une bulle pour zoomer a l'interieur.",
    x: 0,
    y: 0,
  })
  const comment = createNote({
    parent_id: bienvenue.id,
    titre: 'Comment ca marche',
    contenu: 'Un clic zoome dans une note pour voir ses notes filles. Le bouton retour remonte.',
    x: -140,
    y: -80,
  })
  createNote({
    parent_id: comment.id,
    titre: 'Navigation',
    contenu: 'Clic = zoomer. Bouton retour (ou Echap) = remonter d\'un niveau.',
    x: -60,
    y: -50,
  })
  createNote({
    parent_id: comment.id,
    titre: 'Structure',
    contenu: 'Chaque note a une position (x, y) relative a sa note parente.',
    x: 90,
    y: 40,
  })
  const projets = createNote({
    parent_id: bienvenue.id,
    titre: 'Projets',
    contenu: 'Une selection de projets, organises en sous-notes.',
    x: 160,
    y: 60,
  })
  createNote({
    parent_id: projets.id,
    titre: 'Portfolio',
    contenu: 'hamdy-tabsissi.com - Express, EJS, canvas 2D, auto-heberge.',
    x: -100,
    y: 60,
  })
  createNote({
    parent_id: projets.id,
    titre: 'EventMap',
    contenu: 'Carte culturelle d\'evenements franciliens, FastAPI + Leaflet.',
    x: 100,
    y: -40,
  })
  createNote({
    parent_id: bienvenue.id,
    titre: 'A propos',
    contenu: 'Cette mindmap est elle-meme une piece de portfolio : canvas vanilla JS, sans librairie tierce.',
    x: -20,
    y: 170,
  })
}
