# Mindmap

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

La base est creee et pre-remplie de donnees d'exemple au premier demarrage.

## Fichiers

- `server.js` — routes Express, en-tetes de securite, separation lecture/ecriture
- `db.js` — schema, requetes preparees, donnees d'exemple
- `public/scene.js` — scene Three.js : globe, notes, etiquettes, raycast
- `public/controls.js` — camera spherique : zoom molette, pan, orbite Alt
- `public/app.js` — etat, navigation fractale, HUD, edition
