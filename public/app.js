import {
  dessinerScene,
  lireJetonsCouleur,
  ecranVersMonde,
  trouverNoteSousPointeur,
  rayonNote,
} from './canvas-renderer.js'

const enEdition = location.pathname.startsWith('/edit')

const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')
const boutonRetour = document.getElementById('bouton-retour')
const filAriane = document.getElementById('fil-ariane')
const astuce = document.getElementById('astuce-edition')
const contenuNote = document.getElementById('contenu-note')
const panneau = document.getElementById('panneau-edition')
const champTitre = document.getElementById('champ-titre')
const champContenu = document.getElementById('champ-contenu')
const boutonSupprimer = document.getElementById('bouton-supprimer')
const boutonAnnuler = document.getElementById('bouton-annuler')

if (enEdition) astuce.hidden = false

/** @type {{id:number|null, titre:string}[]} */
let pile = [] // ancetres, du plus lointain au plus proche (le dernier = parent direct)
let focusId = null
let focusTitre = 'Racine'
let enfants = []
let survole = null
let editionNoteId = null // id en cours d'edition dans le panneau, ou 'nouveau'
let notePositionNouvelle = null

let transform = { scale: 1, tx: 0, ty: 0 }
let animation = null // {debut, duree, depart, arrivee, apresAnimation}
let opacite = 1
let couleurs = lireJetonsCouleur()

function redimensionner() {
  canvas.width = window.innerWidth * devicePixelRatio
  canvas.height = window.innerHeight * devicePixelRatio
  canvas.style.width = window.innerWidth + 'px'
  canvas.style.height = window.innerHeight + 'px'
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
}
window.addEventListener('resize', redimensionner)
redimensionner()

matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  couleurs = lireJetonsCouleur()
})

function largeurAffichage() { return window.innerWidth }
function hauteurAffichage() { return window.innerHeight }

// --- Chargement des donnees -------------------------------------------

async function chargerNote(id) {
  const url = id === null ? '/api/notes/root' : `/api/notes/${id}`
  const rep = await fetch(url)
  if (!rep.ok) throw new Error(`chargement note ${id} : ${rep.status}`)
  return rep.json()
}

async function allerA(id, titre, { animer = true, poussePile = null } = {}) {
  if (poussePile !== null) pile.push(poussePile)
  const { note, children } = await chargerNote(id)
  focusId = id
  focusTitre = note.titre
  enfants = children
  transform = { scale: 1, tx: 0, ty: 0 }
  metAJourFilAriane()
  contenuNote.textContent = note.contenu
  contenuNote.hidden = !note.contenu
  if (animer) {
    opacite = 0
    animerVers({ scale: 1, tx: 0, ty: 0 }, 180, () => { opacite = 1 })
  }
}

function metAJourFilAriane() {
  boutonRetour.hidden = pile.length === 0
  const chemin = [...pile.map((p) => p.titre), focusTitre]
  filAriane.innerHTML = chemin
    .map((t, i) => (i === chemin.length - 1 ? `<strong>${escapeHtml(t)}</strong>` : escapeHtml(t)))
    .join(' / ')
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// --- Animation de la camera (zoom fractal) ------------------------------

function animerVers(cible, duree, apres) {
  animation = { debut: performance.now(), duree, depart: { ...transform }, cible, apres }
}

function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5) }

function boucle(t) {
  if (animation) {
    const progres = Math.min(1, (t - animation.debut) / animation.duree)
    const e = easeOutQuint(progres)
    transform = {
      scale: animation.depart.scale + (animation.cible.scale - animation.depart.scale) * e,
      tx: animation.depart.tx + (animation.cible.tx - animation.depart.tx) * e,
      ty: animation.depart.ty + (animation.cible.ty - animation.depart.ty) * e,
    }
    if (progres >= 1) {
      const apres = animation.apres
      animation = null
      if (apres) apres()
    }
  }
  if (opacite < 1) opacite = Math.min(1, opacite + 0.08)

  dessinerScene(ctx, {
    largeur: largeurAffichage(),
    hauteur: hauteurAffichage(),
    enfants,
    transform,
    couleurs,
    survole,
    opacite,
  })
  requestAnimationFrame(boucle)
}
requestAnimationFrame(boucle)

// --- Navigation : zoomer dans une note / remonter -----------------------

async function zoomerDans(note) {
  const facteurCible = Math.min(largeurAffichage(), hauteurAffichage()) / (rayonNote(note.titre) * 2.2)
  animerVers({ scale: facteurCible, tx: -note.x, ty: -note.y }, 420, async () => {
    await allerA(note.id, note.titre, { poussePile: { id: focusId, titre: focusTitre } })
  })
}

async function remonter() {
  if (pile.length === 0) return
  const parent = pile.pop()
  animerVers({ scale: 0.35, tx: transform.tx, ty: transform.ty }, 260, async () => {
    await allerA(parent.id, parent.titre, { animer: true })
  })
}

boutonRetour.addEventListener('click', remonter)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') remonter()
})

// --- Pointeur : clic pour zoomer, glisser pour deplacer (edition) -------

let pointeurDepart = null
let deplaceId = null

canvas.addEventListener('pointerdown', (e) => {
  // Seul le bouton principal navigue : le clic droit sert a editer et emet
  // lui aussi une paire pointerdown/pointerup, qui declencherait un zoom.
  if (e.button !== 0) return
  const rect = canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  pointeurDepart = { sx, sy, temps: performance.now() }

  if (enEdition) {
    const note = trouverNoteSousPointeur(sx, sy, enfants, transform, largeurAffichage(), hauteurAffichage())
    if (note) {
      deplaceId = note.id
      canvas.classList.add('dragging')
      canvas.setPointerCapture(e.pointerId)
    }
  }
})

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top

  if (deplaceId !== null) {
    const monde = ecranVersMonde(sx, sy, transform, largeurAffichage(), hauteurAffichage())
    const n = enfants.find((n) => n.id === deplaceId)
    if (n) { n.x = monde.x; n.y = monde.y }
    return
  }

  const survolNote = trouverNoteSousPointeur(sx, sy, enfants, transform, largeurAffichage(), hauteurAffichage())
  const nouveauSurvole = survolNote ? survolNote.id : null
  if (nouveauSurvole !== survole) {
    survole = nouveauSurvole
    canvas.style.cursor = survole !== null ? 'pointer' : 'grab'
  }
})

canvas.addEventListener('pointerup', async (e) => {
  if (e.button !== 0) return
  canvas.classList.remove('dragging')
  const rect = canvas.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const aBouge = pointeurDepart && Math.hypot(sx - pointeurDepart.sx, sy - pointeurDepart.sy) > 6

  // En edition, un appui sur une bulle arme le glisser. S'il n'y a pas eu de
  // mouvement, c'est un clic : il doit zoomer comme en lecture seule, sinon
  // la navigation devient impossible des qu'on est sur /edit.
  if (deplaceId !== null) {
    const id = deplaceId
    deplaceId = null
    pointeurDepart = null
    const n = enfants.find((n) => n.id === id)
    if (aBouge) {
      if (n) await appelApi('PATCH', `/api/write/notes/${id}/position`, { x: n.x, y: n.y })
    } else if (n) {
      await zoomerDans(n)
    }
    return
  }

  if (!aBouge) {
    const note = trouverNoteSousPointeur(sx, sy, enfants, transform, largeurAffichage(), hauteurAffichage())
    if (note) await zoomerDans(note)
  }
  pointeurDepart = null
})

// --- Edition : double-clic sur une note ou sur le vide -------------------

// Le clic simple garde le meme sens qu'en lecture seule (ouvrir la note) :
// editer passe donc par le clic droit, et non par un double-clic -- un
// double-clic aurait declenche le zoom du premier clic avant d'arriver.
if (enEdition) {
  canvas.addEventListener('contextmenu', (e) => {
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const note = trouverNoteSousPointeur(sx, sy, enfants, transform, largeurAffichage(), hauteurAffichage())
    if (!note) return
    e.preventDefault()
    ouvrirPanneau(note)
  })

  // Le vide ne reagit pas au clic simple : le double-clic y est sans ambiguite.
  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    if (trouverNoteSousPointeur(sx, sy, enfants, transform, largeurAffichage(), hauteurAffichage())) return
    notePositionNouvelle = ecranVersMonde(sx, sy, transform, largeurAffichage(), hauteurAffichage())
    ouvrirPanneau(null)
  })
}

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
  notePositionNouvelle = null
}

boutonAnnuler.addEventListener('click', fermerPanneau)

panneau.addEventListener('submit', async (e) => {
  e.preventDefault()
  const titre = champTitre.value.trim()
  const contenu = champContenu.value
  if (!titre) return

  if (editionNoteId !== null) {
    await appelApi('PUT', `/api/write/notes/${editionNoteId}`, { titre, contenu })
  } else {
    const pos = notePositionNouvelle ?? { x: 0, y: 0 }
    await appelApi('POST', '/api/write/notes', {
      parent_id: focusId,
      titre,
      contenu,
      x: pos.x,
      y: pos.y,
    })
  }
  fermerPanneau()
  await allerA(focusId, focusTitre, { animer: false })
})

boutonSupprimer.addEventListener('click', async () => {
  if (editionNoteId === null) return
  if (!confirm('Supprimer cette note et toutes ses notes filles ?')) return
  await appelApi('DELETE', `/api/write/notes/${editionNoteId}`)
  fermerPanneau()
  await allerA(focusId, focusTitre, { animer: false })
})

async function appelApi(methode, url, corps) {
  const rep = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  if (!rep.ok) {
    // Une session Access expiree renverrait ici une redirection/401 : le
    // rechargement de la page relance le flux de login Cloudflare.
    if (rep.status === 401 || rep.status === 403) location.reload()
    throw new Error(`${methode} ${url} : ${rep.status}`)
  }
  return rep.status === 204 ? null : rep.json()
}

// --- Depart --------------------------------------------------------------

allerA(null, 'Racine', { animer: false })
