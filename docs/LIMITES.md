# Limites connues

Limites relevées à la livraison du rendu Three.js (PR #2). Elles sont
documentées ici plutôt que masquées ; aucune n'est une régression.

## Clic sur une étiquette occultée

Une étiquette passée derrière le globe (`etiquette--derriere`) reste cliquable,
mais le clic peut manquer la bille 3D sous-jacente selon la longitude/latitude
de la note, l'angle de caméra étant fixe après `fitToSphere`.

Chemin fiable : la liste des notes filles dans le panneau latéral, ou la
recherche (`/`).

## Échap en toute fin de vol multi-niveaux

Pendant le dernier pas d'un vol multi-niveaux (animation encore en cours),
Échap est absorbé sans effet visible. Un second Échap, une fois la transition
posée (environ 250 ms plus tard), remonte bien d'un niveau.

Comportement voulu (arrêt propre en fin de pas), pas un piège clavier.

## Performance

37 à 46 images par seconde mesurées en Chrome headless piloté par Playwright,
avec rotation souris synthétique continue. Cette méthode ajoute un surcoût qui
ne représente pas un usage réel : la fluidité n'a pas été mesurée dans un
navigateur non automatisé.

## Densité d'étiquettes

La cible de 30 étiquettes visibles en même temps n'a pas pu être vérifiée : les
données d'exemple comptent 22 notes, soit 4 à 7 étiquettes visibles selon le
niveau ouvert. Le comportement au-delà n'est pas testé.

## Données d'exemple et production

`seed()` ne s'exécute que sur une base neuve. Une base existante (la
production) n'est jamais réécrite : elle ne reçoit donc pas les six notes
racine, et son contenu diffère des captures de `docs/captures/`.
