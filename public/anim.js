// Minuteur d'interpolation partage par toute l'appli (scene.js, app.js ;
// controls.js n'en a pas besoin directement). Point de decision unique pour
// reduced-motion : une duree a 0 rend `cb(1)` de facon synchrone, ce qui fait
// sauter directement au dernier etat sans jamais planifier de frame -- plus
// fiable qu'un easing a duree non nulle qu'on esperait imperceptible.

export const easeOutCubic = (p) => 1 - (1 - p) ** 3

// Evaluee a l'appel (pas au chargement du module) : un visiteur peut changer
// la preference systeme pendant la session, la prochaine navigation doit en tenir compte.
export const dureeAnim = (ms) => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms)

// cb(p) recoit une progression deja passee dans `easing`. duree <= 0 resout
// immediatement apres avoir pose l'etat final : aucun rAF planifie, donc aucun
// risque de double application si l'appelant enchaine un autre tween au meme tick.
export function tween(duree, cb, easing = easeOutCubic) {
  return new Promise((resoudre) => {
    if (duree <= 0) {
      cb(1)
      resoudre()
      return
    }
    const debut = performance.now()
    const pas = (t) => {
      const p = Math.min(1, (t - debut) / duree)
      cb(easing(p))
      p < 1 ? requestAnimationFrame(pas) : resoudre()
    }
    requestAnimationFrame(pas)
  })
}
