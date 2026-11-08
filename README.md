# Programmes d'enquêteurs

Outil web, pour ordinateur, qui aide à construire les programmes des enquêteurs mesurant le taux de fraude des voyageurs sur les lignes de bus d'Île-de-France.

Le site est écrit avec Flask, puis transformé en fichiers statiques et publié gratuitement sur GitHub Pages. Il n'y a pas de serveur : les courses et les programmes restent dans le navigateur de chaque poste.

## Utiliser l'outil

1. **Courses** : « Créer une course » (nom, enquêtes par programme de 50 à 150, durée de 5 à 9 heures, lignes et enquêtes à faire). Pour essayer, « Charger l'exemple de la maquette » crée la course Hauts-de-Seine sud (394, 14, 195).
2. La course affiche le reste à programmer par ligne et **le programme suivant suggéré** (restes combinés par un pivot). « Construire ce programme » ouvre le programme pré-rempli.
3. **Construire un programme** : pour chaque segment, la ligne, la direction (à saisir quand elle n'est pas connue), les arrêts de départ et de fin, les heures de début et de fin (6 heures par défaut, à la minute près) et les quotas par heure : 10 de 6 heures à 7 heures, 20 de 7 heures à 9 heures, 10 de 9 heures à 10 heures, puis 15 par heure, tous modifiables. Le nombre d'enquêtes d'un segment est la somme de ses quotas. Entre deux segments, choisir l'arrêt de pivot. L'enregistrement est bloqué s'il y a un surplus sur une ligne.
4. **Lignes et correspondances** : rechercher une ligne, voir ses arrêts et leurs correspondances, régler le rayon, retenir un arrêt de pivot.
5. **Télécharger la course complète** : un fichier Excel avec une feuille de synthèse et une feuille par ligne.
6. **Exporter / Importer** : pour passer les courses d'un poste à l'autre (fichier JSON). Les courses ne quittent jamais le navigateur autrement.

## Travailler en local

```bash
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/flask --app app run --debug
```

Puis ouvrir http://127.0.0.1:5000.

Lancer les tests :

```bash
.venv/bin/pytest
node --test tests/js/*.test.mjs
```

Générer le site statique dans `build/` :

```bash
.venv/bin/python figer.py
```

## Publication sur GitHub Pages

Chaque envoi sur la branche `main` lance les tests, génère le site et le publie (`.github/workflows/deploiement.yml`).

À faire une seule fois dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

## Confidentialité

Le site GitHub Pages gratuit est public. Le dépôt ne contient que des données ouvertes : aucune commande, course ou programme client ne doit y être ajouté.

## Données

Lignes et arrêts : jeu « Arrêts et lignes associées » d'Île-de-France Mobilités, données ouvertes sous licence ODbL.

## Mettre à jour les données

1. Télécharger l'export CSV du jeu « Arrêts et lignes associées » sur data.iledefrance-mobilites.fr et l'enregistrer sous `data/brut/arrets-lignes.csv` (ce dossier n'est pas versionné).
2. Générer les données :

   ```bash
   .venv/bin/python scripts/construire_donnees.py
   ```

3. Lancer les tests, puis versionner `static/donnees/`.

L'ordre vérifié des arrêts d'une ligne se décrit dans `data/ordres/<ligne>.json` (voir `data/ordres/394.json`).
