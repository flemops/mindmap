// Adaptateur camera-controls : la lib gere toute l'inertie de la camera (rotation,
// pan, dolly, amorti). Ce module se limite a (1) la configurer une fois et (2)
// discriminer par-dessus elle les gestes applicatifs -- clic, glisser une note,
// clic droit immobile, double-clic sur le vide -- sans jamais ecrire
// `camera.position` a la main (interdit par la spec).
import * as THREE from './vendor/three-0.185.1/build/three.module.min.js'
import CameraControls from './vendor/camera-controls-3.1.2/camera-controls.module.js'
import { camera, RAYON_GLOBE, distanceCadrage } from './scene.js'

// Doit utiliser exactement le meme module three que scene.js : deux copies
// donneraient deux constructeurs Vector3/Spherical distincts, et les `instanceof`
// internes de la lib echoueraient silencieusement.
CameraControls.install({ THREE })

const RATIO_MIN_DISTANCE = 1.15 // sous 1, un dollyTo pourrait coller la camera dans le verre
const MARGE_CADRAGE = 1.3 // fitToSphere n'a aucun padding : Sphere(centre, r × 1.3) donne ≈ 3.08 r de distance
const SEUIL_SOURIS = 4 // px : en-deca, un clic n'est pas un glisser
const SEUIL_TACTILE = 8

// Sans domElement : connect() est appele depuis brancherControles, apres que
// nos propres ecouteurs soient poses (ordre impose par la spec).
const controls = new CameraControls(camera)
controls.smoothTime = 0.35
controls.draggingSmoothTime = 0.12
controls.minPolarAngle = 0.12
controls.maxPolarAngle = Math.PI - 0.12
// Valeurs = defauts de camera-controls pour une PerspectiveCamera, postees
// explicitement : un futur changement de defaut en amont ne doit pas nous surprendre.
controls.mouseButtons = {
  left: CameraControls.ACTION.ROTATE,
  middle: CameraControls.ACTION.DOLLY,
  right: CameraControls.ACTION.TRUCK,
  wheel: CameraControls.ACTION.DOLLY,
}
controls.touches = {
  one: CameraControls.ACTION.TOUCH_ROTATE,
  two: CameraControls.ACTION.TOUCH_DOLLY_TRUCK,
  three: CameraControls.ACTION.TOUCH_TRUCK,
}
controls.maxDistance = distanceCadrage(RAYON_GLOBE * 1.3) * 2
// Angle de depart actuel conserve (vue d'ensemble depuis un point fixe).
controls.setLookAt(
  ...new THREE.Vector3().setFromSphericalCoords(320, Math.PI / 2.4, 0.6).toArray(),
  0, 0, 0,
  false
)

export function appliquerCamera(delta = 0) {
  return controls.update(delta) // booleen : la camera a-t-elle bouge (amorti en cours)
}

export function distance() {
  return controls.distance
}

export function reglerDistance(v) {
  controls.dollyTo(v, false)
}

// Remplace l'ancien viserCible(point, avancement) : la cible est desormais la sphere du globe vise.
export function viserCible(centre, rayon, animer = true) {
  controls.minDistance = rayon * RATIO_MIN_DISTANCE // AVANT le fit : dollyTo clampe contre la borne courante
  controls.normalizeRotations() // evite un rebobinage de N tours apres de longues orbites
  return controls.fitToSphere(new THREE.Sphere(centre, rayon * MARGE_CADRAGE), animer)
}

export function reglerVol(actif) {
  controls.smoothTime = actif ? 0.2 : 0.35
}

/**
 * Tourne la camera autour de sa cible pour regarder depuis `direction` (vecteur
 * unitaire monde, cf. scene.js#directionCadrage). Ne touche ni a la cible ni a la
 * distance : se combine avec le fitToSphere de viserCible. L'azimut vise est
 * ramene au plus pres de l'azimut courant (jamais plus d'un demi-tour), le polaire
 * est borne pour garder l'horizon lisible. L'orbite manuelle reste libre ensuite.
 */
export function orienterVers(direction, animer = true) {
  const polaire = THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(direction.y, -1, 1)), 0.7, Math.PI - 0.7)
  const courant = controls.azimuthAngle
  let ecart = (Math.atan2(direction.x, direction.z) - courant) % (2 * Math.PI)
  if (ecart > Math.PI) ecart -= 2 * Math.PI
  else if (ecart < -Math.PI) ecart += 2 * Math.PI
  return controls.rotateTo(courant + ecart, polaire, animer)
}

/**
 * Centre le globe dans la zone libre de l'ecran. Sous 560 px le HUD et le panneau
 * de note sont empiles en bas : `basLibre` est l'ordonnee (px) du haut de ce qui
 * recouvre la scene, le globe est remonte au milieu de ce qui reste. Au-dela de
 * 560 px (ou sans `basLibre`) : aucun decalage. Le decalage en pixels est converti
 * en unites monde a la distance de cadrage du globe vise.
 */
export function reglerDecalage(rayon, basLibre = innerHeight, animer = true) {
  const mobile = matchMedia('(max-width: 560px)').matches
  const pixels = mobile ? (innerHeight - Math.min(basLibre, innerHeight)) / 2 : 0
  const parPixel = (2 * distanceCadrage(rayon) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / innerHeight
  // y positif : la camera glisse vers le bas, donc le globe monte a l'ecran.
  controls.setFocalOffset(0, pixels * parPixel, 0, animer)
}

// --- Discrimination des gestes applicatifs ---------------------------------
// Etat du pointeur actif ; un seul a la fois, le reste est laisse a camera-controls
// (multi-touch : rotation a 1 doigt, dolly+pan a 2, gere en interne par la lib).
let appui = null // { pointerId, bouton, x0, y0, aBouge, etiquetteId, glisseNote }

function idEtiquette(cible) {
  return cible.closest?.('.etiquette')?.dataset.id ?? null
}

export function brancherControles(element, crochets) {
  // Nos ecouteurs D'ABORD, en phase capture pour pointerdown/wheel : la phase
  // capture d'un ancetre precede toujours la phase cible/bulle de l'element
  // (canvas ou etiquette), et l'ordre d'enregistrement couvre en plus le cas ou
  // la cible est `element` lui-meme (capture et bulle s'y confondent en AT_TARGET).
  element.addEventListener('pointerdown', (e) => surPointerDown(e, element, crochets), { capture: true })
  // pointermove/pointerup/pointercancel/lostpointercapture n'ont pas besoin de la
  // phase capture : setPointerCapture (Pointer Capture, pas event capture) retargete
  // ces evenements vers `element`, qui les recoit avant que camera-controls (ecouteur
  // sur `document`) ne les voie remonter.
  element.addEventListener('pointermove', (e) => surPointerMove(e, crochets))
  element.addEventListener('pointerup', (e) => surPointerFin(e, crochets))
  element.addEventListener('pointercancel', (e) => surPointerFin(e, crochets))
  element.addEventListener('lostpointercapture', (e) => surPointerFin(e, crochets))
  element.addEventListener('contextmenu', surContextMenu)
  element.addEventListener('dblclick', (e) => surDblClick(e, crochets))
  // capture + non passive : doit pouvoir intercepter ctrl+molette avant camera-controls,
  // qui ecoute aussi `element` en phase bulle et forcerait sinon ACTION.ZOOM (FOV).
  element.addEventListener('wheel', surWheel, { capture: true, passive: false })
  window.addEventListener('blur', surBlur)

  // Puis controls.connect() : pose touch-action:none / user-select:none en CSSOM
  // sur `element` (le HUD est hors de #scene, il garde son scroll et sa selection).
  controls.connect(element)
}

function surPointerDown(e, element, crochets) {
  if (appui) return // un pointeur deja actif : le second doigt appartient a camera-controls seul
  const etiquetteId = idEtiquette(e.target) // lu AVANT que setPointerCapture ne retargete la cible
  const glisseNote = e.button === 0 && crochets.estGlisserNote(e.clientX, e.clientY, etiquetteId)
  if (glisseNote) controls.enabled = false // onPointerDown de camera-controls teste `!this._enabled` en 1re ligne
  element.setPointerCapture(e.pointerId)
  appui = { pointerId: e.pointerId, bouton: e.button, x0: e.clientX, y0: e.clientY, aBouge: false, etiquetteId, glisseNote }
}

function surPointerMove(e, crochets) {
  if (!appui || e.buttons === 0) {
    crochets.surSurvol(e.clientX, e.clientY, idEtiquette(e.target)) // l'app ne fait que poser survolDemande
    return
  }
  if (e.pointerId !== appui.pointerId) return // pointeur d'un autre doigt : laisse a camera-controls
  const seuil = e.pointerType === 'touch' ? SEUIL_TACTILE : SEUIL_SOURIS
  appui.aBouge ||= Math.hypot(e.clientX - appui.x0, e.clientY - appui.y0) > seuil
  if (appui.glisseNote) crochets.surGlisserNote(e.clientX, e.clientY)
  // sinon rien : camera-controls tourne/pan via ses propres ecouteurs sur document
}

function surPointerFin(e, crochets) {
  if (!appui || e.pointerId !== appui.pointerId) return
  controls.enabled = true
  const { bouton, aBouge, etiquetteId, glisseNote } = appui
  appui = null
  if (glisseNote) {
    crochets.surFinGlisserNote(aBouge)
    return
  }
  if (aBouge) return
  // decision « clic droit immobile » prise ICI, jamais sur contextmenu (Windows
  // l'emet apres pointerup, macOS/Linux a l'appui : pointerup est identique partout)
  if (bouton === 0) crochets.surClic(e.clientX, e.clientY, etiquetteId)
  else if (bouton === 2) crochets.surClicDroit(e.clientX, e.clientY, etiquetteId)
}

function surContextMenu(e) {
  e.preventDefault() // systematique : camera-controls ne le fait plus lui-meme quand enabled=false
}

function surDblClick(e, crochets) {
  crochets.surDoubleClicVide(e.clientX, e.clientY, idEtiquette(e.target)) // camera-controls n'ecoute pas dblclick
}

function surWheel(e) {
  if (e.ctrlKey) {
    e.preventDefault()
    e.stopImmediatePropagation()
  }
}

function surBlur() {
  // securite contre un relachement de bouton perdu (alt-tab pendant un glisser)
  appui = null
  controls.enabled = true
}
