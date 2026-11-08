// Téléchargement de la course complète en un seul classeur Excel, créé dans le navigateur.
// Feuille « Synthèse » puis une feuille par ligne avec ses programmes (arrêts, horaires, quotas par heure).

import { accesFerre, etatLignes, pluriel, resumeCourse, texteDuree, totalProgramme, versMinutes } from "./calculs.js";
import { chargerLignes } from "./donnees.js";
import { notifier, telecharger } from "./interface.js";

const BLEU_FONCE = "FF1F4E8C";
const BLEU_CLAIR = "FFEAF1FB";
const BORDURE = "FFD5E2F5";
const TEXTE = "FF0F2A52";
const POLICE = { name: "Arial", size: 10, color: { argb: TEXTE } };
const GRAS = { ...POLICE, bold: true };
const ENTETE = { ...POLICE, bold: true, color: { argb: "FFFFFFFF" } };
const TITRE = { ...POLICE, size: 14, bold: true, color: { argb: BLEU_FONCE } };
const CADRE = { style: "thin", color: { argb: BORDURE } };
const BORDS = { top: CADRE, left: CADRE, bottom: CADRE, right: CADRE };

let promesseExcelJS = null;

function chargerExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!promesseExcelJS) {
    promesseExcelJS = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("./vendor/exceljs.min.js", import.meta.url).href;
      script.onload = () => resolve(window.ExcelJS);
      script.onerror = () => {
        promesseExcelJS = null;
        reject(new Error("la bibliothèque Excel n'a pas pu être chargée"));
      };
      document.head.append(script);
    });
  }
  return promesseExcelJS;
}

function nomFeuille(texte, dejaPris) {
  const base = texte.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Feuille";
  let nom = base;
  for (let i = 2; dejaPris.has(nom.toLowerCase()); i += 1) nom = `${base.slice(0, 27)} (${i})`;
  dejaPris.add(nom.toLowerCase());
  return nom;
}

function nomFichier(course) {
  const propre = course.nom.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "course";
  return `Course ${propre}.xlsx`;
}

function texteAcces(fichiers, parId, ligne, nomArret) {
  const arret = fichiers.get(ligne)?.arrets.find((a) => a.nom === nomArret);
  if (!arret) return "";
  const acces = accesFerre(arret, parId, 300);
  return acces
    ? `${acces.ligne.libelle}, ${acces.nom}, ${pluriel(acces.distance, "mètre", "mètres")}`
    : "Aucune gare de RER, station de métro ou arrêt de tramway à moins de 300 mètres";
}

function ecrireEntete(feuille, numero, valeurs) {
  const rangee = feuille.getRow(numero);
  valeurs.forEach((v, i) => {
    const c = rangee.getCell(i + 1);
    c.value = v;
    c.font = ENTETE;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLEU_FONCE } };
    c.border = BORDS;
    c.alignment = { vertical: "middle", wrapText: true };
  });
  rangee.height = 22;
}

function ecrireRangee(feuille, numero, valeurs, { gras = false, zebre = false } = {}) {
  const rangee = feuille.getRow(numero);
  valeurs.forEach((v, i) => {
    const c = rangee.getCell(i + 1);
    c.value = v;
    c.font = gras ? GRAS : POLICE;
    c.border = BORDS;
    c.alignment = { vertical: "top", wrapText: true };
    if (zebre) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLEU_CLAIR } };
  });
  return rangee;
}

export async function telechargerCourseExcel(course, index) {
  notifier("Préparation du fichier Excel…", "information");
  const [ExcelJS, fichiers] = await Promise.all([chargerExcelJS(), chargerLignes(course.lignes.map((l) => l.ligne))]);
  const parId = index.parId;
  const libelle = (id) => parId.get(id)?.libelle ?? id;
  const programmes = [...course.programmes].sort((a, b) => a.numero - b.numero);
  const resume = resumeCourse(course);
  const etat = etatLignes(course);
  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Programmes d'enquêteurs";
  classeur.created = new Date();
  const pris = new Set();

  // ---------- Synthèse ----------
  const synthese = classeur.addWorksheet(nomFeuille("Synthèse", pris), { views: [{ showGridLines: false }] });
  synthese.columns = [{ width: 14 }, { width: 34 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 }, { width: 46 }];
  synthese.getCell("A1").value = course.nom;
  synthese.getCell("A1").font = TITRE;
  const infos = [
    ["Enquêtes par programme", course.enquetesParProgramme],
    ["Durée d'un programme", texteDuree(Math.round(course.dureeProgrammeHeures * 60))],
    ["Enquêtes commandées", resume.commandees],
    ["Enquêtes programmées", resume.programmees],
    ["Enquêtes restantes", resume.restantes],
    ["Programmes", `${resume.realises} sur ${resume.necessaires} nécessaires`],
    ["Téléchargée le", new Date().toLocaleDateString("fr-FR")],
  ];
  infos.forEach(([titre, valeur], i) => {
    synthese.getCell(`A${i + 3}`).value = titre;
    synthese.getCell(`A${i + 3}`).font = GRAS;
    synthese.mergeCells(`A${i + 3}:B${i + 3}`);
    synthese.getCell(`C${i + 3}`).value = valeur;
    synthese.getCell(`C${i + 3}`).font = POLICE;
    synthese.getCell(`C${i + 3}`).alignment = { horizontal: "left" };
  });

  let r = infos.length + 4;
  synthese.getCell(`A${r}`).value = "Lignes de la course";
  synthese.getCell(`A${r}`).font = { ...TITRE, size: 12 };
  r += 1;
  ecrireEntete(synthese, r, ["Ligne", "Nom", "Exploitant", "Commandées", "Programmées", "Restantes", "Programmes"]);
  const debutLignes = r + 1;
  etat.forEach((l, i) => {
    const ligne = parId.get(l.ligne);
    r += 1;
    ecrireRangee(synthese, r, [
      libelle(l.ligne), ligne?.nom ?? "", ligne?.operateur ?? "", l.commandees, l.programmees, l.restantes,
      l.programmes.map((p) => `Programme ${p.numero} (${p.enquetes})`).join(", "),
    ], { zebre: i % 2 === 1 });
  });
  r += 1;
  ecrireRangee(synthese, r, ["Total", "", "", { formula: `SUM(D${debutLignes}:D${r - 1})`, result: resume.commandees },
    { formula: `SUM(E${debutLignes}:E${r - 1})`, result: resume.programmees },
    { formula: `SUM(F${debutLignes}:F${r - 1})`, result: resume.restantes }, ""], { gras: true });

  r += 2;
  synthese.getCell(`A${r}`).value = "Programmes";
  synthese.getCell(`A${r}`).font = { ...TITRE, size: 12 };
  r += 1;
  ecrireEntete(synthese, r, ["Programme", "Parcours", "Horaires", "Durée", "Enquêtes", "Lignes", "Début : accès", "Fin : accès"]);
  synthese.getColumn(7).width = 40;
  programmes.forEach((p, i) => {
    const premier = p.segments[0];
    const dernier = p.segments[p.segments.length - 1];
    const parcours = p.segments.map((s, k) => {
      const morceau = `${libelle(s.ligne)} : ${s.arretDepart} → ${s.arretFin} (${s.enquetes})`;
      return k === 0 ? morceau : `pivot ${p.segments[k - 1].arretFin}${p.segments[k - 1].arretFin !== s.arretDepart ? ` / ${s.arretDepart}` : ""}, puis ${morceau}`;
    }).join(", ");
    r += 1;
    ecrireRangee(synthese, r, [
      `Programme ${p.numero}`, parcours, `${premier.debut} à ${dernier.fin}`,
      texteDuree(versMinutes(dernier.fin) - versMinutes(premier.debut)), totalProgramme(p),
      [...new Set(p.segments.map((s) => libelle(s.ligne)))].join(", "),
      texteAcces(fichiers, parId, premier.ligne, premier.arretDepart),
      texteAcces(fichiers, parId, dernier.ligne, dernier.arretFin),
    ], { zebre: i % 2 === 1 });
  });
  if (!programmes.length) {
    r += 1;
    synthese.getCell(`A${r}`).value = "Aucun programme pour l'instant.";
    synthese.getCell(`A${r}`).font = POLICE;
  }
  r += 2;
  synthese.getCell(`A${r}`).value = "Données des lignes et des arrêts : Île-de-France Mobilités, jeu « Arrêts et lignes associées », licence ODbL.";
  synthese.getCell(`A${r}`).font = { ...POLICE, italic: true, color: { argb: "FF5B6B82" } };

  // ---------- Une feuille par ligne ----------
  for (const l of etat) {
    const ligne = parId.get(l.ligne);
    const feuille = classeur.addWorksheet(nomFeuille(`Ligne ${libelle(l.ligne)}`, pris), { views: [{ showGridLines: false }] });
    feuille.columns = [{ width: 22 }, { width: 40 }, { width: 52 }];
    feuille.getCell("A1").value = `Ligne ${libelle(l.ligne)}${ligne?.nom && ligne.nom !== ligne.libelle ? ` (${ligne.nom})` : ""}`;
    feuille.getCell("A1").font = TITRE;
    feuille.getCell("A2").value = `${ligne?.operateur ?? ""}. Commandées : ${l.commandees}, programmées : ${l.programmees}, restantes : ${l.restantes}.`;
    feuille.getCell("A2").font = POLICE;
    let ligneCourante = 4;

    const blocs = [];
    for (const p of programmes) {
      p.segments.forEach((s, k) => { if (s.ligne === l.ligne) blocs.push({ p, s, k }); });
    }
    if (!blocs.length) {
      feuille.getCell(`A${ligneCourante}`).value = "Aucun programme sur cette ligne pour l'instant.";
      feuille.getCell(`A${ligneCourante}`).font = POLICE;
      continue;
    }
    for (const { p, s, k } of blocs) {
      const precedent = p.segments[k - 1];
      const suivant = p.segments[k + 1];
      feuille.mergeCells(`A${ligneCourante}:C${ligneCourante}`);
      const titre = feuille.getCell(`A${ligneCourante}`);
      titre.value = `Programme ${p.numero}${p.segments.length > 1 ? `, segment ${k + 1} sur ${p.segments.length}` : ""}`;
      titre.font = ENTETE;
      titre.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLEU_FONCE } };
      feuille.getRow(ligneCourante).height = 22;
      titre.alignment = { vertical: "middle" };
      ligneCourante += 1;
      const details = [
        ["Sens", s.sens || "Non disponible (ordre des arrêts inconnu)", ""],
        ["Arrêt de départ", s.arretDepart,
          k === 0 ? `Accès : ${texteAcces(fichiers, parId, s.ligne, s.arretDepart)}` : `Arrivée de la ligne ${libelle(precedent.ligne)} (${precedent.arretFin})`],
        ["Arrêt de fin", s.arretFin,
          suivant ? `Pivot vers la ligne ${libelle(suivant.ligne)} (${suivant.arretDepart})` : `Accès : ${texteAcces(fichiers, parId, s.ligne, s.arretFin)}`],
        ["Horaires", `${s.debut} à ${s.fin}`, texteDuree(versMinutes(s.fin) - versMinutes(s.debut))],
        ["Enquêtes", s.enquetes, ""],
      ];
      details.forEach((d, i) => {
        const rangee = ecrireRangee(feuille, ligneCourante, d, { zebre: i % 2 === 1 });
        rangee.getCell(1).font = GRAS;
        rangee.getCell(2).alignment = { horizontal: "left", vertical: "top", wrapText: true };
        ligneCourante += 1;
      });
      ecrireEntete(feuille, ligneCourante, ["Quotas par heure", "Tranche", "Enquêtes"]);
      ligneCourante += 1;
      const debutQuotas = ligneCourante;
      s.quotas.forEach((q, i) => {
        ecrireRangee(feuille, ligneCourante, ["", `${q.debut} à ${q.fin}`, q.enquetes], { zebre: i % 2 === 1 });
        ligneCourante += 1;
      });
      ecrireRangee(feuille, ligneCourante, ["Total", "", { formula: `SUM(C${debutQuotas}:C${ligneCourante - 1})`, result: s.enquetes }], { gras: true });
      ligneCourante += 2;
    }
    feuille.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  synthese.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const contenu = await classeur.xlsx.writeBuffer();
  telecharger(nomFichier(course), new Blob([contenu], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  notifier(`Fichier « ${nomFichier(course)} » téléchargé.`);
}
