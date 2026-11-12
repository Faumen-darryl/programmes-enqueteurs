"""Lecture du GTFS d'Île-de-France Mobilités : parcours, sens, destinations et passages par heure.

Le fichier (environ 110 mégaoctets compressés, dont 700 mégaoctets pour stop_times.txt) est lu en flux,
directement dans l'archive zip, sans être décompressé ni chargé en entier.

Pour chaque ligne et chaque sens (`direction_id`), on obtient :
- le parcours principal : la suite d'arrêts qui couvre le plus de passages (trajets × arrêts), ce qui écarte
  les services partiels même nombreux ;
- les variantes (terminus partiels, déviations), avec leur nombre de trajets ;
- la destination affichée (`trip_headsign`) la plus fréquente du parcours principal ;
- pour un jour de référence (le mardi de la période où circulent le plus de trajets) : départs par heure,
  premier et dernier départ.

Le sens de `direction_id` (0 ou 1) n'a pas de signification fixe : on nomme les sens par leur destination.
"""

import csv
import io
import zipfile
from collections import Counter, defaultdict
from datetime import date, timedelta

LICENCE_HORAIRES = "Licence Mobilités"


def _lire(archive, nom):
    return csv.DictReader(io.TextIOWrapper(archive.open(nom), encoding="utf-8-sig", newline=""))


def minutes(heure):
    """« 29:40:00 » -> 1780 (les horaires GTFS dépassent 24 heures après minuit)."""
    h, m, *_ = heure.split(":")
    return int(h) * 60 + int(m)


def heure_texte(total):
    """1780 -> « 05:40 » (heure affichée, après minuit)."""
    total %= 24 * 60
    return f"{total // 60:02d}:{total % 60:02d}"


def _jour(texte):
    return date(int(texte[:4]), int(texte[4:6]), int(texte[6:8]))


def services_par_jour(archive):
    """date -> ensemble des service_id actifs ce jour-là (calendar.txt + calendar_dates.txt)."""
    actifs = defaultdict(set)
    jours = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for r in _lire(archive, "calendar.txt"):
        d, fin = _jour(r["start_date"]), _jour(r["end_date"])
        while d <= fin:
            if r[jours[d.weekday()]] == "1":
                actifs[d].add(r["service_id"])
            d += timedelta(days=1)
    for r in _lire(archive, "calendar_dates.txt"):
        d = _jour(r["date"])
        if r["exception_type"] == "1":
            actifs[d].add(r["service_id"])
        elif r["exception_type"] == "2":
            actifs[d].discard(r["service_id"])
    return actifs


def lire_gtfs(chemin, routes_voulues=None):
    """Renvoie { "periode": {...}, "jourReference": date, "arrets": {stop_id: {...}}, "lignes": {route_id: [sens…]} }."""
    archive = zipfile.ZipFile(chemin)

    arrets = {
        r["stop_id"]: {"nom": r["stop_name"], "lat": float(r["stop_lat"]), "lon": float(r["stop_lon"])}
        for r in _lire(archive, "stops.txt") if r["stop_lat"] and r["stop_lon"]
    }

    trajets = {}
    for r in _lire(archive, "trips.txt"):
        if routes_voulues is None or r["route_id"] in routes_voulues:
            trajets[r["trip_id"]] = (r["route_id"], r["direction_id"] or "0", r["trip_headsign"].strip(), r["service_id"])

    # Jour de référence : le mardi où circulent le plus de trajets (évite les jours fériés et les vacances)
    actifs = services_par_jour(archive)
    trajets_par_service = Counter(t[3] for t in trajets.values())
    mardis = [d for d in actifs if d.weekday() == 1]
    jour_reference = max(mardis or actifs, key=lambda d: (sum(trajets_par_service[s] for s in actifs[d]), -d.toordinal()))
    services_reference = actifs[jour_reference]

    # Une seule lecture de stop_times.txt : les lignes d'un même trajet se suivent dans le fichier
    parcours_ids = {}
    par_trajet = {}

    def terminer(trajet, passages):
        passages.sort()
        motif = tuple(s for _, s, _ in passages)
        pid = parcours_ids.setdefault(motif, len(parcours_ids))
        par_trajet[trajet] = (pid, minutes(passages[0][2]) if passages[0][2] else None)

    courant, passages = None, []
    for r in _lire(archive, "stop_times.txt"):
        trajet = r["trip_id"]
        if trajet != courant:
            if courant is not None and passages:
                terminer(courant, passages)
            courant, passages = trajet, []
        if trajet in trajets:
            passages.append((int(r["stop_sequence"]), r["stop_id"], r["departure_time"] or r["arrival_time"]))
    if courant is not None and passages:
        terminer(courant, passages)
    motifs = {pid: motif for motif, pid in parcours_ids.items()}

    # Regroupement par ligne et par sens
    comptes = defaultdict(Counter)        # (route, sens) -> Counter(parcours)
    destinations = defaultdict(Counter)   # (route, sens, parcours) -> Counter(destination)
    departs = defaultdict(list)           # (route, sens) -> départs du jour de référence, en minutes
    for trajet, (pid, depart) in par_trajet.items():
        route, sens, destination, service = trajets[trajet]
        comptes[route, sens][pid] += 1
        destinations[route, sens, pid][destination] += 1
        if service in services_reference and depart is not None:
            departs[route, sens].append(depart)

    lignes = defaultdict(list)
    for (route, sens), compte in comptes.items():
        principal = max(compte, key=lambda pid: (compte[pid] * len(motifs[pid]), compte[pid], len(motifs[pid]), -pid))
        liste_departs = sorted(departs[route, sens])
        par_heure = Counter((d // 60) % 24 for d in liste_departs)
        lignes[route].append({
            "directionId": int(sens) if sens.isdigit() else sens,
            "destination": destinations[route, sens, principal].most_common(1)[0][0],
            "parcours": list(motifs[principal]),
            "trajets": compte[principal],
            "trajetsTotal": sum(compte.values()),
            "variantes": [
                {"destination": destinations[route, sens, pid].most_common(1)[0][0], "parcours": list(motifs[pid]), "trajets": n}
                for pid, n in compte.most_common() if pid != principal
            ],
            "jour": {
                "passages": len(liste_departs),
                "passagesParHeure": {str(h): par_heure[h] for h in sorted(par_heure)},
                "premier": heure_texte(liste_departs[0]) if liste_departs else None,
                "dernier": heure_texte(liste_departs[-1]) if liste_departs else None,
            },
        })
    for sens in lignes.values():
        sens.sort(key=lambda s: str(s["directionId"]))

    toutes_dates = sorted(actifs)
    return {
        "periode": {"du": toutes_dates[0].isoformat(), "au": toutes_dates[-1].isoformat()} if toutes_dates else None,
        "jourReference": jour_reference.isoformat(),
        "arrets": arrets,
        "lignes": dict(lignes),
    }
