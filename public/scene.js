// Scene 3D : un globe filaire, les notes posees a sa surface. Aucune lumiere
// n'est necessaire (materiaux "basic") -- la scene est un trace, pas un rendu
// realiste, ce qui la garde lisible et peu couteuse.
import * as THREE from '/vendor/three.module.min.js'

// Direction artistique reprise de hamdy-tabsissi.com/monde. Zone volontairement
// hors-theme : la scene reste sombre meme en `prefers-color-scheme: light`,
// donc les couleurs sont litterales ici (meme exception que .tuile-multivers).
export const COULEURS = {
  fond: 0x08070f,
  globe: 0x26243a,
  note: 0xe6b450,
  noteSurvol: 0xffdf9e,
  etoile: 0x6f6b85,
}

export const RAYON_GLOBE = 100
const RAYON_NOTE = 4.5

export const scene = new THREE.Scene()
scene.background = new THREE.Color(COULEURS.fond)

export const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

const raycaster = new THREE.Raycaster()
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(RAYON_GLOBE, 24, 16),
  new THREE.MeshBasicMaterial({ color: COULEURS.globe, wireframe: true, transparent: true, opacity: 0.35 })
)
scene.add(globe)

// Sphere pleine invisible : sert de cible au raycast pour convertir un clic
// dans le vide en coordonnees (longitude, latitude) lors d'une creation.
const globeCible = new THREE.Mesh(
  new THREE.SphereGeometry(RAYON_GLOBE, 24, 16),
  new THREE.MeshBasicMaterial({ visible: false })
)
scene.add(globeCible)

scene.add(champDEtoiles())

/** Groupe recree a chaque changement de niveau : contient les notes du niveau. */
let groupeNotes = new THREE.Group()
scene.add(groupeNotes)

export function attacher(element) {
  element.appendChild(renderer.domElement)
  redimensionner()
}

export function redimensionner() {
  const l = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(l, h)
  camera.aspect = l / h
  camera.updateProjectionMatrix()
}

export function rendu() {
  renderer.render(scene, camera)
}

/**
 * Distance a laquelle le globe tient entierement dans le cadre, etiquettes
 * comprises. Calculee depuis le ratio de l'ecran : sur un telephone en
 * portrait, c'est le champ horizontal qui contraint, pas le vertical -- une
 * distance fixe y ferait sortir les notes du cadre.
 */
export function distanceCadrage(marge = 1.6) {
  const champVertical = THREE.MathUtils.degToRad(camera.fov)
  const champHorizontal = 2 * Math.atan(Math.tan(champVertical / 2) * camera.aspect)
  return (RAYON_GLOBE * marge) / Math.tan(Math.min(champVertical, champHorizontal) / 2)
}

/** (longitude, latitude) en degres -> point a la surface du globe. */
export function positionSpherique(lonDeg, latDeg, rayon = RAYON_GLOBE) {
  const phi = THREE.MathUtils.degToRad(90 - clampLat(latDeg))
  const theta = THREE.MathUtils.degToRad(lonDeg)
  return new THREE.Vector3(
    rayon * Math.sin(phi) * Math.cos(theta),
    rayon * Math.cos(phi),
    rayon * Math.sin(phi) * Math.sin(theta)
  )
}

function clampLat(lat) {
  return Math.max(-85, Math.min(85, lat))
}

/**
 * L'etiquette se pose legerement au-dessus de sa bille, jamais dessus : les
 * sprites font toujours face a la camera, un simple decalage vertical suffit
 * donc quel que soit l'angle d'orbite.
 */
function positionEtiquette(positionBille) {
  return positionBille.clone().multiplyScalar(1.04).add(new THREE.Vector3(0, RAYON_NOTE * 2.6, 0))
}

/** Point 3D -> (longitude, latitude) en degres, pour reecrire x/y en base. */
export function lonLatDepuisPoint(point) {
  const p = point.clone().normalize()
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(p.y))
  const lon = THREE.MathUtils.radToDeg(Math.atan2(p.z, p.x))
  return { lon, lat }
}

/**
 * Remplace les notes affichees. Chaque note devient une bille a la surface et
 * une etiquette texte legerement au-dessus.
 */
export function poserNotes(notes) {
  scene.remove(groupeNotes)
  groupeNotes.traverse((objet) => {
    if (objet.geometry) objet.geometry.dispose()
    if (objet.material) {
      if (objet.material.map) objet.material.map.dispose()
      objet.material.dispose()
    }
  })
  groupeNotes = new THREE.Group()

  for (const note of notes) {
    const position = positionSpherique(note.x, note.y)

    const bille = new THREE.Mesh(
      new THREE.SphereGeometry(RAYON_NOTE, 16, 12),
      new THREE.MeshBasicMaterial({ color: COULEURS.note })
    )
    bille.position.copy(position)
    bille.userData.note = note
    groupeNotes.add(bille)

    const etiquette = etiquetteTexte(note.titre)
    etiquette.position.copy(positionEtiquette(position))
    etiquette.userData.note = note
    groupeNotes.add(etiquette)
  }

  scene.add(groupeNotes)
}

export function surlignerNote(id) {
  for (const objet of groupeNotes.children) {
    if (!objet.isMesh || !objet.userData.note) continue
    objet.material.color.setHex(objet.userData.note.id === id ? COULEURS.noteSurvol : COULEURS.note)
    objet.scale.setScalar(objet.userData.note.id === id ? 1.35 : 1)
  }
}

/** Deplace une note deja affichee (glisser en mode edition). */
export function deplacerNote(id, lon, lat) {
  const position = positionSpherique(lon, lat)
  for (const objet of groupeNotes.children) {
    if (objet.userData.note?.id !== id) continue
    if (objet.isSprite) objet.position.copy(positionEtiquette(position))
    else objet.position.copy(position)
  }
}

/** Note sous le pointeur (coordonnees ecran), ou null. */
export function noteSousPointeur(sx, sy) {
  preparerRaycast(sx, sy)
  const touches = raycaster.intersectObjects(groupeNotes.children, false)
  return touches.length > 0 ? touches[0].object.userData.note : null
}

/** Point du globe sous le pointeur, ou null si le clic vise le vide. */
export function pointGlobeSousPointeur(sx, sy) {
  preparerRaycast(sx, sy)
  const touches = raycaster.intersectObject(globeCible, false)
  return touches.length > 0 ? touches[0].point : null
}

function preparerRaycast(sx, sy) {
  const pointeur = new THREE.Vector2(
    (sx / window.innerWidth) * 2 - 1,
    -(sy / window.innerHeight) * 2 + 1
  )
  raycaster.setFromCamera(pointeur, camera)
}

function etiquetteTexte(texte) {
  const echelle = 2
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const police = `${13 * echelle}px ui-monospace, SFMono-Regular, Menlo, monospace`

  ctx.font = police
  const largeurTexte = ctx.measureText(texte).width
  canvas.width = Math.ceil(largeurTexte + 16 * echelle)
  canvas.height = 24 * echelle

  // La taille du canvas reinitialise le contexte : la police doit etre reposee.
  ctx.font = police
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#cfcbe0'
  ctx.fillText(texte, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(canvas.width / echelle / 3.2, canvas.height / echelle / 3.2, 1)
  return sprite
}

function champDEtoiles() {
  const nombre = 1400
  const positions = new Float32Array(nombre * 3)
  for (let i = 0; i < nombre; i++) {
    // Distribution sur une coquille lointaine, pour un fond qui ne bouge
    // presque pas quand on orbite -- l'effet "ciel" plutot que "confettis".
    const rayon = 1200 + Math.random() * 900
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = rayon * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = rayon * Math.cos(phi)
    positions[i * 3 + 2] = rayon * Math.sin(phi) * Math.sin(theta)
  }
  const geometrie = new THREE.BufferGeometry()
  geometrie.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return new THREE.Points(
    geometrie,
    new THREE.PointsMaterial({ color: COULEURS.etoile, size: 3, sizeAttenuation: true })
  )
}
