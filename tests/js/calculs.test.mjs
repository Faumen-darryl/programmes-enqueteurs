// Tests des calculs métier : node --test tests/js
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accesFerre, ajusterSens, decoupage, distanceEntreArrets, enquetesSegment, etatLignes, finPourObjectif, pivotsEntre,
  programmesNecessaires, quotasConserves, quotasParDefaut, quotasPourObjectif, resumeCourse, segmentsSuggeres,
  suggestions, texteDuree, tranchesHoraires, verifierProgramme,
} from "../../static/js/calculs.js";
import { rechercherLignes } from "../../static/js/donnees.js";

// Trois lignes de bus fictives qui reprennent l'exemple de la maquette
const L394 = {
  id: "C01319", libelle: "394",
  ordre: { source: "test", sens: [{ nom: "vers Bourg-la-Reine", arrets: [0, 1, 2] }, { nom: "vers Issy", arrets: [2, 1, 0] }] },
  arrets: [
    { nom: "Issy", lat: 48.82, lon: 2.26, correspondances: [["RERC", "Issy RER", 102]] },
    { nom: "Division Leclerc", lat: 48.80, lon: 2.29, correspondances: [["C01215", "Division Leclerc", 0], ["C00350", "Division Leclerc", 49]] },
    { nom: "Stade du Panorama", lat: 48.79, lon: 2.29, correspondances: [["C00350", "Stade du Panorama", 0]] },
  ],
};
const L14 = {
  id: "C00350", libelle: "14", ordre: null,
  arrets: [
    { nom: "Division Leclerc", lat: 48.8001, lon: 2.2904, correspondances: [["C01319", "Division Leclerc", 49]] },
    { nom: "Stade du Panorama", lat: 48.79, lon: 2.29, correspondances: [["C01319", "Stade du Panorama", 0]] },
  ],
};
const L195 = {
  id: "C01215", libelle: "195", ordre: null,
  arrets: [{ nom: "Division Leclerc", lat: 48.80, lon: 2.29, correspondances: [["C01319", "Division Leclerc", 0]] }],
};
const fichiers = new Map([[L394.id, L394], [L14.id, L14], [L195.id, L195]]);

function course(programmes = []) {
  return {
    id: "c", nom: "Hauts-de-Seine sud", enquetesParProgramme: 120, dureeProgrammeHeures: 7,
    lignes: [{ ligne: "C01319", commandees: 240 }, { ligne: "C00350", commandees: 75 }, { ligne: "C01215", commandees: 45 }],
    programmes,
  };
}

/** Segment de `enquetes` enquêtes à partir de `debut`, avec les quotas par défaut ajustés. */
function segment(ligne, enquetes, debut = "06:00", depart = "A", arrivee = "B") {
  const s = { ligne, sens: "vers B", arretDepart: depart, arretFin: arrivee, debut, fin: finPourObjectif(debut, enquetes) };
  s.quotas = quotasPourObjectif(s, enquetes);
  return s;
}

test("tranches d'une heure coupées aux heures rondes", () => {
  assert.deepEqual(tranchesHoraires("09:30", "11:15"), [
    { debut: "09:30", fin: "10:00" }, { debut: "10:00", fin: "11:00" }, { debut: "11:00", fin: "11:15" }]);
  assert.deepEqual(tranchesHoraires("10:00", "09:00"), []);
});

test("répartition automatique : heures de pointe du matin, puis 15 par heure", () => {
  assert.deepEqual(quotasParDefaut({ debut: "06:00", fin: "16:00" }).map((q) => q.enquetes), [10, 20, 20, 10, 15, 15, 15, 15, 15, 15]);
  assert.deepEqual(quotasParDefaut({ debut: "18:00", fin: "19:00" }).map((q) => q.enquetes), [15]);
  // Une demi-heure vaut la moitié du quota de son heure
  assert.deepEqual(quotasParDefaut({ debut: "07:30", fin: "09:00" }).map((q) => q.enquetes), [10, 20]);
});

test("fin d'un segment calculée pour atteindre un nombre d'enquêtes", () => {
  assert.equal(finPourObjectif("06:00", 120), "14:00");
  assert.equal(finPourObjectif("06:00", 75), "11:00");
  assert.equal(finPourObjectif("11:00", 45), "14:00");
  assert.equal(finPourObjectif("06:00", 45), "08:45");
  const s = { debut: "06:00", fin: "08:45" };
  assert.deepEqual(quotasPourObjectif(s, 45).map((q) => q.enquetes), [10, 20, 15]);
});

test("enquêtes d'un segment = somme des quotas par heure", () => {
  const s = segment("C01319", 75);
  assert.equal(enquetesSegment(s), 75);
  s.quotas[0].enquetes += 3;
  assert.equal(enquetesSegment(s), 78);
});

test("les quotas conservés gardent les tranches inchangées, les nouvelles prennent le quota par défaut", () => {
  const s = { debut: "07:00", fin: "09:00", quotas: [{ debut: "07:00", fin: "08:00", enquetes: 25 }, { debut: "08:00", fin: "09:00", enquetes: 5 }] };
  s.fin = "10:00";
  assert.deepEqual(quotasConserves(s).map((q) => q.enquetes), [25, 5, 10]);
});

test("durées écrites en toutes lettres", () => {
  assert.equal(texteDuree(420), "7 heures");
  assert.equal(texteDuree(270), "4 heures 30 minutes");
  assert.equal(texteDuree(60), "1 heure");
  assert.equal(texteDuree(45), "45 minutes");
});

test("programmes nécessaires et restes (règle 2)", () => {
  assert.equal(programmesNecessaires(360, 120), 3);
  assert.equal(programmesNecessaires(361, 120), 4);
  assert.deepEqual(decoupage(240, 120), { pleins: 2, reste: 0 });
  assert.deepEqual(decoupage(75, 120), { pleins: 0, reste: 75 });
});

test("état des lignes et résumé de la course", () => {
  const c = course([{ id: "p1", numero: 1, segments: [segment("C01319", 120)] }]);
  const etat = etatLignes(c);
  assert.equal(etat[0].programmees, 120);
  assert.equal(etat[0].restantes, 120);
  assert.deepEqual(resumeCourse(c), { commandees: 360, programmees: 120, restantes: 240, necessaires: 3, realises: 1 });
});

test("un programme correct ne bloque pas ; la durée différente n'est qu'une alerte", () => {
  const p = { id: "p1", numero: 1, segments: [segment("C01319", 120)] }; // 06:00 à 14:00 avec les quotas par défaut
  assert.deepEqual(verifierProgramme({ ...course(), dureeProgrammeHeures: 8 }, p), { erreurs: [], alertes: [] });
  assert.deepEqual(verifierProgramme(course(), p), { erreurs: [], alertes: ["Le programme dure 8 heures au lieu de 7 heures."] });
});

test("le surplus bloque l'enregistrement (règle 1)", () => {
  const c = course([{ id: "p1", numero: 1, segments: [segment("C00350", 60)] }]);
  const p = { id: "p2", numero: 2, segments: [segment("C00350", 30)] };
  const { erreurs } = verifierProgramme(c, p, (id) => (id === "C00350" ? "14" : id));
  assert.equal(erreurs.length, 1);
  assert.match(erreurs[0], /Ligne 14 : 30 enquêtes programmées pour 15 restantes/);
});

test("une modification ne compte pas deux fois le programme modifié", () => {
  const p1 = { id: "p1", numero: 1, segments: [segment("C00350", 75)] };
  const c = course([p1]);
  assert.deepEqual(verifierProgramme(c, structuredClone(p1)).erreurs, []);
});

test("des quotas tous à zéro bloquent l'enregistrement", () => {
  const s = segment("C01319", 30);
  s.quotas.forEach((q) => { q.enquetes = 0; });
  const { erreurs } = verifierProgramme(course(), { id: "p", numero: 1, segments: [s] });
  assert.ok(erreurs.some((e) => e.includes("aucune enquête dans les quotas par heure")));
});

test("segments qui se chevauchent, arrêts manquants, direction absente, alertes de total et de durée", () => {
  const a = segment("C01319", 45, "06:00");
  const b = segment("C00350", 30, "08:30", "", "B");
  b.sens = "";
  const { erreurs, alertes } = verifierProgramme(course(), { id: "p", numero: 1, segments: [a, b] });
  assert.ok(erreurs.some((e) => e.includes("commence avant la fin du segment précédent")));
  assert.ok(erreurs.some((e) => e.includes("choisir l'arrêt de départ.")));
  assert.ok(alertes.some((e) => e.includes("direction non renseignée")));
  assert.ok(alertes.some((e) => e.includes("75 enquêtes au lieu de 120")));
});

test("pivots entre deux lignes, du plus proche au plus loin", () => {
  assert.deepEqual(pivotsEntre(L394, L14), [
    { arretA: "Stade du Panorama", arretB: "Stade du Panorama", distance: 0 },
    { arretA: "Division Leclerc", arretB: "Division Leclerc", distance: 49 },
  ]);
  assert.deepEqual(pivotsEntre(L14, L394)[0], { arretA: "Stade du Panorama", arretB: "Stade du Panorama", distance: 0 });
  assert.deepEqual(pivotsEntre(L14, L195), []);
});

test("distance entre deux arrêts : donnée connue, sinon calculée", () => {
  assert.equal(distanceEntreArrets(L394, "Division Leclerc", L14, "Division Leclerc"), 49);
  assert.ok(distanceEntreArrets(L394, "Issy", L14, "Stade du Panorama") > 3000);
});

test("accès le plus proche : seulement les lignes ferrées", () => {
  const parId = new Map([["RERC", { id: "RERC", libelle: "RER C", famille: "rer" }], ["C00350", { famille: "bus" }]]);
  assert.equal(accesFerre(L394.arrets[0], parId).ligne.libelle, "RER C");
  assert.equal(accesFerre(L394.arrets[2], parId), null);
});

test("suggestion de la maquette : 394 (75) puis 195 (45), pivot Division Leclerc", () => {
  const c = course([
    { id: "p1", numero: 1, segments: [segment("C01319", 120)] },
    { id: "p2", numero: 2, segments: [segment("C01319", 45, "06:00"), segment("C00350", 75, "08:45")] },
  ]);
  const [premiere] = suggestions(c, fichiers);
  assert.equal(premiere.type, "paire");
  assert.deepEqual(premiere.segments, [{ ligne: "C01319", enquetes: 75 }, { ligne: "C01215", enquetes: 45 }]);
  assert.equal(premiere.total, 120);
  assert.deepEqual(premiere.pivot, { arretA: "Division Leclerc", arretB: "Division Leclerc", distance: 0 });
});

test("suggestion au départ : jamais plus que le reste d'une ligne", () => {
  const liste = suggestions(course(), fichiers, 10);
  assert.ok(liste.length > 0);
  for (const s of liste) {
    for (const seg of s.segments) {
      const ligne = course().lignes.find((l) => l.ligne === seg.ligne);
      assert.ok(seg.enquetes <= ligne.commandees);
    }
    assert.ok(s.total <= 120);
  }
});

test("segments pré-remplis à partir d'une suggestion", () => {
  const s = { segments: [{ ligne: "C01319", enquetes: 75 }, { ligne: "C01215", enquetes: 45 }], total: 120, pivot: { arretA: "Division Leclerc", arretB: "Division Leclerc", distance: 0 } };
  const [a, b] = segmentsSuggeres(s, fichiers, course());
  assert.equal(a.sens, "vers Bourg-la-Reine");
  assert.equal(a.arretDepart, "Issy");
  assert.equal(a.arretFin, "Division Leclerc");
  assert.equal(b.arretDepart, "Division Leclerc");
  assert.equal(a.debut, "06:00");
  assert.equal(a.fin, "11:00");
  assert.equal(b.debut, "11:00");
  assert.equal(b.fin, "14:00");
  assert.equal(enquetesSegment(a), 75);
  assert.equal(enquetesSegment(b), 45);
});

test("recherche de ligne : numéro exact d'abord, puis commune", () => {
  const lignes = [
    { id: "1", libelle: "3940", nom: "3940", operateur: "X", communes: ["Massy"] },
    { id: "2", libelle: "394", nom: "394", operateur: "ATM Croix du Sud", communes: ["Châtillon"] },
    { id: "3", libelle: "14", nom: "14", operateur: "Transdev Vallée Sud", communes: ["Fontenay-aux-Roses"] },
  ];
  assert.deepEqual(rechercherLignes(lignes, "394").resultats.map((l) => l.id), ["2", "1"]);
  assert.deepEqual(rechercherLignes(lignes, "chatillon").resultats.map((l) => l.id), ["2"]);
  assert.deepEqual(rechercherLignes(lignes, "14 transdev").resultats.map((l) => l.id), ["3"]);
  assert.equal(rechercherLignes(lignes, "").total, 0);
});

// Ligne à deux sens, comme la 14 : Division Leclerc est le premier arrêt d'un sens et le dernier de l'autre
const L14_SENS = {
  id: "C00350", libelle: "14",
  ordre: { source: "GTFS", sens: [{ nom: "vers Croix de Berny", arrets: [0, 1, 2] }, { nom: "vers Division Leclerc", arrets: [2, 1, 0] }] },
  arrets: [{ nom: "Division Leclerc" }, { nom: "Stade du Panorama" }, { nom: "Croix de Berny" }],
};

test("direction choisie pour finir au pivot, départ complété", () => {
  const s = ajusterSens({ sens: "vers Croix de Berny", arretDepart: "", arretFin: "Division Leclerc" }, L14_SENS);
  assert.deepEqual(s, { sens: "vers Division Leclerc", arretDepart: "Croix de Berny", arretFin: "Division Leclerc" });
});

test("direction choisie pour partir du pivot, terminus complété", () => {
  const s = ajusterSens({ sens: "vers Division Leclerc", arretDepart: "Division Leclerc", arretFin: "" }, L14_SENS);
  assert.deepEqual(s, { sens: "vers Croix de Berny", arretDepart: "Division Leclerc", arretFin: "Croix de Berny" });
});

test("direction gardée quand elle convient, changée sinon", () => {
  const ok = ajusterSens({ sens: "vers Division Leclerc", arretDepart: "Croix de Berny", arretFin: "Stade du Panorama" }, L14_SENS);
  assert.equal(ok.sens, "vers Division Leclerc");
  const autre = ajusterSens({ sens: "vers Division Leclerc", arretDepart: "Division Leclerc", arretFin: "Croix de Berny" }, L14_SENS);
  assert.equal(autre.sens, "vers Croix de Berny");
  const sansOrdre = { sens: "vers Antony", arretDepart: "", arretFin: "X" };
  assert.deepEqual(ajusterSens({ ...sansOrdre }, { ordre: null }), sansOrdre);
});
