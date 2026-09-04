// Scene 3D : un seul monde continu. Les notes de premier niveau sont posees sur
// un globe filaire ; deplier une note fait apparaitre ses filles sur une sphere
// plus petite centree sur elle, reliees par un trait. Rien n'est jamais retire
// de la scene lors d'une navigation -- on ne change pas de "fenetre", le monde
// grandit autour de ce qu'on ouvre.
//
// Aucune lumiere : les materiaux sont "basic". La scene est un trace, pas un
// rendu realiste, ce qui la garde lisible et peu couteuse.
import * as THREE from '/vendor/three.module.min.js'

// Direction artistique reprise de hamdy-tabsissi.com/monde. Zone volontairement
// hors-theme : la scene reste sombre meme en `prefers-color-scheme: light`,
// donc les couleurs sont litterales ici (meme exception que .tuile-multivers
// du portfolio). Elles doivent rester identiques a celles de style.css.
export const COULEURS = {
  fond: 0x08070f,
  globe: 0x26243a,
  trait: 0x4a4570,
  note: 0xe6b450,
  noteOuverte: 0xffdf9e,
  noteSurvol: 0xffdf9e,
  etoile: 0x6f6b85,
}

export const RAYON_GLOBE = 100
/** Chaque niveau tient dans une sphere nettement plus petite que son parent. */
const FACTEUR_NIVEAU = 0.46

export const scene = new THREE.Scene()
scene.background = new THREE.Color(COULEURS.fond)

export const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

const raycaster = new THREE.Raycaster()

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(RAYON_GLOBE, 24, 16),
  new THREE.MeshBasicMaterial({ color: COULEURS.globe, wireframe: true, transparent: true, opacity: 0.32 })
)
scene.add(globe)

scene.add(champDEtoiles())

const groupeNotes = new THREE.Group()
const groupeTraits = new THREE.Group()
scene.add(groupeNotes, groupeTraits)

/**
 * Tout ce que la scene connait d'une note affichee.
 * @type {Map<number, {note: object, centre: THREE.Vector3, rayon: number,
 *                     bille: THREE.Mesh, etiquette: THREE.Sprite,
 *                     parentId: number|null, deplie: boolean}>}
 */
const noeuds = new Map()

export function attacher(element) {
  element.appendChild(renderer.domElement)
  redimensionner()
}

export function redimensionner() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}

export function rendu() {
  renderer.render(scene, camera)
}

/**
 * Distance a laquelle une sphere de rayon donne tient dans le cadre. Calculee
 * depuis le ratio de l'ecran : en portrait c'est le champ horizontal qui
 * contraint, une distance fixe y sortirait les notes du cadre.
 */
export function distanceCadrage(rayon = RAYON_GLOBE, marge = 1.7) {
  const champVertical = THREE.MathUtils.degToRad(camera.fov)
  const champHorizontal = 2 * Math.atan(Math.tan(champVertical / 2) * camera.aspect)
  return (rayon * marge) / Math.tan(Math.min(champVertical, champHorizontal) / 2)
}

/** (longitude, latitude) en degres -> point sur une sphere donnee. */
export function positionSpherique(lonDeg, latDeg, rayon, centre = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(90 - Math.max(-85, Math.min(85, latDeg)))
  const theta = THREE.MathUtils.degToRad(lonDeg)
  return new THREE.Vector3(
    rayon * Math.sin(phi) * Math.cos(theta),
    rayon * Math.cos(phi),
    rayon * Math.sin(phi) * Math.sin(theta)
  ).add(centre)
}

/** Point sur une sphere -> (longitude, latitude) relatives a son centre. */
export function lonLatDepuisPoint(point, centre) {
  const p = point.clone().sub(centre).normalize()
  return {
    lon: THREE.MathUtils.radToDeg(Math.atan2(p.z, p.x)),
    lat: 90 - THREE.MathUtils.radToDeg(Math.acos(p.y)),
  }
}

export function noeud(id) {
  return noeuds.get(id) ?? null
}

export function estDeplie(id) {
  return noeuds.get(id)?.deplie === true
}

export function compterEnfants(id) {
  let total = 0
  for (const n of noeuds.values()) if (n.parentId === id) total++
  return total
}

/**
 * Ajoute des notes autour d'un parent. `parentId === null` = premier niveau,
 * pose sur le globe central. Les notes deja presentes ne sont pas retouchees :
 * la scene s'enrichit, elle ne se remplace pas.
 */
export function ajouterNotes(parentId, notes) {
  const parent = parentId === null ? null : noeuds.get(parentId)
  const centre = parent ? parent.centre : new THREE.Vector3()
  const rayon = parent ? parent.rayon * FACTEUR_NIVEAU : RAYON_GLOBE

  for (const note of notes) {
    if (noeuds.has(note.id)) continue
    const position = positionSpherique(note.x, note.y, rayon, centre)
    const rayonBille = Math.max(1.6, rayon * 0.05)

    const bille = new THREE.Mesh(
      new THREE.SphereGeometry(rayonBille, 16, 12),
      new THREE.MeshBasicMaterial({ color: COULEURS.note })
    )
    bille.position.copy(position)
    bille.userData.note = note
    groupeNotes.add(bille)

    const etiquette = etiquetteTexte(note.titre, rayon)
    etiquette.position.copy(positionEtiquette(position, rayonBille))
    etiquette.userData.note = note
    groupeNotes.add(etiquette)

    noeuds.set(note.id, { note, centre: position, rayon, bille, etiquette, parentId, deplie: false })

    if (parent) groupeTraits.add(trait(parent.centre, position))
  }

  if (parent) parent.deplie = true
}

/** Marque visuellement les notes deja ouvertes. */
export function majEtats(idSelectionne) {
  for (const [id, n] of noeuds) {
    const couleur = id === idSelectionne || n.deplie ? COULEURS.noteOuverte : COULEURS.note
    n.bille.material.color.setHex(couleur)
    n.bille.scale.setScalar(id === idSelectionne ? 1.4 : 1)
  }
}

export function survoler(id) {
  for (const [autreId, n] of noeuds) {
    if (n.deplie) continue
    n.bille.material.color.setHex(autreId === id ? COULEURS.noteSurvol : COULEURS.note)
  }
}

/** Deplace une note et son etiquette (glisser en mode edition). */
export function deplacerNote(id, lon, lat) {
  const n = noeuds.get(id)
  if (!n) return
  const parent = n.parentId === null ? null : noeuds.get(n.parentId)
  const centreParent = parent ? parent.centre : new THREE.Vector3()
  const position = positionSpherique(lon, lat, n.rayon, centreParent)
  n.centre.copy(position)
  n.bille.position.copy(position)
  n.etiquette.position.copy(positionEtiquette(position, n.bille.geometry.parameters.radius))
  redessinerTraits()
}

function redessinerTraits() {
  groupeTraits.clear()
  for (const n of noeuds.values()) {
    if (n.parentId === null) continue
    const parent = noeuds.get(n.parentId)
    if (parent) groupeTraits.add(trait(parent.centre, n.centre))
  }
}

/** Sphere sur laquelle se placent les filles d'une note : cible du raycast. */
export function pointSurSphereDe(parentId, sx, sy) {
  const parent = parentId === null ? null : noeuds.get(parentId)
  const centre = parent ? parent.centre : new THREE.Vector3()
  const rayon = parent ? parent.rayon * FACTEUR_NIVEAU : RAYON_GLOBE

  preparerRaycast(sx, sy)
  const sphere = new THREE.Sphere(centre, rayon)
  const point = new THREE.Vector3()
  return raycaster.ray.intersectSphere(sphere, point) ? point : null
}

export function noteSousPointeur(sx, sy) {
  preparerRaycast(sx, sy)
  const touches = raycaster.intersectObjects(groupeNotes.children, false)
  return touches.length > 0 ? touches[0].object.userData.note : null
}

export function retirerNote(id) {
  const n = noeuds.get(id)
  if (!n) return
  for (const [autreId, autre] of [...noeuds]) {
    if (autre.parentId === id) retirerNote(autreId)
  }
  groupeNotes.remove(n.bille, n.etiquette)
  n.bille.geometry.dispose()
  n.bille.material.dispose()
  n.etiquette.material.map?.dispose()
  n.etiquette.material.dispose()
  noeuds.delete(id)
  redessinerTraits()
}

function preparerRaycast(sx, sy) {
  raycaster.setFromCamera(
    new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1),
    camera
  )
}

function positionEtiquette(position, rayonBille) {
  return position.clone().add(new THREE.Vector3(0, rayonBille * 2.4 + 2, 0))
}

function trait(depart, arrivee) {
  const geometrie = new THREE.BufferGeometry().setFromPoints([depart.clone(), arrivee.clone()])
  return new THREE.Line(
    geometrie,
    new THREE.LineBasicMaterial({ color: COULEURS.trait, transparent: true, opacity: 0.7 })
  )
}

function etiquetteTexte(texte, rayonNiveau) {
  const echelle = 2
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const police = `${13 * echelle}px ui-monospace, SFMono-Regular, Menlo, monospace`

  ctx.font = police
  canvas.width = Math.ceil(ctx.measureText(texte).width + 16 * echelle)
  canvas.height = 24 * echelle

  // Redimensionner le canvas reinitialise le contexte : reposer la police.
  ctx.font = police
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#cfcbe0'
  ctx.fillText(texte, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  )
  // L'etiquette suit la taille de son niveau, sinon les sous-notes deviennent
  // illisibles ou ecrasent le niveau au-dessus.
  const facteur = (rayonNiveau / RAYON_GLOBE) * 0.31 + 0.06
  sprite.scale.set((canvas.width / echelle) * facteur, (canvas.height / echelle) * facteur, 1)
  return sprite
}

function champDEtoiles() {
  const nombre = 1600
  const positions = new Float32Array(nombre * 3)
  for (let i = 0; i < nombre; i++) {
    // Coquille lointaine : le fond bouge peu quand on orbite, effet "ciel"
    // plutot que "confettis".
    const rayon = 1400 + Math.random() * 1100
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
