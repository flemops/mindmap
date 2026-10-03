# Limites connues

Limites du rendu Three.js (PR #2) et des réglages de lisibilité (PR #3),
documentées ici plutôt que masquées. Vérifiées en production le 03/10/2026 sur
mindmap.hamdy-tabsissi.com, dans un Chrome de bureau (fenêtre 1536 × 639) ;
revérifiées après le déploiement de la PR #3 (Chrome de bureau et émulation
1536 × 639 et 390 × 844).

## Étiquettes au dos du globe

Depuis la PR #3, une étiquette passée derrière le globe (`etiquette--derriere`)
reste lisible (opacité 0,32) et cliquable. Vérifié en production : depuis
« Bienvenue », un clic sur l'étiquette « Projets », au dos du globe, ouvre
« Projets ». Avant la PR #3, ce clic ne faisait rien (2 essais sur 2).

La caméra se tourne vers les notes filles à l'ouverture d'une note, mais des
filles réparties tout autour du globe restent en partie au dos : atténuées,
pas masquées.

Une étiquette qui en recouvre une plus importante (`etiquette--genee`)
s'efface et revient au survol de sa bille. Chemin toujours fiable : la liste
des notes filles dans le panneau latéral, ou la recherche (`/`).

## Échap en toute fin de vol multi-niveaux

Pendant le dernier pas d'un vol multi-niveaux (animation encore en cours),
Échap est absorbé sans effet visible. Un second Échap, une fois la transition
posée, remonte bien d'un niveau.

Vérifié en production sur le vol Racine → Bienvenue → Comment ca marche →
Structure : Échap envoyé à l'arrivée sur « Structure » sans effet, second Échap
700 ms plus tard remonte à « Comment ca marche ». Au repos, Échap remonte d'un
niveau (revérifié après la PR #3 : « Projets » → « Bienvenue »).

Comportement voulu (arrêt propre en fin de pas), pas un piège clavier.

## Performance

Mesurée avant la PR #3 : 144 images par seconde au repos, environ 39 pendant un
vol multi-niveaux, pire écart entre deux images 50 ms, sur une seule machine.

Non remesurée après la PR #3, qui ajoute un calcul de collisions d'étiquettes à
chaque image rendue (négligeable à 8 notes, non testé sur une base plus dense).

## Fil d'Ariane

Corrigé par la PR #3 : le fil se cale sur la note ouverte. Vérifié en
production à quatre niveaux (Racine → Bienvenue → Comment ca marche →
Structure) : à 1536 px, le dernier maillon est entier et le fil défile de
31 px, si bien que c'est le début de « RACINE » qui est rogné à gauche (le fil
reste défilable horizontalement) ; à 390 px, les quatre maillons tiennent
entiers.

## Mobile

Vérifié en production en émulation 390 × 844 : aucun débordement horizontal,
fil d'Ariane et recherche empilés en bas, panneau de note au-dessus. Depuis la
PR #3, le globe est centré dans la zone libre au-dessus du panneau (vérifié sur
« Bienvenue », « Comment ca marche » et « Naviguer »).

Le décalage du globe n'est recalculé qu'à la navigation : après une rotation de
l'écran, il faut ouvrir une note pour le recaler.

Non vérifié : un vrai téléphone, les gestes tactiles (pincer, glisser) et la
fluidité sur mobile.

## Densité d'étiquettes

La cible de 30 étiquettes visibles en même temps n'a pas pu être vérifiée : la
base de production compte 8 notes, les données d'exemple 22. Le comportement
au-delà n'est pas testé.

## Données d'exemple et production

`seed()` ne s'exécute que sur une base neuve. La base de production n'est pas
réécrite : elle garde une seule note racine (« Bienvenue ») et son contenu
diffère des captures de `docs/captures/`, qui montrent les six racines.
