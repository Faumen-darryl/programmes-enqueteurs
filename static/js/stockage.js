// Courses et programmes enregistrés dans ce navigateur (localStorage).
// Rien n'est envoyé sur Internet : l'export JSON sert à passer d'un poste à l'autre.

const CLE_COURSES = "programmes-enqueteurs/courses";
const CLE_PIVOT = "programmes-enqueteurs/pivot-retenu";
const FORMAT = "programmes-enqueteurs";

export function stockageDisponible() {
  try {
    const essai = `${CLE_COURSES}/essai`;
    localStorage.setItem(essai, "1");
    localStorage.removeItem(essai);
    return true;
  } catch {
    return false;
  }
}

export function nouvelIdentifiant() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function lireCourses() {
  try {
    const brut = localStorage.getItem(CLE_COURSES);
    const donnees = brut ? JSON.parse(brut) : [];
    return Array.isArray(donnees) ? donnees.map(normaliserCourse) : [];
  } catch {
    return [];
  }
}

export function enregistrerCourses(courses) {
  localStorage.setItem(CLE_COURSES, JSON.stringify(courses));
}

export function trouverCourse(id) {
  return lireCourses().find((c) => c.id === id) || null;
}

export function enregistrerCourse(course) {
  const courses = lireCourses();
  const i = courses.findIndex((c) => c.id === course.id);
  course.modifieeLe = new Date().toISOString();
  if (i >= 0) courses[i] = course;
  else courses.push(course);
  enregistrerCourses(courses);
  return course;
}

export function supprimerCourse(id) {
  enregistrerCourses(lireCourses().filter((c) => c.id !== id));
}

function normaliserCourse(c) {
  return {
    id: String(c.id),
    nom: String(c.nom || "Course sans nom"),
    enquetesParProgramme: Number(c.enquetesParProgramme) || 120,
    dureeProgrammeHeures: Number(c.dureeProgrammeHeures) || 7,
    lignes: (c.lignes || []).map((l) => ({ ligne: String(l.ligne), commandees: Number(l.commandees) || 0 })),
    programmes: (c.programmes || []).map((p) => ({
      id: String(p.id),
      numero: Number(p.numero) || 0,
      segments: (p.segments || []).map((s) => ({
        ligne: String(s.ligne || ""),
        sens: s.sens || null,
        arretDepart: s.arretDepart || "",
        arretFin: s.arretFin || "",
        debut: s.debut || "",
        fin: s.fin || "",
        quotas: (s.quotas || []).map((q) => ({ debut: q.debut, fin: q.fin, enquetes: Number(q.enquetes) || 0 })),
        // Enquêtes du segment = somme des quotas par heure (le champ est gardé pour les fichiers exportés).
        enquetes: (s.quotas || []).length ? s.quotas.reduce((a, q) => a + (Number(q.enquetes) || 0), 0) : Number(s.enquetes) || 0,
      })),
    })),
    creeeLe: c.creeeLe || null,
    modifieeLe: c.modifieeLe || null,
  };
}

// ---------- Import et export ----------

export function exporterCourses(courses = lireCourses()) {
  return JSON.stringify({ format: FORMAT, version: 1, exporteLe: new Date().toISOString(), courses }, null, 2);
}

/** Ajoute les courses d'un fichier exporté. Une course déjà présente (même identifiant) est remplacée. */
export function importerCourses(texte) {
  let donnees;
  try {
    donnees = JSON.parse(texte);
  } catch {
    throw new Error("Ce fichier n'est pas un fichier JSON lisible.");
  }
  const liste = Array.isArray(donnees) ? donnees : donnees?.courses;
  if (!Array.isArray(liste) || (donnees.format && donnees.format !== FORMAT)) {
    throw new Error("Ce fichier ne contient pas de courses exportées par cet outil.");
  }
  const importees = liste.filter((c) => c && c.id && Array.isArray(c.lignes)).map(normaliserCourse);
  if (!importees.length) throw new Error("Aucune course trouvée dans ce fichier.");
  const courses = lireCourses();
  let remplacees = 0;
  for (const c of importees) {
    const i = courses.findIndex((x) => x.id === c.id);
    if (i >= 0) {
      courses[i] = c;
      remplacees += 1;
    } else {
      courses.push(c);
    }
  }
  enregistrerCourses(courses);
  return { ajoutees: importees.length - remplacees, remplacees };
}

// ---------- Exemple de la maquette ----------

export function courseExemple() {
  return {
    id: nouvelIdentifiant(),
    nom: "Hauts-de-Seine sud (exemple)",
    enquetesParProgramme: 120,
    dureeProgrammeHeures: 7,
    lignes: [
      { ligne: "C01319", commandees: 240 },
      { ligne: "C00350", commandees: 75 },
      { ligne: "C01215", commandees: 45 },
    ],
    programmes: [],
    creeeLe: new Date().toISOString(),
    modifieeLe: null,
  };
}

// ---------- Pivot retenu dans l'écran Lignes et correspondances ----------

export function retenirPivot(pivot) {
  try {
    localStorage.setItem(CLE_PIVOT, JSON.stringify(pivot));
  } catch {
    /* stockage indisponible : le pivot n'est pas retenu */
  }
}

export function lirePivotRetenu() {
  try {
    return JSON.parse(localStorage.getItem(CLE_PIVOT) || "null");
  } catch {
    return null;
  }
}

export function oublierPivot() {
  try {
    localStorage.removeItem(CLE_PIVOT);
  } catch {
    /* rien à faire */
  }
}
