// Écran 1 : lignes et correspondances.

import { accesFerre, arretsDuSens, FAMILLES_FERREES, RAYON_PIVOT } from "./calculs.js";
import { chargerIndex, chargerLigne, cleNaturelle } from "./donnees.js";
import {
  bouton, creerChoixLigne, descriptionLigne, el, etatAttente, etatVide, etiquette, etiquettesLigne, hash, icone,
  lireHash, message, notifier, pastille, remplacerHash, texteDistance, titreLigne, urls, vider,
} from "./interface.js";
import { lireCourses, lirePivotRetenu, retenirPivot } from "./stockage.js";

const contenu = document.getElementById("contenu-ligne");
const caseSpeciales = document.getElementById("inclure-speciales");
const BUS_AFFICHES = 8;

let index = null;
let choix = null;
let fichier = null;
let etat = lireEtat();

function lireEtat() {
  const h = lireHash();
  const rayon = Number(h.rayon);
  return {
    ligne: h.ligne || "",
    sens: h.sens || "",
    arret: h.arret || "",
    rayon: rayon >= 50 && rayon <= 300 ? rayon : RAYON_PIVOT,
    tout: h.tout === "1",
  };
}

function parametres() {
  return {
    ligne: etat.ligne, sens: etat.sens, arret: etat.arret,
    rayon: etat.rayon === RAYON_PIVOT ? "" : etat.rayon, tout: etat.tout ? "1" : "",
  };
}

const estSpeciale = (ligne) => ligne && (ligne.demande || ligne.remplacement);
const visible = (ligne) => ligne && (etat.tout || !estSpeciale(ligne));

async function demarrer() {
  vider(contenu, etatAttente());
  try {
    index = await chargerIndex();
  } catch (erreur) {
    vider(contenu, message(`Impossible de charger la liste des lignes : ${erreur.message}`, "alerte"));
    return;
  }
  caseSpeciales.checked = etat.tout;
  caseSpeciales.addEventListener("change", () => {
    etat.tout = caseSpeciales.checked;
    remplacerHash(parametres());
    rendreLigne();
  });
  choix = creerChoixLigne({
    lignes: index.lignes.filter((l) => l.fichier),
    filtre: (l) => etat.tout || !estSpeciale(l),
    id: "recherche-ligne",
    onChoix: (ligne) => ouvrirLigne(ligne.id),
  });
  document.getElementById("emplacement-choix").append(choix.element);
  window.addEventListener("hashchange", () => {
    const nouvel = lireEtat();
    const changeLigne = nouvel.ligne !== etat.ligne;
    etat = nouvel;
    caseSpeciales.checked = etat.tout;
    if (changeLigne) chargerEtRendre();
    else rendreLigne();
  });
  chargerEtRendre();
}

function ouvrirLigne(id, arret = "") {
  location.hash = hash({ ...parametres(), ligne: id, sens: "", arret });
}

async function chargerEtRendre() {
  fichier = null;
  const ligne = index.parId.get(etat.ligne);
  if (!ligne || !ligne.fichier) {
    choix.definir(null);
    rendreAccueil(etat.ligne && !ligne ? "Cette ligne n'existe pas dans les données." : null);
    return;
  }
  choix.definir(ligne);
  vider(contenu, etatAttente(`Chargement de la ligne ${ligne.libelle}…`));
  try {
    fichier = await chargerLigne(ligne.id);
  } catch (erreur) {
    vider(contenu, message(`Impossible de charger la ligne ${ligne.libelle} : ${erreur.message}`, "alerte"));
    return;
  }
  if (fichier.id !== etat.ligne) return;
  rendreLigne();
}

function rendreAccueil(avertissement) {
  const dejaVues = new Set();
  const lignesCourses = [];
  for (const course of lireCourses()) {
    for (const { ligne } of course.lignes) {
      const l = index.parId.get(ligne);
      if (l && !dejaVues.has(l.id)) {
        dejaVues.add(l.id);
        lignesCourses.push(l);
      }
    }
  }
  const exemple = index.parId.get("C01319");
  const raccourcis = lignesCourses.length ? lignesCourses : [exemple].filter(Boolean);
  vider(contenu,
    avertissement ? message(avertissement, "alerte") : null,
    el("section", { class: "carte accueil-lignes" },
      el("h2", { text: "Choisissez une ligne" }),
      el("p", { text: `Tapez un numéro de ligne, un nom, une commune ou un exploitant dans le champ ci-dessus. ${index.lignes.filter((l) => l.fichier).length} lignes de bus sont disponibles.` }),
      el("p", { class: "accueil-lignes__titre", text: lignesCourses.length ? "Lignes de vos courses" : "Par exemple" }),
      el("div", { class: "rangee" }, raccourcis.map((l) => el("button", {
        class: "raccourci-ligne", type: "button", onclick: () => ouvrirLigne(l.id),
      }, pastille(l), el("span", { text: titreLigne(l) }))))));
  setTimeout(() => choix.champ.focus(), 0);
}

// ---------- Ligne ----------

function correspondancesDe(arret, rayon) {
  const lourdes = [];
  const bus = [];
  for (const [id, nom, distance] of arret.correspondances) {
    if (distance > rayon) continue;
    const ligne = index.parId.get(id);
    if (!visible(ligne)) continue;
    (FAMILLES_FERREES.has(ligne.famille) ? lourdes : bus).push({ ligne, nom, distance });
  }
  const tri = (a, b) => cleNaturelle(a.ligne.libelle, b.ligne.libelle);
  return { lourdes: lourdes.sort(tri), bus: bus.sort(tri) };
}

function rendreLigne() {
  if (!fichier) return;
  const ligne = index.parId.get(fichier.id);
  const sensValide = fichier.ordre?.sens.some((s) => s.nom === etat.sens) ? etat.sens : "";
  const arrets = arretsDuSens(fichier, sensValide);
  let arretChoisi = arrets.find((a) => a.nom === etat.arret) || fichier.arrets.find((a) => a.nom === etat.arret) || arrets[0];
  if (!arrets.includes(arretChoisi)) arretChoisi = arrets[0];
  etat.sens = sensValide;
  etat.arret = arretChoisi?.nom || "";
  remplacerHash(parametres());

  const entete = el("section", { class: "carte entete-ligne" },
    el("div", { class: "entete-ligne__titre" },
      pastille(ligne),
      el("div", {},
        el("h2", { text: titreLigne(ligne) }),
        el("p", { class: "texte-secondaire", text: descriptionLigne(ligne, 6) })),
      el("div", { class: "entete-ligne__etiquettes" },
        etiquettesLigne(ligne),
        etiquette(`${fichier.arrets.length} arrêts`, "neutre"),
        fichier.ordre ? etiquette("Ordre de la fiche horaire", "succes") : etiquette("Ordre non disponible", "alerte"))),
    el("div", { class: "entete-ligne__reglages" },
      fichier.ordre ? el("div", { class: "reglage" },
        el("span", { class: "etiquette-champ", text: "Sens" }),
        el("div", { class: "onglets", role: "group", "aria-label": "Sens" },
          [{ nom: "", texte: "Tous les arrêts" }, ...fichier.ordre.sens.map((s) => ({ nom: s.nom, texte: s.nom }))].map((s) => el("button", {
            type: "button", class: "onglet", "aria-pressed": String(s.nom === etat.sens),
            onclick: () => { etat.sens = s.nom; rendreLigne(); },
          }, s.texte)))) : null,
      el("div", { class: "reglage reglage--rayon" },
        el("label", { class: "etiquette-champ", for: "rayon", text: "Rayon de correspondance" }),
        el("div", { class: "curseur" },
          el("input", {
            type: "range", id: "rayon", min: "50", max: "300", step: "10", value: String(etat.rayon),
            oninput: (e) => {
              etat.rayon = Number(e.target.value);
              e.target.nextElementSibling.textContent = texteDistance(etat.rayon);
              rendreListe(ligne, arrets, arretChoisi);
              rendreDetail(arretChoisi);
            },
            onchange: () => remplacerHash(parametres()),
          }),
          el("output", { for: "rayon", text: texteDistance(etat.rayon) })))));

  vider(contenu,
    entete,
    el("div", { class: "grille-ligne" },
      el("section", { class: "carte liste-arrets", id: "liste-arrets", "aria-label": "Arrêts de la ligne" }),
      el("aside", { class: "carte detail-arret", id: "detail-arret", "aria-label": "Détail de l'arrêt" })));
  rendreListe(ligne, arrets, arretChoisi);
  rendreDetail(arretChoisi);
}

function rendreListe(ligne, arrets, arretChoisi) {
  const liste = document.getElementById("liste-arrets");
  const ordonne = Boolean(fichier.ordre);
  vider(liste,
    !ordonne ? message("Ordre des arrêts non disponible pour cette ligne : les arrêts sont classés par ordre alphabétique. L'ordre réel viendra avec les horaires (GTFS).", "information") : null,
    el("div", { class: "liste-arrets__entete" },
      el("span", { text: "Arrêt" }),
      el("span", { text: "Train, métro, tramway" }),
      el("span", { text: `Bus à ${texteDistance(etat.rayon)} ou moins` })),
    el("ol", { class: `trace${ordonne ? " trace--ordonne" : ""}` },
      arrets.map((arret, i) => {
        const { lourdes, bus } = correspondancesDe(arret, etat.rayon);
        const aucune = !lourdes.length && !bus.length;
        return el("li", {},
          el("button", {
            type: "button", class: "arret-ligne", "aria-pressed": String(arret === arretChoisi),
            onclick: () => {
              etat.arret = arret.nom;
              remplacerHash(parametres());
              liste.querySelectorAll(".arret-ligne").forEach((b) => b.setAttribute("aria-pressed", "false"));
              liste.querySelectorAll(".arret-ligne")[i].setAttribute("aria-pressed", "true");
              rendreDetail(arret);
            },
          },
          el("span", { class: "arret-ligne__repere", "aria-hidden": "true" }, ordonne ? String(i + 1) : ""),
          el("span", { class: "arret-ligne__nom" },
            el("strong", { text: arret.nom }),
            el("span", { text: [arret.communes.join(", "), arret.remarque].filter(Boolean).join(" · ") })),
          aucune
            ? el("span", { class: "arret-ligne__aucune texte-discret", text: "Aucune correspondance" })
            : [
              el("span", { class: "arret-ligne__pastilles" }, lourdes.map((c) => pastille(c.ligne, `${c.ligne.libelle} : ${c.nom}, ${texteDistance(c.distance)}`))),
              el("span", { class: "arret-ligne__pastilles" },
                bus.slice(0, BUS_AFFICHES).map((c) => pastille(c.ligne, `${c.ligne.libelle} : ${c.nom}, ${texteDistance(c.distance)}`)),
                bus.length > BUS_AFFICHES ? el("span", { class: "plus", text: `et ${bus.length - BUS_AFFICHES} autres` }) : null),
            ]));
      })));
}

function rendreDetail(arret) {
  const detail = document.getElementById("detail-arret");
  if (!arret) {
    vider(detail, el("p", { text: "Aucun arrêt." }));
    return;
  }
  const ligne = index.parId.get(fichier.id);
  const acces = accesFerre(arret, index.parId, 300);
  const toutes = arret.correspondances
    .map(([id, nom, distance]) => ({ ligne: index.parId.get(id), nom, distance }))
    .filter((c) => visible(c.ligne));
  const lourdes = toutes.filter((c) => FAMILLES_FERREES.has(c.ligne.famille));
  const bus = toutes.filter((c) => !FAMILLES_FERREES.has(c.ligne.famille));
  const pivot = lirePivotRetenu();
  const estRetenu = pivot && pivot.ligne === fichier.id && pivot.arret === arret.nom;

  const groupe = (titre, elements) => el("div", { class: "groupe-correspondances" },
    el("h4", { text: titre }),
    elements.length
      ? el("ul", {}, elements.map((c) => {
        const hors = c.distance > etat.rayon;
        const contenuLigne = [pastille(c.ligne), el("span", { class: "groupe-correspondances__nom", text: c.nom }),
          el("span", { class: "groupe-correspondances__distance", text: texteDistance(c.distance) })];
        return el("li", { class: hors ? "hors-rayon" : "" },
          c.ligne.fichier
            ? el("a", { href: hash({ ligne: c.ligne.id, arret: c.nom, rayon: etat.rayon === RAYON_PIVOT ? "" : etat.rayon, tout: etat.tout ? "1" : "" }), title: `Voir la ligne ${c.ligne.libelle} à l'arrêt ${c.nom}` }, contenuLigne)
            : el("div", {}, contenuLigne));
      }))
      : el("p", { class: "texte-discret", text: "Aucune correspondance" }));

  vider(detail,
    el("p", { class: "detail-arret__surtitre" }, icone("arret", 16), el("span", { text: `Arrêt de la ligne ${ligne.libelle}` })),
    el("h3", { text: arret.nom }),
    el("p", { class: "texte-secondaire", text: arret.communes.join(", ") }),
    arret.nomIdfm ? el("p", { class: "texte-discret petit", text: `Nom dans les données d'Île-de-France Mobilités : ${arret.nomIdfm}` }) : null,
    arret.remarque ? message(arret.remarque, "alerte") : null,
    acces
      ? el("div", { class: "acces" },
        el("span", { class: "etiquette-champ", text: "Gare, station ou tramway le plus proche" }),
        el("div", { class: "acces__ligne" }, pastille(acces.ligne), el("span", { text: acces.nom }), el("strong", { text: texteDistance(acces.distance) })))
      : message("Aucune gare de RER, station de métro ou arrêt de tramway à moins de 300 mètres.", "alerte"),
    el("p", { class: "detail-arret__note texte-secondaire", text: `Correspondances jusqu'à 300 mètres ; celles au-delà de ${texteDistance(etat.rayon)} sont grisées.` }),
    groupe("Train, métro, tramway", lourdes),
    groupe("Bus", bus),
    el("div", { class: "detail-arret__actions" },
      estRetenu
        ? message(el("span", {}, "Arrêt de pivot retenu. ", el("a", { href: urls().programme, text: "Construire un programme" })), "succes")
        : bouton("Utiliser comme arrêt de pivot", {
          variante: "primaire", nomIcone: "pivot",
          onclick: () => {
            retenirPivot({ ligne: fichier.id, libelle: ligne.libelle, arret: arret.nom });
            notifier(`« ${arret.nom} » (ligne ${ligne.libelle}) est retenu comme arrêt de pivot : il sera proposé en premier dans Construire un programme.`);
            rendreDetail(arret);
          },
        })));
}

demarrer();
