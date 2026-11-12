// Éléments d'interface partagés par les écrans.

import { pluriel } from "./calculs.js";
import { rechercherLignes } from "./donnees.js";

const SVG = "http://www.w3.org/2000/svg";

/** Crée un élément : el("p", { class: "x", text: "…", onclick: f }, enfants…) */
export function el(balise, proprietes = {}, ...enfants) {
  const e = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(proprietes || {})) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle === "class") e.className = valeur;
    else if (cle === "text") e.textContent = valeur;
    else if (cle === "dataset") Object.assign(e.dataset, valeur);
    else if (cle.startsWith("on") && typeof valeur === "function") e.addEventListener(cle.slice(2).toLowerCase(), valeur);
    else if (["value", "checked", "disabled", "hidden", "selected", "open"].includes(cle)) e[cle] = valeur;
    else e.setAttribute(cle, valeur === true ? "" : valeur);
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    e.append(enfant instanceof Node ? enfant : String(enfant));
  }
  return e;
}

export function vider(element, ...enfants) {
  element.replaceChildren(...enfants.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  return element;
}

/** Icône du jeu d'icônes de la page (symboles « icone-<nom> » dans base.html). */
export function icone(nom, taille = 18) {
  const svg = document.createElementNS(SVG, "svg");
  for (const [k, v] of Object.entries({
    class: "icone", width: taille, height: taille, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true",
  })) svg.setAttribute(k, v);
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", `#icone-${nom}`);
  svg.append(use);
  return svg;
}

export function pastille(ligne, titre = null) {
  if (!ligne) return el("span", { class: "pastille pastille--bus", text: "?" });
  return el("span", {
    class: `pastille ${ligne.famille === "bus" ? "pastille--bus" : "pastille--ferree"}`,
    title: titre ?? (ligne.nom && ligne.nom !== ligne.libelle ? `${ligne.nom}, ${ligne.operateur}` : ligne.operateur),
    text: ligne.libelle,
  });
}

export function etiquette(texte, ton = "neutre") {
  return el("span", { class: `etiquette etiquette--${ton}`, text: texte });
}

export function message(texte, ton = "information") {
  const nomIcone = { succes: "succes", alerte: "alerte", erreur: "alerte", information: "information" }[ton];
  const contenu = typeof texte === "string" ? el("p", { text: texte }) : el("div", {}, texte);
  return el("div", { class: `message message--${ton}`, role: ton === "alerte" || ton === "erreur" ? "alert" : "status" },
    icone(nomIcone, 20), contenu);
}

export function bouton(texte, { variante = "secondaire", nomIcone = null, onclick = null, type = "button", desactive = false, titre = null, petit = false } = {}) {
  return el("button", {
    class: `bouton bouton--${variante}${petit ? " bouton--petit" : ""}`, type, disabled: desactive, title: titre, onclick,
  }, nomIcone ? icone(nomIcone, petit ? 16 : 18) : null, el("span", { text: texte }));
}

export function lien(texte, href, { variante = "secondaire", nomIcone = null } = {}) {
  return el("a", { class: `bouton bouton--${variante}`, href }, nomIcone ? icone(nomIcone, 18) : null, el("span", { text: texte }));
}

export function texteDistance(metres) {
  return pluriel(metres, "mètre", "mètres");
}

export function texteEnquetes(n) {
  return pluriel(n, "enquête", "enquêtes");
}

export function nombre(n) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

/** « ATM Croix du Sud, Bourg-la-Reine, Châtillon et 4 autres communes » */
export function descriptionLigne(ligne, communesMax = 3) {
  const communes = ligne.communes || [];
  let texteCommunes = communes.slice(0, communesMax).join(", ");
  if (communes.length > communesMax) {
    const autres = communes.length - communesMax;
    texteCommunes += ` et ${pluriel(autres, "autre commune", "autres communes")}`;
  }
  return [ligne.operateur, texteCommunes].filter(Boolean).join(", ");
}

export function titreLigne(ligne) {
  return ligne.nom && ligne.nom !== ligne.libelle ? ligne.nom : `Ligne ${ligne.libelle}`;
}

export function etiquettesLigne(ligne) {
  return [
    ligne.demande ? etiquette("Transport à la demande", "alerte") : null,
    ligne.remplacement ? etiquette("Bus de remplacement", "alerte") : null,
  ];
}

// ---------- Adresses ----------

export function urls() {
  const d = document.body.dataset;
  return { donnees: d.urlDonnees, lignes: d.urlLignes, courses: d.urlCourses, programme: d.urlProgramme };
}

export function lireHash() {
  return Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
}

export function hash(parametres) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parametres)) if (v !== null && v !== undefined && v !== "") p.set(k, v);
  const texte = p.toString();
  return texte ? `#${texte}` : "";
}

export function remplacerHash(parametres) {
  history.replaceState(null, "", `${location.pathname}${location.search}${hash(parametres)}`);
}

// ---------- Fichiers ----------

export function telecharger(nomFichier, contenu, type = "application/json") {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: nomFichier, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function choisirFichier(accept) {
  return new Promise((resolve) => {
    const champ = el("input", { type: "file", accept, hidden: true });
    champ.addEventListener("change", () => {
      resolve(champ.files[0] || null);
      champ.remove();
    });
    document.body.append(champ);
    champ.click();
  });
}

// ---------- Notifications et fenêtres ----------

export function notifier(texte, ton = "succes") {
  let zone = document.querySelector(".notifications");
  if (!zone) {
    zone = el("div", { class: "notifications", "aria-live": "polite" });
    document.body.append(zone);
  }
  const note = message(texte, ton);
  note.classList.add("notification");
  zone.append(note);
  setTimeout(() => note.remove(), 5000);
}

/** Fenêtre modale. Renvoie { fenetre, corps, pied, fermer }. */
export function ouvrirFenetre(titre, { large = false, onFermer = null } = {}) {
  const corps = el("div", { class: "fenetre__corps" });
  const pied = el("div", { class: "fenetre__pied" });
  const fenetre = el("dialog", { class: `fenetre${large ? " fenetre--large" : ""}`, "aria-label": titre },
    el("div", { class: "fenetre__entete" },
      el("h2", { text: titre }),
      el("button", { class: "fenetre__fermer", type: "button", "aria-label": "Fermer", onclick: () => fermer() }, icone("fermer", 20))),
    corps, pied);
  document.body.append(fenetre);
  const fermer = () => {
    fenetre.close();
  };
  fenetre.addEventListener("close", () => {
    fenetre.remove();
    if (onFermer) onFermer();
  });
  fenetre.showModal();
  return { fenetre, corps, pied, fermer };
}

export function etatAttente(texte = "Chargement des données…") {
  return el("div", { class: "etat-attente" }, el("span", { class: "roue", "aria-hidden": "true" }), el("span", { text: texte }));
}

export function etatVide(titre, texte, ...actions) {
  return el("div", { class: "etat-vide" }, el("h2", { text: titre }), texte ? el("p", { text: texte }) : null,
    actions.length ? el("div", { class: "etat-vide__actions" }, actions) : null);
}

// ---------- Choix d'une ligne (liste déroulante avec recherche) ----------

let compteurChoix = 0;

export function creerChoixLigne({ lignes, onChoix, valeur = null, filtre = () => true, placeholder = "Numéro, nom, commune ou exploitant", id = null }) {
  compteurChoix += 1;
  const idListe = `choix-ligne-${compteurChoix}`;
  const champ = el("input", {
    class: "champ choix-ligne__champ", type: "search", placeholder, autocomplete: "off", spellcheck: "false", id,
    role: "combobox", "aria-expanded": "false", "aria-autocomplete": "list", "aria-controls": idListe,
  });
  const liste = el("ul", { class: "choix-ligne__liste", id: idListe, role: "listbox", hidden: true });
  const racine = el("div", { class: "choix-ligne" }, icone("recherche", 18), champ, liste);
  let resultats = [];
  let actif = -1;
  let choisie = valeur;

  const texteChoisie = () => (choisie ? `${choisie.libelle}${choisie.nom !== choisie.libelle ? `  ${choisie.nom}` : ""}` : "");
  const afficherChoisie = () => { champ.value = texteChoisie(); };

  function fermer() {
    liste.hidden = true;
    champ.setAttribute("aria-expanded", "false");
    actif = -1;
  }

  function surligner(i) {
    actif = i;
    [...liste.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    liste.children[i]?.scrollIntoView({ block: "nearest" });
  }

  function rendre() {
    const texte = champ.value;
    if (!texte.trim() || texte === texteChoisie()) {
      fermer();
      return;
    }
    const { resultats: r, total } = rechercherLignes(lignes.filter(filtre), texte, 50);
    resultats = r;
    vider(liste,
      r.map((ligne, i) => el("li", {
        role: "option", class: "choix-ligne__option", "aria-selected": "false",
        onmousedown: (e) => { e.preventDefault(); choisir(ligne); },
        onmousemove: () => { if (actif !== i) surligner(i); },
      },
      pastille(ligne),
      el("span", { class: "choix-ligne__texte" },
        el("strong", { text: titreLigne(ligne) }),
        el("span", { text: descriptionLigne(ligne) })),
      el("span", { class: "choix-ligne__etiquettes" }, etiquettesLigne(ligne)))),
      !r.length ? el("li", { class: "choix-ligne__info", text: "Aucune ligne ne correspond à cette recherche." }) : null,
      total > r.length ? el("li", { class: "choix-ligne__info", text: `${total} lignes correspondent : précisez la recherche pour voir les autres.` }) : null);
    liste.hidden = false;
    champ.setAttribute("aria-expanded", "true");
    if (r.length) surligner(0);
  }

  function choisir(ligne) {
    choisie = ligne;
    afficherChoisie();
    fermer();
    onChoix?.(ligne);
  }

  champ.addEventListener("input", rendre);
  champ.addEventListener("focus", () => champ.select());
  champ.addEventListener("blur", () => { fermer(); afficherChoisie(); });
  champ.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && !liste.hidden) { e.preventDefault(); surligner(Math.min(actif + 1, resultats.length - 1)); }
    else if (e.key === "ArrowUp" && !liste.hidden) { e.preventDefault(); surligner(Math.max(actif - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (!liste.hidden && resultats[actif]) choisir(resultats[actif]);
    } else if (e.key === "Escape") { fermer(); afficherChoisie(); }
  });
  afficherChoisie();

  return {
    element: racine,
    champ,
    definir(ligne) { choisie = ligne; afficherChoisie(); },
    valeur: () => choisie,
  };
}

/** Demande une confirmation dans une fenêtre. Renvoie une promesse : true si l'action est confirmée. */
export function confirmerAction(titre, texte, libelleBouton, variante = "danger") {
  return new Promise((resolve) => {
    let reponse = false;
    const { corps, pied, fermer } = ouvrirFenetre(titre, { onFermer: () => resolve(reponse) });
    corps.append(el("p", { text: texte }));
    pied.append(
      bouton("Annuler", { onclick: () => fermer() }),
      bouton(libelleBouton, { variante, onclick: () => { reponse = true; fermer(); } }));
  });
}

// ---------- Notification après changement de page ----------

const CLE_NOTIFICATION = "programmes-enqueteurs/notification";

export function notifierApresChargement(texte, ton = "succes") {
  try {
    sessionStorage.setItem(CLE_NOTIFICATION, JSON.stringify({ texte, ton }));
  } catch {
    /* stockage indisponible : pas de message */
  }
}

function afficherNotificationEnAttente() {
  try {
    const brut = sessionStorage.getItem(CLE_NOTIFICATION);
    if (!brut) return;
    sessionStorage.removeItem(CLE_NOTIFICATION);
    const { texte, ton } = JSON.parse(brut);
    notifier(texte, ton);
  } catch {
    /* rien à afficher */
  }
}

afficherNotificationEnAttente();

// ---------- Dates et sources des données ----------

/** « 2026-12-01 » -> « mardi 1 décembre 2026 » */
export function dateTexte(iso, avecJour = true) {
  if (!iso) return "";
  const [a, m, j] = iso.split("-").map(Number);
  const options = { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
  if (avecJour) options.weekday = "long";
  return new Intl.DateTimeFormat("fr-FR", options).format(new Date(Date.UTC(a, m - 1, j)));
}

/** Complète la mention de la barre latérale avec les dates des données (index de lignes.json). */
export function afficherSources(index) {
  const zone = document.getElementById("mention-donnees");
  if (!zone || !index) return;
  const h = index.horaires;
  zone.textContent = h?.periode
    ? `Données : Île-de-France Mobilités. Lignes et arrêts sous licence ODbL ; horaires (GTFS) du ${dateTexte(h.periode.du, false)} au ${dateTexte(h.periode.au, false)}, sous Licence Mobilités. Générées le ${dateTexte(index.genereLe, false)}.`
    : `Données : Île-de-France Mobilités, lignes et arrêts sous licence ODbL. Générées le ${dateTexte(index.genereLe, false)}.`;
}
