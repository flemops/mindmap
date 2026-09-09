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

test('/api/notes/root répond avec la racine virtuelle et ses enfants', async () => {
  const r = await fetch(url('/api/notes/root'));
  assert.equal(r.status, 200);
  const corps = await r.json();
  assert.equal(corps.note.id, null);
  assert.ok(Array.isArray(corps.children));
});

test('/api/notes/999999 (id inexistant) répond 404', async () => {
  const r = await fetch(url('/api/notes/999999'));
  assert.equal(r.status, 404);
});

test('une écriture sans session Access échoue proprement (400, pas une pile d\'appels)', async () => {
  // Ce serveur n'implémente aucune authentification (Access la garantit en
  // amont) : ce test ne vérifie pas un refus d'accès, seulement que la route
  // valide bien son corps et ne fuit pas d'erreur interne.
  const r = await fetch(url('/api/write/notes'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(r.status, 400);
});
