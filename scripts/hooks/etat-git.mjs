// Signature des modifications non commitees sous des chemins donnes (diff + fichiers
// nouveaux, contenu compris) : sert de tampon « deja verifie » aux hooks et au
// verificateur. null = rien n'a change par rapport a HEAD.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const TAMPONS = path.join(RACINE, '.verif')

export function signatureModifs(chemins) {
  // stderr ignore : les avertissements de fins de ligne (CRLF) ne doivent pas polluer les hooks.
  const git = (...a) => execFileSync('git', a, { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const diff = git('diff', 'HEAD', '--', ...chemins)
  const nouveaux = git('ls-files', '--others', '--exclude-standard', '--', ...chemins).split('\n').filter(Boolean)
  if (!diff && !nouveaux.length) return null
  const h = createHash('sha1').update(diff)
  for (const f of nouveaux) h.update(f).update(readFileSync(path.join(RACINE, f)))
  return h.digest('hex')
}

export function lireTampon(nom) {
  try {
    return readFileSync(path.join(TAMPONS, nom), 'utf8').trim()
  } catch {
    return null
  }
}
