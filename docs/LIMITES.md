# Limites connues

Limites du rendu Three.js (PR #2) et des réglages de lisibilité (PR #3),
documentées ici plutôt que masquées. Vérifiées en production le 03/10/2026 sur
mindmap.hamdy-tabsissi.com, dans un Chrome de bureau (fenêtre 1536 × 639) ;
revérifiées après le déploiement de la PR #3 (Chrome de bureau et émulation
1536 × 639 et 390 × 844). Les finitions du 03/10/2026 (aide, panneau repliable,
rotation, ancêtres, recherche) sont vérifiées par `npm run verifier`.

## Étiquettes au dos du globe

Une étiquette passée derrière le globe (`etiquette--derriere`) reste lisible et
cliquable : opacité 0,6 pour une fille (cible de navigation de premier rang,
~6:1 sur le fond), 0,32 pour une petite-fille. Vérifié en production : depuis
« Bienvenue », un clic sur l'étiquette « Projets », au dos du globe, ouvre
« Projets ». Avant la PR #3, ce clic ne faisait rien (2 essais sur 2).

La caméra se tourne vers les notes filles à l'ouverture d'une note, mais trois
filles réparties tout autour du globe ne tiennent jamais toutes sur la face
avant : il en reste une au dos, lisible à 0,6.

## Ancêtres et globe parent

La bille d'un ancêtre (au centre du globe parent, souvent juste derrière la
caméra) formait un grand disque sombre ; elle est désormais masquée au repos et
n'est plus cliquable. On remonte par le fil d'Ariane, « remonter » ou Échap.
Le filaire du globe parent passe de 0,035 à 0,022 d'opacité. Réglages :
`public/apparence.js` (`ROLES.ancetre`, `GLOBES.parent`).

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

Mesurée le 03/10/2026 sur la prod, dans un Chrome visible au premier plan
(Intel Iris Xe, fenêtre 1440 × 900) :

| Phase | Avec bloom | Sans bloom (`?sansbloom`) |
|---|---|---|
| Repos | 144 images/s | 144 images/s |
| Vol simple | 30 images/s (une image sur deux > 33 ms) | 76 images/s |
| Orbite à la souris | 38 images/s | 94 images/s |
| Vol multi-niveaux | 35 images/s | 107 images/s |

Le bloom (`UnrealBloomPass`, plein écran) est le goulot dès que la caméra bouge :
×2,5 à ×3. Il est donc **coupé sur téléphone** (pointeur tactile et petit côté de
l'écran sous 600 px ; réglage `LUEUR` dans `public/apparence.js`, `?avecbloom`
pour comparer). Sans bloom, les billes gardent l'ambre exact (gain plafonné à 1,
sinon la teinte saturait en jaune citron) et seul le halo de la note ouverte
suggère la lueur.

Mesure en émulation téléphone (390 × 844, CPU ralenti ×4, même GPU de portable :
ordre de grandeur, pas une mesure sur téléphone) :

| Phase | Avec bloom | Sans bloom |
|---|---|---|
| Vol multi-niveaux | 20 images/s, 84 % d'images > 33 ms | 37 images/s, 21 % |
| Vol simple | 22 images/s, 73 % > 33 ms | 25 images/s, 36 % |
| Repos après ouverture | 21 images > 33 ms sur 317 | 2 sur 359 |

Le vol simple reste limité par le processeur (chargement, création des
étiquettes), pas par le rendu.

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

Rotation de l'écran : le globe est recadré et recentré tout de suite (avant, il
gardait le décalage du portrait jusqu'à la navigation suivante). Sous 560 px, le
panneau de note se réduit à son titre (bouton ▾) : il couvre alors 20 % de la
hauteur au lieu de 42 % à 319 px, et le globe se recentre dans la place libérée.
Une aide de première visite s'affiche à la racine (en haut sur téléphone, en bas
à gauche sur bureau) ; elle ne revient plus dès qu'une note a été ouverte ou
qu'elle a été fermée (mémoire du navigateur, sinon elle réapparaît sans erreur).

## Anomalies « note ouverte sans Entrée » et « clic sans effet »

Vues deux fois lors des premiers contrôles en prod, expliquées le 03/10/2026 :

- La recherche choisissait un résultat dès l'appui (`pointerdown`) : un doigt
  posé sur la liste pour la faire défiler ouvrait une note (reproduit : glisser
  sur la liste ouvrait « A propos »). Le choix se fait désormais au clic.
- Un clic pendant une transition (≈ 0,6 s après chaque ouverture, plus si les
  filles tardent à arriver) est ignoré par conception : un seul vol à la fois.
  Reproduit : un tap sur une fille 250 ms après l'ouverture de sa mère ne fait
  rien. Dans un onglet en arrière-plan (cas des premiers contrôles), le rendu
  tombe à ~2 images/s et la transition dure d'autant : d'où les « clics sans
  effet ». Juste après le chargement, 12 taps sur 12 ouvrent la note.

## Taps sur téléphone

Retour de test sur un vrai téléphone (03/10/2026) : les taps marchaient mal.
Reproduit en Chrome headless (390 × 844, densité 3, vrais événements tactiles)
puis corrigé par les PR #4 et #5 :

- une bille fait 6 à 10 px de diamètre sur téléphone ; un tap décalé de 8 px ne
  faisait rien. Un tap qui manque une bille retient désormais la fille ou
  petite-fille la plus proche à 22 px près (6 px à la souris) ;
- la caméra faisait un second balayage après le vol, pendant lequel un tap
  ratait sa cible. Les filles des notes de premier niveau sont préchargées et la
  réorientation se fait en plein vol : un seul mouvement, vue immobile vers 2 s
  après le tap, y compris avec 300 ms de latence simulée ;
- l'étiquette de la note ouverte n'intercepte plus le tap destiné à la bille
  qu'elle recouvre.

Vérifié en production après déploiement : 17 taps sur 17 (bille au centre,
décalée de 8 à 15 px, étiquette, petites-filles), contre 12 sur 17 avant.

Non vérifié : un vrai téléphone après correctif, les gestes pincer et glisser,
la fluidité réelle sur mobile.

## Densité d'étiquettes

La cible de 30 étiquettes visibles en même temps n'a pas pu être vérifiée : la
base de production compte 8 notes, les données d'exemple 22. Le comportement
au-delà n'est pas testé.

## Données d'exemple et production

`seed()` ne s'exécute que sur une base neuve. La base de production n'est pas
réécrite : elle garde une seule note racine (« Bienvenue ») et son contenu
diffère des captures de `docs/captures/`, qui montrent les six racines.
