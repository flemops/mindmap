# Limites connues

Limites du rendu Three.js (PR #2), documentées ici plutôt que masquées.
Vérifiées en production le 03/10/2026 sur mindmap.hamdy-tabsissi.com, dans un
Chrome de bureau (fenêtre 1536 × 639, écran 144 Hz).

## Clic sur une étiquette occultée

Une étiquette passée derrière le globe (`etiquette--derriere`, opacité 0,15)
ne répond pas au clic : l'angle de caméra est fixe après `fitToSphere` et le
clic manque la bille 3D sous-jacente.

Vérifié en production : depuis « Bienvenue », un clic sur les étiquettes
occultées « A propos » et « Comment ca marche » ne fait rien (2 essais sur 2).

Chemin fiable : la liste des notes filles dans le panneau latéral (vérifiée :
elle ouvre bien « A propos »), ou la recherche (`/`).

## Échap en toute fin de vol multi-niveaux

Pendant le dernier pas d'un vol multi-niveaux (animation encore en cours),
Échap est absorbé sans effet visible. Un second Échap, une fois la transition
posée, remonte bien d'un niveau.

Vérifié en production sur le vol Racine → Bienvenue → Comment ca marche →
Structure : Échap envoyé à l'arrivée sur « Structure » sans effet, second Échap
700 ms plus tard remonte à « Comment ca marche ».

Comportement voulu (arrêt propre en fin de pas), pas un piège clavier.

## Performance

Au repos : 144 images par seconde. Pendant un vol multi-niveaux : environ
39 images par seconde, pire écart entre deux images 50 ms. La chute pendant les
transitions est réelle dans un navigateur non automatisé ; elle n'a été mesurée
que sur une seule machine.

## Fil d'Ariane tronqué

À quatre niveaux de profondeur, le dernier élément du fil d'Ariane est coupé
(« STRUC » au lieu de « STRUCTURE ») à 1536 px de large. Le fil défile
horizontalement mais sa barre est masquée et il ne se cale pas sur la note
ouverte.

## Mobile

Vérifié en production en émulation 390 × 844 (agent Android, tactile émulé,
clics souris) : aucun débordement horizontal, fil d'Ariane et recherche empilés
en bas, panneau de note au-dessus, ouverture d'une note par son étiquette.

Non vérifié : un vrai téléphone, les gestes tactiles (pincer, glisser) et la
fluidité sur mobile. Le panneau de note recouvre le bas de la scène et peut
cacher des notes filles.

## Densité d'étiquettes

La cible de 30 étiquettes visibles en même temps n'a pas pu être vérifiée : la
base de production compte 8 notes, les données d'exemple 22. Le comportement
au-delà n'est pas testé.

## Données d'exemple et production

`seed()` ne s'exécute que sur une base neuve. La base de production n'est pas
réécrite : elle garde une seule note racine (« Bienvenue ») et son contenu
diffère des captures de `docs/captures/`, qui montrent les six racines.
