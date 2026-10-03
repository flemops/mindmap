---
name: visual-tune
description: Ajuster le rendu du Mindmap à partir d'une intention visuelle (« le globe parent reste trop présent », « les titres des filles sont illisibles », « les ancêtres prennent trop de place ») sans demander de valeurs à Hamdy — trouver les réglages, modifier, vérifier dans un vrai navigateur, itérer, puis présenter. À utiliser pour toute retouche visuelle ou d'animation du Mindmap.
---

# visual-tune — d'une intention à un rendu vérifié

Hamdy donne une intention, pas des nombres. C'est à toi de choisir les valeurs et de prouver le résultat.

## 1. Traduire l'intention en réglages

| Intention | Où regarder |
|---|---|
| Ancêtres / frères trop présents | `apparence.js` → `ROLES.ancetre`, `ROLES.voisin` (k = luminosité, echelle, trait, `bille: false`) |
| Globe parent ou ouvert trop chargé | `GLOBES.parent` / `GLOBES.ouvert` (grille, verre) |
| Lueur trop forte, trop blanche | `LUEUR` (force d'abord, puis `coeur`) |
| Billes trop petites ou grosses, halo | `MONDE.tailleBille`, `billeMin`, `halo`, `ROLES.*.echelle` |
| Titres : taille, opacité au dos, collisions | `style.css` → `--etiquette-*` ; priorités : `ETIQUETTES` |
| Cadrage, distance, vitesse caméra | `CAMERA` ; orientation automatique : `scene.js#directionCadrage` |
| Ce qui se passe pendant une transition | `scene.js#appliquerEtat` (interpolation entre deux rôles) |

Partir du plus petit changement qui sert l'intention. Une valeur à la fois, sauf si l'intention en implique plusieurs (ex. « plus discret » = opacité **et** luminosité).

## 2. Boucle

1. `cp .verif/empreinte.json .verif/empreinte-avant.json` si l'empreinte existe (pour voir ensuite ce qui a bougé).
2. Modifier.
3. `npm run verifier -- --formats 390,1440` (ajouter 319 si le petit écran est en jeu). Doit être vert, sans erreur console.
4. **Relire les captures** de `.verif/` concernées (Read sur les PNG) et juger l'intention, pas seulement l'absence d'erreur. Comparer avec l'état d'avant.
5. Pas convaincant : ajuster et recommencer. Deux ou trois tours suffisent d'habitude.
6. Final : `npm run verifier` (3 formats) vert ; contraste d'un texte modifié ≥ 4,5:1.

## 3. Présenter

Une ou deux lignes : ce qui a changé (réglage → ancienne → nouvelle valeur), la capture à regarder, ce qui n'a pas pu être vérifié (vrai téléphone, fluidité réelle). Ne pas committer sans demande.

## Pièges
- `fitToSphere` remet le décalage vertical à zéro : rappeler `decaler()` après `viserCible()`.
- La fluidité ne se juge pas en headless (rendu logiciel) : signaler, ne pas conclure.
- Le bloom coûte ~×2,5 en images/s quand la caméra bouge : tout ajout d'effet plein écran est à mesurer.
