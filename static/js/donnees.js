// Chargement des données générées (static/donnees) et recherche de lignes.

let promesseIndex = null;
const promessesLignes = new Map();

/** Dossier des données, déduit de l'adresse de lignes.json donnée par le gabarit. */
function urlDonnees() {
  return document.body.dataset.urlDonnees.replace(/lignes\.json$/, "");
}

async function lireJson(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Données introuvables (${reponse.status}) : ${url}`);
  return reponse.json();
}

/** Index de toutes les lignes : { source, genereLe, lignes, parId } */
export function chargerIndex() {
  if (!promesseIndex) {
    promesseIndex = lireJson(`${urlDonnees()}lignes.json`).then((index) => {
      index.parId = new Map(index.lignes.map((l) => [l.id, l]));
      return index;
    });
    promesseIndex.catch(() => { promesseIndex = null; });
  }
  return promesseIndex;
}

/** Fichier d'une ligne de bus : arrêts, ordre, correspondances. */
export function chargerLigne(id) {
  if (!promessesLignes.has(id)) {
    const promesse = lireJson(`${urlDonnees()}lignes/${encodeURIComponent(id)}.json`);
    promesse.catch(() => promessesLignes.delete(id));
    promessesLignes.set(id, promesse);
  }
  return promessesLignes.get(id);
}

/** Map identifiant -> fichier, pour plusieurs lignes. */
export async function chargerLignes(ids) {
  const uniques = [...new Set(ids.filter(Boolean))];
  const fichiers = await Promise.all(uniques.map(chargerLigne));
  return new Map(uniques.map((id, i) => [id, fichiers[i]]));
}

// ---------- Recherche ----------

export function normaliser(texte) {
  return String(texte || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function cleNaturelle(a, b) {
  return String(a).localeCompare(String(b), "fr", { numeric: true, sensitivity: "base" });
}

const champsRecherche = new WeakMap();

function champs(ligne) {
  if (!champsRecherche.has(ligne)) {
    champsRecherche.set(ligne, {
      libelle: normaliser(ligne.libelle),
      nom: normaliser(ligne.nom),
      communes: normaliser((ligne.communes || []).join(" ")),
      operateur: normaliser(ligne.operateur),
    });
  }
  return champsRecherche.get(ligne);
}

/**
 * Lignes correspondant à `texte` : numéro exact d'abord, puis début de numéro, nom, commune, exploitant.
 * Renvoie { resultats, total }.
 */
export function rechercherLignes(lignes, texte, limite = 60) {
  const q = normaliser(texte);
  if (!q) return { resultats: [], total: 0 };
  const mots = q.split(" ");
  const trouves = [];
  for (const ligne of lignes) {
    const c = champs(ligne);
    let score;
    if (c.libelle === q) score = 0;
    else if (c.libelle.startsWith(q)) score = 1;
    else if (c.nom.includes(q)) score = 2;
    else if (c.communes.includes(q)) score = 3;
    else if (c.operateur.includes(q)) score = 4;
    else if (mots.every((m) => c.libelle === m || c.nom.includes(m) || c.communes.includes(m) || c.operateur.includes(m))) score = 5;
    else continue;
    trouves.push([score, ligne]);
  }
  trouves.sort((a, b) => a[0] - b[0] || cleNaturelle(a[1].libelle, b[1].libelle) || cleNaturelle(a[1].nom, b[1].nom));
  return { resultats: trouves.slice(0, limite).map((t) => t[1]), total: trouves.length };
}
