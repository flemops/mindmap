// Smoke test du serveur : démarre réellement `server.js` sur une base jetable
// et interroge les routes publiques.
//
// Ce n'est pas une suite de tests unitaires et ça n'essaie pas de l'être.
// C'est le garde-fou du déploiement continu (voir .github/workflows/prod-tag.yml
// et flemops/ci-templates) : le tag `prod` ne se déplace que si ce fichier
// passe, et le déploiement sur la VM se juge ensuite sur /health. Avant ce
// fichier, mindmap n'avait aucune vérification automatisée avant promotion en
// production — seul le healthcheck + rollback côté VM protégeait.
//
// Volontairement sans dépendance : node:test + fetch natif, rien à installer.
// Calqué sur test/smoke.mjs du portfolio.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.SMOKE_PORT || 3999);
const BASE = `http://127.0.0.1:${PORT}`;
const DEMARRAGE_MS = 20_000;

let travail;
let serveur;
let journal = '';

function url(chemin) {
  return `${BASE}${chemin}`;
}

async function attendreDemarrage() {
  const limite = Date.now() + DEMARRAGE_MS;
  while (Date.now() < limite) {
    if (serveur.exitCode !== null) {
      throw new Error(`server.js s'est arrêté (code ${serveur.exitCode}) :\n${journal}`);
    }
    try {
      const r = await fetch(url('/health'), { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch {
      // pas encore en écoute
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`/health n'a pas répondu en ${DEMARRAGE_MS} ms :\n${journal}`);
}

before(async () => {
  travail = mkdtempSync(path.join(tmpdir(), 'mindmap-smoke-'));
  serveur = spawn(process.execPath, ['server.js'], {
    cwd: RACINE,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(PORT),
      // Base jetable : ni la base de production ni celle du dépôt ne sont touchées.
      MINDMAP_DB_PATH: path.join(travail, 'smoke.db')
    }
  });
  serveur.stdout.on('data', (d) => (journal += d));
  serveur.stderr.on('data', (d) => (journal += d));
  await attendreDemarrage();
});

after(async () => {
  if (serveur && serveur.exitCode === null) {
    const arret = new Promise((r) => serveur.once('exit', r));
    serveur.kill('SIGTERM');
    await Promise.race([arret, new Promise((r) => setTimeout(r, 3000))]);
  }
  try {
    if (travail) rmSync(travail, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // sans importance
  }
});

test('/health répond 200 ok', async () => {
  const r = await fetch(url('/health'));
  assert.equal(r.status, 200);
  const corps = await r.json();
  assert.equal(corps.status, 'ok');
});

test('/ sert la page (index.html)', async () => {
  const r = await fetch(url('/'));
  assert.equal(r.status, 200);
  const corps = await r.text();
  assert.ok(corps.length > 0, '/ a répondu un corps vide');
});

test('/edit sert la page (Access la protège en amont, pas ce serveur)', async () => {
  const r = await fetch(url('/edit'));
  assert.equal(r.status, 200);
});

test('/api/notes/root répond avec les six notes racine du seed initial, dans l\'ordre', async () => {
  // Une base neuve (MINDMAP_DB_PATH inexistant) déclenche seed() dans db.js :
  // exactement six notes de premier niveau, "Bienvenue" en tête. Une assertion
  // "children est un tableau" passerait avec un tableau vide et ne
  // détecterait ni un `parent_id IS ?` réécrit en `= ?` (silencieux en
  // SQLite : NULL = NULL est faux), ni un seed() cassé. Comparer la liste
  // complète des titres, dans l'ordre, vérifie en plus le ORDER BY id.
  const r = await fetch(url('/api/notes/root'));
  assert.equal(r.status, 200);
  const corps = await r.json();
  assert.equal(corps.note.id, null);
  assert.equal(corps.children.length, 6);
  assert.equal(corps.children[0].titre, 'Bienvenue');
  assert.deepEqual(
    corps.children.map((n) => n.titre),
    ['Bienvenue', 'Comment ça marche', 'Projets', 'Sécurité', 'Infra', 'À propos']
  );
});

test('/api/notes/:id sur « Projets » renvoie ses 3 notes filles, dont « Portfolio »', async () => {
  const racine = await (await fetch(url('/api/notes/root'))).json();
  const projets = racine.children.find((n) => n.titre === 'Projets');
  assert.ok(projets, 'la note « Projets » manque à la racine');

  const r = await fetch(url(`/api/notes/${projets.id}`));
  assert.equal(r.status, 200);
  const corps = await r.json();
  assert.equal(corps.note.titre, 'Projets');
  assert.equal(corps.children.length, 3);
  assert.ok(
    corps.children.some((n) => n.titre === 'Portfolio'),
    '« Portfolio » manque parmi les filles de « Projets »'
  );
});

test('/api/notes/999999 (id inexistant) répond 404', async () => {
  const r = await fetch(url('/api/notes/999999'));
  assert.equal(r.status, 404);
});

test('un corps JSON malformé sur /api/write échoue proprement (400, pas une pile d\'appels)', async () => {
  // Ce serveur n'implémente aucune authentification (Access la garantit en
  // amont) : ce test ne vérifie pas un refus d'accès. Il vérifie le
  // gestionnaire d'erreur applicatif (server.js) qui existe précisément pour
  // qu'un corps JSON invalide ne fasse pas fuir de pile d'appels ni de
  // fragment de la requête dans le journal — un {} bien formé n'atteint
  // jamais ce chemin (il s'arrête plus tôt, sur "titre requis").
  const r = await fetch(url('/api/write/notes'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{ceci nest pas du json'
  });
  assert.equal(r.status, 400);
  const corps = await r.json();
  assert.equal(corps.error, 'requete invalide');
  assert.ok(!/at .*server\.js:/.test(JSON.stringify(corps)), 'la réponse laisse fuir une pile d\'appels');
});

test('{} sur /api/write/notes échoue sur la validation applicative (titre requis)', async () => {
  const r = await fetch(url('/api/write/notes'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(r.status, 400);
  const corps = await r.json();
  assert.equal(corps.error, 'titre requis');
});

test('écriture → lecture → suppression : le chemin DB réel fonctionne de bout en bout', async () => {
  // Le plus important des cas non couverts jusqu'ici : /health ne touche
  // jamais SQLite (server.js), donc rien ne garantissait qu'une écriture
  // aboutisse vraiment avant ce test.
  const creation = await fetch(url('/api/write/notes'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parent_id: null, titre: 'Note de test smoke', contenu: 'temporaire' })
  });
  assert.equal(creation.status, 201);
  const note = await creation.json();
  assert.equal(note.titre, 'Note de test smoke');
  assert.ok(Number.isInteger(note.id));

  const lecture = await fetch(url(`/api/notes/${note.id}`));
  assert.equal(lecture.status, 200);
  const relue = await lecture.json();
  assert.equal(relue.note.titre, 'Note de test smoke');

  const deplacement = await fetch(url(`/api/write/notes/${note.id}`), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ x: 42, y: -7 })
  });
  assert.equal(deplacement.status, 200);
  assert.equal((await deplacement.json()).x, 42);

  const suppression = await fetch(url(`/api/write/notes/${note.id}`), { method: 'DELETE' });
  assert.equal(suppression.status, 204);

  const apresSuppression = await fetch(url(`/api/notes/${note.id}`));
  assert.equal(apresSuppression.status, 404);
});
