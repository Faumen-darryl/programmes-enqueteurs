// Écran 3 : courses, et fenêtre 2b « Créer une course ».

import {
  decoupage, enquetesSegment, etatLignes, pluriel, programmesNecessaires, prochainNumero, resumeCourse, suggestions,
  texteDuree, totalProgramme, versMinutes,
} from "./calculs.js";
import { chargerIndex, chargerLignes } from "./donnees.js";
import {
  bouton, choisirFichier, confirmerAction, creerChoixLigne, descriptionLigne, el, etatAttente, etatVide, etiquette,
  hash, icone, lien, lireHash, message, notifier, ouvrirFenetre, pastille, telecharger, texteDistance, texteEnquetes,
  titreLigne, urls, vider,
} from "./interface.js";
import {
  courseExemple, enregistrerCourse, exporterCourses, importerCourses, lireCourses, nouvelIdentifiant,
  stockageDisponible, supprimerCourse,
} from "./stockage.js";

const racine = document.getElementById("ecran-courses");
const boutonExporter = document.getElementById("exporter-courses");
let index = null;

const ligneDe = (id) => index.parId.get(id) || { id, libelle: id, nom: id, famille: "bus", operateur: "", communes: [] };
const libelle = (id) => ligneDe(id).libelle;

async function demarrer() {
  vider(racine, etatAttente());
  try {
    index = await chargerIndex();
  } catch (erreur) {
    vider(racine, message(`Impossible de charger la liste des lignes : ${erreur.message}`, "alerte"));
    return;
  }
  document.getElementById("creer-course").addEventListener("click", () => ouvrirFenetreCourse(null));
  document.getElementById("importer-courses").addEventListener("click", importer);
  boutonExporter.addEventListener("click", exporter);
  window.addEventListener("hashchange", rendre);
  rendre();
  if (lireHash().creer === "1") {
    history.replaceState(null, "", location.pathname);
    ouvrirFenetreCourse(null);
  }
}

function coursesTriees() {
  return lireCourses().sort((a, b) => (b.creeeLe || "").localeCompare(a.creeeLe || ""));
}

function rendre() {
  const courses = coursesTriees();
  boutonExporter.disabled = !courses.length;
  const avertissement = stockageDisponible() ? null
    : message("Ce navigateur bloque l'enregistrement local (navigation privée ou réglage de confidentialité) : les courses ne pourront pas être gardées.", "alerte");

  if (!courses.length) {
    vider(racine, avertissement, el("section", { class: "carte" }, etatVide(
      "Aucune course pour l'instant",
      "Créez votre première course avec ses lignes et le nombre d'enquêtes à faire sur chacune, importez un fichier exporté depuis un autre poste, ou chargez l'exemple de la maquette pour essayer l'outil.",
      bouton("Créer une course", { variante: "primaire", nomIcone: "ajouter", onclick: () => ouvrirFenetreCourse(null) }),
      bouton("Importer des courses", { nomIcone: "importer", onclick: importer }),
      bouton("Charger l'exemple de la maquette", {
        variante: "discret", nomIcone: "etoile",
        onclick: () => {
          const exemple = enregistrerCourse(courseExemple());
          location.hash = hash({ course: exemple.id });
          rendre();
        },
      }))));
    return;
  }
  const choisie = courses.find((c) => c.id === lireHash().course) || courses[0];
  vider(racine, avertissement,
    el("div", { class: "grille-courses" },
      el("nav", { class: "liste-courses", "aria-label": "Courses" },
        el("p", { class: "etiquette-champ", text: pluriel(courses.length, "course", "courses") }),
        courses.map((c) => carteCourse(c, c === choisie))),
      detailCourse(choisie)));
}

function carteCourse(course, active) {
  const r = resumeCourse(course);
  const pourcentage = r.commandees ? Math.round((100 * r.programmees) / r.commandees) : 0;
  return el("a", { class: "carte-course", href: hash({ course: course.id }), "aria-current": active ? "true" : null },
    el("strong", { text: course.nom }),
    el("span", { class: "carte-course__lignes" }, course.lignes.map((l) => pastille(ligneDe(l.ligne)))),
    el("span", { class: "barre-progression", "aria-hidden": "true" }, el("span", { style: `width: ${pourcentage}%` })),
    el("span", { class: "carte-course__chiffres", text: `${pluriel(r.realises, "programme", "programmes")} sur ${r.necessaires}, ${pluriel(r.restantes, "enquête restante", "enquêtes restantes")}` }));
}

// ---------- Détail d'une course ----------

function detailCourse(course) {
  const r = resumeCourse(course);
  const etat = etatLignes(course);
  const urlProgramme = (parametres) => `${urls().programme}${hash({ course: course.id, ...parametres })}`;
  const boutonExcel = bouton("Télécharger la course complète", {
    nomIcone: "telecharger",
    onclick: async () => {
      boutonExcel.disabled = true;
      try {
        const { telechargerCourseExcel } = await import("./excel.js");
        await telechargerCourseExcel(course, index);
      } catch (erreur) {
        notifier(`Le fichier n'a pas pu être créé : ${erreur.message}`, "alerte");
      } finally {
        boutonExcel.disabled = false;
      }
    },
  });
  const zoneSuggestion = el("section", { class: "carte suggestion" });

  const detail = el("div", { class: "detail-course" },
    el("section", { class: "carte entete-course" },
      el("div", { class: "entete-course__titre" },
        el("div", {},
          el("h2", { text: course.nom }),
          el("p", { class: "texte-secondaire", text: `${texteEnquetes(course.enquetesParProgramme)} par programme, programmes de ${texteDuree(Math.round(course.dureeProgrammeHeures * 60))}` })),
        el("div", { class: "rangee" },
          bouton("Modifier", { variante: "discret", nomIcone: "modifier", onclick: () => ouvrirFenetreCourse(course) }),
          bouton("Supprimer", { variante: "danger", nomIcone: "supprimer", onclick: () => supprimer(course) }))),
      el("div", { class: "tuiles" },
        tuile("Enquêtes à faire", r.commandees),
        tuile("Programmées", r.programmees),
        tuile("Restantes", r.restantes, r.restantes === 0 ? "succes" : null),
        tuile("Programmes", `${r.realises} sur ${r.necessaires}`)),
      el("div", { class: "rangee" },
        lien("Construire un programme", urlProgramme({}), { variante: "primaire", nomIcone: "ajouter" }),
        boutonExcel)),
    zoneSuggestion,
    el("section", { class: "carte" },
      el("h3", { class: "carte__titre", text: "Lignes de la course" }),
      el("div", { class: "tableau-conteneur" }, el("table", { class: "tableau" },
        el("thead", {}, el("tr", {},
          el("th", { text: "Ligne" }), el("th", { class: "nombre", text: "Enquêtes à faire" }), el("th", { class: "nombre", text: "Programmées" }),
          el("th", { class: "nombre", text: "Restantes" }), el("th", { text: "Reste à programmer" }), el("th", { text: "Programmes" }))),
        el("tbody", {}, etat.map((l) => {
          const ligne = ligneDe(l.ligne);
          const { pleins, reste } = decoupage(Math.max(l.restantes, 0), course.enquetesParProgramme);
          return el("tr", {},
            el("td", {}, el("div", { class: "cellule-ligne" }, pastille(ligne),
              el("span", {}, el("strong", { text: titreLigne(ligne) }), el("span", { class: "texte-secondaire petit", text: ligne.operateur })))),
            el("td", { class: "nombre", text: l.commandees }),
            el("td", { class: "nombre", text: l.programmees }),
            el("td", { class: "nombre" }, el("strong", { text: l.restantes })),
            el("td", {}, l.restantes <= 0 ? etiquette("Complet", "succes") : [
              pleins ? el("span", { text: pluriel(pleins, "programme plein", "programmes pleins") }) : null,
              pleins && reste ? el("span", { text: " et " }) : null,
              reste ? etiquette(`${reste} à combiner`, "alerte") : null,
            ]),
            el("td", {}, el("div", { class: "rangee rangee--serree" },
              l.programmes.length ? l.programmes.map((p) => etiquette(`Programme ${p.numero} : ${p.enquetes}`, "neutre"))
                : el("span", { class: "texte-discret", text: "Aucun programme" }))));
        }))))),
    el("section", { class: "carte" },
      el("h3", { class: "carte__titre", text: "Programmes" }),
      course.programmes.length
        ? el("div", { class: "pile" }, [...course.programmes].sort((a, b) => a.numero - b.numero).map((p) => carteProgramme(course, p, urlProgramme)))
        : el("p", { class: "texte-secondaire vide-programmes", text: "Aucun programme pour l'instant : utilisez la suggestion ci-dessus ou « Construire un programme »." })));

  remplirSuggestion(course, zoneSuggestion, urlProgramme);
  return detail;
}

function tuile(titre, valeur, ton = null) {
  return el("div", { class: `tuile${ton ? ` tuile--${ton}` : ""}` }, el("span", { text: titre }), el("strong", { text: valeur }));
}

async function remplirSuggestion(course, zone, urlProgramme) {
  const r = resumeCourse(course);
  if (r.restantes <= 0) {
    vider(zone, message("Toutes les enquêtes à faire sont programmées. Vous pouvez télécharger la course complète.", "succes"));
    return;
  }
  vider(zone, etatAttente("Recherche du programme suivant…"));
  let liste;
  try {
    const fichiers = await chargerLignes(course.lignes.map((l) => l.ligne));
    liste = suggestions(course, fichiers, 3);
  } catch (erreur) {
    vider(zone, message(`Suggestion impossible : ${erreur.message}`, "alerte"));
    return;
  }
  if (!liste.length) {
    zone.remove();
    return;
  }
  const [premiere, ...autres] = liste;
  const numero = prochainNumero(course);
  const lienSuggestion = (s, variante) => lien("Construire ce programme",
    urlProgramme({ suggestion: s.segments.map((x) => `${x.ligne}:${x.enquetes}`).join(",") }), { variante, nomIcone: "fleche" });
  vider(zone,
    el("div", { class: "suggestion__entete" },
      el("div", {},
        el("p", { class: "suggestion__surtitre" }, icone("etoile", 16), el("span", { text: `Programme ${numero} suggéré` })),
        el("p", { class: "texte-secondaire", text: explication(premiere, course) })),
      lienSuggestion(premiere, "primaire")),
    parcours(premiere, course),
    autres.length ? el("div", { class: "suggestion__autres" },
      el("p", { class: "etiquette-champ", text: "Autres possibilités" }),
      autres.map((s) => el("div", { class: "suggestion__autre" }, parcours(s, course, true), lienSuggestion(s, "discret")))) : null);
}

function explication(s, course) {
  const noms = s.segments.map((x) => `la ${libelle(x.ligne)}`);
  if (s.type === "paire") return `Les restes de ${noms[0]} et de ${noms[1]} se combinent par un pivot à 150 mètres ou moins.`;
  if (s.type === "complement") return `Un reste est complété avec des enquêtes de l'autre ligne, reliée par un pivot à 150 mètres ou moins.`;
  if (s.type === "complet") return `${noms[0][0].toUpperCase()}${noms[0].slice(1)} a encore assez d'enquêtes pour un programme plein de ${course.enquetesParProgramme}.`;
  return `Aucune autre ligne de la course n'a de pivot à 150 mètres ou moins avec ${noms[0]} : ce programme reste plus court.`;
}

function parcours(s, course, compact = false) {
  const morceaux = [];
  s.segments.forEach((x, i) => {
    if (i > 0 && s.pivot) {
      morceaux.push(el("span", { class: "parcours__pivot" }, icone("pivot", 16),
        el("span", { text: `Pivot ${s.pivot.arretA}${s.pivot.arretB !== s.pivot.arretA ? ` / ${s.pivot.arretB}` : ""}, ${texteDistance(s.pivot.distance)}` })));
    }
    morceaux.push(el("span", { class: "parcours__segment" }, pastille(ligneDe(x.ligne)), el("strong", { text: texteEnquetes(x.enquetes) })));
  });
  return el("div", { class: `parcours${compact ? " parcours--compact" : ""}` }, morceaux,
    el("span", { class: "parcours__total", text: `Total : ${s.total} sur ${course.enquetesParProgramme}` }));
}

function carteProgramme(course, programme, urlProgramme) {
  const premier = programme.segments[0];
  const dernier = programme.segments[programme.segments.length - 1];
  const duree = premier && dernier ? versMinutes(dernier.fin) - versMinutes(premier.debut) : 0;
  const elements = [];
  programme.segments.forEach((s, i) => {
    if (i > 0) {
      const precedent = programme.segments[i - 1];
      elements.push(el("li", { class: "segment-resume__pivot" }, icone("pivot", 16),
        el("span", { text: precedent.arretFin === s.arretDepart
          ? `Pivot ${s.arretDepart}`
          : `Pivot ${precedent.arretFin} (${libelle(precedent.ligne)}) vers ${s.arretDepart} (${libelle(s.ligne)})` })));
    }
    elements.push(el("li", { class: "segment-resume" },
      pastille(ligneDe(s.ligne)),
      el("div", {},
        el("strong", { text: `${s.arretDepart} → ${s.arretFin}` }),
        el("span", { class: "texte-secondaire petit", text: [s.sens, `${s.debut} à ${s.fin}`].filter(Boolean).join(", ") }),
        el("span", { class: "quotas-resume", text: s.quotas.map((q) => `${q.debut} à ${q.fin} : ${q.enquetes}`).join(" ; ") })),
      el("strong", { class: "segment-resume__nombre", text: texteEnquetes(enquetesSegment(s)) })));
  });
  return el("article", { class: "carte-programme" },
    el("header", {},
      el("h4", { text: `Programme ${programme.numero}` }),
      premier ? el("span", { class: "texte-secondaire", text: `${premier.debut} à ${dernier.fin}, ${texteDuree(duree)}` }) : null,
      el("strong", { class: "carte-programme__total", text: texteEnquetes(totalProgramme(programme)) }),
      el("div", { class: "rangee rangee--serree" },
        lien("Modifier", urlProgramme({ programme: programme.id }), { variante: "discret", nomIcone: "modifier" }),
        bouton("Supprimer", { variante: "danger", nomIcone: "supprimer", petit: true, onclick: () => supprimerProgramme(course, programme) }))),
    el("ol", { class: "segments-resume" }, elements));
}

// ---------- Actions ----------

async function supprimer(course) {
  const ok = await confirmerAction("Supprimer la course",
    `Supprimer la course « ${course.nom} » et ${pluriel(course.programmes.length, "son programme", "ses programmes")} ? Cette action est définitive. Pensez à exporter les courses avant si besoin.`,
    "Supprimer la course");
  if (!ok) return;
  supprimerCourse(course.id);
  notifier(`La course « ${course.nom} » a été supprimée.`);
  history.replaceState(null, "", location.pathname);
  rendre();
}

async function supprimerProgramme(course, programme) {
  const ok = await confirmerAction("Supprimer le programme",
    `Supprimer le programme ${programme.numero} (${texteEnquetes(totalProgramme(programme))}) ? Ses enquêtes redeviennent à programmer.`,
    "Supprimer le programme");
  if (!ok) return;
  course.programmes = course.programmes.filter((p) => p.id !== programme.id);
  enregistrerCourse(course);
  notifier(`Le programme ${programme.numero} a été supprimé.`);
  rendre();
}

function exporter() {
  const courses = lireCourses();
  if (!courses.length) return;
  const jour = new Date().toISOString().slice(0, 10);
  telecharger(`courses-${jour}.json`, exporterCourses(courses));
  notifier(`${pluriel(courses.length, "course exportée", "courses exportées")}. Ouvrez ce fichier avec « Importer » sur un autre poste.`);
}

async function importer() {
  const fichier = await choisirFichier(".json,application/json");
  if (!fichier) return;
  try {
    const { ajoutees, remplacees } = importerCourses(await fichier.text());
    const parties = [];
    if (ajoutees) parties.push(pluriel(ajoutees, "course ajoutée", "courses ajoutées"));
    if (remplacees) parties.push(pluriel(remplacees, "course remplacée", "courses remplacées"));
    notifier(`Import terminé : ${parties.join(", ")}.`);
    rendre();
  } catch (erreur) {
    notifier(erreur.message, "alerte");
  }
}

// ---------- Fenêtre « Créer une course » ----------

const ENQUETES_MINIMUM = 50;
const ENQUETES_MAXIMUM = 150;
const DUREES = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

function ouvrirFenetreCourse(course) {
  const modification = Boolean(course);
  const brouillon = course ? structuredClone(course) : {
    id: nouvelIdentifiant(), nom: "", enquetesParProgramme: 120, dureeProgrammeHeures: 7, lignes: [], programmes: [],
    creeeLe: new Date().toISOString(),
  };
  const programmeesParLigne = new Map(etatLignes(brouillon).map((l) => [l.ligne, l.programmees]));
  const lignesBus = index.lignes.filter((l) => l.fichier);
  const rangees = brouillon.lignes.map((l) => ({ ligne: index.parId.get(l.ligne) || null, commandees: l.commandees }));
  if (!rangees.length) rangees.push({ ligne: null, commandees: "" });

  const { corps, pied, fermer } = ouvrirFenetre(modification ? "Modifier la course" : "Créer une course", { large: true });
  const zoneErreurs = el("div");
  const champNom = el("input", { class: "champ", id: "course-nom", value: brouillon.nom, placeholder: "Par exemple : Hauts-de-Seine sud" });
  const champEpp = el("input", { class: "champ champ--nombre", id: "course-epp", type: "number", min: String(ENQUETES_MINIMUM), max: String(ENQUETES_MAXIMUM), step: "1", value: String(brouillon.enquetesParProgramme) });
  const champDuree = el("select", { class: "champ", id: "course-duree" },
    [...new Set([...DUREES, brouillon.dureeProgrammeHeures])].sort((x, y) => x - y)
      .map((d) => el("option", { value: String(d), selected: d === brouillon.dureeProgrammeHeures, text: texteDuree(Math.round(d * 60)) })));
  const zoneLignes = el("div", { class: "lignes-course" });
  const zoneResume = el("div", { class: "resume-course" });

  corps.append(zoneErreurs,
    el("div", { class: "formulaire" },
      el("div", { class: "champ-groupe champ-groupe--large" }, el("label", { class: "etiquette-champ", for: "course-nom", text: "Nom de la course" }), champNom),
      el("div", { class: "champ-groupe" }, el("label", { class: "etiquette-champ", for: "course-epp", text: `Enquêtes par programme (${ENQUETES_MINIMUM} à ${ENQUETES_MAXIMUM})` }), champEpp),
      el("div", { class: "champ-groupe" }, el("label", { class: "etiquette-champ", for: "course-duree", text: "Durée d'un programme (5 à 9 heures)" }), champDuree)),
    el("h3", { class: "sous-titre-fenetre", text: "Lignes et enquêtes à faire" }),
    zoneLignes,
    bouton("Ajouter une ligne", { variante: "discret", nomIcone: "ajouter", onclick: () => { rangees.push({ ligne: null, commandees: "" }); rendreLignes(true); } }),
    zoneResume);

  const epp = () => Number(champEpp.value) || 0;

  function rendreLignes(focusDerniere = false) {
    vider(zoneLignes,
      el("div", { class: "lignes-course__entete" }, el("span", { text: "Ligne" }), el("span", { text: "Enquêtes à faire" }), el("span", { text: "Programmes" }), el("span")),
      rangees.map((rangee, i) => {
        const info = el("span", { class: "lignes-course__info" });
        const description = el("span", { class: "texte-secondaire petit", text: rangee.ligne ? descriptionLigne(rangee.ligne) : "" });
        const programmees = rangee.ligne ? programmeesParLigne.get(rangee.ligne.id) || 0 : 0;
        const choix = creerChoixLigne({
          lignes: lignesBus,
          valeur: rangee.ligne,
          placeholder: "Rechercher une ligne",
          onChoix: (l) => { rangee.ligne = l; description.textContent = descriptionLigne(l); majInfo(); },
        });
        const champ = el("input", {
          class: "champ champ--nombre", type: "number", min: String(Math.max(1, programmees)), step: "1", value: String(rangee.commandees ?? ""),
          "aria-label": "Enquêtes à faire",
          oninput: (e) => { rangee.commandees = e.target.value === "" ? "" : Number(e.target.value); majInfo(); },
        });
        function majInfo() {
          const n = Number(rangee.commandees) || 0;
          const { pleins, reste } = decoupage(n, epp());
          info.textContent = n ? [pleins ? pluriel(pleins, "plein", "pleins") : null, reste ? `reste ${reste}` : null].filter(Boolean).join(", ") : "";
          rendreResume();
        }
        majInfo();
        if (focusDerniere && i === rangees.length - 1) setTimeout(() => choix.champ.focus(), 0);
        return el("div", { class: "lignes-course__rangee" },
          el("div", {}, choix.element, description,
            programmees ? el("span", { class: "texte-secondaire petit", text: ` ${pluriel(programmees, "enquête déjà programmée", "enquêtes déjà programmées")}` }) : null),
          champ, info,
          el("button", {
            class: "bouton-icone", type: "button", title: programmees ? "Cette ligne a des programmes : supprimez-les d'abord" : "Retirer cette ligne",
            "aria-label": "Retirer cette ligne", disabled: Boolean(programmees),
            onclick: () => { rangees.splice(i, 1); if (!rangees.length) rangees.push({ ligne: null, commandees: "" }); rendreLignes(); },
          }, icone("supprimer", 18)));
      }));
    rendreResume();
  }

  function rendreResume() {
    const valides = rangees.filter((r) => r.ligne && Number(r.commandees) > 0);
    const total = valides.reduce((a, r) => a + Number(r.commandees), 0);
    const restes = valides.map((r) => ({ ligne: r.ligne, reste: decoupage(Number(r.commandees), epp()).reste })).filter((r) => r.reste > 0);
    vider(zoneResume,
      el("div", { class: "tuiles tuiles--compactes" },
        tuile("Enquêtes à faire", total),
        tuile("Programmes nécessaires", programmesNecessaires(total, epp()))),
      el("div", { class: "resume-course__restes" },
        el("span", { class: "etiquette-champ", text: "Restes à combiner" }),
        restes.length
          ? el("div", { class: "rangee rangee--serree" }, restes.map((r) => el("span", { class: "reste" }, pastille(r.ligne), el("span", { text: texteEnquetes(r.reste) }))))
          : el("span", { class: "texte-discret", text: "Aucun : chaque ligne remplit des programmes entiers." })));
  }

  function valider() {
    const erreurs = [];
    const nom = champNom.value.trim();
    if (!nom) erreurs.push("Donnez un nom à la course.");
    const n = Number(champEpp.value);
    if (!Number.isInteger(n) || n < ENQUETES_MINIMUM || n > ENQUETES_MAXIMUM) erreurs.push(`Le nombre d'enquêtes par programme doit être entre ${ENQUETES_MINIMUM} et ${ENQUETES_MAXIMUM}.`);
    const remplies = rangees.filter((r) => r.ligne || r.commandees !== "");
    if (!remplies.length) erreurs.push("Ajoutez au moins une ligne.");
    const vues = new Set();
    for (const r of remplies) {
      if (!r.ligne) { erreurs.push("Choisissez la ligne de chaque rangée, ou retirez la rangée vide."); continue; }
      if (vues.has(r.ligne.id)) erreurs.push(`La ligne ${r.ligne.libelle} est présente deux fois.`);
      vues.add(r.ligne.id);
      const c = Number(r.commandees);
      if (!Number.isInteger(c) || c <= 0) erreurs.push(`Ligne ${r.ligne.libelle} : indiquez le nombre d'enquêtes à faire.`);
      const deja = programmeesParLigne.get(r.ligne.id) || 0;
      if (c < deja) erreurs.push(`Ligne ${r.ligne.libelle} : ${deja} enquêtes sont déjà programmées, le nombre d'enquêtes à faire ne peut pas être plus petit.`);
    }
    for (const [id, deja] of programmeesParLigne) {
      if (deja && !vues.has(id)) erreurs.push(`La ligne ${libelle(id)} a des programmes : elle ne peut pas être retirée.`);
    }
    return { erreurs, nom, remplies };
  }

  champEpp.addEventListener("input", () => rendreLignes());
  pied.append(
    bouton("Annuler", { onclick: () => fermer() }),
    bouton(modification ? "Enregistrer" : "Créer la course", {
      variante: "primaire",
      onclick: () => {
        const { erreurs, nom, remplies } = valider();
        if (erreurs.length) {
          vider(zoneErreurs, message(el("ul", { class: "liste-erreurs" }, erreurs.map((e) => el("li", { text: e }))), "erreur"));
          corps.scrollTop = 0;
          return;
        }
        brouillon.nom = nom;
        brouillon.enquetesParProgramme = Number(champEpp.value);
        brouillon.dureeProgrammeHeures = Number(champDuree.value);
        brouillon.lignes = remplies.map((r) => ({ ligne: r.ligne.id, commandees: Number(r.commandees) }));
        enregistrerCourse(brouillon);
        fermer();
        notifier(modification ? `La course « ${nom} » a été enregistrée.` : `La course « ${nom} » a été créée.`);
        if (lireHash().course === brouillon.id) rendre();
        else location.hash = hash({ course: brouillon.id });
      },
    }));
  rendreLignes();
  setTimeout(() => champNom.focus(), 0);
}

demarrer();
