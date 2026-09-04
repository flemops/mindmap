# Mindmap

Mindmap fractale a navigation spatiale : chaque note contient ses propres
notes. Un clic zoome a l'interieur d'une note pour reveler ses notes filles,
le bouton retour remonte d'un niveau.

Piece de portfolio : **canvas 2D vanilla, aucune librairie de mind-map**.

## Pile

Node 22 + Express + `node:sqlite` (pas de dependance de base de donnees),
canvas 2D ecrit a la main, aucune etape de build, aucun asset distant
(CSP `script-src 'self'`).

## Modele de donnees

Une seule table, recursive :

```
notes(id, parent_id -> notes.id, x, y, titre, contenu)
```

`parent_id NULL` = note de premier niveau. Les coordonnees `(x, y)` sont
relatives a la note parente : chaque niveau est son propre espace.

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
- `public/canvas-renderer.js` — fonctions de dessin pures (aucun etat)
- `public/app.js` — etat, navigation fractale, animation, edition
