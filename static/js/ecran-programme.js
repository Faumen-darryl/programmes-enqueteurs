// Écran 2 : construire (ou modifier) un programme d'une course.

import {
  accesFerre, ajusterSens as ajusterSensSegment, arretsDuSens, distanceEntreArrets, enquetesSegment, etatLignes, finPourObjectif, HEURE_DEBUT_DEFAUT,
  pivotsEntre, pluriel, prochainNumero, quotasConserves, quotasParDefaut, quotasPourObjectif, RAYON_PIVOT,
  segmentsSuggeres, sommeQuotas, texteDuree, totalProgramme, verifierProgramme, versHeure, versMinutes,
} from "./calculs.js";
import { chargerIndex, chargerLignes } from "./donnees.js";
import {
  afficherSources, bouton, el, etatAttente, etatVide, etiquette, hash, icone, lien, lireHash, message, notifier, notifierApresChargement,
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
    afficherSources(index);
  } catch (erreur) {
    vider(racine, message(`Impossible de charger la liste des lignes : ${erreur.message}`, "alerte"));
    return;
  }
  window.addEventListener("beforeunload", (e) => {
    if (modifie) e.preventDefault();
  });
  // Bouton Retour ou lien vers un autre programme : l'ancre change sans recharger la page
  window.addEventListener("hashchange", () => {
    if (modifie && !window.confirm("Le programme en cours n'est pas enregistré. Le quitter quand même ?")) return;
    preparer();
  });
  await preparer();
}

async function preparer() {
  const courses = lireCourses();
  if (!courses.length) {
    vider(racine, el("section", { class: "carte" }, etatVide(
      "Aucune course",
      "Un programme est toujours construit dans une course. Créez d'abord une course avec ses lignes et leurs enquêtes à faire.",
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
      return segmentsSuggeres({ segments, total: segments.reduce((a, s) => a + s.enquetes, 0), pivot }, fichiers, course);
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
      modifie = false;
      location.hash = hash({ course: e.target.value }); // l'écouteur « hashchange » prépare le nouveau programme
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
      el("span", { text: l.ceProgramme ? `${l.ceProgramme} dans ce programme, ${l.restantes < 0 ? `${-l.restantes} en trop` : `reste ${l.restantes} après`}` : `sur ${l.commandees} à faire` }))))));
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

/** Direction cohérente avec les arrêts de départ et de fin (voir ajusterSens dans calculs.js). */
function ajusterSens(segment) {
  return ajusterSensSegment(segment, fichiers.get(segment.ligne));
}

/** Directions déjà saisies pour une ligne, dans toutes les courses : proposées pendant la saisie. */
function directionsConnues(ligne) {
  const directions = new Set();
  const segments = [...lireCourses().flatMap((c) => c.programmes.flatMap((p) => p.segments)), ...programme.segments];
  for (const s of segments) if (s.ligne === ligne && String(s.sens || "").trim()) directions.add(s.sens.trim());
  return [...directions].sort((a, b) => a.localeCompare(b, "fr"));
}

const DEUX_CHIFFRES = (n) => String(n).padStart(2, "0");

/** Heure en deux listes : heures de 00 à 23, minutes de 00 à 59. */
function champHeure(id, valeur, onchange) {
  const [h, m] = (valeur || HEURE_DEBUT_DEFAUT).split(":");
  const liste = (suffixe, nombre, actuel, etiquette) => el("select", {
    class: "champ champ--heure", id: `${id}-${suffixe}`, "aria-label": etiquette,
    onchange: () => onchange(`${heures.value}:${minutes.value}`),
  }, Array.from({ length: nombre }, (_, k) => el("option", { value: DEUX_CHIFFRES(k), text: DEUX_CHIFFRES(k), selected: DEUX_CHIFFRES(k) === actuel })));
  const heures = liste("heures", 24, h, "Heures");
  const minutes = liste("minutes", 60, m, "Minutes");
  return el("div", { class: "heure" }, heures, el("span", { class: "heure__separateur", text: ":" }), minutes);
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
    ? choixSelect(id("sens"), [
      ...fichier.ordre.sens.map((x) => ({ valeur: x.nom, texte: x.nom })),
      // Direction saisie avant que la ligne ait ses sens officiels : gardée telle quelle
      ...(s.sens && !fichier.ordre.sens.some((x) => x.nom === s.sens) ? [{ valeur: s.sens, texte: `${s.sens} (saisie à la main)` }] : []),
    ], s.sens || "", (v) => changer(() => {
      s.sens = v || null;
      const noms = new Set(arretsDuSens(fichier, s.sens).map((a) => a.nom));
      if (!noms.has(s.arretDepart)) s.arretDepart = "";
      if (!noms.has(s.arretFin)) s.arretFin = "";
    }), "Choisir la direction")
    : el("input", {
      class: "champ", id: id("sens"), value: s.sens || "", list: id("directions"), autocomplete: "off",
      placeholder: "Par exemple : vers Gare de Clamart",
      oninput: (e) => { s.sens = e.target.value.trim() || null; marquerModifie(); rendreResume(); },
    });
  const directions = !fichier?.ordre && s.ligne
    ? el("datalist", { id: id("directions") }, directionsConnues(s.ligne).map((d) => el("option", { value: d })))
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

  const recalculer = (segment) => {
    segment.quotas = quotasManuels.has(segment) ? quotasConserves(segment) : quotasParDefaut(segment);
  };
  const champDebut = champHeure(id("debut"), s.debut, (v) => changer(() => { s.debut = v; recalculer(s); }));
  const champFinHeure = champHeure(id("fin-heure"), s.fin, (v) => changer(() => {
    const ancienne = s.fin;
    s.fin = v;
    recalculer(s);
    const suivant = programme.segments[i + 1];
    if (suivant && suivant.debut === ancienne && versMinutes(v) < versMinutes(suivant.fin)) {
      suivant.debut = v;
      recalculer(suivant);
    }
  }));

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
      fichier?.ordre || !s.ligne
        ? champ("Direction", id("sens"), champSens)
        : el("div", { class: "champ-groupe" },
          el("label", { class: "etiquette-champ", for: id("sens"), text: "Direction (à saisir)" }),
          champSens, directions),
      champ("Arrêt de départ", id("depart"), champDepart),
      champ("Arrêt de fin", id("fin"), champFin)),
    (estPremier && s.arretDepart) || (estDernier && s.arretFin) ? el("div", { class: "segment__acces" },
      estPremier ? blocAcces(fichier, s.arretDepart, "Début") : null,
      estDernier ? blocAcces(fichier, s.arretFin, "Fin") : null) : null,
    el("div", { class: "segment__grille segment__grille--horaires" },
      champ("Début", id("debut-heures"), champDebut),
      champ("Fin", id("fin-heure-heures"), champFinHeure),
      el("div", { class: "champ-groupe" }, el("span", { class: "etiquette-champ", text: "Durée" }),
        el("p", { class: "segment__duree", text: duree > 0 ? texteDuree(duree) : "L'heure de fin doit être après l'heure de début" }))),
    zoneQuotas);
}

const TEXTE_PROFIL = "Répartition automatique : 10 enquêtes de 6 heures à 7 heures, 20 de 7 heures à 9 heures, 10 de 9 heures à 10 heures, puis 15 par heure. Chaque quota reste modifiable.";

function rendreQuotas(s, zone) {
  const total = el("p", { class: "quotas__total", text: texteTotalQuotas(s) });
  vider(zone,
    el("div", { class: "quotas__entete" },
      el("h4", { text: "Quotas par heure" }),
      bouton("Répartir automatiquement", {
        variante: "discret", petit: true, nomIcone: "horloge",
        onclick: () => {
          quotasManuels.delete(s);
          s.quotas = quotasParDefaut(s);
          marquerModifie();
          rendreQuotas(s, zone);
          rendreRestes();
          rendreResume();
        },
      })),
    el("p", { class: "quotas__profil", text: TEXTE_PROFIL }),
    s.quotas.length
      ? el("div", { class: "quotas__grille" }, s.quotas.map((q) => el("label", { class: "quota" },
        el("span", { text: `${q.debut} à ${q.fin}` }),
        el("input", {
          class: "champ champ--nombre champ--petit", type: "number", min: "0", step: "1", value: String(q.enquetes),
          "aria-label": `Enquêtes de ${q.debut} à ${q.fin}`,
          oninput: (e) => {
            q.enquetes = Math.max(0, Math.round(Number(e.target.value) || 0));
            quotasManuels.add(s);
            marquerModifie();
            total.textContent = texteTotalQuotas(s);
            rendreRestes();
            rendreResume();
          },
        }))))
      : el("p", { class: "texte-secondaire", text: "Choisissez une heure de fin après l'heure de début pour obtenir les tranches d'une heure." }),
    total);
}

function texteTotalQuotas(s) {
  return `Total du segment : ${texteEnquetes(sommeQuotas(s))}, somme des quotas par heure.`;
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
  const debut = dernier?.fin || HEURE_DEBUT_DEFAUT;
  const manque = course.enquetesParProgramme - totalProgramme(programme);
  const objectif = Math.min(Math.max(candidate.restantes, 0), manque > 0 ? manque : course.enquetesParProgramme);
  const segment = {
    ligne: candidate.ligne,
    sens: fichier?.ordre ? fichier.ordre.sens[0].nom : null,
    arretDepart: "",
    arretFin: "",
    debut,
    fin: objectif > 0 ? finPourObjectif(debut, objectif) : versHeure(Math.min(versMinutes(debut) + 60, 23 * 60 + 59)),
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
  segment.quotas = objectif > 0 ? quotasPourObjectif(segment, objectif) : quotasParDefaut(segment);
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
      el("div", {}, el("dt", { text: "Segments" }), el("dd", { text: programme.segments.map((s) => `${libelle(s.ligne)} (${enquetesSegment(s)})`).join(" puis ") || "Aucun" })),
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
      enquetes: sommeQuotas(s), quotas: s.quotas.map((q) => ({ debut: q.debut, fin: q.fin, enquetes: Number(q.enquetes) })),
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
