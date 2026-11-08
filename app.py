"""Outil de programmes d'enquêteurs : application Flask.

Le site publié sur GitHub Pages est statique : `figer.py` transforme chaque page
en fichier HTML. Aucune route ne doit donc dépendre d'une requête (formulaire,
paramètres d'URL) ; les parties interactives sont écrites en JavaScript.
"""

from flask import Flask, render_template

app = Flask(__name__)

# Entrées de la barre latérale : (point d'entrée Flask, libellé, icône).
NAVIGATION = [
    ("lignes", "Lignes et correspondances", "lignes"),
    ("programme", "Construire un programme", "programme"),
    ("courses", "Courses", "courses"),
]


@app.context_processor
def variables_communes():
    return {"navigation": NAVIGATION}


@app.route("/")
def lignes():
    return render_template("lignes.html", titre="Lignes et correspondances")


@app.route("/programme/")
def programme():
    return render_template("programme.html", titre="Construire un programme")


@app.route("/courses/")
def courses():
    return render_template("courses.html", titre="Courses")


@app.route("/composants/")
def composants():
    return render_template("composants.html", titre="Composants de l'interface")
