// Écran 2 : construire (ou modifier) un programme d'une course.

import {
  accesFerre, arretsDuSens, distanceEntreArrets, etatLignes, pivotsEntre, pluriel, prochainNumero, quotasConserves,
  quotasRepartis, RAYON_PIVOT, segmentsSuggeres, sommeQuotas, texteDuree, totalProgramme, verifierProgramme,
  versHeure, versMinutes,
} from "./calculs.js";
import { chargerIndex, chargerLignes } from "./donnees.js";
import {
  bouton, el, etatAttente, etatVide, etiquette, hash, icone, lien, lireHash, message, notifier, notifierApresChargement,
  pastille, remplacerHash, texteDistance, texteEnquetes, urls, vider,
} from "./interface.js";
import { enregistrerCourse, lireCourses, lirePivotRetenu, nouvelIdentifiant } from "./stockage.js";

const racine = document.getElementById("ecran-programme");
let index = null;
let course = null;
let programme = null;
let fichiers = new Map();
let modification = false;
let modifie = false;
const quotasManuels = new WeakSet();

const ligneDe = (id) => index.parId.get(id) || { id, libelle: id, nom: id, famille: "bus", operateur: "" };
const libelle = (id) => ligneDe(id).libelle;

async function demarrer() {
  vider(racine, etatAttente());
  try {
    index = await chargerIndex();
  } catch (erreur) {
    vider(racine, message(`Impossible de charger la liste des lignes : ${erreur.message}`, "alerte"));
    return;
  }
  window.addEventListener("beforeunload", (e) => {
    if (modifie) e.preventDefault();
  });
  await preparer();
}

async function preparer() {
  const courses = lireCourses();
  if (!courses.length) {
    vider(racine, el("section", { class: "carte" }, etatVide(
      "Aucune course",
      "Un programme est toujours construit dans une course. Créez d'abord une course avec ses lignes et les enquêtes commandées.",
      lien("Créer une course", `${urls().courses}#creer=1`, { variante: "primaire", nomIcone: "ajouter" }))));
    return;
  }
  const h = lireHash();
  course = courses.find((c) => c.id === h.course) || courses[0];
  vider(racine, etatAttente("Chargement des lignes de la course…"));
  try {
    fichiers = await chargerLignes(course.lignes.map((l) => l.ligne));
  } catch (erreur) {
    vider(racine, message(`Impossible de charger les lignes de la course : ${erreur.message}`, "alerte"));
    return;
  }

  const existant = h.programme ? course.programmes.find((p) => p.id === h.programme) : null;
  modification = Boolean(existant);
  if (existant) {
    programme = structuredClone(existant);
    programme.segments.forEach((s) => quotasManuels.add(s));
  } else {
    programme = { id: nouvelIdentifiant(), numero: prochainNumero(course), segments: segmentsInitiaux(h.suggestion) };
  }
  modifie = false;
  remplacerHash({ course: course.id, programme: modification ? programme.id : "" });
  rendre();
}

function segmentsInitiaux(texteSuggestion) {
  if (texteSuggestion) {
    const segments = texteSuggestion.split(",").map((morceau) => {
      const [ligne, n] = morceau.split(":");
      return { ligne, enquetes: Number(n) || 0 };
    }).filter((s) => course.lignes.some((l) => l.ligne === s.ligne) && s.enquetes > 0);
    if (segments.length) {
      const pivot = segments.length === 2 ? pivotsEntre(fichiers.get(segments[0].ligne), fichiers.get(segments[1].ligne))[0] : null;
      return segmentsSuggeres({ segments, total: segments.reduce((a, s) => a + s.enquetes, 0), pivot }, fichiers, course).map(ajusterSens);
    }
  }
  const etat = etatLignes(course);
  const premiere = etat.find((l) => l.restantes > 0) || etat[0];
  if (!premiere || premiere.restantes <= 0) return [];
  const enquetes = Math.min(premiere.restantes, course.enquetesParProgramme);
  return segmentsSuggeres({ segments: [{ ligne: premiere.ligne, enquetes }], total: enquetes, pivot: null }, fichiers, course);
}

function marquerModifie() {
  modifie = true;
}

// ---------- Rendu ----------

function rendre() {
  const courses = lireCourses();
  const choixCourse = el("select", {
    class: "champ", id: "choix-course",
    onchange: (e) => {
      if (modifie && !window.confirm("Le programme en cours n'est pas enregistré. Changer de course quand même ?")) {
        e.target.value = course.id;
        return;
      }
      location.hash = hash({ course: e.target.value });
      preparer();
    },
  }, courses.map((c) => el("option", { value: c.id, selected: c.id === course.id, text: c.nom })));

  vider(racine,
    el("section", { class: "carte barre-programme" },
      el("div", { class: "barre-programme__haut" },
        el("div", { class: "champ-groupe" }, el("label", { class: "etiquette-champ", for: "choix-course", text: "Course" }), choixCourse),
        el("div", { class: "barre-programme__titre" },
          el("span", { class: "etiquette-champ", text: modification ? "Modification" : "Nouveau programme" }),
          el("strong", { text: `Programme ${programme.numero}` })),
        el("p", { class: "texte-secondaire barre-programme__reglages", text: `${texteEnquetes(course.enquetesParProgramme)} par programme, ${texteDuree(Math.round(course.dureeProgrammeHeures * 60))}` })),
      el("div", { id: "restes", class: "restes" })),
    el("div", { class: "grille-programme" },
      el("div", { id: "segments", class: "segments" }),
      el("aside", { id: "resume-programme", class: "carte resume-programme" })));
  rendreSegments();
  rendreRestes();
  rendreResume();
}

function rendreRestes() {
  const zone = document.getElementById("restes");
  vider(zone,
    el("span", { class: "etiquette-champ", text: "Reste à programmer" }),
    el("div", { class: "restes__liste" }, etatLignes(course, programme).map((l) => el("div", {
      class: `reste-ligne${l.restantes < 0 ? " reste-ligne--surplus" : ""}${l.ceProgramme ? " reste-ligne--utilisee" : ""}`,
    },
    pastille(ligneDe(l.ligne)),
    el("span", { class: "reste-ligne__chiffres" },
      el("strong", { text: pluriel(Math.max(l.disponibles, 0), "restante", "restantes") }),
      el("span", { text: l.ceProgramme ? `${l.ceProgramme} dans ce programme, ${l.restantes < 0 ? `${-l.restantes} en trop` : `reste ${l.restantes} après`}` : `sur ${l.commandees} commandées` }))))));
}

function rendreSegments() {
  const zone = document.getElementById("segments");
  if (!programme.segments.length) {
    vider(zone, el("section", { class: "carte" }, etatVide(
      "Toutes les enquêtes de cette course sont programmées",
      "Il ne reste rien à programmer sur ses lignes. Vous pouvez modifier un programme existant depuis l'écran Courses.",
      lien("Voir la course", `${urls().courses}${hash({ course: course.id })}`, { variante: "primaire" }))));
    return;
  }
  const elements = [];
  programme.segments.forEach((s, i) => {
    if (i > 0) elements.push(cartePivot(i));
    elements.push(carteSegment(s, i));
  });
  vider(zone, elements, bouton("Ajouter un segment sur une autre ligne", { variante: "secondaire", nomIcone: "ajouter", onclick: ajouterSegment }));
}

/** Choisit un sens où l'arrêt de départ précède l'arrêt de fin ; vide un arrêt introuvable dans tous les sens. */
function ajusterSens(segment) {
  const fichier = fichiers.get(segment.ligne);
  if (!fichier?.ordre) return segment;
  const valide = (sens) => {
    const noms = sens.arrets.map((i) => fichier.arrets[i].nom);
    const d = segment.arretDepart ? noms.indexOf(segment.arretDepart) : -1;
    const f = segment.arretFin ? noms.indexOf(segment.arretFin) : Infinity;
    return (!segment.arretDepart || d !== -1) && (!segment.arretFin || f !== -1) && d < f;
  };
  const actuel = fichier.ordre.sens.find((x) => x.nom === segment.sens);
  if (actuel && valide(actuel)) return segment;
  const autre = fichier.ordre.sens.find(valide);
  if (autre) {
    segment.sens = autre.nom;
    return segment;
  }
  const garde = fichier.ordre.sens.find((x) => x.arrets.some((i) => fichier.arrets[i].nom === (segment.arretFin || segment.arretDepart)));
  if (garde) segment.sens = garde.nom;
  const noms = arretsDuSens(fichier, segment.sens).map((a) => a.nom);
  if (noms.indexOf(segment.arretDepart) >= noms.indexOf(segment.arretFin)) segment.arretDepart = "";
  return segment;
}

function choixSelect(id, options, valeur, onchange, vide = "Choisir…") {
  return el("select", { class: "champ", id, onchange: (e) => onchange(e.target.value) },
    el("option", { value: "", text: vide, selected: !valeur }),
    options.map((o) => el("option", { value: o.valeur, text: o.texte, selected: o.valeur === valeur })));
}

function blocAcces(fichier, nomArret, role) {
  const arret = fichier?.arrets.find((a) => a.nom === nomArret);
  if (!arret) return null;
  const acces = accesFerre(arret, index.parId, 300);
  if (!acces) return message(`${role} du programme : aucune gare de RER, station de métro ou arrêt de tramway à moins de 300 mètres.`, "alerte");
  return el("div", { class: "acces acces--compact" },
    el("span", { class: "etiquette-champ", text: `${role} du programme : accès le plus proche` }),
    el("div", { class: "acces__ligne" }, pastille(acces.ligne), el("span", { text: acces.nom }), el("strong", { text: texteDistance(acces.distance) })));
}

function carteSegment(s, i) {
  const fichier = fichiers.get(s.ligne);
  const estPremier = i === 0;
  const estDernier = i === programme.segments.length - 1;
  const etat = etatLignes(course, programme);
  const arrets = fichier ? arretsDuSens(fichier, s.sens) : [];
  const ordonne = Boolean(fichier?.ordre && s.sens);
  const optionsArrets = (debutA = 0) => arrets.slice(debutA).map((a) => ({
    valeur: a.nom, texte: ordonne ? `${arrets.indexOf(a) + 1}. ${a.nom}` : a.nom,
  }));
  const indexDepart = ordonne ? arrets.findIndex((a) => a.nom === s.arretDepart) : -1;
  const id = (nom) => `segment-${i}-${nom}`;
  const zoneQuotas = el("div", { class: "quotas" });

  const changer = (modif) => {
    modif();
    marquerModifie();
    rendre();
  };

  const champLigne = choixSelect(id("ligne"), course.lignes.map((l) => {
    const e = etat.find((x) => x.ligne === l.ligne);
    const ligne = ligneDe(l.ligne);
    return { valeur: l.ligne, texte: `${ligne.libelle}${ligne.nom !== ligne.libelle ? ` ${ligne.nom}` : ""} (${pluriel(Math.max(e.disponibles, 0), "restante", "restantes")})` };
  }), s.ligne, (v) => changer(() => {
    s.ligne = v;
    const f = fichiers.get(v);
    s.sens = f?.ordre ? f.ordre.sens[0].nom : null;
    s.arretDepart = "";
    s.arretFin = "";
  }), "Choisir une ligne");

  const champSens = fichier?.ordre
    ? choixSelect(id("sens"), fichier.ordre.sens.map((x) => ({ valeur: x.nom, texte: x.nom })), s.sens || "", (v) => changer(() => {
      s.sens = v || null;
      const noms = new Set(arretsDuSens(fichier, s.sens).map((a) => a.nom));
      if (!noms.has(s.arretDepart)) s.arretDepart = "";
      if (!noms.has(s.arretFin)) s.arretFin = "";
    }), "Tous les arrêts")
    : null;

  const champDepart = choixSelect(id("depart"), optionsArrets(), s.arretDepart, (v) => changer(() => {
    s.arretDepart = v;
    if (ordonne) {
      const iD = arrets.findIndex((a) => a.nom === v);
      const iF = arrets.findIndex((a) => a.nom === s.arretFin);
      if (iF !== -1 && iF <= iD) s.arretFin = "";
    }
  }), "Choisir l'arrêt de départ");
  const champFin = choixSelect(id("fin"), optionsArrets(indexDepart + 1), s.arretFin, (v) => changer(() => { s.arretFin = v; }), "Choisir l'arrêt de fin");

  const champHeure = (nom, valeur, applique) => el("input", {
    class: "champ", type: "time", step: "900", id: id(nom), value: valeur || "",
    onchange: (e) => changer(() => {
      applique(e.target.value);
      s.quotas = quotasManuels.has(s) ? quotasConserves(s) : quotasRepartis(s);
    }),
  });
  const champDebut = champHeure("debut", s.debut, (v) => { s.debut = v; });
  const champFinHeure = champHeure("fin-heure", s.fin, (v) => {
    const ancienne = s.fin;
    s.fin = v;
    const suivant = programme.segments[i + 1];
    if (suivant && suivant.debut === ancienne && versMinutes(v) !== null && versMinutes(v) < versMinutes(suivant.fin)) {
      suivant.debut = v;
      suivant.quotas = quotasManuels.has(suivant) ? quotasConserves(suivant) : quotasRepartis(suivant);
    }
  });
  const champEnquetes = el("input", {
    class: "champ champ--nombre", type: "number", min: "1", step: "1", id: id("enquetes"), value: String(s.enquetes || ""),
    oninput: (e) => {
      s.enquetes = Number(e.target.value) || 0;
      if (!quotasManuels.has(s)) s.quotas = quotasRepartis(s);
      marquerModifie();
      rendreQuotas(s, zoneQuotas);
      rendreRestes();
      rendreResume();
    },
  });

  const duree = versMinutes(s.fin) - versMinutes(s.debut);
  const champ = (texte, cible, element) => el("div", { class: "champ-groupe" }, el("label", { class: "etiquette-champ", for: cible, text: texte }), element);

  rendreQuotas(s, zoneQuotas);
  return el("section", { class: "carte segment", "aria-label": `Segment ${i + 1}` },
    el("header", { class: "segment__entete" },
      el("span", { class: "segment__numero", text: i + 1 }),
      el("h3", { text: `Segment ${i + 1}` }),
      s.ligne ? pastille(ligneDe(s.ligne)) : null,
      fichier && !fichier.ordre ? etiquette("Ordre des arrêts non disponible", "alerte") : null,
      programme.segments.length > 1 ? bouton("Retirer", {
        variante: "discret", nomIcone: "supprimer", petit: true,
        onclick: () => changer(() => programme.segments.splice(i, 1)),
      }) : null),
    el("div", { class: "segment__grille" },
      champ("Ligne", id("ligne"), champLigne),
      champSens ? champ("Sens", id("sens"), champSens) : el("div", { class: "champ-groupe" },
        el("span", { class: "etiquette-champ", text: "Sens" }),
        el("p", { class: "texte-secondaire segment__sans-sens", text: "Non disponible pour cette ligne : l'ordre des arrêts n'est pas connu." })),
      champ("Arrêt de départ", id("depart"), champDepart),
      champ("Arrêt de fin", id("fin"), champFin)),
    (estPremier && s.arretDepart) || (estDernier && s.arretFin) ? el("div", { class: "segment__acces" },
      estPremier ? blocAcces(fichier, s.arretDepart, "Début") : null,
      estDernier ? blocAcces(fichier, s.arretFin, "Fin") : null) : null,
    el("div", { class: "segment__grille segment__grille--horaires" },
      champ("Début", id("debut"), champDebut),
      champ("Fin", id("fin-heure"), champFinHeure),
      champ("Enquêtes sur ce segment", id("enquetes"), champEnquetes),
      el("div", { class: "champ-groupe" }, el("span", { class: "etiquette-champ", text: "Durée" }),
        el("p", { class: "segment__duree", text: duree > 0 ? texteDuree(duree) : "Horaires à compléter" }))),
    zoneQuotas);
}

function rendreQuotas(s, zone) {
  const somme = sommeQuotas(s);
  const juste = somme === Number(s.enquetes);
  vider(zone,
    el("div", { class: "quotas__entete" },
      el("h4", { text: "Quotas par heure" }),
      bouton("Répartir automatiquement", {
        variante: "discret", petit: true, nomIcone: "horloge",
        onclick: () => {
          quotasManuels.delete(s);
          s.quotas = quotasRepartis(s);
          marquerModifie();
          rendreQuotas(s, zone);
          rendreResume();
        },
      })),
    s.quotas.length
      ? el("div", { class: "quotas__grille" }, s.quotas.map((q, k) => el("label", { class: "quota" },
        el("span", { text: `${q.debut} à ${q.fin}` }),
        el("input", {
          class: "champ champ--nombre champ--petit", type: "number", min: "0", step: "1", value: String(q.enquetes),
          "aria-label": `Enquêtes de ${q.debut} à ${q.fin}`,
          oninput: (e) => {
            q.enquetes = Math.max(0, Number(e.target.value) || 0);
            quotasManuels.add(s);
            marquerModifie();
            const total = zone.querySelector(".quotas__total");
            const ok = sommeQuotas(s) === Number(s.enquetes);
            total.className = `quotas__total ${ok ? "quotas__total--juste" : "quotas__total--faux"}`;
            total.textContent = texteTotalQuotas(s);
            rendreResume();
          },
        }))))
      : el("p", { class: "texte-secondaire", text: "Indiquez l'heure de début et l'heure de fin pour obtenir les tranches d'une heure." }),
    el("p", { class: `quotas__total ${juste ? "quotas__total--juste" : "quotas__total--faux"}`, text: texteTotalQuotas(s) }));
}

function texteTotalQuotas(s) {
  const somme = sommeQuotas(s);
  if (somme === Number(s.enquetes)) return `Total des quotas : ${somme}, égal aux enquêtes du segment.`;
  return `Total des quotas : ${somme} au lieu de ${s.enquetes || 0}. Corrigez les quotas ou utilisez « Répartir automatiquement ».`;
}

function cartePivot(i) {
  const a = programme.segments[i - 1];
  const b = programme.segments[i];
  const fA = fichiers.get(a.ligne);
  const fB = fichiers.get(b.ligne);
  const base = (...contenu) => el("div", { class: "pivot" }, el("span", { class: "pivot__icone" }, icone("pivot", 18)), el("div", { class: "pivot__contenu" }, contenu));
  if (!fA || !fB) return base(el("p", { class: "texte-secondaire", text: "Choisissez les deux lignes pour voir les arrêts de pivot." }));

  const retenu = lirePivotRetenu();
  const pivots = pivotsEntre(fA, fB, RAYON_PIVOT);
  const estRetenu = (p) => retenu && ((retenu.ligne === fA.id && retenu.arret === p.arretA) || (retenu.ligne === fB.id && retenu.arret === p.arretB));
  pivots.sort((x, y) => Number(estRetenu(y)) - Number(estRetenu(x)));
  const actuel = pivots.findIndex((p) => p.arretA === a.arretFin && p.arretB === b.arretDepart);

  let etatPivot = null;
  if (a.arretFin && b.arretDepart) {
    const d = distanceEntreArrets(fA, a.arretFin, fB, b.arretDepart);
    etatPivot = d !== null && d <= RAYON_PIVOT
      ? message(`Pivot : de « ${a.arretFin} » (${fA.libelle}) à « ${b.arretDepart} » (${fB.libelle}), ${texteDistance(d)}.`, "succes")
      : message(`« ${a.arretFin} » et « ${b.arretDepart} » sont à ${d === null ? "une distance inconnue" : texteDistance(d)} : ce n'est pas un pivot (150 mètres ou moins). Choisissez un pivot ci-dessous.`, "alerte");
  }

  return base(
    el("div", { class: "pivot__entete" },
      el("strong", { text: a.ligne === b.ligne ? `Changement de sens sur la ${fA.libelle}` : `Pivot entre la ${fA.libelle} et la ${fB.libelle}` }),
      el("span", { class: "texte-secondaire", text: pivots.length ? pluriel(pivots.length, "arrêt possible à 150 mètres ou moins", "arrêts possibles à 150 mètres ou moins") : "" })),
    pivots.length
      ? el("select", {
        class: "champ", "aria-label": "Arrêt de pivot",
        onchange: (e) => {
          const p = pivots[Number(e.target.value)];
          if (!p) return;
          a.arretFin = p.arretA;
          b.arretDepart = p.arretB;
          ajusterSens(a);
          ajusterSens(b);
          marquerModifie();
          rendre();
        },
      },
      el("option", { value: "", text: "Choisir un arrêt de pivot…", selected: actuel === -1 }),
      pivots.map((p, k) => el("option", {
        value: String(k), selected: k === actuel,
        text: `${p.arretA === p.arretB ? p.arretA : `${p.arretA} (${fA.libelle}) puis ${p.arretB} (${fB.libelle})`}, ${texteDistance(p.distance)}${estRetenu(p) ? ", pivot retenu" : ""}`,
      })))
      : message(`Aucun arrêt de la ${fA.libelle} n'est à 150 mètres ou moins d'un arrêt de la ${fB.libelle}.`, "alerte"),
    etatPivot);
}

function ajouterSegment() {
  const dernier = programme.segments[programme.segments.length - 1];
  const etat = etatLignes(course, programme);
  const candidate = etat.find((l) => l.restantes > 0 && l.ligne !== dernier?.ligne) || etat.find((l) => l.ligne !== dernier?.ligne) || etat[0];
  const fichier = fichiers.get(candidate.ligne);
  const debut = dernier?.fin || "07:00";
  const finJournee = versMinutes(programme.segments[0]?.debut || "07:00") + Math.round(course.dureeProgrammeHeures * 60);
  const fin = versHeure(Math.max(versMinutes(debut) + 60, finJournee));
  const manque = course.enquetesParProgramme - totalProgramme(programme);
  const segment = {
    ligne: candidate.ligne,
    sens: fichier?.ordre ? fichier.ordre.sens[0].nom : null,
    arretDepart: "",
    arretFin: "",
    debut,
    fin,
    enquetes: Math.max(1, Math.min(Math.max(candidate.restantes, 0), manque > 0 ? manque : candidate.restantes)) || 1,
  };
  if (dernier && fichiers.get(dernier.ligne) && fichier) {
    const pivot = pivotsEntre(fichiers.get(dernier.ligne), fichier)[0];
    if (pivot) {
      dernier.arretFin = pivot.arretA;
      segment.arretDepart = pivot.arretB;
      ajusterSens(dernier);
      ajusterSens(segment);
    }
  }
  segment.quotas = quotasRepartis(segment);
  programme.segments.push(segment);
  marquerModifie();
  rendre();
}

// ---------- Résumé et enregistrement ----------

function rendreResume() {
  const zone = document.getElementById("resume-programme");
  const { erreurs, alertes } = verifierProgramme(course, programme, libelle);
  const total = totalProgramme(programme);
  const premier = programme.segments[0];
  const dernier = programme.segments[programme.segments.length - 1];
  const duree = premier && dernier ? versMinutes(dernier.fin) - versMinutes(premier.debut) : 0;
  const prevue = Math.round(course.dureeProgrammeHeures * 60);
  const boutonEnregistrer = bouton(modification ? "Enregistrer les modifications" : "Enregistrer le programme", {
    variante: "primaire", desactive: erreurs.length > 0, onclick: enregistrer,
  });

  vider(zone,
    el("h3", { text: `Programme ${programme.numero}` }),
    el("div", { class: `resume-total${total === course.enquetesParProgramme ? " resume-total--juste" : ""}` },
      el("span", { class: "etiquette-champ", text: "Total du programme" }),
      el("strong", { text: total }),
      el("span", { text: `sur ${texteEnquetes(course.enquetesParProgramme)}` })),
    el("dl", { class: "resume-liste" },
      el("div", {}, el("dt", { text: "Durée" }), el("dd", { text: duree > 0 ? `${texteDuree(duree)} sur ${texteDuree(prevue)}` : "À compléter" })),
      el("div", {}, el("dt", { text: "Horaires" }), el("dd", { text: premier?.debut && dernier?.fin ? `${premier.debut} à ${dernier.fin}` : "À compléter" })),
      el("div", {}, el("dt", { text: "Segments" }), el("dd", { text: programme.segments.map((s) => `${libelle(s.ligne)} (${s.enquetes || 0})`).join(" puis ") || "Aucun" })),
      el("div", {}, el("dt", { text: "Début" }), el("dd", { text: premier?.arretDepart || "À choisir" })),
      el("div", {}, el("dt", { text: "Fin" }), el("dd", { text: dernier?.arretFin || "À choisir" }))),
    erreurs.length
      ? message(el("div", {}, el("strong", { text: "À corriger avant d'enregistrer" }), el("ul", { class: "liste-erreurs" }, erreurs.map((e) => el("li", { text: e })))), "erreur")
      : null,
    alertes.length ? message(el("ul", { class: "liste-erreurs" }, alertes.map((e) => el("li", { text: e }))), "alerte") : null,
    !erreurs.length && !alertes.length ? message("Le programme est complet et peut être enregistré.", "succes") : null,
    el("div", { class: "resume-actions" },
      boutonEnregistrer,
      lien("Retour à la course", `${urls().courses}${hash({ course: course.id })}`, { variante: "discret" })));
}

function enregistrer() {
  const { erreurs } = verifierProgramme(course, programme, libelle);
  if (erreurs.length) {
    rendreResume();
    return;
  }
  const propre = {
    id: programme.id,
    numero: programme.numero,
    segments: programme.segments.map((s) => ({
      ligne: s.ligne, sens: s.sens || null, arretDepart: s.arretDepart, arretFin: s.arretFin, debut: s.debut, fin: s.fin,
      enquetes: Number(s.enquetes), quotas: s.quotas.map((q) => ({ debut: q.debut, fin: q.fin, enquetes: Number(q.enquetes) })),
    })),
  };
  const aJour = lireCourses().find((c) => c.id === course.id) || course;
  const i = aJour.programmes.findIndex((p) => p.id === propre.id);
  if (i >= 0) aJour.programmes[i] = propre;
  else aJour.programmes.push(propre);
  const verification = verifierProgramme(aJour, propre, libelle);
  if (verification.erreurs.length) {
    notifier("Les enquêtes de la course ont changé entre-temps : vérifiez le programme.", "alerte");
    course = aJour;
    rendre();
    return;
  }
  enregistrerCourse(aJour);
  modifie = false;
  notifierApresChargement(`Programme ${propre.numero} enregistré (${texteEnquetes(totalProgramme(propre))}).`);
  location.href = `${urls().courses}${hash({ course: course.id })}`;
}

demarrer();
