# Outil de programmes d'enquêteurs (lignes de bus)

Application web statique, **uniquement pour ordinateur**, en **français**, hébergée gratuitement sur GitHub Pages.
Elle aide à construire les programmes des enquêteurs qui mesurent le taux de fraude des voyageurs sur des lignes de bus.

## Vocabulaire (à respecter dans le code et dans l'interface)

- **Enquête** : un questionnaire passé à un voyageur.
- **Ligne** : une ligne de bus (aussi RER, métro, tramway en tant que correspondances).
- **Course** : un ensemble de lignes demandées par le client, avec pour chaque ligne un nombre d'enquêtes commandées. Une course contient plusieurs lignes ; une ligne a plusieurs programmes.
- **Programme** : une journée de travail d'un enquêteur, de 7 heures (entre 7 et 9 heures possibles), soit environ 120 enquêtes (110 à 130). Ces deux valeurs sont des réglages de la course.
- **Segment** : la partie d'un programme faite sur une ligne.
- **Pivot** : arrêt où l'on passe d'une ligne à une autre (correspondance à 150 mètres ou moins).
- **Quota par heure** : nombre d'enquêtes à faire sur une tranche d'une heure (ex. 10 de 7h à 8h, 20 de 8h à 9h).

## Règles métier

1. Le client commande un nombre fixe d'enquêtes par ligne. **Il ne faut jamais en programmer plus** que le reste de la ligne (un surplus est une perte pour l'agence).
2. Nombre de programmes nécessaires pour une ligne = commandées ÷ enquêtes par programme (ex. 240 enquêtes sur la 394 = 2 programmes de 120).
3. Un petit reste (par exemple 45 enquêtes) ne remplit pas une journée : on le combine avec le reste d'une autre ligne en chaînant les deux lignes par un pivot, jusqu'à atteindre le total d'un programme.
4. Le début et la fin d'un programme doivent être faciles d'accès : afficher la gare de RER, la station de métro ou l'arrêt de tramway le plus proche (distance en mètres), avertir s'il n'y en a pas.
5. Un programme est enregistré dans une course. Le total des quotas par heure doit être égal au nombre d'enquêtes du programme.
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
| 2b · Créer une course | `14:325` | fenêtre : nom, enquêtes par programme, durée, lignes avec enquêtes commandées, programmes nécessaires, restes à combiner |
| 3 · Courses | `15:193` | liste des courses, lignes de la course, programmes par ligne, suggestion du programme suivant, « Télécharger la course complète » |

Les composants (pastille de ligne, bouton, barre latérale) sont dans le cadre « Composants » (`1:16`).
Points non vérifiés visuellement : écrans 2 et 2b (limite d'appels Figma atteinte) ; sur l'écran 3, la ligne de détail du programme 2 passe sur trois lignes.
L'étape 1 (barre latérale, pastilles, boutons) a été construite **sans voir la maquette** (limite d'appels Figma atteinte le 8 novembre 2026), à partir des jetons ci-dessous : la comparer au cadre « Composants » dès que possible (largeur de la barre latérale 288 pixels, icônes, rayons, tailles).
Les chiffres de la maquette (noms de courses, commandes, horaires) sont des exemples.

## Données

- Source : jeu « Arrêts et lignes associées » d'Île-de-France Mobilités (données ouvertes, licence ODbL, à citer). CSV séparé par `;`, colonnes `route_id, route_long_name, stop_id, stop_name, stop_lon, stop_lat, OperatorName, shortName, bookingRules, mode, Pointgeo, Nom_commune, Code_insee`.
- Il donne les couples ligne ↔ arrêt avec coordonnées, **mais pas l'ordre des arrêts, ni le sens, ni les horaires**.
- Correspondance = autre ligne ayant un arrêt à 150 mètres ou moins (distance de haversine) d'un arrêt de la ligne ; le détail va jusqu'à 300 mètres. Le rayon est un réglage de l'écran 1 : précalculer les distances jusqu'à 300 mètres et filtrer côté navigateur.
- Libellés : bus = `shortName` ; « RER B », « Métro 12 », « Métro 3bis », « Tramway T6 », « Transilien N », « TER Normandie » (nom long), « Câble C1 », « Funiculaire de Montmartre », « CDG VAL », « ORLYVAL ».
- Le numéro seul n'identifie pas une ligne de bus (55 lignes « Soir », 24 « TàD », deux lignes 45, la 6 de remplacement du métro…) : l'identifiant est le `route_id` sans le préfixe `IDFM:` (ex. `C01319` pour la 394). Pour choisir une ligne, afficher aussi le nom long, l'exploitant et les communes.
- `scripts/construire_donnees.py` (étape 2, faite) remplace l'ancien `correspondances.py` pour toutes les lignes. Il lit `data/brut/arrets-lignes.csv` et écrit `static/donnees/` en 5 secondes environ. Les données générées **sont versionnées** (environ 20 mégaoctets, 2,4 une fois compressés) : le CSV ne l'est pas, donc GitHub Actions ne peut pas les régénérer. Après chaque nouveau CSV : relancer le script, lancer les tests, versionner `static/donnees/`.
- Arrêts : les quais (`stop_id`) de même nom à 400 mètres ou moins les uns des autres (de proche en proche) forment un arrêt. Des homonymes éloignés (« Mairie » dans 9 villages sur une même ligne) deviennent « Mairie (Balloy) », etc.
- Ordre connu : un fichier par ligne dans `data/ordres/` (sens, arrêts dans l'ordre de la fiche horaire, alias fiche → jeu, remarques). Seule la **394** en a un (`data/ordres/394.json`, fiches valables à partir du 24 août 2026). Les arrêts y portent le nom de la fiche horaire, le nom du jeu reste dans `nomIdfm`.
- Fautes du jeu corrigées partout dans `data/corrections_noms.json` (« Brosselette » → « Brossolette » : 394, 195, 432, 441, N32).
- Pour toutes les autres lignes, l'ordre des arrêts et les horaires demandent le **GTFS** (Datahub d'Île-de-France Mobilités). Tant qu'il n'est pas intégré, lister les arrêts de ces lignes de façon claire comme « ordre non disponible » plutôt que d'inventer un ordre.
- Le téléchargement du CSV doit se faire depuis un poste ayant accès à `data.iledefrance-mobilites.fr`. Ne pas le versionner s'il est lourd (dossier `data/brut/` ignoré par git).

### Format des données générées (lu par le JavaScript)

`static/donnees/lignes.json` : `{ source, genereLe, rayonMaximum: 300, lignes: [...] }`, chaque ligne :
`{ id, libelle, nom, famille, operateur, demande, remplacement, arrets, ordre, fichier, communes }`
- `famille` : `bus`, `rer`, `train` (Transilien et TER), `metro`, `tramway`, `navette`, `cable`, `funiculaire`. Pastille bleu clair pour `bus`, bleu foncé pour les autres.
- `demande` : transport à la demande (réservation). `remplacement` : bus de remplacement d'un métro, RER ou tramway. `ordre` : ordre des arrêts connu. `fichier` : un fichier de ligne existe (bus seulement).

`static/donnees/lignes/<id>.json` (lignes de bus) :
`{ id, libelle, nom, famille, operateur, demande, ordre, arrets: [...] }`
- `ordre` : `null` (arrêts par ordre alphabétique, afficher « ordre non disponible ») ou `{ source, sens: [{ nom: "vers Bourg-la-Reine", arrets: [indices dans arrets] }] }`.
- arrêt : `{ nom, nomIdfm?, communes, quais: [stop_id], lat, lon, remarque?, correspondances }`.
- `correspondances` : `[[id de l'autre ligne, nom de l'arrêt sur cette ligne, distance en mètres]]`, la plus proche par ligne, jusqu'à 300 mètres, triées par distance. Le nom est exactement le `nom` de l'arrêt dans le fichier de l'autre ligne : il sert de pivot.

## Architecture (confirmée par Darryl le 8 novembre 2026)

- **Flask figé** : pages écrites avec Flask et des gabarits Jinja (`app.py`, `templates/`), transformées en fichiers statiques par Frozen-Flask (`figer.py` → `build/`) et publiées sur GitHub Pages par GitHub Actions (`.github/workflows/deploiement.yml`). Aucun serveur en production.
- Conséquence : aucune route ne doit dépendre d'une requête (formulaire POST, paramètres d'URL, session). Seulement des pages sans argument, ou dont les arguments sont connus au moment de la génération. Les parties interactives (choix de ligne, rayon, création de course, quotas, contrôle du surplus) sont en JavaScript sans framework, dans `static/js/`.
- Les liens passent toujours par `url_for` : le site est publié dans un sous-dossier (`URL_DE_BASE`, fourni par `actions/configure-pages`). Côté JavaScript, construire les adresses des données à partir d'une URL fournie par le gabarit, jamais en dur.
- Composants Jinja dans `templates/macros.html` : `pastille_ligne`, `bouton`, `message`, `etiquette`, `icone`. La page `/composants/` les montre tous.
- Couleurs dans `static/css/application.css` sous forme de variables (`--texte`, `--primaire`, etc.), reprises des jetons ci-dessus.
- `scripts/construire_donnees.py` → `static/donnees/lignes.json` (index des lignes) et `static/donnees/lignes/<ligne>.json` (arrêts, ordre si connu, correspondances avec distances jusqu'à 300 mètres).
- Courses et programmes : enregistrés dans le navigateur (`localStorage`, clé `programmes-enqueteurs/courses`), avec import et export JSON pour les transférer d'un poste à l'autre. Le pivot retenu dans l'écran 1 est sous `programmes-enqueteurs/pivot-retenu`.
- JavaScript (modules ES, sans construction) dans `static/js/` :
  - `calculs.js` : règles métier pures (heures et tranches, répartition des quotas, état des lignes, contrôle d'un programme, pivots, accès gare, suggestions). Aucun accès à la page : c'est lui qu'on teste.
  - `donnees.js` (chargement et recherche des lignes), `stockage.js` (courses, import, export, exemple de la maquette), `interface.js` (éléments, pastilles, fenêtres, notifications, liste de choix d'une ligne).
  - Un fichier par écran : `ecran-lignes.js`, `ecran-courses.js` (avec la fenêtre 2b), `ecran-programme.js` ; `excel.js` charge `vendor/exceljs.min.js` (ExcelJS 4.4.0, licence MIT) seulement au téléchargement.
  - Navigation par l'ancre de l'adresse : `/#ligne=C01319&arret=…&sens=…&rayon=…`, `/courses/#course=<id>` (`#creer=1` ouvre la fenêtre), `/programme/#course=<id>` (nouveau), `&programme=<id>` (modification), `&suggestion=C01319:75,C01215:45` (pré-rempli).
- Règles appliquées par `verifierProgramme` : bloquent l'enregistrement le surplus sur une ligne (règle 1), un total de quotas différent des enquêtes du segment (règle 5), un segment incomplet ou qui commence avant la fin du précédent ; simples alertes : total différent des enquêtes par programme, durée différente de la durée prévue, pivot à plus de 150 mètres.
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
Segment   { ligne, sens, arretDepart, arretFin, debut: "07:00", fin: "11:30", enquetes,
            quotas: [{ debut, fin, enquetes }] }   // tranches coupées aux heures rondes
```

Calculs : programmées(ligne) = somme des enquêtes des segments de cette ligne ; restantes = commandées − programmées (jamais négatif, bloquer l'enregistrement sinon) ; programmes nécessaires = ⌈total commandé ÷ enquêtes par programme⌉.
Suggestion : paires de lignes de la course dont les restes sont inférieurs à un programme, qui ont un pivot à 150 mètres ou moins, et dont la somme se rapproche de 120. Sont aussi proposés : un programme plein sur une ligne qui a encore 120 enquêtes ou plus, un petit reste complété par une partie d'une grosse ligne, et en dernier recours un petit reste seul. Classement : écart à 120, puis paire, plein, complément, seul, puis distance du pivot. La ligne qui a le plus d'enquêtes passe en premier.

Exemple de la maquette : course « Hauts-de-Seine sud » = 394 (240), 14 (75), 195 (45), soit 360 enquêtes et 3 programmes. Programme 1 : 394 seule (120). Programme 2 : 394 (45) puis 14 (75), pivot Stade du Panorama. Programme 3 suggéré : 394 (75) puis 195 (45), pivot Division Leclerc.

## Ordre de réalisation conseillé

1. Squelette de l'application, mise en page (barre latérale, pastilles, boutons) et déploiement sur GitHub Pages. *Fait le 8 novembre 2026 ; reste à comparer à la maquette.*
2. Script de génération des données pour toutes les lignes. *Fait le 8 novembre 2026.*
3. Écran 1 : lignes, arrêts, correspondances, rayon réglable. *Fait le 8 novembre 2026.*
4. Écran 3 et 2b : courses, stockage dans le navigateur, import/export JSON. *Fait le 8 novembre 2026.*
5. Écran 2 : construction d'un programme avec pivots, quotas, contrôle du surplus. *Fait le 8 novembre 2026.*
6. Téléchargement de la course complète en Excel (généré dans le navigateur, puisque le site n'a pas de serveur). *Fait le 8 novembre 2026.*
7. Horaires et ordre des arrêts de toutes les lignes avec le GTFS.

Avant de coder une étape, confirmer avec Darryl les points marqués « à confirmer ».

**Consigne de Darryl (8 novembre 2026)** : il veut un outil qui fonctionne, pas des pages qui décrivent ce qui viendra. Ne jamais livrer d'écran « en préparation » : construire la fonction, la tester dans un navigateur, puis la montrer. La page `/composants/` reste accessible par son adresse mais n'est plus dans la barre latérale.
