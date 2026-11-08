import re
from html.parser import HTMLParser
from pathlib import Path

import pytest

from app import app
from figer import figer

PAGES = {
    "/": "Lignes et correspondances",
    "/programme/": "Construire un programme",
    "/courses/": "Courses",
    "/composants/": "Composants de l'interface",
}

# Règle d'interface : aucune abréviation dans les textes affichés.
ABREVIATIONS_INTERDITES = [
    r"\bn°",
    r"\bnum\.",
    r"\btram\b",
    r"\bmin\b",
    r"\bkm\b",
    r"\b\d+\s?m\b",
    r"\b\d+\s?h\b",
]


class TexteVisible(HTMLParser):
    """Récupère le texte affiché, sans le contenu des balises style et script."""

    def __init__(self):
        super().__init__()
        self.morceaux = []
        self._ignore = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self._ignore += 1

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self._ignore -= 1

    def handle_data(self, data):
        if not self._ignore:
            self.morceaux.append(data)


def texte_visible(html):
    analyseur = TexteVisible()
    analyseur.feed(html)
    return " ".join(" ".join(analyseur.morceaux).split())


@pytest.fixture
def client():
    return app.test_client()


@pytest.mark.parametrize("adresse, titre", PAGES.items())
def test_page_affichee_en_francais(client, adresse, titre):
    reponse = client.get(adresse)
    assert reponse.status_code == 200
    html = reponse.get_data(as_text=True)
    assert '<html lang="fr">' in html
    assert f"<h1>{titre}</h1>" in html.replace("&#39;", "'")
    assert "family=Inter" in html


@pytest.mark.parametrize("adresse", PAGES)
def test_lien_actif_dans_la_barre_laterale(client, adresse):
    html = client.get(adresse).get_data(as_text=True)
    assert html.count('aria-current="page"') == 1


@pytest.mark.parametrize("adresse", PAGES)
def test_aucune_abreviation(client, adresse):
    texte = texte_visible(client.get(adresse).get_data(as_text=True))
    for motif in ABREVIATIONS_INTERDITES:
        trouve = re.search(motif, texte, flags=re.IGNORECASE)
        assert trouve is None, f"abréviation « {trouve.group(0)} » sur {adresse}"


def test_site_fige_pour_github_pages(tmp_path):
    destination = tmp_path / "build"
    figer(str(destination), "https://exemple.github.io/programmes-enqueteurs/")

    for chemin in ("index.html", "programme/index.html", "courses/index.html",
                   "composants/index.html", "static/css/application.css"):
        assert (destination / chemin).is_file(), chemin

    accueil = (destination / "index.html").read_text(encoding="utf-8")
    assert 'href="/programmes-enqueteurs/static/css/application.css"' in accueil
    assert 'href="/programmes-enqueteurs/courses/"' in accueil


def test_aucune_donnee_client_dans_les_fichiers_publies():
    """Seules les données ouvertes peuvent être publiées (le site GitHub Pages est public)."""
    racine = Path(app.root_path)
    publies = [p for p in (racine / "static").rglob("*") if p.is_file()]
    interdits = [p for p in publies if p.suffix.lower() in (".xlsx", ".xls", ".csv")]
    assert interdits == []
