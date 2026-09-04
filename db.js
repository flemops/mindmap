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
      "Chaque note est posee sur un globe et contient ses propres notes. Cliquez une note pour entrer dedans.",
    x: 20,
    y: 12,
  })
  const comment = createNote({
    parent_id: bienvenue.id,
    titre: 'Comment ca marche',
    contenu: 'Un clic entre dans une note et revele ses notes filles. Le bouton remonter revient au niveau precedent.',
    x: -55,
    y: 28,
  })
  createNote({
    parent_id: comment.id,
    titre: 'Naviguer',
    contenu: 'Molette : zoom. Glisser : deplacer la vue. Alt + glisser : orbiter autour du globe.',
    x: -30,
    y: 20,
  })
  createNote({
    parent_id: comment.id,
    titre: 'Structure',
    contenu: 'Chaque note porte une longitude et une latitude : sa place sur le globe de sa note parente.',
    x: 70,
    y: -18,
  })
  const projets = createNote({
    parent_id: bienvenue.id,
    titre: 'Projets',
    contenu: 'Une selection de projets, organises en sous-notes.',
    x: 110,
    y: -22,
  })
  createNote({
    parent_id: projets.id,
    titre: 'Portfolio',
    contenu: 'hamdy-tabsissi.com - Express, EJS, canvas 2D, auto-heberge.',
    x: -40,
    y: 30,
  })
  createNote({
    parent_id: projets.id,
    titre: 'EventMap',
    contenu: "Carte culturelle d'evenements franciliens, FastAPI + Leaflet.",
    x: 60,
    y: -30,
  })
  createNote({
    parent_id: bienvenue.id,
    titre: 'A propos',
    contenu: 'Cette mindmap est une piece de portfolio : Three.js, sans librairie de mind-map.',
    x: -150,
    y: -35,
  })
}
