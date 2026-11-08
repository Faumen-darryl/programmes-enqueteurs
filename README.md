# Programmes d'enquêteurs

Outil web, pour ordinateur, qui aide à construire les programmes des enquêteurs mesurant le taux de fraude des voyageurs sur les lignes de bus d'Île-de-France.

Le site est écrit avec Flask, puis transformé en fichiers statiques et publié gratuitement sur GitHub Pages. Il n'y a pas de serveur : les courses et les programmes restent dans le navigateur de chaque poste.

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
