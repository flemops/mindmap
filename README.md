# Mindmap

<!-- déploiement continu (pull-based) actif depuis le 09/09/2026 -->

Mindmap 3D a navigation spatiale : chaque note contient ses propres notes.

**Un seul monde continu.** Ouvrir une note fait apparaitre ses notes filles
*autour d'elle*, dans le meme espace, reliees par un trait -- le niveau
precedent reste visible. Il n'y a jamais de bascule vers une scene isolee :
on ne change pas de fenetre, le monde grandit autour de ce qu'on ouvre. Le
contenu de la note ouverte s'affiche dans un panneau lateral.

Piece de portfolio : **Three.js, aucune librairie de mind-map**.

## Pile

Node 22 + Express + `node:sqlite` (pas de dependance de base de donnees),
Three.js servi en local, aucune etape de build, aucun asset distant
(CSP `script-src 'self'`).

## Modele de donnees

Une seule table, recursive :

```
notes(id, parent_id -> notes.id, x, y, titre, contenu)
```

`parent_id NULL` = note de premier niveau. `(x, y)` sont une **longitude et une
latitude en degres** : la place de la note sur le globe de sa note parente.
Chaque niveau est donc son propre espace.

## Acces

- **Lecture publique** : `/`, `/api/notes/:id` — ouvert, sans authentification.
- **Ecriture protegee** : `/edit`, `/api/write/*` — derriere Cloudflare Access
  en *path-policy* (une seule application Access ciblant deux chemins du meme
  sous-domaine, le reste restant public).

Le serveur n'implemente **aucune** logique de mot de passe : l'authentification
est entierement geree en amont par Cloudflare Access. Le service n'ecoute que
sur `127.0.0.1` et n'est joignable que par le tunnel cloudflared, donc l'origine
n'est pas atteignable directement.

## Developpement

```
npm install
node server.js      # http://127.0.0.1:3020
```

La base est creee et pre-remplie de donnees d'exemple au premier demarrage
(6 notes racine avec 2-3 filles chacune).

## Addons vendores

Aucune etape de build, aucun asset distant (CSP `script-src 'self'`) : Three.js
et ses addons sont copies depuis `node_modules` dans `public/vendor/`, sous un
dossier par version (`three-0.185.1/`, `camera-controls-3.1.2/`) -- une montee
de version cree un nouveau dossier plutot que d'ecraser l'ancien, ce qui rend
le cache HTTP long et `immutable` sans risque. Les specificateurs nus `'three'`
des addons sont reecrits en chemin relatif vers `build/three.module.min.js`
(une import map inline serait bloquee par la CSP).

| Addon | Pourquoi |
|---|---|
| `three` (build + core) | Moteur de rendu 3D du globe fractal |
| `renderers/CSS2DRenderer.js` | Etiquettes de notes en HTML natif (nettes a tout zoom), plutot que des sprites canvas |
| `postprocessing/EffectComposer.js` + `RenderPass.js` | Pipeline de rendu multi-passes, socle du bloom |
| `postprocessing/UnrealBloomPass.js` | Lueur ambree de la note ouverte |
| `postprocessing/OutputPass.js` | Tone mapping + conversion sRGB en sortie de pipeline, sans lequel le rendu post-composer est trop sombre |
| `postprocessing/{Pass,ShaderPass,MaskPass}.js` | Dependances internes d'EffectComposer/UnrealBloomPass |
| `shaders/{CopyShader,LuminosityHighPassShader,OutputShader}.js` | Shaders consommes par les passes ci-dessus |
| `camera-controls` | Camera orbitale avec cadrage anime (`fitToSphere`) sur la sphere de la note ouverte |

Pour monter une nouvelle version : copier les fichiers dans un nouveau dossier
`public/vendor/<lib>-<version>/`, reecrire les specificateurs `'three'` des
addons (`sed` sur `from '../../../build/three.module.min.js'`), mettre a jour
les imports dans `public/*.js`, laisser l'ancien dossier tant qu'un visiteur
peut encore l'avoir en cache (7 jours).

## Fichiers

- `server.js` — routes Express, en-tetes de securite, separation lecture/ecriture, montage statique de `public/vendor/`
- `db.js` — schema, requetes preparees, donnees d'exemple
- `public/scene.js` — scene Three.js : globe fractal, etiquettes CSS2D, bloom, raycast
- `public/controls.js` — adaptateur camera-controls : orbite, pan, dolly, cadrage anime
- `public/anim.js` — utilitaire de transition (`tween`), sans dependance, respecte `prefers-reduced-motion`
- `public/recherche.js` — recherche combobox : indexation paresseuse de l'arbre, filtre, clavier
- `public/app.js` — etat, navigation fractale, HUD, edition
- `public/vendor/` — Three.js et camera-controls vendores (voir ci-dessus)
