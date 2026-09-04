// Camera pilotee en coordonnees spheriques autour d'une cible deplacable.
//
//   molette          -> zoom (distance camera <-> cible)
//   clic-glisser     -> orbite 3D (azimut / elevation) : le geste principal
//   Alt + glisser    -> pan 2D (on deplace la cible dans le plan de l'ecran)
//
// Ecrit a la main plutot qu'avec OrbitControls : le schema demande ne
// correspond pas aux gestes par defaut d'OrbitControls, et 80 lignes lisibles
// valent mieux qu'un addon qu'il faudrait de toute facon reconfigurer.
import * as THREE from '/vendor/three.module.min.js'
import { camera } from './scene.js'

const DISTANCE_MIN = 130
const DISTANCE_MAX = 900

export const cible = new THREE.Vector3(0, 0, 0)
const spherique = new THREE.Spherical(320, Math.PI / 2.4, 0.6)

export function appliquerCamera() {
  spherique.makeSafe()
  camera.position.setFromSpherical(spherique).add(cible)
  camera.lookAt(cible)
}

export function distance() {
  return spherique.radius
}

/**
 * Deplace progressivement la cible de la camera vers un point. `avancement`
 * va de 0 a 1 : l'appelant pilote la courbe d'animation, on ne fait qu'appliquer.
 */
const cibleDepart = new THREE.Vector3()
let cibleEnCours = false

export function viserCible(point, avancement) {
  if (!cibleEnCours) {
    cibleDepart.copy(cible)
    cibleEnCours = true
  }
  cible.lerpVectors(cibleDepart, new THREE.Vector3(point.x, point.y, point.z), avancement)
  if (avancement >= 1) cibleEnCours = false
}

export function reglerDistance(valeur) {
  spherique.radius = THREE.MathUtils.clamp(valeur, DISTANCE_MIN, DISTANCE_MAX)
}

/**
 * Branche les gestes. `crochets` permet a l'application de reprendre la main :
 * - `estGlisserNote(sx, sy)` -> true si l'appui a demarre sur une note a
 *   deplacer (mode edition) ; le pan est alors suspendu.
 * - `surGlisserNote(sx, sy)` -> appele pendant ce glisser.
 * - `surFinGlisserNote(aBouge)` -> fin du glisser.
 * - `surClic(sx, sy)` -> appui/relachement sans deplacement.
 * - `surSurvol(sx, sy)` -> mouvement simple, sans bouton.
 * - `surDoubleClicVide(sx, sy)` -> double-clic hors d'une note.
 * - `surClicDroit(sx, sy)` -> clic droit.
 */
export function brancherControles(element, crochets) {
  let bouton = null
  let depart = null
  let aBouge = false
  let glisseNote = false

  element.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    crochets.surClicDroit?.(e.clientX, e.clientY)
  })

  element.addEventListener('wheel', (e) => {
    e.preventDefault()
    reglerDistance(spherique.radius * (e.deltaY > 0 ? 1.12 : 0.89))
    appliquerCamera()
  }, { passive: false })

  element.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    bouton = e.button
    depart = { x: e.clientX, y: e.clientY }
    aBouge = false
    glisseNote = crochets.estGlisserNote?.(e.clientX, e.clientY) === true
    element.setPointerCapture(e.pointerId)
  })

  element.addEventListener('pointermove', (e) => {
    if (bouton === null) {
      crochets.surSurvol?.(e.clientX, e.clientY)
      return
    }

    const dx = e.clientX - depart.x
    const dy = e.clientY - depart.y
    if (Math.hypot(dx, dy) > 4) aBouge = true
    depart = { x: e.clientX, y: e.clientY }

    if (glisseNote) {
      crochets.surGlisserNote?.(e.clientX, e.clientY)
    } else if (e.altKey) {
      panoramiquer(dx, dy)
    } else {
      orbiter(dx, dy)
    }
    appliquerCamera()
  })

  element.addEventListener('pointerup', (e) => {
    if (bouton === null) return
    element.releasePointerCapture(e.pointerId)
    if (glisseNote) crochets.surFinGlisserNote?.(aBouge)
    else if (!aBouge) crochets.surClic?.(e.clientX, e.clientY)
    bouton = null
    glisseNote = false
  })

  element.addEventListener('dblclick', (e) => {
    crochets.surDoubleClicVide?.(e.clientX, e.clientY)
  })
}

function orbiter(dx, dy) {
  spherique.theta -= dx * 0.005
  spherique.phi = THREE.MathUtils.clamp(spherique.phi - dy * 0.005, 0.15, Math.PI - 0.15)
}

function panoramiquer(dx, dy) {
  // Deplacement dans le plan de l'ecran : on projette les axes de la camera.
  const echelle = spherique.radius * 0.0018
  const droite = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0)
  const haut = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1)
  cible.addScaledVector(droite, -dx * echelle)
  cible.addScaledVector(haut, dy * echelle)
}
