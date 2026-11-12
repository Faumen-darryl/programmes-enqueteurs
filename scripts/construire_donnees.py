#!/usr/bin/env python3
"""Génère les données de l'application à partir de deux jeux d'Île-de-France Mobilités :
le CSV « Arrêts et lignes associées » (licence ODbL) et le GTFS des horaires (Licence Mobilités).

Entrées (dossier data/brut/, non versionné) :
    arrets-lignes.csv             lignes, arrêts, coordonnées, communes
    IDFM-gtfs.zip                 horaires : ordre des arrêts, sens, destinations, passages par heure
Entrées versionnées :
    data/ordres/*.json            ordre vérifié de certaines lignes (fiches horaires) : sert de nom
                                  d'arrêt et de contrôle du GTFS
    data/corrections_noms.json    fautes de frappe du jeu corrigées dans les noms affichés

Sorties :
    static/donnees/lignes.json        index de toutes les lignes (bus, RER, métro, tramway…)
    static/donnees/lignes/<id>.json   une ligne de bus : arrêts, sens (arrêts dans l'ordre, destination,
                                      variantes, passages par heure), correspondances jusqu'à 300 mètres

Usage :
    python scripts/construire_donnees.py --telecharger   # retélécharge le CSV et le GTFS, puis génère
    python scripts/construire_donnees.py                 # génère à partir des fichiers déjà téléchargés
    python scripts/construire_donnees.py --sans-gtfs     # sans horaires (arrêts par ordre alphabétique)
"""

import argparse
import csv
import difflib
import json
import math
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

try:  # lancé comme script (python scripts/construire_donnees.py) ou comme module (tests)
    from scripts.lire_gtfs import LICENCE_HORAIRES, lire_gtfs
except ImportError:
    from lire_gtfs import LICENCE_HORAIRES, lire_gtfs

RACINE = Path(__file__).resolve().parent.parent
CSV_DEFAUT = RACINE / "data" / "brut" / "arrets-lignes.csv"
GTFS_DEFAUT = RACINE / "data" / "brut" / "IDFM-gtfs.zip"
URL_CSV = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/arrets-lignes/exports/csv?delimiter=%3B"
URL_GTFS = "https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip"
VARIANTES_MAXIMUM = 5      # variantes d'un sens gardées dans les fichiers (les plus fréquentes)
ORDRES_DEFAUT = RACINE / "data" / "ordres"
CORRECTIONS_DEFAUT = RACINE / "data" / "corrections_noms.json"
SORTIE_DEFAUT = RACINE / "static" / "donnees"

RAYON_MAXIMUM = 300        # mètres : distances précalculées ; le rayon affiché se règle dans le navigateur
RAYON_REGROUPEMENT = 400   # mètres : quais de même nom plus proches que cela = un seul arrêt
MODES_ENQUETES = {"Bus"}   # lignes sur lesquelles on fait des enquêtes (un fichier par ligne)

# mode IDFM -> famille utilisée par l'interface (pastille : « bus » ou autre)
FAMILLES = {
    "Bus": "bus",
    "RapidTransit": "rer",
    "LocalTrain": "train",
    "regionalRail": "train",
    "Metro": "metro",
    "Tramway": "tramway",
    "RailShuttle": "navette",
    "CableWay": "cable",
    "Funicular": "funiculaire",
}
ORDRE_FAMILLES = ["bus", "rer", "train", "metro", "tramway", "navette", "cable", "funiculaire"]
NUMEROS_METRO = {"3B": "3bis", "7B": "7bis"}


# --------------------------------------------------------------------------------------
# Outils
# --------------------------------------------------------------------------------------
def normaliser(texte):
    """Minuscules sans accents ni ponctuation, pour comparer des noms d'arrêts."""
    texte = unicodedata.normalize("NFD", texte.lower())
    texte = "".join(c for c in texte if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", texte).strip()


def cle_naturelle(texte):
    """Clé de tri qui range « 2 » avant « 10 »."""
    return [(0, int(t), "") if t.isdigit() else (1, 0, normaliser(t)) for t in re.split(r"(\d+)", texte) if t]


def haversine(lat1, lon1, lat2, lon2):
    """Distance en mètres entre deux points (latitude, longitude en degrés)."""
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(a))


def identifiant(route_id):
    """« IDFM:C01319 » -> « C01319 » (nom du fichier de la ligne)."""
    ident = route_id.split(":")[-1]
    if not re.fullmatch(r"[A-Za-z0-9_-]+", ident):
        raise ValueError(f"identifiant de ligne inattendu : {route_id!r}")
    return ident


def libelle(mode, nom_court, nom_long):
    """Libellé affiché : numéro pour un bus, « RER B », « Métro 12 », « Tramway T6 »…"""
    if mode == "Bus":
        return nom_court
    if mode == "RapidTransit":
        return f"RER {nom_court}"
    if mode == "LocalTrain":
        return f"Transilien {nom_court}"
    if mode == "regionalRail":
        return nom_long or "TER"
    if mode == "Metro":
        return f"Métro {NUMEROS_METRO.get(nom_court, nom_court)}"
    if mode == "Tramway":
        return f"Tramway {nom_court}"
    if mode == "CableWay":
        return f"Câble {nom_court}"
    if mode == "Funicular":
        return "Funiculaire de Montmartre"
    return nom_court


# --------------------------------------------------------------------------------------
# Lecture
# --------------------------------------------------------------------------------------
# L'export de l'API d'Île-de-France Mobilités nomme certaines colonnes autrement (en minuscules, « id »).
COLONNES = {"id": "route_id", "operatorname": "OperatorName", "shortname": "shortName", "bookingrules": "bookingRules",
            "nom_commune": "Nom_commune", "pointgeo": "Pointgeo", "code_insee": "Code_insee"}


def charger_csv(chemin):
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        lecteur = csv.reader(f, delimiter=";")
        entetes = [COLONNES.get(c.strip(), c.strip()) for c in next(lecteur, [])]
        rangees = [dict(zip(entetes, valeurs)) for valeurs in lecteur if valeurs]
    if not rangees:
        sys.exit(f"Le fichier {chemin} est vide.")
    attendues = {"route_id", "route_long_name", "stop_id", "stop_name", "stop_lon", "stop_lat",
                 "OperatorName", "shortName", "bookingRules", "mode", "Nom_commune"}
    manquantes = attendues - set(rangees[0])
    if manquantes:
        sys.exit(f"Colonnes absentes du CSV : {', '.join(sorted(manquantes))}")
    return rangees


def construire_lignes(rangees):
    """route_id -> description de la ligne et ses quais (un quai = un stop_id)."""
    lignes = {}
    for r in rangees:
        ligne = lignes.get(r["route_id"])
        if ligne is None:
            ligne = lignes[r["route_id"]] = {
                "route_id": r["route_id"],
                "id": identifiant(r["route_id"]),
                "mode": r["mode"],
                "famille": FAMILLES.get(r["mode"], "autre"),
                "libelle": libelle(r["mode"], r["shortName"], r["route_long_name"]),
                "nom": r["route_long_name"],
                "operateur": r["OperatorName"],
                "demande": False,
                "quais": {},
            }
        if r["bookingRules"].strip() or r["route_long_name"].startswith("TàD"):
            ligne["demande"] = True
        ligne["quais"].setdefault(r["stop_id"], {
            "id": r["stop_id"],
            "nom": r["stop_name"],
            "lat": float(r["stop_lat"]),
            "lon": float(r["stop_lon"]),
            "commune": r["Nom_commune"],
        })
    return lignes


# --------------------------------------------------------------------------------------
# Arrêts : regroupement des quais
# --------------------------------------------------------------------------------------
def corriger_nom(nom, corrections):
    """Remplace les mots mal orthographiés (mot entier) : « Brosselette » -> « Brossolette »."""
    for faux, juste in corrections.items():
        nom = re.sub(rf"\b{re.escape(faux)}\b", juste, nom)
    return nom


def regrouper_quais(quais, rayon=RAYON_REGROUPEMENT, corrections=None):
    """Regroupe les quais de même nom distants de moins de `rayon` mètres (de proche en proche).

    Deux arrêts « Mairie » dans deux villages restent deux arrêts : leur nom affiché
    reçoit alors la commune, par exemple « Mairie (Balloy) ».
    """
    par_nom = defaultdict(list)
    for q in quais:
        par_nom[q["nom"]].append(q)

    arrets = []
    for nom, groupe in par_nom.items():
        groupes = []
        restants = sorted(groupe, key=lambda q: q["id"])
        while restants:
            courant = [restants.pop(0)]
            i = 0
            while i < len(courant):
                proches = [q for q in restants
                           if haversine(courant[i]["lat"], courant[i]["lon"], q["lat"], q["lon"]) <= rayon]
                for q in proches:
                    restants.remove(q)
                courant.extend(proches)
                i += 1
            groupes.append(courant)

        for membres in groupes:
            communes = sorted({q["commune"] for q in membres if q["commune"]})
            arrets.append({
                "nom": corriger_nom(nom, corrections or {}),
                "nomIdfm": nom,
                "communes": communes,
                "quais": sorted(membres, key=lambda q: q["id"]),
                "lat": sum(q["lat"] for q in membres) / len(membres),
                "lon": sum(q["lon"] for q in membres) / len(membres),
                "homonymes": len(groupes) > 1,
            })

    # Noms affichés uniques : on ajoute la commune, puis un numéro si besoin
    for arret in arrets:
        if arret["homonymes"]:
            arret["nom"] = f"{arret['nom']} ({', '.join(arret['communes']) or 'commune inconnue'})"
    vus = defaultdict(int)
    for arret in sorted(arrets, key=lambda a: (a["nom"], a["quais"][0]["id"])):
        vus[arret["nom"]] += 1
        if vus[arret["nom"]] > 1:
            arret["nom"] = f"{arret['nom']}, arrêt {vus[arret['nom']]}"
    for arret in arrets:
        del arret["homonymes"]

    arrets.sort(key=lambda a: (normaliser(a["nom"]), a["nom"]))
    return arrets


# --------------------------------------------------------------------------------------
# Ordre connu des arrêts (fiches horaires)
# --------------------------------------------------------------------------------------
def charger_ordres(dossier):
    """route_id -> contenu d'un fichier data/ordres/*.json."""
    ordres = {}
    for chemin in sorted(Path(dossier).glob("*.json")):
        with open(chemin, encoding="utf-8") as f:
            contenu = json.load(f)
        contenu["fichier"] = chemin.name
        ordres[contenu["route_id"]] = contenu
    return ordres


def charger_corrections(chemin):
    if not Path(chemin).is_file():
        return {}
    with open(chemin, encoding="utf-8") as f:
        return json.load(f).get("mots", {})


def resoudre_noms(noms_fiche, arrets, alias):
    """Nom de la fiche horaire -> arrêt du jeu de données (ou None), avec avertissements."""
    par_nom_idfm = defaultdict(list)
    for a in arrets:
        for nom in {a["nomIdfm"], a["nom"]}:
            par_nom_idfm[nom].append(a)
    index = {normaliser(n): n for n in par_nom_idfm}
    resultat, avertissements = {}, []
    for nom in noms_fiche:
        cible = None
        if nom in alias:
            cible = alias[nom] if alias[nom] in par_nom_idfm else None
        elif normaliser(nom) in index:
            cible = index[normaliser(nom)]
        else:
            proche = difflib.get_close_matches(normaliser(nom), list(index), n=1, cutoff=0.8)
            if proche:
                cible = index[proche[0]]
                avertissements.append(f"« {nom} » rapproché de « {cible} » (à vérifier)")
        if cible is None:
            avertissements.append(f"« {nom} » introuvable dans le jeu de données")
            resultat[nom] = None
        elif len(par_nom_idfm[cible]) > 1:
            avertissements.append(f"« {nom} » correspond à plusieurs arrêts éloignés « {cible} »")
            resultat[nom] = None
        else:
            resultat[nom] = par_nom_idfm[cible][0]
    return resultat, avertissements


def ordre_general(sens):
    """Ordre de tous les arrêts : celui du premier sens, les arrêts propres au retour insérés à leur place."""
    if not sens:
        return []
    general = list(sens[0]["arrets"])
    for autre in sens[1:]:
        liste = autre["arrets"]
        for i, nom in enumerate(liste):
            if nom in general:
                continue
            # Le retour roule dans l'autre direction : l'arrêt qui le précède au retour le suit à l'aller.
            precedents = [x for x in reversed(liste[:i]) if x in general]
            position = general.index(precedents[0]) if precedents else len(general)
            general.insert(position, nom)
    return general


def appliquer_ordre(arrets, ordre):
    """Range les arrêts dans l'ordre de la fiche horaire et renvoie (arrêts, ordre, avertissements)."""
    general = ordre_general(ordre["sens"])
    correspondance, avertissements = resoudre_noms(general, arrets, ordre.get("alias", {}))

    ranges, deja = [], set()
    for nom in general:
        arret = correspondance[nom]
        if arret is None or id(arret) in deja:
            continue
        deja.add(id(arret))
        arret["nom"] = nom  # nom de la fiche horaire, celui que voit l'enquêteur
        if ordre.get("remarques", {}).get(nom):
            arret["remarque"] = ordre["remarques"][nom]
        ranges.append(arret)
    hors_fiche = [a for a in arrets if id(a) not in deja]
    for arret in hors_fiche:
        arret["remarque"] = "Absent de la fiche horaire"
        avertissements.append(f"« {arret['nomIdfm']} » est dans le jeu de données mais pas sur la fiche horaire")
    ranges.extend(hors_fiche)

    position = {id(a): i for i, a in enumerate(ranges)}
    sens = [{"nom": s["nom"],
             "arrets": [position[id(correspondance[n])] for n in s["arrets"] if correspondance.get(n) is not None]}
            for s in ordre["sens"]]
    return ranges, {"source": ordre["source"], "sens": sens}, avertissements


# --------------------------------------------------------------------------------------
# Ordre des arrêts, sens et passages : GTFS
# --------------------------------------------------------------------------------------
def ajouter_quais_gtfs(ligne, sens_gtfs, arrets_gtfs):
    """Ajoute à la ligne les arrêts de ses parcours GTFS absents du CSV. Renvoie leur nombre."""
    existants = list(ligne["quais"].values())
    ajoutes = 0
    for sens in sens_gtfs:
        for parcours in [sens["parcours"]] + [v["parcours"] for v in sens["variantes"][:VARIANTES_MAXIMUM]]:
            for stop_id in parcours:
                if stop_id in ligne["quais"] or stop_id not in arrets_gtfs:
                    continue
                a = arrets_gtfs[stop_id]
                voisin = min(existants, key=lambda q: haversine(q["lat"], q["lon"], a["lat"], a["lon"]), default=None)
                commune = voisin["commune"] if voisin and haversine(voisin["lat"], voisin["lon"], a["lat"], a["lon"]) <= 1000 else ""
                ligne["quais"][stop_id] = {"id": stop_id, "nom": a["nom"], "lat": a["lat"], "lon": a["lon"], "commune": commune}
                ajoutes += 1
    return ajoutes


def sens_depuis_gtfs(arrets, sens_gtfs):
    """Sens d'une ligne d'après le GTFS : suites d'arrêts (objets de `arrets`), destination, variantes, passages."""
    par_quai = {q["id"]: a for a in arrets for q in a["quais"]}

    def suite(parcours):
        resultat = []
        for stop_id in parcours:
            a = par_quai.get(stop_id)
            if a is not None and (not resultat or resultat[-1] is not a):
                resultat.append(a)
        return resultat

    sens = []
    for s in sens_gtfs:
        principal = suite(s["parcours"])
        if len(principal) < 2:
            continue
        destination = s["destination"] or principal[-1]["nom"]
        variantes = []
        for v in s["variantes"]:
            arrets_variante = suite(v["parcours"])
            if len(arrets_variante) >= 2 and arrets_variante != principal and len(variantes) < VARIANTES_MAXIMUM:
                variantes.append({"destination": v["destination"] or arrets_variante[-1]["nom"], "suite": arrets_variante, "trajets": v["trajets"]})
        sens.append({
            "nom": f"vers {destination}",
            "destination": destination,
            "directionId": s["directionId"],
            "suite": principal,
            "trajets": s["trajets"],
            "trajetsTotal": s["trajetsTotal"],
            "variantes": variantes,
            "jour": s["jour"],
        })
    noms = defaultdict(int)
    for x in sens:
        noms[x["nom"]] += 1
    for x in sens:  # deux sens vers la même destination (boucle) : on les numérote
        if noms[x["nom"]] > 1:
            x["nom"] = f"{x['nom']} (sens {x['directionId']})"
    return sens


def ranger_selon_sens(arrets, sens):
    """Tous les arrêts dans l'ordre des sens (voir ordre_general) ; les arrêts hors parcours à la fin."""
    general = ordre_general([{"arrets": [id(a) for a in x["suite"]]} for x in sens])
    par_id = {id(a): a for a in arrets}
    ranges = [par_id[i] for i in general]
    vus = set(general)
    ranges += [a for a in arrets if id(a) not in vus]
    return ranges


def verifier_avec_gtfs(nom_sens, indices_fiche, sens_gtfs, position):
    """Rapproche un sens de la fiche horaire du sens GTFS le plus semblable. Renvoie (sens GTFS, vérification)."""
    meilleur, ratio = None, -1.0
    for x in sens_gtfs:
        indices = [position[id(a)] for a in x["suite"]]
        r = difflib.SequenceMatcher(None, indices_fiche, indices, autojunk=False).ratio()
        if r > ratio:
            meilleur, ratio = x, r
    if meilleur is None:
        return None, {"identique": False, "texte": "Aucun sens correspondant dans le GTFS."}
    indices = [position[id(a)] for a in meilleur["suite"]]
    if indices == indices_fiche:
        return meilleur, {"identique": True, "texte": f"Identique au GTFS (destination « {meilleur['destination']} », direction_id {meilleur['directionId']})."}
    return meilleur, {"identique": False, "texte": f"Différent du GTFS (destination « {meilleur['destination']} », ressemblance {round(100 * ratio)} %)."}


def sortie_sens(x, position, nom=None, indices=None, verification=None):
    """Sens tel qu'il est écrit dans le fichier de la ligne."""
    sortie = {"nom": nom or x["nom"], "arrets": indices if indices is not None else [position[id(a)] for a in x["suite"]]}
    if x is not None:
        sortie.update({
            "destination": x["destination"],
            "directionId": x["directionId"],
            "trajets": x["trajets"],
            "trajetsTotal": x["trajetsTotal"],
            "variantes": [{"destination": v["destination"], "arrets": [position[id(a)] for a in v["suite"]], "trajets": v["trajets"]}
                          for v in x["variantes"]],
            "jour": x["jour"],
        })
    if verification:
        sortie["verification"] = verification
    return sortie


# --------------------------------------------------------------------------------------
# Correspondances
# --------------------------------------------------------------------------------------
class IndexSpatial:
    """Grille de cases d'environ `rayon` mètres pour trouver vite les quais proches."""

    def __init__(self, quais, rayon):
        self.rayon = rayon
        self.dlat = rayon / 111_000
        self.dlon = rayon / (111_000 * math.cos(math.radians(50)))  # 50° : au nord de l'Île-de-France, cases plus larges
        self.cases = defaultdict(list)
        for q in quais:
            self.cases[self._case(q["lat"], q["lon"])].append(q)

    def _case(self, lat, lon):
        return int(math.floor(lat / self.dlat)), int(math.floor(lon / self.dlon))

    def autour(self, lat, lon):
        """(distance, quai) pour chaque quai à `rayon` mètres ou moins."""
        i, j = self._case(lat, lon)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for q in self.cases.get((i + di, j + dj), ()):
                    d = haversine(lat, lon, q["lat"], q["lon"])
                    if d <= self.rayon:
                        yield d, q


def calculer_correspondances(ligne, arret, index, desserte, cle_tri):
    """Pour chaque autre ligne, l'arrêt le plus proche de `arret` (à RAYON_MAXIMUM mètres ou moins)."""
    meilleures = {}
    for quai in arret["quais"]:
        for d, voisin in index.autour(quai["lat"], quai["lon"]):
            for autre_id, nom_arret in desserte[voisin["id"]]:
                if autre_id == ligne["id"]:
                    continue
                if autre_id not in meilleures or d < meilleures[autre_id][0]:
                    meilleures[autre_id] = (d, nom_arret)
    return [[autre_id, nom, round(d)] for autre_id, (d, nom)
            in sorted(meilleures.items(), key=lambda kv: (round(kv[1][0]), cle_tri[kv[0]]))]


# --------------------------------------------------------------------------------------
# Construction
# --------------------------------------------------------------------------------------
def construire(rangees, ordres, corrections=None, gtfs=None):
    """Renvoie (index, fichiers par ligne, avertissements, informations). `gtfs` : résultat de lire_gtfs ou None."""
    lignes = construire_lignes(rangees)
    avertissements = []
    infos = {"quaisAjoutes": 0, "lignesAvecSens": 0, "verifications": []}
    source_gtfs = f"GTFS d'Île-de-France Mobilités, horaires du {gtfs['periode']['du']} au {gtfs['periode']['au']}" if gtfs and gtfs.get("periode") else None

    # Arrêts de toutes les lignes (les noms servent aussi pour les correspondances)
    for ligne in lignes.values():
        sens_gtfs = gtfs["lignes"].get(ligne["route_id"], []) if gtfs and ligne["mode"] in MODES_ENQUETES else []
        if sens_gtfs:
            infos["quaisAjoutes"] += ajouter_quais_gtfs(ligne, sens_gtfs, gtfs["arrets"])
        ligne["arrets"] = regrouper_quais(list(ligne["quais"].values()), corrections=corrections)
        ligne["ordre"] = None
        sens = sens_depuis_gtfs(ligne["arrets"], sens_gtfs) if sens_gtfs else []
        ordre = ordres.get(ligne["route_id"])
        if ordre:
            # Fiche horaire vérifiée : elle donne l'ordre et les noms ; le GTFS la contrôle et ajoute les passages.
            ligne["arrets"], ordre_fiche, avert = appliquer_ordre(ligne["arrets"], ordre)
            avertissements += [f"Ligne {ligne['libelle']} : {a}" for a in avert]
            position = {id(a): i for i, a in enumerate(ligne["arrets"])}
            sortie = []
            for s in ordre_fiche["sens"]:
                if sens:
                    x, verification = verifier_avec_gtfs(s["nom"], s["arrets"], sens, position)
                    infos["verifications"].append(f"Ligne {ligne['libelle']}, {s['nom']} : {verification['texte']}")
                    if not verification["identique"]:
                        avertissements.append(f"Ligne {ligne['libelle']}, {s['nom']} : {verification['texte']}")
                    sortie.append(sortie_sens(x, position, nom=s["nom"], indices=s["arrets"], verification=verification))
                else:
                    sortie.append(s)
            source = ordre_fiche["source"] + (" ; contrôlé avec le " + source_gtfs if sens else "")
            ligne["ordre"] = {"source": source, "sens": sortie}
        elif sens:
            ligne["arrets"] = ranger_selon_sens(ligne["arrets"], sens)
            position = {id(a): i for i, a in enumerate(ligne["arrets"])}
            ligne["ordre"] = {"source": source_gtfs, "sens": [sortie_sens(x, position) for x in sens]}
        if ligne["ordre"]:
            infos["lignesAvecSens"] += 1
    if gtfs:
        absentes = sorted(set(gtfs["lignes"]) - set(lignes))
        infos["absentesDuCsv"] = absentes
        if absentes:
            avertissements.append(f"{len(absentes)} ligne(s) du GTFS absente(s) du CSV, par exemple {', '.join(absentes[:5])} : "
                                  "le CSV est peut-être incomplet, comparer avec le précédent avant de publier.")
    for route_id in sorted(set(ordres) - set(lignes)):
        avertissements.append(f"{ordres[route_id]['fichier']} : ligne {route_id} absente du jeu de données")

    # Quai -> lignes qui le desservent, avec le nom affiché de l'arrêt sur chacune
    desserte = defaultdict(list)
    quais = {}
    for ligne in lignes.values():
        for arret in ligne["arrets"]:
            for quai in arret["quais"]:
                desserte[quai["id"]].append((ligne["id"], arret["nom"]))
                quais[quai["id"]] = quai
    index = IndexSpatial(quais.values(), RAYON_MAXIMUM)
    cle_tri = {l["id"]: (ORDRE_FAMILLES.index(l["famille"]) if l["famille"] in ORDRE_FAMILLES else 99,
                         cle_naturelle(l["libelle"]), l["id"]) for l in lignes.values()}

    fichiers = {}
    for ligne in sorted(lignes.values(), key=lambda l: cle_tri[l["id"]]):
        if ligne["mode"] not in MODES_ENQUETES:
            continue
        arrets = []
        for arret in ligne["arrets"]:
            sortie = {"nom": arret["nom"]}
            if arret["nomIdfm"] != arret["nom"]:
                sortie["nomIdfm"] = arret["nomIdfm"]
            sortie["communes"] = arret["communes"]
            sortie["quais"] = [q["id"] for q in arret["quais"]]
            sortie["lat"] = round(arret["lat"], 6)
            sortie["lon"] = round(arret["lon"], 6)
            if arret.get("remarque"):
                sortie["remarque"] = arret["remarque"]
            sortie["correspondances"] = calculer_correspondances(ligne, arret, index, desserte, cle_tri)
            arrets.append(sortie)
        fichiers[ligne["id"]] = {
            "id": ligne["id"],
            "libelle": ligne["libelle"],
            "nom": ligne["nom"],
            "famille": ligne["famille"],
            "operateur": ligne["operateur"],
            "demande": ligne["demande"],
            "ordre": ligne["ordre"],
            "arrets": arrets,
        }

    index_lignes = []
    for ligne in sorted(lignes.values(), key=lambda l: cle_tri[l["id"]]):
        communes = sorted({c for a in ligne["arrets"] for c in a["communes"]}, key=normaliser)
        index_lignes.append({
            "id": ligne["id"],
            "libelle": ligne["libelle"],
            "nom": ligne["nom"],
            "famille": ligne["famille"],
            "operateur": ligne["operateur"],
            "demande": ligne["demande"],
            "remplacement": ligne["nom"].startswith("Remplacement"),
            "arrets": len(ligne["arrets"]),
            "ordre": ligne["ordre"] is not None,
            "fichier": ligne["id"] in fichiers,
            "communes": communes,
        })
    return index_lignes, fichiers, avertissements, infos


def ecrire(sortie, index_lignes, fichiers, nom_csv, nombre_rangees, date_generation, horaires=None):
    sortie = Path(sortie)
    dossier_lignes = sortie / "lignes"
    dossier_lignes.mkdir(parents=True, exist_ok=True)
    for ancien in dossier_lignes.glob("*.json"):
        if ancien.stem not in fichiers:
            ancien.unlink()
    for ident, contenu in fichiers.items():
        with open(dossier_lignes / f"{ident}.json", "w", encoding="utf-8") as f:
            json.dump(contenu, f, ensure_ascii=False, separators=(",", ":"))
    index = {
        "source": {
            "jeu": "Arrêts et lignes associées",
            "producteur": "Île-de-France Mobilités",
            "licence": "ODbL",
            "fichier": nom_csv,
            "rangees": nombre_rangees,
        },
        "horaires": horaires,
        "genereLe": date_generation,
        "rayonMaximum": RAYON_MAXIMUM,
        "lignes": index_lignes,
    }
    with open(sortie / "lignes.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))


def telecharger(url, destination):
    """Télécharge `url` dans `destination` (fichier temporaire puis renommage)."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporaire = destination.with_name(destination.name + ".partiel")
    print(f"Téléchargement de {url}…")
    with urllib.request.urlopen(url, timeout=600) as reponse, open(temporaire, "wb") as f:
        while bloc := reponse.read(1 << 20):
            f.write(bloc)
    temporaire.replace(destination)
    print(f"  {destination} : {destination.stat().st_size / 1e6:.1f} mégaoctets")


def main(arguments=None):
    analyseur = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analyseur.add_argument("--csv", default=CSV_DEFAUT, help="export CSV du jeu « Arrêts et lignes associées »")
    analyseur.add_argument("--gtfs", default=GTFS_DEFAUT, help="archive GTFS d'Île-de-France Mobilités")
    analyseur.add_argument("--sans-gtfs", action="store_true", help="générer sans horaires (arrêts par ordre alphabétique)")
    analyseur.add_argument("--telecharger", action="store_true", help="retélécharger le CSV et le GTFS avant de générer")
    analyseur.add_argument("--ordres", default=ORDRES_DEFAUT, help="dossier des ordres d'arrêts connus")
    analyseur.add_argument("--corrections", default=CORRECTIONS_DEFAUT, help="corrections des noms d'arrêts")
    analyseur.add_argument("--sortie", default=SORTIE_DEFAUT, help="dossier de sortie")
    args = analyseur.parse_args(arguments)

    if args.telecharger:
        if Path(args.csv).is_file():  # le précédent CSV est gardé : l'export d'IDFM a déjà manqué des lignes
            Path(args.csv).replace(Path(args.csv).with_name("arrets-lignes.precedent.csv"))
        telecharger(URL_CSV, args.csv)
        if not args.sans_gtfs:
            telecharger(URL_GTFS, args.gtfs)
    if not Path(args.csv).is_file():
        sys.exit(f"CSV introuvable : {args.csv}\n"
                 "Lancer « python scripts/construire_donnees.py --telecharger » depuis un poste qui a accès à "
                 "data.iledefrance-mobilites.fr et eu.ftp.opendatasoft.com.")
    gtfs = None
    if not args.sans_gtfs:
        if not Path(args.gtfs).is_file():
            sys.exit(f"GTFS introuvable : {args.gtfs}\n"
                     "Lancer avec --telecharger, ou avec --sans-gtfs pour générer sans horaires.")
        print("Lecture du GTFS…")
        gtfs = lire_gtfs(args.gtfs)

    rangees = charger_csv(args.csv)
    index_lignes, fichiers, avertissements, infos = construire(rangees, charger_ordres(args.ordres),
                                                               charger_corrections(args.corrections), gtfs)
    horaires = None
    if gtfs:
        horaires = {
            "jeu": "Horaires au format GTFS",
            "producteur": "Île-de-France Mobilités",
            "licence": LICENCE_HORAIRES,
            "fichier": Path(args.gtfs).name,
            "periode": gtfs["periode"],
            "jourReference": gtfs["jourReference"],
        }
    ecrire(args.sortie, index_lignes, fichiers, Path(args.csv).name, len(rangees), date.today().isoformat(), horaires)

    for v in infos["verifications"]:
        print("Contrôle :", v)
    for a in avertissements:
        print("Attention :", a)
    ordonnees = sum(1 for l in index_lignes if l["ordre"])
    print(f"{len(index_lignes)} lignes dans l'index, {len(fichiers)} fichiers de ligne, "
          f"{ordonnees} ligne(s) avec ordre des arrêts connu"
          + (f", {infos['quaisAjoutes']} arrêt(s) ajouté(s) depuis le GTFS, jour de référence {gtfs['jourReference']}." if gtfs else "."))


if __name__ == "__main__":
    main()
