import {
  attacher,
  redimensionner,
  distanceCadrage,
  rendu,
  poserNotes,
  surlignerNote,
  deplacerNote,
  noteSousPointeur,
  pointGlobeSousPointeur,
  lonLatDepuisPoint,
} from './scene.js'
import { brancherControles, appliquerCamera, distance, reglerDistance, cible } from './controls.js'

const enEdition = location.pathname.startsWith('/edit')

const conteneur = document.getElementById('scene')
const boutonRetour = document.getElementById('bouton-retour')
const filAriane = document.getElementById('fil-ariane')
const contenuNote = document.getElementById('contenu-note')
const titreNote = document.getElementById('titre-note')
const compteur = document.getElementById('compteur-notes')
const astuce = document.getElementById('astuce')
const panneau = document.getElementById('panneau-edition')
const champTitre = document.getElementById('champ-titre')
const champContenu = document.getElementById('champ-contenu')
const boutonSupprimer = document.getElementById('bouton-supprimer')
const boutonAnnuler = document.getElementById('bouton-annuler')

/** @type {{id: number|null, titre: string}[]} ancetres, du plus lointain au plus proche */
let pile = []
let focusId = null
let focusTitre = 'Racine'
let enfants = []
let noteEnDeplacement = null
let editionNoteId = null
let positionNouvelleNote = null

// Fondu applique au changement de niveau : la scene reapparait en douceur.
let opacite = 1

attacher(conteneur)
reglerDistance(distanceCadrage())
appliquerCamera()
window.addEventListener('resize', () => {
  redimensionner()
  // Le cadrage depend du ratio : il doit etre recalcule a chaque changement
  // de taille, sinon une rotation de telephone sort les notes du cadre.
  reglerDistance(distanceCadrage())
  appliquerCamera()
})
if (enEdition) astuce.hidden = false

// --- Donnees -------------------------------------------------------------

async function chargerNote(id) {
  const rep = await fetch(id === null ? '/api/notes/root' : `/api/notes/${id}`)
  if (!rep.ok) throw new Error(`chargement note ${id} : ${rep.status}`)
  return rep.json()
}

async function allerA(id, { poussePile = null } = {}) {
  if (poussePile !== null) pile.push(poussePile)
  const { note, children } = await chargerNote(id)
  focusId = id
  focusTitre = note.titre
  enfants = children
  poserNotes(children)
  cible.set(0, 0, 0)
  reglerDistance(distanceCadrage())
  appliquerCamera()
  majHud(note)
  opacite = 0
}

function majHud(note) {
  boutonRetour.hidden = pile.length === 0
  titreNote.textContent = note.titre
  contenuNote.textContent = note.contenu
  contenuNote.hidden = !note.contenu
  compteur.textContent = `${enfants.length} note${enfants.length > 1 ? 's' : ''}`
  filAriane.textContent = [...pile.map((p) => p.titre), focusTitre].join(' / ')
}

// --- Boucle de rendu -----------------------------------------------------

function boucle() {
  if (opacite < 1) {
    opacite = Math.min(1, opacite + 0.06)
    conteneur.style.opacity = opacite
  }
  rendu()
  requestAnimationFrame(boucle)
}
requestAnimationFrame(boucle)

// --- Navigation fractale -------------------------------------------------

let enTransition = false

async function zoomerDans(note) {
  if (enTransition) return
  enTransition = true

  // On plonge vers la note avant de basculer de niveau : c'est ce mouvement
  // qui donne le sentiment d'entrer *dans* la note plutot que de changer d'ecran.
  const depart = distance()
  const debut = performance.now()
  const duree = 420

  await new Promise((resoudre) => {
    const avancer = (t) => {
      const p = Math.min(1, (t - debut) / duree)
      const e = 1 - Math.pow(1 - p, 4)
      reglerDistance(depart + (depart * 0.42 - depart) * e)
      appliquerCamera()
      if (p < 1) requestAnimationFrame(avancer)
      else resoudre()
    }
    requestAnimationFrame(avancer)
  })

  await allerA(note.id, { poussePile: { id: focusId, titre: focusTitre } })
  enTransition = false
}

async function remonter() {
  if (pile.length === 0 || enTransition) return
  enTransition = true
  const parent = pile.pop()
  await allerA(parent.id)
  enTransition = false
}

boutonRetour.addEventListener('click', remonter)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panneau.hidden) remonter()
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
    const point = pointGlobeSousPointeur(sx, sy)
    if (!point) return
    const { lon, lat } = lonLatDepuisPoint(point)
    noteEnDeplacement.x = lon
    noteEnDeplacement.y = lat
    deplacerNote(noteEnDeplacement.id, lon, lat)
  },

  surFinGlisserNote: async (aBouge) => {
    const note = noteEnDeplacement
    noteEnDeplacement = null
    if (!note) return
    if (aBouge) {
      await appelApi('PATCH', `/api/write/notes/${note.id}/position`, { x: note.x, y: note.y })
    } else {
      await zoomerDans(note)
    }
  },

  surClic: async (sx, sy) => {
    const note = noteSousPointeur(sx, sy)
    if (note) await zoomerDans(note)
  },

  surSurvol: (sx, sy) => {
    const note = noteSousPointeur(sx, sy)
    surlignerNote(note ? note.id : null)
    conteneur.style.cursor = note ? 'pointer' : 'grab'
  },

  surClicDroit: (sx, sy) => {
    if (!enEdition) return
    const note = noteSousPointeur(sx, sy)
    if (note) ouvrirPanneau(note)
  },

  surDoubleClicVide: (sx, sy) => {
    if (!enEdition) return
    if (noteSousPointeur(sx, sy)) return
    const point = pointGlobeSousPointeur(sx, sy)
    if (!point) return
    positionNouvelleNote = lonLatDepuisPoint(point)
    ouvrirPanneau(null)
  },
})

// --- Panneau d'edition ---------------------------------------------------

function ouvrirPanneau(note) {
  editionNoteId = note ? note.id : null
  champTitre.value = note ? note.titre : ''
  champContenu.value = note ? note.contenu : ''
  boutonSupprimer.hidden = !note
  panneau.hidden = false
  champTitre.focus()
}

function fermerPanneau() {
  panneau.hidden = true
  editionNoteId = null
  positionNouvelleNote = null
}

boutonAnnuler.addEventListener('click', fermerPanneau)

panneau.addEventListener('submit', async (e) => {
  e.preventDefault()
  const titre = champTitre.value.trim()
  if (!titre) return
  const contenu = champContenu.value

  if (editionNoteId !== null) {
    await appelApi('PUT', `/api/write/notes/${editionNoteId}`, { titre, contenu })
  } else {
    const pos = positionNouvelleNote ?? { lon: 0, lat: 0 }
    await appelApi('POST', '/api/write/notes', {
      parent_id: focusId,
      titre,
      contenu,
      x: pos.lon,
      y: pos.lat,
    })
  }
  fermerPanneau()
  await rafraichirNiveau()
})

boutonSupprimer.addEventListener('click', async () => {
  if (editionNoteId === null) return
  if (!confirm('Supprimer cette note et toutes ses notes filles ?')) return
  await appelApi('DELETE', `/api/write/notes/${editionNoteId}`)
  fermerPanneau()
  await rafraichirNiveau()
})

/** Recharge le niveau courant sans rejouer l'animation d'entree. */
async function rafraichirNiveau() {
  const { note, children } = await chargerNote(focusId)
  enfants = children
  poserNotes(children)
  majHud(note)
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

// --- Depart --------------------------------------------------------------

allerA(null)
