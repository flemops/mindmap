# Mindmap — consignes Claude

Mindmap 3D fractale : chaque note contient ses notes, posées sur un globe. Prod : https://mindmap.hamdy-tabsissi.com · suivi : page Notion « PROJET — Mindmap : finir les 5 % restants ».

## Stack
Node 22+, Express, `node:sqlite` (une table récursive `notes`). Front sans build : modules ES servis tels quels, Three.js 0.185 et camera-controls **vendorés** dans `public/vendor/` (jamais de CDN). CSP stricte : aucun script ni style inline (`style-src 'self'`).

## Carte du code
- `public/apparence.js` : **tous les réglages visuels** (couleurs, tailles, opacités par rôle, globes, bloom, caméra). Point d'entrée de toute demande visuelle.
- `public/style.css` : HUD, panneaux ; réglages des titres 3D en variables `--etiquette-*` en tête de fichier.
- `public/scene.js` : mécanique 3D. Rôles ouverte / enfant / petit / voisin / ancêtre / caché ; `appliquerEtat()` est le **seul** endroit qui écrit l'apparence des nœuds ; rendu à la demande (`marquerSale()`).
- `public/controls.js` : caméra (camera-controls) et tri des gestes (clic, glisser, tolérance tactile).
- `public/app.js` : état (`ouverteId`), navigation, HUD, édition. Ne fait pas de maths 3D.
- `server.js` / `db.js` : API publique en lecture, écriture `/api/write/*` protégée en amont par Cloudflare Access.

## Commandes
- `npm start` : http://127.0.0.1:3020 (variables `PORT`, `MINDMAP_DB_PATH`).
- `npm test` : smoke serveur (~8 s). C'est aussi le garde-fou du déploiement.
- `npm run verifier` : parcours navigateur réels (319 et 390 px au doigt, 1440 px à la souris), console, captures dans `.verif/`. Options : `--formats 390` (rapide), `--prod` (copie des données de prod), `--url <url>` (serveur existant), `--comparer .verif/empreinte-avant.json`.

## Règles
- **Changement visuel ou d'interaction : il n'est pas fini tant que `npm run verifier` n'est pas vert et que les captures de `.verif/` n'ont pas été relues.** Le hook de fin de tâche le rappelle.
- **Remanier sans changer le rendu** : `cp .verif/empreinte.json .verif/empreinte-avant.json` avant, puis `npm run verifier -- --comparer .verif/empreinte-avant.json` après.
- Une intention visuelle (« ancêtres moins présents ») se traduit en valeurs dans `apparence.js` / `--etiquette-*` : choisir soi-même, vérifier, itérer. Skill `visual-tune`.
- Palette stricte : `COULEURS` (apparence.js) = variables de `style.css`.
- Pièges Three.js connus : `fitToSphere` remet le décalage vertical à zéro (rappeler `decaler()` après `viserCible()`) ; le raycast ignore `visible` (filtrer via `billesCliquables`) ; masquer une ancre masque tout son sous-arbre.
- Vérification : le navigateur intégré de Claude Code casse les clics en émulation mobile, et un onglet en arrière-plan bride le rendu à ~2 images/s. Passer par `npm run verifier` ; la fluidité ne se mesure que dans un Chrome visible.
- Git : jamais de commit, push ou déploiement sans demande explicite. Merger dans `master` = déploiement auto (CI → tag `prod` → la VM suit en ~3 min). Travailler dans un worktree à partir de `origin/master`.
- Accents dans tout texte visible ; commentaires de code sans accents (style existant).
