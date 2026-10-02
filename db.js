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

// Données d'exemple, posées une seule fois, quand la base n'existe pas encore.
// x = longitude (-180..180), y = latitude (-60..60). Les six racines sont
// réparties autour du globe ; les filles d'une même note sont écartées d'au
// moins 70° de longitude pour ne pas se chevaucher.
function seed() {
  const poser = (parent_id, titre, contenu, x, y) =>
    createNote({ parent_id, titre, contenu, x, y })

  const bienvenue = poser(null, 'Bienvenue',
    "Chaque note est posée sur un globe et contient ses propres notes. Cliquez une note pour l'ouvrir.", 0, 25)
  poser(bienvenue.id, 'Naviguer',
    'Molette : zoom. Glisser : orbiter. Clic droit + glisser : déplacer la vue. Clic : ouvrir une note.', -90, 15)
  poser(bienvenue.id, 'Rechercher',
    'La touche « / » ouvre la recherche. Entrée vole vers la note trouvée, Échap ferme.', 90, -15)

  const comment = poser(null, 'Comment ça marche',
    'Le principe en trois notes : la structure des données, la navigation dans un seul monde, la séparation lecture / écriture.', 60, -20)
  poser(comment.id, 'Structure',
    'Chaque note porte une longitude et une latitude : sa place sur le globe de sa note parente. Une seule table SQLite récursive : notes(id, parent_id).', -120, 20)
  poser(comment.id, 'Un seul monde',
    'Ouvrir une note fait apparaître ses filles autour d\'elle, dans le même espace. Le niveau précédent reste visible.', 0, -25)
  poser(comment.id, 'Lecture et écriture',
    'La lecture est publique. /edit et /api/write sont protégés par Cloudflare Access : le serveur n\'a aucune logique de mot de passe.', 120, 10)

  const projets = poser(null, 'Projets',
    'Une sélection de projets, chacun détaillé dans une sous-note.', 120, 10)
  poser(projets.id, 'Portfolio',
    'hamdy-tabsissi.com — Node/Express, EJS, node:sqlite, nginx et tunnel cloudflared, auto-hébergé sur une VM Oracle.', -120, -15)
  poser(projets.id, 'EventMap',
    "eventmap.hamdy-tabsissi.com — carte d'événements culturels franciliens. FastAPI/Python, Leaflet, SQLite.", 0, 25)
  poser(projets.id, 'Observatory',
    "Service d'observation des agents et de l'infra, dépôt flemops/observatory, derrière Cloudflare Access.", 120, -20)

  const securite = poser(null, 'Sécurité',
    'Trois piliers : Cloudflare Access en amont, une CSP stricte, des sauvegardes testées.', 180, -25)
  poser(securite.id, 'Cloudflare Access',
    "Authentification en amont, avec une path-policy sur /edit et /api/write. L'origine n'est joignable que par le tunnel.", -120, 10)
  poser(securite.id, 'CSP stricte',
    "script-src 'self', aucun asset distant. Three.js et ses addons sont vendorés dans public/vendor/.", 0, -20)
  poser(securite.id, 'Sauvegardes',
    'Litestream + restic vers Cloudflare R2, restauration testée. CrowdSec tourne sur la VM.', 120, 25)

  const infra = poser(null, 'Infra',
    'Tout tourne sur une VM Oracle, exposée uniquement à travers un tunnel Cloudflare.', -120, 20)
  poser(infra.id, 'VM Oracle',
    "ARM, Ubuntu, services systemd. Elle n'écoute que sur 127.0.0.1.", -120, 25)
  poser(infra.id, 'Tunnel cloudflared',
    'Aucun port ouvert : tout passe par Cloudflare.', 0, -15)
  poser(infra.id, 'n8n et Guacamole',
    'Automatisations n8n ; accès RDP dans le navigateur via Guacamole. Tous deux derrière Access.', 120, 15)

  const apropos = poser(null, 'À propos',
    "Ce qu'est cette carte, et qui l'a faite.", -60, -10)
  poser(apropos.id, 'Pièce de portfolio',
    'Mindmap fractale à navigation spatiale : Three.js, un globe par note, aucune librairie de mind-map.', -90, -20)
  poser(apropos.id, 'Auteur',
    'Hamdy Tabsissi, développeur. Cette carte est le pendant visuel du portfolio.', 90, 20)
}
