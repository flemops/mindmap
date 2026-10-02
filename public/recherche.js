// Recherche combobox (§8 de la spec) : indexation BFS paresseuse sur le cache
// de app.js, filtre/scoring local, rendu et clavier ARIA. Module sans etat
// partage avec app.js au-dela des callbacks recus par brancherRecherche :
// il ne connait ni la scene ni l'API, seulement le champ et la liste DOM.

let champEl = null
let listeEl = null
let chargerEnfants = null
let surChoix = null
let surFermeture = null

// Index plat { id, titre, contenu, chemin, ids } et sa promesse de
// construction. `chemin` inclut le titre du noeud lui-meme (dernier
// element) : le fil affiche se deduit en l'excluant (voir rendreResultats).
let index = null
let indexation = null

// Resultats actuellement rendus (hors messages non selectionnables) et index
// du resultat mis en avant au clavier, ou null si aucun.
let resultatsCourants = []
let actif = null

/** Enleve les diacritiques puis bascule en minuscules pour un match tolerant. */
function normaliser(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Parcourt l'arbre par niveau (un aller-retour reseau par profondeur, pas
 * par noeud) en s'appuyant sur le cache de chargerEnfants : le crawl ne
 * touche jamais la scene, il ne fait que rechauffer ce cache pour que les
 * vols ulterieurs vers un resultat soient instantanes.
 */
async function construireIndex() {
  const liste = []
  let lot = [{ id: null, chemin: [], ids: [] }]
  while (lot.length) {
    const enfants = await Promise.all(lot.map((e) => chargerEnfants(e.id)))
    const suivant = []
    lot.forEach((e, i) => {
      enfants[i].forEach((c) => {
        const ids = [...e.ids, c.id]
        const chemin = [...e.chemin, c.titre]
        liste.push({ id: c.id, titre: c.titre, contenu: c.contenu ?? '', chemin, ids })
        suivant.push({ id: c.id, chemin, ids })
      })
    })
    lot = suivant
  }
  return liste
}

/** Memoise la construction : un seul crawl tant que invaliderIndexRecherche() n'est pas appelee. */
function assurerIndex() {
  if (indexation) return indexation
  champEl.setAttribute('aria-busy', 'true')
  indexation = construireIndex().then((liste) => {
    index = liste
    champEl.removeAttribute('aria-busy')
    return liste
  })
  return indexation
}

/** Score 3 (titre commence par q), 2 (titre contient q), 1 (contenu contient q) ; 10 max. */
function filtrer(q) {
  const notes = []
  for (const entree of index) {
    const titre = normaliser(entree.titre)
    let score = 0
    if (titre.startsWith(q)) score = 3
    else if (titre.includes(q)) score = 2
    else if (normaliser(entree.contenu).includes(q)) score = 1
    if (score) notes.push({ entree, score })
  }
  notes.sort((a, b) => b.score - a.score || a.entree.ids.length - b.entree.ids.length || a.entree.titre.localeCompare(b.entree.titre))
  return notes.slice(0, 10).map((n) => n.entree)
}

function ouvrirListe() {
  listeEl.hidden = false
  champEl.setAttribute('aria-expanded', 'true')
}

/** Rendu par createElement/textContent : jamais d'innerHTML sur un titre de note. */
function rendreResultats(entrees) {
  resultatsCourants = entrees
  actif = null
  listeEl.textContent = ''
  entrees.forEach((entree, i) => {
    const li = document.createElement('li')
    li.id = `res-${i}`
    li.dataset.i = String(i)
    li.setAttribute('role', 'option')
    li.setAttribute('aria-selected', 'false')
    const titre = document.createElement('span')
    titre.className = 'resultat-titre'
    titre.textContent = entree.titre
    const chemin = document.createElement('span')
    chemin.className = 'resultat-chemin'
    // chemin[] inclut l'entree elle-meme en dernier : on l'exclut et on
    // prefixe RACINE (racine n'a pas de titre propre dans l'index).
    chemin.textContent = ['Racine', ...entree.chemin.slice(0, -1)].join(' › ')
    li.append(titre, chemin)
    listeEl.appendChild(li)
  })
  champEl.removeAttribute('aria-activedescendant')
  ouvrirListe()
}

/** "Indexation…" / "Aucun résultat" : non selectionnable (aria-disabled), exclu du clavier. */
function rendreMessage(texte) {
  resultatsCourants = []
  actif = null
  listeEl.textContent = ''
  const li = document.createElement('li')
  li.setAttribute('role', 'option')
  li.setAttribute('aria-disabled', 'true')
  li.textContent = texte
  listeEl.appendChild(li)
  champEl.removeAttribute('aria-activedescendant')
  ouvrirListe()
}

function fermerListe() {
  listeEl.hidden = true
  listeEl.textContent = ''
  champEl.setAttribute('aria-expanded', 'false')
  champEl.removeAttribute('aria-activedescendant')
  resultatsCourants = []
  actif = null
}

function appliquerFiltre(q) {
  const trouves = filtrer(q)
  trouves.length ? rendreResultats(trouves) : rendreMessage('Aucun résultat')
}

function surSaisie() {
  const q = normaliser(champEl.value.trim())
  if (!q) { fermerListe(); return }
  if (!index) {
    rendreMessage('Indexation…')
    // L'indexation a deja ete lancee au focus ; on ne fait que reagir a sa
    // fin. Le controle de fraicheur evite d'ecraser une saisie plus recente
    // si l'utilisateur a retape pendant le crawl.
    assurerIndex().then(() => {
      if (normaliser(champEl.value.trim()) === q) appliquerFiltre(q)
    })
    return
  }
  appliquerFiltre(q)
}

function deplacerActif(delta) {
  if (!resultatsCourants.length) return
  const max = resultatsCourants.length - 1
  actif = actif === null ? (delta > 0 ? 0 : max) : Math.min(max, Math.max(0, actif + delta))
  ;[...listeEl.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === actif)))
  const li = listeEl.children[actif]
  li.scrollIntoView({ block: 'nearest' })
  champEl.setAttribute('aria-activedescendant', li.id)
}

function choisir(i) {
  const entree = resultatsCourants[i]
  if (!entree) return
  fermerRecherche()
  surChoix(entree)
}

function surClavierChamp(e) {
  switch (e.key) {
    case 'ArrowDown':
      e.stopPropagation()
      deplacerActif(1)
      break
    case 'ArrowUp':
      e.stopPropagation()
      deplacerActif(-1)
      break
    case 'Enter':
      e.stopPropagation()
      e.preventDefault()
      choisir(actif ?? 0)
      break
    case 'Escape':
      // Consommee ici : la chaine Echap globale (app.js) ne doit pas aussi
      // remonter d'un niveau quand l'utilisateur ferme juste la recherche.
      e.stopPropagation()
      fermerRecherche()
      break
  }
}

function surPointeurListe(e) {
  const li = e.target.closest('li[data-i]')
  if (!li) return
  // preventDefault avant le blur du champ (mousedown le declenche sinon en
  // premier) : le focus reste sur le champ, meme chemin qu'un Enter.
  e.preventDefault()
  choisir(Number(li.dataset.i))
}

/** Branche le module sur le DOM et les callbacks fournis par app.js. */
export function brancherRecherche({ champ, liste, chargerEnfants: cf, surChoix: sc, surFermeture: sf }) {
  champEl = champ
  listeEl = liste
  chargerEnfants = cf
  surChoix = sc
  surFermeture = sf
  champEl.addEventListener('focus', assurerIndex)
  champEl.addEventListener('input', surSaisie)
  champEl.addEventListener('keydown', surClavierChamp)
  listeEl.addEventListener('pointerdown', surPointeurListe)
  champEl.form?.addEventListener('submit', (e) => e.preventDefault())
}

/** A appeler apres toute ecriture (POST/PUT/DELETE/PATCH) : re-crawl au prochain focus. */
export function invaliderIndexRecherche() {
  index = null
  indexation = null
}

export function ouvrirRecherche() {
  champEl.focus()
  champEl.select()
  assurerIndex()
}

export function fermerRecherche() {
  champEl.value = ''
  fermerListe()
  surFermeture()
}
