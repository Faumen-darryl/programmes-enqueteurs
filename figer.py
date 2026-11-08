"""Génère le site statique dans `build/` pour GitHub Pages.

Usage :
    python figer.py

La variable d'environnement URL_DE_BASE donne l'adresse du site publié
(par exemple https://faumen-darryl.github.io/programmes-enqueteurs/), afin que
les liens et les fichiers statiques pointent vers le bon sous-dossier.
Sans elle, le site est généré pour être servi à la racine (aperçu local).
"""

import os

from flask_frozen import Freezer

from app import app


def figer(destination="build", url_de_base=None):
    app.config["FREEZER_DESTINATION"] = destination
    app.config["FREEZER_BASE_URL"] = url_de_base or os.environ.get("URL_DE_BASE") or None
    app.config["FREEZER_REMOVE_EXTRA_FILES"] = True
    app.config["FREEZER_IGNORE_MIMETYPE_WARNINGS"] = True
    freezer = Freezer(app)
    return freezer.freeze()


if __name__ == "__main__":
    pages = figer()
    print(f"{len(pages)} fichiers générés dans {app.config['FREEZER_DESTINATION']}/")
