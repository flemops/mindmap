// Fonctions de dessin pures : ne touchent a aucun etat applicatif, ne font
// aucun appel reseau. app.js leur passe l'etat courant a chaque frame.

/** Rayon d'une bulle en fonction de la longueur du titre. */
export function rayonNote(titre) {
  return Math.max(48, Math.min(96, 40 + titre.length * 2.2))
}

// Le canvas ne resout pas les variables CSS : `ctx.font = "... var(--display)"`
// echoue silencieusement et retombe sur la police par defaut. On lit donc les
// jetons ici, une fois, pour les passer au canvas sous forme de valeurs.
export function lireJetonsCouleur() {
  const style = getComputedStyle(document.documentElement)
  return {
    fond: style.getPropertyValue('--bg').trim(),
    surface: style.getPropertyValue('--surface').trim(),
    bordure: style.getPropertyValue('--border').trim(),
    texte: style.getPropertyValue('--text').trim(),
    texteAttenue: style.getPropertyValue('--text-muted').trim(),
    accent: style.getPropertyValue('--accent').trim(),
    police: style.getPropertyValue('--display').trim() || 'system-ui, sans-serif',
  }
}

/** Convertit une coordonnee monde (relative a la note courante) en coordonnee ecran. */
export function mondeVersEcran(x, y, transform, largeur, hauteur) {
  return {
    x: largeur / 2 + (x + transform.tx) * transform.scale,
    y: hauteur / 2 + (y + transform.ty) * transform.scale,
  }
}

export function ecranVersMonde(sx, sy, transform, largeur, hauteur) {
  return {
    x: (sx - largeur / 2) / transform.scale - transform.tx,
    y: (sy - hauteur / 2) / transform.scale - transform.ty,
  }
}

function texteMultiligne(ctx, texte, cx, cy, largeurMax, tailleLigne) {
  const mots = texte.split(/\s+/)
  const lignes = []
  let ligne = ''
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot
    if (ctx.measureText(essai).width > largeurMax && ligne) {
      lignes.push(ligne)
      ligne = mot
    } else {
      ligne = essai
    }
  }
  if (ligne) lignes.push(ligne)
  const depart = cy - ((lignes.length - 1) * tailleLigne) / 2
  lignes.forEach((l, i) => ctx.fillText(l, cx, depart + i * tailleLigne))
}

/**
 * Dessine la scene courante : la note focus au centre (discrete, en fond) et
 * ses notes filles disposees selon leur (x, y). `opacite` permet le fondu
 * d'entree apres un changement de niveau.
 */
export function dessinerScene(ctx, { largeur, hauteur, enfants, transform, couleurs, survole, opacite }) {
  ctx.clearRect(0, 0, largeur, hauteur)
  ctx.fillStyle = couleurs.fond
  ctx.fillRect(0, 0, largeur, hauteur)

  ctx.save()
  ctx.globalAlpha = opacite

  const centre = mondeVersEcran(0, 0, transform, largeur, hauteur)

  // Fils discrets du centre vers chaque bulle : montre la structure sans viser/reticuler.
  ctx.strokeStyle = couleurs.bordure
  ctx.lineWidth = 1
  for (const n of enfants) {
    const p = mondeVersEcran(n.x, n.y, transform, largeur, hauteur)
    ctx.beginPath()
    ctx.moveTo(centre.x, centre.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  for (const n of enfants) {
    const p = mondeVersEcran(n.x, n.y, transform, largeur, hauteur)
    const rayon = Math.max(4, rayonNote(n.titre) * transform.scale)
    const estSurvole = survole === n.id

    ctx.beginPath()
    ctx.arc(p.x, p.y, rayon, 0, Math.PI * 2)
    ctx.fillStyle = couleurs.surface
    ctx.fill()
    ctx.lineWidth = estSurvole ? 2 : 1
    ctx.strokeStyle = estSurvole ? couleurs.accent : couleurs.bordure
    ctx.stroke()

    ctx.fillStyle = couleurs.texte
    ctx.font = `600 ${Math.max(9, 15 * transform.scale)}px ${couleurs.police}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (rayon > 20) {
      texteMultiligne(ctx, n.titre, p.x, p.y, rayon * 1.5, 16 * transform.scale)
    }
  }

  ctx.restore()
}

/** Renvoie la note dont la bulle contient (sx, sy) en coordonnees ecran, ou null. */
export function trouverNoteSousPointeur(sx, sy, enfants, transform, largeur, hauteur) {
  for (let i = enfants.length - 1; i >= 0; i--) {
    const n = enfants[i]
    const p = mondeVersEcran(n.x, n.y, transform, largeur, hauteur)
    const rayon = rayonNote(n.titre) * transform.scale
    const dx = sx - p.x
    const dy = sy - p.y
    if (dx * dx + dy * dy <= rayon * rayon) return n
  }
  return null
}
