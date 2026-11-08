import csv
import json
import math
from pathlib import Path

import pytest

from scripts.construire_donnees import (RAYON_MAXIMUM, construire, ecrire, haversine, libelle,
                                        ordre_general, regrouper_quais)

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "static" / "donnees"

ENTETES = ["route_id", "route_long_name", "stop_id", "stop_name", "stop_lon", "stop_lat", "OperatorName",
           "shortName", "bookingRules", "mode", "Pointgeo", "Nom_commune", "Code_insee"]
BASE = (48.80, 2.30)


def decale(nord, est, origine=BASE):
    """Point situé à `nord` et `est` mètres de l'origine."""
    lat = origine[0] + nord / 111_195
    lon = origine[1] + est / (111_195 * math.cos(math.radians(origine[0])))
    return lat, lon


def rangee(route_id, nom_court, mode, stop_id, nom_arret, point, commune="Ville", nom_long=None, reservation=""):
    return {"route_id": route_id, "route_long_name": nom_long or nom_court, "stop_id": stop_id,
            "stop_name": nom_arret, "stop_lon": str(point[1]), "stop_lat": str(point[0]),
            "OperatorName": "Exploitant", "shortName": nom_court, "bookingRules": reservation, "mode": mode,
            "Pointgeo": "", "Nom_commune": commune, "Code_insee": ""}


@pytest.fixture
def rangees():
    return [
        # Ligne étudiée : trois arrêts sur 2 kilomètres, l'arrêt B a deux quais proches
        rangee("IDFM:C01319", "394", "Bus", "IDFM:1", "Arrêt A", decale(0, 0)),
        rangee("IDFM:C01319", "394", "Bus", "IDFM:2", "Arrêt B", decale(0, 1000)),
        rangee("IDFM:C01319", "394", "Bus", "IDFM:3", "Arrêt B", decale(30, 1000)),
        rangee("IDFM:C01319", "394", "Bus", "IDFM:4", "Pierre Brosselette", decale(0, 2000)),
        # Bus à 120 mètres de B
        rangee("IDFM:C00350", "14", "Bus", "IDFM:10", "Stade", decale(120, 1000)),
        # RER à 250 mètres de l'arrêt Brossolette : visible jusqu'à 300 mètres, pas à 150
        rangee("IDFM:C01743", "B", "RapidTransit", "IDFM:20", "Gare RER", decale(250, 2000)),
        # Lignes lointaines
        rangee("IDFM:C01373", "3B", "Metro", "IDFM:30", "Station", decale(5000, 0)),
        rangee("IDFM:C01390", "T6", "Tramway", "IDFM:40", "Arrêt tramway", decale(-5000, 0)),
        # Ligne rurale : deux « Mairie » à 5 kilomètres l'une de l'autre
        rangee("IDFM:C09000", "Soir", "Bus", "IDFM:50", "Mairie", decale(10000, 0), "Village Nord",
               nom_long="Soir Village", reservation='[{"id": "booking_rule:1"}]'),
        rangee("IDFM:C09000", "Soir", "Bus", "IDFM:51", "Mairie", decale(15000, 0), "Village Sud",
               nom_long="Soir Village", reservation='[{"id": "booking_rule:1"}]'),
        rangee("IDFM:C09000", "Soir", "Bus", "IDFM:52", "Église", decale(12000, 0), "Village Nord",
               nom_long="Soir Village", reservation='[{"id": "booking_rule:1"}]'),
    ]


@pytest.fixture
def ordres():
    return {"IDFM:C01319": {
        "ligne": "394", "route_id": "IDFM:C01319", "fichier": "394.json", "source": "Fiche horaire de test",
        "sens": [{"nom": "vers C", "arrets": ["Gare A", "Arrêt B", "Pierre Brossolette"]},
                 {"nom": "vers A", "arrets": ["Pierre Brossolette", "Arrêt B", "Gare A"]}],
        "alias": {"Gare A": "Arrêt A"},
        "remarques": {"Arrêt B": "Remarque de test"},
    }}


@pytest.fixture
def resultat(rangees, ordres):
    return construire(rangees, ordres, {"Brosselette": "Brossolette"})


def par_id(index_lignes):
    return {l["id"]: l for l in index_lignes}


def test_haversine():
    assert haversine(48.0, 2.0, 49.0, 2.0) == pytest.approx(111_195, rel=1e-3)
    assert haversine(*decale(0, 0), *decale(0, 1000)) == pytest.approx(1000, abs=1)


@pytest.mark.parametrize("mode, nom_court, nom_long, attendu", [
    ("Bus", "394", "394", "394"),
    ("RapidTransit", "B", "B", "RER B"),
    ("Metro", "12", "12", "Métro 12"),
    ("Metro", "3B", "3B", "Métro 3bis"),
    ("Tramway", "T6", "T6", "Tramway T6"),
    ("LocalTrain", "N", "N", "Transilien N"),
    ("regionalRail", "TER", "TER Normandie", "TER Normandie"),
    ("CableWay", "C1", "C1", "Câble C1"),
])
def test_libelles(mode, nom_court, nom_long, attendu):
    assert libelle(mode, nom_court, nom_long) == attendu


def test_index_de_toutes_les_lignes(resultat):
    index_lignes, fichiers, avertissements = resultat
    lignes = par_id(index_lignes)
    assert set(lignes) == {"C01319", "C00350", "C01743", "C01373", "C01390", "C09000"}
    assert set(fichiers) == {"C01319", "C00350", "C09000"}, "un fichier par ligne de bus seulement"
    assert lignes["C01743"]["famille"] == "rer" and not lignes["C01743"]["fichier"]
    assert lignes["C09000"]["demande"] is True
    assert lignes["C01319"]["ordre"] is True and lignes["C00350"]["ordre"] is False
    assert avertissements == []


def test_quais_proches_de_meme_nom_regroupes(resultat):
    _, fichiers, _ = resultat
    b = [a for a in fichiers["C01319"]["arrets"] if a["nom"] == "Arrêt B"]
    assert len(b) == 1 and b[0]["quais"] == ["IDFM:2", "IDFM:3"]


def test_homonymes_eloignes_distingues_par_commune(resultat):
    _, fichiers, _ = resultat
    noms = [a["nom"] for a in fichiers["C09000"]["arrets"]]
    assert noms == ["Église", "Mairie (Village Nord)", "Mairie (Village Sud)"], "ordre alphabétique sans ordre connu"
    assert fichiers["C09000"]["ordre"] is None


def test_ordre_de_la_fiche_horaire(resultat):
    _, fichiers, _ = resultat
    ligne = fichiers["C01319"]
    assert [a["nom"] for a in ligne["arrets"]] == ["Gare A", "Arrêt B", "Pierre Brossolette"]
    assert ligne["arrets"][0]["nomIdfm"] == "Arrêt A"
    assert ligne["arrets"][1]["remarque"] == "Remarque de test"
    assert ligne["ordre"]["sens"] == [{"nom": "vers C", "arrets": [0, 1, 2]}, {"nom": "vers A", "arrets": [2, 1, 0]}]


def test_correction_des_fautes_du_jeu(resultat):
    _, fichiers, _ = resultat
    arret = fichiers["C01319"]["arrets"][2]
    assert arret["nom"] == "Pierre Brossolette" and arret["nomIdfm"] == "Pierre Brosselette"


def test_correspondances_avec_distance(resultat):
    _, fichiers, _ = resultat
    a, b, c = fichiers["C01319"]["arrets"]
    assert a["correspondances"] == []
    # Stade est à 120 mètres au nord du premier quai de B, donc à 90 mètres du second (30 mètres au nord)
    assert b["correspondances"] == [["C00350", "Stade", pytest.approx(90, abs=1)]]
    assert c["correspondances"] == [["C01743", "Gare RER", pytest.approx(250, abs=1)]]
    # Dans l'autre sens, l'arrêt de la 394 porte son nom de fiche horaire
    assert fichiers["C00350"]["arrets"][0]["correspondances"] == [["C01319", "Arrêt B", pytest.approx(90, abs=1)]]


def test_ordre_general_insere_les_arrets_propres_au_retour():
    sens = [{"nom": "aller", "arrets": ["A", "B", "D", "E"]},
            {"nom": "retour", "arrets": ["E", "D", "C", "B", "A"]}]
    assert ordre_general(sens) == ["A", "B", "C", "D", "E"]


def test_regroupement_de_proche_en_proche():
    quais = [{"id": f"q{i}", "nom": "Gare", "lat": decale(0, 350 * i)[0], "lon": decale(0, 350 * i)[1],
              "commune": "Ville"} for i in range(3)]
    assert len(regrouper_quais(quais)) == 1  # 0 → 350 → 700 mètres : une seule chaîne


def test_ecriture_supprime_les_fichiers_perimes(tmp_path, resultat):
    index_lignes, fichiers, _ = resultat
    (tmp_path / "lignes").mkdir()
    (tmp_path / "lignes" / "ANCIENNE.json").write_text("{}")
    ecrire(tmp_path, index_lignes, fichiers, "test.csv", 11, "2026-11-08")
    assert sorted(p.stem for p in (tmp_path / "lignes").glob("*.json")) == sorted(fichiers)
    index = json.loads((tmp_path / "lignes.json").read_text(encoding="utf-8"))
    assert index["rayonMaximum"] == RAYON_MAXIMUM and index["source"]["licence"] == "ODbL"


def test_script_en_ligne_de_commande(tmp_path, rangees):
    from scripts.construire_donnees import main
    chemin_csv = tmp_path / "arrets-lignes.csv"
    with open(chemin_csv, "w", encoding="utf-8-sig", newline="") as f:
        ecrivain = csv.DictWriter(f, fieldnames=ENTETES, delimiter=";")
        ecrivain.writeheader()
        ecrivain.writerows(rangees)
    main(["--csv", str(chemin_csv), "--ordres", str(tmp_path / "aucun"), "--sortie", str(tmp_path / "sortie")])
    assert (tmp_path / "sortie" / "lignes.json").is_file()
    assert len(list((tmp_path / "sortie" / "lignes").glob("*.json"))) == 3


# --------------------------------------------------------------------------------------
# Contrôles des données générées et versionnées dans static/donnees
# --------------------------------------------------------------------------------------
donnees_presentes = pytest.mark.skipif(not (DONNEES / "lignes.json").is_file(), reason="données non générées")


@pytest.fixture(scope="module")
def index_reel():
    return json.loads((DONNEES / "lignes.json").read_text(encoding="utf-8"))


@donnees_presentes
def test_donnees_generees_coherentes(index_reel):
    lignes = par_id(index_reel["lignes"])
    fichiers = {p.stem for p in (DONNEES / "lignes").glob("*.json")}
    assert fichiers == {i for i, l in lignes.items() if l["fichier"]}
    for ident in sorted(fichiers)[::50]:  # un échantillon, pour rester rapide
        ligne = json.loads((DONNEES / "lignes" / f"{ident}.json").read_text(encoding="utf-8"))
        for arret in ligne["arrets"]:
            for autre, nom, distance in arret["correspondances"]:
                assert autre in lignes and autre != ident and nom
                assert 0 <= distance <= RAYON_MAXIMUM


@donnees_presentes
def test_libelles_sans_abreviation(index_reel):
    libelles = {l["libelle"] for l in index_reel["lignes"] if l["famille"] != "bus"}
    assert not any(l.startswith("Tram ") for l in libelles)
    assert {"RER B", "Métro 12", "Tramway T6", "Transilien N"} <= libelles


@donnees_presentes
def test_exemple_de_la_maquette(index_reel):
    """Course « Hauts-de-Seine sud » : pivots Stade du Panorama (394 → 14) et Division Leclerc (394 → 195)."""
    ids = {(l["libelle"], l["operateur"]): l["id"] for l in index_reel["lignes"] if l["famille"] == "bus"}
    ligne_394 = json.loads((DONNEES / "lignes" / f"{ids['394', 'ATM Croix du Sud']}.json").read_text(encoding="utf-8"))
    assert ligne_394["ordre"] is not None and len(ligne_394["ordre"]["sens"]) == 2
    arrets = {a["nom"]: a for a in ligne_394["arrets"]}
    corr_panorama = {c[0]: c[2] for c in arrets["Stade du Panorama"]["correspondances"]}
    corr_leclerc = {c[0]: c[2] for c in arrets["Division Leclerc"]["correspondances"]}
    assert corr_panorama[ids["14", "Transdev Vallée Sud"]] <= 150
    assert corr_leclerc[ids["195", "ATM Croix du Sud"]] <= 150
