import {
  attacher,
  redimensionner,
  rendu,
  ajouterNotes,
  majEtats,
  survoler,
  deplacerNote,
  retirerNote,
  noteSousPointeur,
  pointSurSphereDe,
  lonLatDepuisPoint,
  distanceCadrage,
  noeud,
  estDeplie,
  compterEnfants,
  RAYON_GLOBE,
} from './scene.js'
import { brancherControles, appliquerCamera, viserCible, distance, reglerDistance } from './controls.js'

const enEdition = location.pathname.startsWith('/edit')

const conteneur = document.getElementById('scene')
const panneauNote = document.getElementById('panneau-note')
const titreNote = document.getElementById('titre-note')
const contenuNote = document.getElementById('contenu-note')
const compteur = document.getElementById('compteur-notes')
const filAriane = document.getElementById('fil-ariane')
const boutonRemonter = document.getElementById('bouton-remonter')
const boutonFermer = document.getElementById('bouton-fermer-note')
const astuce = document.getElementById('astuce')
const panneau = document.getElementById('panneau-edition')
const champTitre = document.getElementById('champ-titre')
const champContenu = document.getElementById('champ-contenu')
const boutonSupprimer = document.getElementById('bouton-supprimer')
const boutonAnnuler = document.getElementById('bouton-annuler')

/** Note actuellement selectionnee (panneau lateral ouvert), ou null a la racine. */
let selectionId = null
let noteEnDeplacement = null
let editionNoteId = null
let positionNouvelleNote = null
let enTransition = false

attacher(conteneur)
reglerDistance(distanceCadrage(RAYON_GLOBE))
appliquerCamera()
window.addEventListener('resize', () => {
  redimensionner()
  appliquerCamera()
})
if (enEdition) astuce.hidden = false

// --- Donnees -------------------------------------------------------------

async function chargerNote(id) {
  const rep = await fetch(id === null ? '/api/notes/root' : `/api/notes/${id}`)
  if (!rep.ok) throw new Error(`chargement note ${id} : ${rep.status}`)
  return rep.json()
}

async function appelApi(methode, url, corps) {
  const rep = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  if (!rep.ok) {
    // Une session Access expiree se traduit ici par un 401/403 : recharger
    // relance le flux de connexion Cloudflare.
    if (rep.status === 401 || rep.status === 403) location.reload()
    throw new Error(`${methode} ${url} : ${rep.status}`)
  }
  return rep.status === 204 ? null : rep.json()
}

// --- Boucle de rendu -----------------------------------------------------

function boucle() {
  rendu()
  requestAnimationFrame(boucle)
}
requestAnimationFrame(boucle)

// --- Ouvrir une note : ses filles apparaissent autour d'elle --------------

/**
 * La camera se recentre sur la note ouverte et se rapproche, mais rien ne
 * disparait : le niveau precedent reste visible autour. C'est ce qui distingue
 * ce monde continu d'une navigation "une scene par note".
 */
function cadrerSur(centre, rayon, duree = 620) {
  const cibleDistance = distanceCadrage(rayon)
  const departDistance = distance()
  const debut = performance.now()

  return new Promise((resoudre) => {
    const avancer = (t) => {
      const p = Math.min(1, (t - debut) / duree)
      const e = 1 - Math.pow(1 - p, 4)
      viserCible(centre, e)
      reglerDistance(departDistance + (cibleDistance - departDistance) * e)
      appliquerCamera()
      if (p < 1) requestAnimationFrame(avancer)
      else resoudre()
    }
    requestAnimationFrame(avancer)
  })
}

async function ouvrirNote(note) {
  if (enTransition) return
  enTransition = true

  if (!estDeplie(note.id)) {
    const { children } = await chargerNote(note.id)
    ajouterNotes(note.id, children)
  }

  selectionId = note.id
  const n = noeud(note.id)
  majEtats(selectionId)
  majPanneau(note)
  await cadrerSur(n.centre, n.rayon * 0.62)
  enTransition = false
}

async function revenirALaRacine() {
  if (enTransition) return
  enTransition = true
  selectionId = null
  majEtats(null)
  fermerPanneauNote()
  await cadrerSur({ x: 0, y: 0, z: 0 }, RAYON_GLOBE)
  enTransition = false
}

async function remonterDUnNiveau() {
  const courant = selectionId === null ? null : noeud(selectionId)
  if (!courant) return
  if (courant.parentId === null) return revenirALaRacine()
  const parent = noeud(courant.parentId)
  if (!parent) return revenirALaRacine()
  await ouvrirNote(parent.note)
}

// --- Panneau lateral de la note ------------------------------------------

function majPanneau(note) {
  const nbEnfants = compterEnfants(note.id)
  titreNote.textContent = note.titre
  contenuNote.textContent = note.contenu || '(pas de contenu)'
  compteur.textContent = `${nbEnfants} note${nbEnfants > 1 ? 's' : ''} a l'interieur`
  filAriane.textContent = cheminDe(note.id).join(' / ')
  panneauNote.hidden = false
  boutonRemonter.hidden = false
}

function cheminDe(id) {
  const chemin = []
  let courant = id === null ? null : noeud(id)
  while (courant) {
    chemin.unshift(courant.note.titre)
    courant = courant.parentId === null ? null : noeud(courant.parentId)
  }
  return ['Racine', ...chemin]
}

function fermerPanneauNote() {
  panneauNote.hidden = true
  boutonRemonter.hidden = true
  filAriane.textContent = 'Racine'
}

boutonRemonter.addEventListener('click', remonterDUnNiveau)
boutonFermer.addEventListener('click', revenirALaRacine)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panneau.hidden) remonterDUnNiveau()
})

// --- Gestes --------------------------------------------------------------

brancherControles(conteneur, {
  estGlisserNote: (sx, sy) => {
    if (!enEdition) return false
    const note = noteSousPointeur(sx, sy)
    noteEnDeplacement = note ?? null
    return note !== null
  },

  surGlisserNote: (sx, sy) => {
    if (!noteEnDeplacement) return
    const n = noeud(noteEnDeplacement.id)
    if (!n) return
    const point = pointSurSphereDe(n.parentId, sx, sy)
    if (!point) return
    const parent = n.parentId === null ? null : noeud(n.parentId)
    const centreParent = parent ? parent.centre : { x: 0, y: 0, z: 0 }
    const { lon, lat } = lonLatDepuisPoint(point, centreParent)
    noteEnDeplacement.x = lon
    noteEnDeplacement.y = lat
    deplacerNote(noteEnDeplacement.id, lon, lat)
  },

  surFinGlisserNote: async (aBouge) => {
    const note = noteEnDeplacement
    noteEnDeplacement = null
    if (!note) return
    if (aBouge) await appelApi('PATCH', `/api/write/notes/${note.id}/position`, { x: note.x, y: note.y })
    else await ouvrirNote(note)
  },

  surClic: async (sx, sy) => {
    const note = noteSousPointeur(sx, sy)
    if (note) await ouvrirNote(note)
  },

  surSurvol: (sx, sy) => {
    const note = noteSousPointeur(sx, sy)
    survoler(note ? note.id : null)
    conteneur.style.cursor = note ? 'pointer' : 'grab'
  },

  surClicDroit: (sx, sy) => {
    if (!enEdition) return
    const note = noteSousPointeur(sx, sy)
    if (note) ouvrirPanneauEdition(note)
  },

  surDoubleClicVide: (sx, sy) => {
    if (!enEdition) return
    if (noteSousPointeur(sx, sy)) return
    // La nouvelle note se pose sur la sphere du niveau ouvert.
    const point = pointSurSphereDe(selectionId, sx, sy)
    if (!point) return
    const parent = selectionId === null ? null : noeud(selectionId)
    const centreParent = parent ? parent.centre : { x: 0, y: 0, z: 0 }
    positionNouvelleNote = lonLatDepuisPoint(point, centreParent)
    ouvrirPanneauEdition(null)
  },
})

// --- Panneau d'edition ---------------------------------------------------

function ouvrirPanneauEdition(note) {
  editionNoteId = note ? note.id : null
  champTitre.value = note ? note.titre : ''
  champContenu.value = note ? note.contenu : ''
  boutonSupprimer.hidden = !note
  panneau.hidden = false
  champTitre.focus()
}

function fermerPanneauEdition() {
  panneau.hidden = true
  editionNoteId = null
  positionNouvelleNote = null
}

boutonAnnuler.addEventListener('click', fermerPanneauEdition)

panneau.addEventListener('submit', async (e) => {
  e.preventDefault()
  const titre = champTitre.value.trim()
  if (!titre) return
  const contenu = champContenu.value

  if (editionNoteId !== null) {
    const maj = await appelApi('PUT', `/api/write/notes/${editionNoteId}`, { titre, contenu })
    // Le titre est dessine dans une texture : on retire puis on repose la note.
    const n = noeud(editionNoteId)
    const parentId = n ? n.parentId : null
    retirerNote(editionNoteId)
    ajouterNotes(parentId, [maj])
    if (selectionId === editionNoteId) majPanneau(maj)
  } else {
    const pos = positionNouvelleNote ?? { lon: 0, lat: 0 }
    const creee = await appelApi('POST', '/api/write/notes', {
      parent_id: selectionId,
      titre,
      contenu,
      x: pos.lon,
      y: pos.lat,
    })
    ajouterNotes(selectionId, [creee])
  }
  majEtats(selectionId)
  fermerPanneauEdition()
})

boutonSupprimer.addEventListener('click', async () => {
  if (editionNoteId === null) return
  if (!confirm('Supprimer cette note et toutes ses notes filles ?')) return
  await appelApi('DELETE', `/api/write/notes/${editionNoteId}`)
  retirerNote(editionNoteId)
  if (selectionId === editionNoteId) await revenirALaRacine()
  fermerPanneauEdition()
})

// --- Depart --------------------------------------------------------------

const { children } = await chargerNote(null)
ajouterNotes(null, children)
majEtats(null)
filAriane.textContent = 'Racine'
