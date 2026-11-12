# Outil de programmes d'enquêteurs (lignes de bus)

Application web statique, **uniquement pour ordinateur**, en **français**, hébergée gratuitement sur GitHub Pages.
Elle aide à construire les programmes des enquêteurs qui mesurent le taux de fraude des voyageurs sur des lignes de bus.

## Vocabulaire (à respecter dans le code et dans l'interface)

- **Enquête** : un questionnaire passé à un voyageur.
- **Ligne** : une ligne de bus (aussi RER, métro, tramway en tant que correspondances).
- **Course** : un ensemble de lignes demandées par le client, avec pour chaque ligne un nombre d'**enquêtes à faire**. Une course contient plusieurs lignes ; une ligne a plusieurs programmes. Dans l'interface, écrire « Enquêtes à faire », jamais « commandées » (consigne de Darryl) ; dans le code et les fichiers exportés, le champ reste `commandees`.
- **Programme** : une journée de travail d'un enquêteur, de 7 heures par défaut (entre 5 et 9 heures possibles), soit 120 enquêtes par défaut (entre 50 et 150 possibles). Ces deux valeurs sont des réglages de la course.
- **Segment** : la partie d'un programme faite sur une ligne.
- **Pivot** : arrêt où l'on passe d'une ligne à une autre (correspondance à 150 mètres ou moins).
- **Quota par heure** : nombre d'enquêtes à faire sur une tranche d'une heure. Répartition automatique (consigne de Darryl, heures de pointe) : 10 de 6 heures à 7 heures, 20 de 7 heures à 8 heures, 20 de 8 heures à 9 heures, 10 de 9 heures à 10 heures, puis 15 par heure (jusqu'à 16 heures selon Darryl ; les autres heures valent aussi 15 en attendant sa réponse). Une tranche plus courte reçoit le quota au prorata. Chaque quota reste modifiable à la main. `PROFIL_QUOTAS` dans `calculs.js`.
- **Direction** : sens de circulation d'un segment, nommé par sa destination (« vers Gare de Bourg-la-Reine »). Connue par le GTFS pour presque toutes les lignes (liste de choix) ; pour les lignes sans sens connu, l'utilisateur la saisit (les directions déjà saisies pour la ligne sont proposées). Une direction saisie à la main avant le GTFS reste proposée (« saisie à la main »). `ajusterSens` (`calculs.js`) choisit la direction où l'arrêt de départ précède l'arrêt de fin et complète l'arrêt manquant (premier arrêt ou terminus).

## Règles métier

1. Le client commande un nombre fixe d'enquêtes par ligne. **Il ne faut jamais en programmer plus** que le reste de la ligne (un surplus est une perte pour l'agence).
2. Nombre de programmes nécessaires pour une ligne = enquêtes à faire ÷ enquêtes par programme (ex. 240 enquêtes sur la 394 = 2 programmes de 120).
3. Un petit reste (par exemple 45 enquêtes) ne remplit pas une journée : on le combine avec le reste d'une autre ligne en chaînant les deux lignes par un pivot, jusqu'à atteindre le total d'un programme.
4. Le début et la fin d'un programme doivent être faciles d'accès : afficher la gare de RER, la station de métro ou l'arrêt de tramway le plus proche (distance en mètres), avertir s'il n'y en a pas.
5. Un programme est enregistré dans une course. Le nombre d'enquêtes d'un segment est la somme de ses quotas par heure (il n'y a plus de champ « enquêtes sur ce segment » : Darryl l'a jugé inutile) ; le total du programme est donc toujours égal à la somme des quotas.
6. Une course peut être téléchargée en **un seul fichier** : la course, toutes ses lignes, tous les programmes de chaque ligne (arrêts, horaires, quotas par heure). Fait selon le format proposé (classeur Excel : une feuille « Synthèse » + une feuille par ligne avec chaque programme, ses arrêts, son accès ou son pivot, ses horaires et ses quotas par heure) ; Darryl ne l'a pas encore validé.

## Règles d'interface

- Aucune abréviation dans les textes affichés : « mètres », « tramway », « numéro », « heures ». Les noms propres restent tels quels (RER B, noms de lignes).
- Quand un arrêt n'a pas de correspondance, écrire **« Aucune correspondance »** (pas de tiret).
- Fonds et couleurs : blanc et bleu. Police : Inter.
- Jetons de couleur : texte `#0F2A52`, texte secondaire `#5B6B82`, texte discret `#98A5B8`, primaire `#2563C9`, primaire foncé `#1F4E8C`, bleu clair `#EAF1FB`, bordure `#D5E2F5`, fond de page `#F5F8FD`, succès `#1E8A5A` / `#E3F4EC`, alerte `#B7791F` / `#FDF3DC`.
- Pastille de ligne : bus = fond bleu clair, bordure bleue, texte bleu foncé ; train, métro, tramway = fond bleu foncé, texte blanc.

## Maquette Figma (référence visuelle)

Fichier : https://www.figma.com/design/aNgH9fD4qPoADC7JGvGI6Q (clé `aNgH9fD4qPoADC7JGvGI6Q`), page « Maquette », écrans de 1440 px de large.

| Écran | Nœud | Contenu |
|---|---|---|
| 1 · Lignes et correspondances | `3:2` | choix de ligne, arrêts dans l'ordre avec correspondances (train/métro/tramway séparés des bus), détail d'un arrêt, bouton « Utiliser comme arrêt de pivot » |
| 2 · Construire un programme | `14:82` | choix de la course, reste à programmer par ligne, parcours en segments reliés par des pivots, quotas par heure, total du programme |
| 2b · Créer une course | `14:325` | fenêtre : nom, enquêtes par programme, durée, lignes avec enquêtes à faire, programmes nécessaires, restes à combiner |
| 3 · Courses | `15:193` | liste des courses, lignes de la course, programmes par ligne, suggestion du programme suivant, « Télécharger la course complète » |

Les composants (pastille de ligne, bouton, barre latérale) sont dans le cadre « Composants » (`1:16`).
Points non vérifiés visuellement : écrans 2 et 2b (limite d'appels Figma atteinte) ; sur l'écran 3, la ligne de détail du programme 2 passe sur trois lignes.
L'étape 1 (barre latérale, pastilles, boutons) a été construite **sans voir la maquette** (limite d'appels Figma atteinte le 8 novembre 2026), à partir des jetons ci-dessous : la comparer au cadre « Composants » dès que possible (largeur de la barre latérale 288 pixels, icônes, rayons, tailles).
Les chiffres de la maquette (noms de courses, commandes, horaires) sont des exemples.

## Données

- Source : jeu « Arrêts et lignes associées » d'Île-de-France Mobilités (données ouvertes, licence ODbL, à citer). CSV séparé par `;`, colonnes `route_id, route_long_name, stop_id, stop_name, stop_lon, stop_lat, OperatorName, shortName, bookingRules, mode, Pointgeo, Nom_commune, Code_insee`.
- Il donne les couples ligne ↔ arrêt avec coordonnées, **mais pas l'ordre des arrêts, ni le sens, ni les horaires** : ceux-ci viennent du GTFS (ci-dessous).
- Correspondance = autre ligne ayant un arrêt à 150 mètres ou moins (distance de haversine) d'un arrêt de la ligne ; le détail va jusqu'à 300 mètres. Le rayon est un réglage de l'écran 1 : précalculer les distances jusqu'à 300 mètres et filtrer côté navigateur.
- Libellés : bus = `shortName` ; « RER B », « Métro 12 », « Métro 3bis », « Tramway T6 », « Transilien N », « TER Normandie » (nom long), « Câble C1 », « Funiculaire de Montmartre », « CDG VAL », « ORLYVAL ».
- Le numéro seul n'identifie pas une ligne de bus (55 lignes « Soir », 24 « TàD », deux lignes 45, la 6 de remplacement du métro…) : l'identifiant est le `route_id` sans le préfixe `IDFM:` (ex. `C01319` pour la 394). Pour choisir une ligne, afficher aussi le nom long, l'exploitant et les communes.
- `scripts/construire_donnees.py` (étape 2, faite) remplace l'ancien `correspondances.py` pour toutes les lignes. Il lit `data/brut/arrets-lignes.csv` et `data/brut/IDFM-gtfs.zip` (lecture du GTFS dans `scripts/lire_gtfs.py`) et écrit `static/donnees/` en 25 secondes environ. Les données générées **sont versionnées** (environ 22 mégaoctets) : le CSV et le GTFS ne le sont pas, donc GitHub Actions ne peut pas les régénérer. Mise à jour : `.venv/bin/python scripts/construire_donnees.py --telecharger` (retélécharge les deux fichiers, garde le CSV précédent sous `arrets-lignes.precedent.csv`), puis lancer les tests et versionner `static/donnees/`. `--sans-gtfs` génère sans horaires.
- Arrêts : les quais (`stop_id`) de même nom à 400 mètres ou moins les uns des autres (de proche en proche) forment un arrêt. Des homonymes éloignés (« Mairie » dans 9 villages sur une même ligne) deviennent « Mairie (Balloy) », etc.
- Fiches horaires vérifiées : un fichier par ligne dans `data/ordres/` (sens, arrêts dans l'ordre de la fiche horaire, alias fiche → jeu, remarques). Seule la **394** en a un (`data/ordres/394.json`, fiches valables à partir du 24 août 2026). Pour ces lignes, la fiche donne l'ordre et les noms des arrêts (le nom du jeu reste dans `nomIdfm`), et le script la **compare au GTFS** : chaque sens reçoit `verification: { identique, texte }` et une différence est signalée. Le 12 novembre 2026 : les deux sens de la 394 sont identiques au GTFS.
- Fautes du jeu corrigées partout dans `data/corrections_noms.json` (« Brosselette » → « Brossolette » : 394, 195, 432, 441, N32).
- **Ordre des arrêts, sens et horaires : source = GTFS d'Île-de-France Mobilités** (gratuit, sans compte). Lien direct indiqué par transport.data.gouv.fr : `https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip` (114 mégaoctets le 12 novembre 2026, dont 690 pour `stop_times.txt` une fois décompressé ; horaires sur environ un mois glissant, mis à jour plusieurs fois par jour). Page de référence : https://prim.iledefrance-mobilites.fr/en/jeux-de-donnees/offre-horaires-tc-gtfs-idfm . Documentation des fichiers : https://eu.ftp.opendatasoft.com/stif/GTFS/opendata_gtfs.pdf
- Pourquoi pas le jeu « arrêts et lignes associées » seul : aucune colonne d'ordre ni de sens. Test fait sur la 394 : un ordre géographique (plus proche voisin) remet 26 arrêts sur 28 à la bonne place, mais en connaissant déjà les bons arrêts et sans donner le sens. Trop fragile pour les lignes avec boucle ou branche. Ne pas l'utiliser comme solution.
- Ce que le GTFS fournit : `routes.txt` (ligne, `route_short_name`, mode), `trips.txt` (sens `direction_id`, destination affichée `trip_headsign`), `stop_times.txt` (ordre `stop_sequence` et heures de passage), `stops.txt`, `calendar.txt` et `calendar_dates.txt` (jours de circulation). Identifiants : **les mêmes que le CSV** (`IDFM:C01319` pour la ligne, `IDFM:<numéro>` pour les arrêts de bus, tramway et métro ; `IDFM:monomodalStopPlace:<numéro>` pour RER et Transilien). Les heures dépassent 24 heures après minuit (`29:40:00`). Les lignes d'un même trajet se suivent dans `stop_times.txt` : une seule lecture en flux suffit (20 secondes), directement dans le zip.
- Ce que le script en tire, pour chaque ligne de bus et chaque sens (`scripts/lire_gtfs.py`) : le **parcours principal** (la suite d'arrêts qui couvre le plus de passages, trajets × arrêts, ce qui écarte les services partiels même nombreux), les **variantes** (terminus partiels, déviations ; les 5 plus fréquentes sont gardées), la **destination** affichée la plus fréquente, et pour un **jour de référence** (le mardi de la période où circulent le plus de trajets ; le 1er décembre 2026 pour le GTFS du 12 novembre) : départs par heure, premier et dernier départ. Les arrêts d'un parcours absents du CSV pour cette ligne sont ajoutés depuis `stops.txt` (115 le 12 novembre, commune reprise de l'arrêt le plus proche). Résultat le 12 novembre 2026 : 1 961 lignes de bus sur 1 967 ont leurs sens ; les 6 autres sont des lignes de transport à la demande sans trajet régulier, pour lesquelles la direction se saisit à la main.
- Vérifications du premier essai (12 novembre 2026) : (1) **394 identique** à la fiche horaire dans les deux sens (test `test_394_identique_au_gtfs_dans_les_deux_sens`) ; (2) **`direction_id` n'a pas de sens fixe** (394 : 1 = vers Bourg-la-Reine ; 14 : 0 = vers la Croix de Berny) : les sens sont nommés « vers » + `trip_headsign` ; la liste « Tous les arrêts » suit le sens `direction_id` 0 ; (3) **licence** : sur transport.data.gouv.fr, la ressource « Horaires au format GTFS » est sous **Licence Mobilités**. D'après la page officielle (https://wiki.lafabriquedesmobilites.fr/wiki/Licence_Mobilités), c'est l'ODbL avec ses conditions particulières : seules les données d'horaires d'IDFM y sont soumises ; l'obligation de partage à l'identique porte sur les données du GTFS modifiées, à republier sous la même licence ; s'y ajoutent l'identification du réutilisateur (non demandée pour ce lien) et la compatibilité avec la stratégie de mobilité de l'autorité. Les fichiers générés sont publics dans ce dépôt et la source est citée dans la barre latérale et dans `lignes.json` (`horaires`). Le texte complet de la licence (PDF sur cloud.fabmob.io) n'a pas été lu. (4) Les lignes sans trajet n'arrêtent pas le script.
- **Attention au CSV** : le 12 novembre 2026, l'export de l'API (`URL_CSV`) n'avait que 1 924 lignes de bus au lieu de 1 967 (manquaient notamment la 14 et les lignes de Transdev Vallée Sud, Transdev Sud Yvelines et Keolis Grand Paris Seine Orly), alors que le GTFS les avait. Le script signale les lignes du GTFS absentes du CSV : comparer avec `arrets-lignes.precedent.csv` avant de publier. Les données publiées viennent du CSV fourni par Darryl le 8 novembre 2026 et du GTFS du 12 novembre 2026. L'export de l'API nomme ses colonnes autrement (`id`, `shortname`…) : `charger_csv` accepte les deux formes.
- Le GTFS s'actualise : la commande `--telecharger` ci-dessus le retélécharge et régénère les fichiers (l'ordre des arrêts change rarement, les horaires davantage). La barre latérale affiche la période des horaires et la date de génération des données.
- Autre source gratuite possible, non vérifiée : OpenStreetMap (relations de lignes avec arrêts ordonnés par sens). À réserver au recoupement du GTFS.
- Accès réseau : l'environnement cloud « programmes-enqueteurs » autorise `eu.ftp.opendatasoft.com`, `data.iledefrance-mobilites.fr`, `transport.data.gouv.fr`, `prim.iledefrance-mobilites.fr` (bloqué par Cloudflare pour les robots), `data.iledefrance.fr` et `wiki.lafabriquedesmobilites.fr`. Ailleurs, télécharger depuis un poste qui y a accès. Ne pas versionner le CSV ni le GTFS (dossier `data/brut/` ignoré par git).

### Format des données générées (lu par le JavaScript)

`static/donnees/lignes.json` : `{ source, horaires, genereLe, rayonMaximum: 300, lignes: [...] }` (`source` : le CSV ; `horaires` : le GTFS, avec `licence`, `periode` et `jourReference`), chaque ligne :
`{ id, libelle, nom, famille, operateur, demande, remplacement, arrets, ordre, fichier, communes }`
- `famille` : `bus`, `rer`, `train` (Transilien et TER), `metro`, `tramway`, `navette`, `cable`, `funiculaire`. Pastille bleu clair pour `bus`, bleu foncé pour les autres.
- `demande` : transport à la demande (réservation). `remplacement` : bus de remplacement d'un métro, RER ou tramway. `ordre` : ordre des arrêts connu. `fichier` : un fichier de ligne existe (bus seulement).

`static/donnees/lignes/<id>.json` (lignes de bus) :
`{ id, libelle, nom, famille, operateur, demande, ordre, arrets: [...] }`
- `ordre` : `null` (arrêts par ordre alphabétique, afficher « ordre non disponible ») ou `{ source, sens: [...] }`. Un sens : `{ nom: "vers Gare de Bourg-la-Reine", arrets: [indices dans arrets], destination, directionId, trajets, trajetsTotal, variantes: [{ destination, arrets, trajets }], jour: { passages, passagesParHeure: { "7": 8, … }, premier: "05:56", dernier: "01:25" }, verification? }`. `trajets` : trajets du parcours principal sur toute la période ; `jour` : départs du jour de référence (`horaires.jourReference` de l'index). Les arrêts du fichier sont rangés dans l'ordre des sens, les arrêts hors parcours principaux à la fin.
- arrêt : `{ nom, nomIdfm?, communes, quais: [stop_id], lat, lon, remarque?, correspondances }`.
- `correspondances` : `[[id de l'autre ligne, nom de l'arrêt sur cette ligne, distance en mètres]]`, la plus proche par ligne, jusqu'à 300 mètres, triées par distance. Le nom est exactement le `nom` de l'arrêt dans le fichier de l'autre ligne : il sert de pivot.

## Architecture (confirmée par Darryl le 8 novembre 2026)

- **Flask figé** : pages écrites avec Flask et des gabarits Jinja (`app.py`, `templates/`), transformées en fichiers statiques par Frozen-Flask (`figer.py` → `build/`) et publiées sur GitHub Pages par GitHub Actions (`.github/workflows/deploiement.yml`). Aucun serveur en production.
- Conséquence : aucune route ne doit dépendre d'une requête (formulaire POST, paramètres d'URL, session). Seulement des pages sans argument, ou dont les arguments sont connus au moment de la génération. Les parties interactives (choix de ligne, rayon, création de course, quotas, contrôle du surplus) sont en JavaScript sans framework, dans `static/js/`.
- Les liens passent toujours par `url_for` : le site est publié dans un sous-dossier (`URL_DE_BASE`, fourni par `actions/configure-pages`). Côté JavaScript, construire les adresses des données à partir d'une URL fournie par le gabarit, jamais en dur.
- Composants Jinja dans `templates/macros.html` : `pastille_ligne`, `bouton`, `message`, `etiquette`, `icone`. La page `/composants/` les montre tous.
- Couleurs dans `static/css/application.css` sous forme de variables (`--texte`, `--primaire`, etc.), reprises des jetons ci-dessus.
- `scripts/construire_donnees.py` (entrées : le CSV et le GTFS) → `static/donnees/lignes.json` (index des lignes) et `static/donnees/lignes/<ligne>.json` (pour chaque sens : destination, arrêts ordonnés, variantes, passages du jour de référence ; pour chaque arrêt : correspondances avec distances jusqu'à 300 mètres). Le GTFS dépasse 100 mégaoctets : il est lu en flux dans le zip, jamais chargé en entier ni envoyé au navigateur.
- Courses et programmes : enregistrés dans le navigateur (`localStorage`, clé `programmes-enqueteurs/courses`), avec import et export JSON pour les transférer d'un poste à l'autre. Le pivot retenu dans l'écran 1 est sous `programmes-enqueteurs/pivot-retenu`.
- JavaScript (modules ES, sans construction) dans `static/js/` :
  - `calculs.js` : règles métier pures (heures et tranches, répartition des quotas, état des lignes, contrôle d'un programme, pivots, accès gare, suggestions). Aucun accès à la page : c'est lui qu'on teste.
  - `donnees.js` (chargement et recherche des lignes), `stockage.js` (courses, import, export, exemple de la maquette), `interface.js` (éléments, pastilles, fenêtres, notifications, liste de choix d'une ligne).
  - Un fichier par écran : `ecran-lignes.js`, `ecran-courses.js` (avec la fenêtre 2b), `ecran-programme.js` ; `excel.js` charge `vendor/exceljs.min.js` (ExcelJS 4.4.0, licence MIT) seulement au téléchargement.
  - Navigation par l'ancre de l'adresse : `/#ligne=C01319&arret=…&sens=…&rayon=…`, `/courses/#course=<id>` (`#creer=1` ouvre la fenêtre), `/programme/#course=<id>` (nouveau), `&programme=<id>` (modification), `&suggestion=C01319:75,C01215:45` (pré-rempli).
- Règles appliquées par `verifierProgramme` : bloquent l'enregistrement le surplus sur une ligne (règle 1), un segment sans enquête, un segment incomplet (ligne, arrêts, heures) ou qui commence avant la fin du précédent ; simples alertes : direction non renseignée, total différent des enquêtes par programme, durée différente de la durée prévue, pivot à plus de 150 mètres.
- Horaires : un programme commence par défaut à 06:00 ; heures et minutes se choisissent dans deux listes (00 à 23, 00 à 59). Un programme pré-rempli (suggestion, nouveau programme, segment ajouté) dure le temps que les quotas par défaut atteignent son nombre d'enquêtes (`finPourObjectif`) : 120 enquêtes depuis 06:00 finissent à 14:00, soit 8 heures, d'où une alerte si la course prévoit 7 heures.
- Affichage : pensé pour 1280 à 1440 pixels de large et plus ; en dessous de 1400 pixels, la barre latérale et les colonnes se resserrent. Écran 1 : correspondances d'un arrêt sur toute la largeur (train, métro, tramway sur une ligne, bus en dessous, 12 bus au plus puis « et N autres bus »), une seule pastille par libellé ; le détail regroupe les correspondances par arrêt de l'autre ligne. Vérifier l'absence de débordement sur la Gare du Nord (ligne 91, `C01122`) et la Gare de Meaux (ligne 7702, `C01820`), les arrêts les plus chargés.
- **Confidentialité** : GitHub Pages gratuit est public. Aucune donnée client (commandes, courses, programmes) ne doit être dans le dépôt, seulement les données ouvertes. Le `.gitignore` exclut `*.xlsx`, `*.xls`, `exports/` et `courses*.json` ; un test vérifie qu'aucun fichier Excel ou CSV n'est dans `static/`.
- Tests : `node --test tests/js/*.test.mjs` (calculs : quotas, surplus, pivots, suggestion de la maquette) et `pytest` (pages affichées, lien actif, absence d'abréviations dans les gabarits, site figé sous un sous-dossier, données générées). Ils tournent avant chaque déploiement. Les textes écrits par le JavaScript ne sont pas couverts par `pytest` : les vérifier dans un navigateur (Playwright) après chaque changement d'interface.

Commandes :

```bash
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/flask --app app run --debug        # développement, http://127.0.0.1:5000
.venv/bin/pytest                             # tests Python
node --test tests/js/*.test.mjs              # tests des calculs
.venv/bin/python figer.py                    # site statique dans build/
```

## Modèle de données

```
Course    { id, nom, enquetesParProgramme: 120, dureeProgrammeHeures: 7,
            lignes: [{ ligne, commandees }], programmes: Programme[] }
Programme { id, numero, segments: Segment[] }
Segment   { ligne, sens /* direction */, arretDepart, arretFin, debut: "06:00", fin: "11:00",
            enquetes /* = somme des quotas, recalculée */, quotas: [{ debut, fin, enquetes }] }   // tranches coupées aux heures rondes
```

Calculs : programmées(ligne) = somme des enquêtes des segments de cette ligne ; restantes = à faire − programmées (jamais négatif, bloquer l'enregistrement sinon) ; programmes nécessaires = ⌈total à faire ÷ enquêtes par programme⌉.
Suggestion : paires de lignes de la course dont les restes sont inférieurs à un programme, qui ont un pivot à 150 mètres ou moins, et dont la somme se rapproche de 120. Sont aussi proposés : un programme plein sur une ligne qui a encore 120 enquêtes ou plus, un petit reste complété par une partie d'une grosse ligne, et en dernier recours un petit reste seul. Classement : écart à 120, puis paire, plein, complément, seul, puis distance du pivot. La ligne qui a le plus d'enquêtes passe en premier.

Exemple de la maquette : course « Hauts-de-Seine sud » = 394 (240), 14 (75), 195 (45), soit 360 enquêtes et 3 programmes. Programme 1 : 394 seule (120). Programme 2 : 394 (45) puis 14 (75), pivot Stade du Panorama. Programme 3 suggéré : 394 (75) puis 195 (45), pivot Division Leclerc.

## Ordre de réalisation conseillé

1. Squelette de l'application, mise en page (barre latérale, pastilles, boutons) et déploiement sur GitHub Pages. *Fait le 8 novembre 2026 ; reste à comparer à la maquette.*
2. Script de génération des données pour toutes les lignes, **avec le GTFS** (ordre des arrêts, sens, destination, passages par heure). Validé sur la 394 en comparant à la fiche horaire. *Fait le 8 novembre 2026 (CSV), GTFS ajouté le 12 novembre 2026.*
3. Écran 1 : lignes, arrêts dans l'ordre, sens, correspondances, rayon réglable. *Fait le 8 novembre 2026 ; sens et départs du GTFS affichés le 12 novembre 2026.*
4. Écran 3 et 2b : courses, stockage dans le navigateur, import/export JSON. *Fait le 8 novembre 2026.*
5. Écran 2 : construction d'un programme avec pivots, quotas, contrôle du surplus. *Fait le 8 novembre 2026.*
6. Téléchargement de la course complète en Excel (généré dans le navigateur, puisque le site n'a pas de serveur). *Fait le 8 novembre 2026.*
7. Utiliser les passages par heure du GTFS pour proposer des quotas par heure et vérifier la durée d'un programme (à confirmer avec Darryl : comment combiner avec sa répartition des heures de pointe).

Avant de coder une étape, confirmer avec Darryl les points marqués « à confirmer ».

**Consigne de Darryl (8 novembre 2026)** : il veut un outil qui fonctionne, pas des pages qui décrivent ce qui viendra. Ne jamais livrer d'écran « en préparation » : construire la fonction, la tester dans un navigateur, puis la montrer. La page `/composants/` reste accessible par son adresse mais n'est plus dans la barre latérale.
