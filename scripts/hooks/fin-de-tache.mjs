// Hook Stop : avant de rendre la main, si du code a change (non commite) :
//  1. `npm test` (smoke, ~8 s), seulement si ces changements n'ont pas deja passe ;
//  2. si public/ a change depuis la derniere verification navigateur reussie
//     (`npm run verifier` pose le tampon), on bloque avec un rappel.
// Code 2 = Claude doit continuer (corriger / verifier). Second arret de suite
// (stop_hook_active) : on laisse passer, pour ne jamais boucler.
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RACINE, TAMPONS, signatureModifs, lireTampon } from './etat-git.mjs'

let entree = ''
for await (const morceau of process.stdin) entree += morceau
try {
  if (JSON.parse(entree || '{}').stop_hook_active) process.exit(0)
} catch {}

const CODE = ['public', 'server.js', 'db.js', 'test', 'scripts', 'package.json']
const sigCode = signatureModifs(CODE)
if (!sigCode) process.exit(0)

const problemes = []
if (lireTampon('tests-ok') !== sigCode) {
  const r = spawnSync(process.execPath, ['--test', 'test/smoke.mjs'], { cwd: RACINE, encoding: 'utf8' })
  if (r.status === 0) {
    mkdirSync(TAMPONS, { recursive: true })
    writeFileSync(path.join(TAMPONS, 'tests-ok'), sigCode)
  } else {
    problemes.push(`npm test echoue :\n${(r.stdout + r.stderr).split('\n').filter((l) => /✖|not ok|Error|assert/i.test(l)).slice(0, 15).join('\n')}`)
  }
}

const sigPublic = signatureModifs(['public'])
if (sigPublic && lireTampon('verifie') !== sigPublic) {
  problemes.push(
    'public/ a change depuis la derniere verification navigateur reussie : lancer `npm run verifier` ' +
      '(ou `npm run verifier -- --formats 390` pour aller vite), relire les captures de .verif/, puis conclure.'
  )
}

if (problemes.length) {
  console.error(problemes.join('\n\n'))
  process.exit(2)
}
