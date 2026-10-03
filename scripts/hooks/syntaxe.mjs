// Hook PostToolUse (Edit|Write|MultiEdit) : `node --check` sur le fichier JS du
// projet qui vient d'etre modifie (~0,1 s). Une erreur de syntaxe remonte tout de
// suite a Claude (code 2) au lieu d'apparaitre plus tard comme une page noire.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { RACINE } from './etat-git.mjs'

let entree = ''
for await (const morceau of process.stdin) entree += morceau
let fichier
try {
  fichier = JSON.parse(entree || '{}').tool_input?.file_path
} catch {
  process.exit(0) // entree illisible : ne jamais bloquer pour ca
}
if (!fichier || !/\.(m?js)$/.test(fichier)) process.exit(0)
const relatif = path.relative(RACINE, path.resolve(fichier))
if (relatif.startsWith('..') || relatif.includes('vendor') || relatif.includes('node_modules')) process.exit(0)

const r = spawnSync(process.execPath, ['--check', fichier], { encoding: 'utf8' })
if (r.status !== 0) {
  console.error(`Erreur de syntaxe dans ${relatif} :\n${r.stderr}`)
  process.exit(2)
}
