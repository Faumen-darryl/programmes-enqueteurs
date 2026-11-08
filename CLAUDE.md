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
6. Une course peut être téléchargée en **un seul fichier** : la course, toutes ses lignes, tous les programmes de chaque ligne (arrêts, horaires, quotas par heure). Format proposé : classeur Excel, une feuille de synthèse + une feuille par ligne (à confirmer avec Darryl).

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
- Libellés : bus = `shortName` ; « RER B », « Métro 12 », « Tramway T6 », « Transilien N » pour le reste.
- `correspondances.py` (déjà écrit) fait ce calcul pour une ligne et contient l'ordre vérifié des arrêts de la **394** (`ORDRE_394`), les alias de noms entre fiche horaire et jeu de données (`ALIAS_394`) et des cas particuliers (ex. « Brosselette » est une faute dans le jeu IDFM). À transformer en script de génération de données pour toutes les lignes.
- Pour toutes les autres lignes, l'ordre des arrêts et les horaires demandent le **GTFS** (Datahub d'Île-de-France Mobilités). Tant qu'il n'est pas intégré, lister les arrêts de ces lignes de façon claire comme « ordre non disponible » plutôt que d'inventer un ordre.
- Le téléchargement du CSV doit se faire depuis un poste ayant accès à `data.iledefrance-mobilites.fr`. Ne pas le versionner s'il est lourd (dossier `data/brut/` ignoré par git).

## Architecture (confirmée par Darryl le 8 novembre 2026)

- **Flask figé** : pages écrites avec Flask et des gabarits Jinja (`app.py`, `templates/`), transformées en fichiers statiques par Frozen-Flask (`figer.py` → `build/`) et publiées sur GitHub Pages par GitHub Actions (`.github/workflows/deploiement.yml`). Aucun serveur en production.
- Conséquence : aucune route ne doit dépendre d'une requête (formulaire POST, paramètres d'URL, session). Seulement des pages sans argument, ou dont les arguments sont connus au moment de la génération. Les parties interactives (choix de ligne, rayon, création de course, quotas, contrôle du surplus) sont en JavaScript sans framework, dans `static/js/`.
- Les liens passent toujours par `url_for` : le site est publié dans un sous-dossier (`URL_DE_BASE`, fourni par `actions/configure-pages`). Côté JavaScript, construire les adresses des données à partir d'une URL fournie par le gabarit, jamais en dur.
- Composants Jinja dans `templates/macros.html` : `pastille_ligne`, `bouton`, `message`, `etiquette`, `icone`. La page `/composants/` les montre tous.
- Couleurs dans `static/css/application.css` sous forme de variables (`--texte`, `--primaire`, etc.), reprises des jetons ci-dessus.
- `scripts/construire_donnees.py` → `static/donnees/lignes.json` (index des lignes) et `static/donnees/lignes/<ligne>.json` (arrêts, ordre si connu, correspondances avec distances jusqu'à 300 mètres).
- Courses et programmes : enregistrés dans le navigateur (`localStorage`), avec import et export JSON pour les transférer d'un poste à l'autre.
- **Confidentialité** : GitHub Pages gratuit est public. Aucune donnée client (commandes, courses, programmes) ne doit être dans le dépôt, seulement les données ouvertes. Le `.gitignore` exclut `*.xlsx`, `*.xls`, `exports/` et `courses*.json` ; un test vérifie qu'aucun fichier Excel ou CSV n'est dans `static/`.
- Tests : `pytest` (pages affichées, lien actif, absence d'abréviations, site figé sous un sous-dossier). Ils tournent avant chaque déploiement.

Commandes :

```bash
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/flask --app app run --debug        # développement, http://127.0.0.1:5000
.venv/bin/pytest                             # tests
.venv/bin/python figer.py                    # site statique dans build/
```

## Modèle de données

```
Course    { id, nom, enquetesParProgramme: 120, dureeProgrammeHeures: 7,
            lignes: [{ ligne, commandees }], programmes: Programme[] }
Programme { id, numero, segments: Segment[] }
Segment   { ligne, sens, arretDepart, arretFin, debut, fin,
            quotas: [{ debut, fin, enquetes }] }
```

Calculs : programmées(ligne) = somme des enquêtes des segments de cette ligne ; restantes = commandées − programmées (jamais négatif, bloquer l'enregistrement sinon) ; programmes nécessaires = ⌈total commandé ÷ enquêtes par programme⌉.
Suggestion : paires de lignes de la course dont les restes sont inférieurs à un programme, qui ont un pivot à 150 mètres ou moins, et dont la somme se rapproche de 120.

Exemple de la maquette : course « Hauts-de-Seine sud » = 394 (240), 14 (75), 195 (45), soit 360 enquêtes et 3 programmes. Programme 1 : 394 seule (120). Programme 2 : 394 (45) puis 14 (75), pivot Stade du Panorama. Programme 3 suggéré : 394 (75) puis 195 (45), pivot Division Leclerc.

## Ordre de réalisation conseillé

1. Squelette de l'application, mise en page (barre latérale, pastilles, boutons) et déploiement sur GitHub Pages. *Fait le 8 novembre 2026 ; reste à comparer à la maquette.*
2. Script de génération des données pour toutes les lignes.
3. Écran 1 : lignes, arrêts, correspondances, rayon réglable.
4. Écran 3 et 2b : courses, stockage dans le navigateur, import/export JSON.
5. Écran 2 : construction d'un programme avec pivots, quotas, contrôle du surplus.
6. Téléchargement de la course complète en Excel (généré dans le navigateur, puisque le site n'a pas de serveur).
7. Horaires et ordre des arrêts de toutes les lignes avec le GTFS.

Avant de coder une étape, confirmer avec Darryl les points marqués « à confirmer ».
