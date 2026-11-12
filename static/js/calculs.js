// Calculs métier, sans accès à la page : testés avec « node --test tests/js ».

export const RAYON_PIVOT = 150;
export const FAMILLES_FERREES = new Set(["rer", "train", "metro", "tramway", "navette", "cable", "funiculaire"]);

// ---------- Heures ----------

export function versMinutes(heure) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(heure || "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

export function versHeure(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function pluriel(n, singulier, plurielTexte) {
  return `${n} ${Math.abs(n) > 1 ? plurielTexte : singulier}`;
}

export function texteDuree(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return pluriel(m, "minute", "minutes");
  return m ? `${pluriel(h, "heure", "heures")} ${pluriel(m, "minute", "minutes")}` : pluriel(h, "heure", "heures");
}

/** Tranches d'une heure, coupées aux heures rondes : 09:30 à 11:15 -> 09:30-10:00, 10:00-11:00, 11:00-11:15. */
export function tranchesHoraires(debut, fin) {
  const d = versMinutes(debut);
  const f = versMinutes(fin);
  if (d === null || f === null || f <= d) return [];
  const tranches = [];
  for (let t = d; t < f;) {
    const suivant = Math.min(f, (Math.floor(t / 60) + 1) * 60);
    tranches.push({ debut: versHeure(t), fin: versHeure(suivant) });
    t = suivant;
  }
  return tranches;
}

// ---------- Quotas par heure ----------

/**
 * Quotas par défaut, heure par heure (consigne de Darryl, 8 novembre 2026) : heures de pointe du matin.
 * 6 h - 7 h : 10 ; 7 h - 9 h : 20 ; 9 h - 10 h : 10 ; puis 15 par heure. Les heures absentes valent 15.
 */
export const PROFIL_QUOTAS = { 6: 10, 7: 20, 8: 20, 9: 10, 10: 15, 11: 15, 12: 15, 13: 15, 14: 15, 15: 15 };
export const QUOTA_HORS_PROFIL = 15;
export const HEURE_DEBUT_DEFAUT = "06:00";

export function quotaParDefaut(heure) {
  return PROFIL_QUOTAS[heure] ?? QUOTA_HORS_PROFIL;
}

/** Quota par défaut d'une tranche : la valeur de son heure, au prorata si la tranche dure moins d'une heure. */
export function quotaTranche(tranche) {
  const d = versMinutes(tranche.debut);
  const f = versMinutes(tranche.fin);
  return Math.round((quotaParDefaut(Math.floor(d / 60) % 24) * (f - d)) / 60);
}

/** Répartition automatique : chaque tranche reçoit le quota par défaut de son heure. */
export function quotasParDefaut(segment) {
  return tranchesHoraires(segment.debut, segment.fin).map((t) => ({ ...t, enquetes: quotaTranche(t) }));
}

/** Nouvelles tranches après un changement d'horaires : les tranches inchangées gardent leur quota, les autres prennent le quota par défaut. */
export function quotasConserves(segment) {
  const anciens = new Map((segment.quotas || []).map((q) => [`${q.debut}-${q.fin}`, q.enquetes]));
  return tranchesHoraires(segment.debut, segment.fin).map((t) => ({ ...t, enquetes: anciens.get(`${t.debut}-${t.fin}`) ?? quotaTranche(t) }));
}

/** Heure de fin à laquelle les quotas par défaut, cumulés depuis `debut`, atteignent `objectif` enquêtes. */
export function finPourObjectif(debut, objectif, dureeMaximum = 9 * 60) {
  const d = versMinutes(debut);
  const limite = Math.min(d + dureeMaximum, 23 * 60 + 59);
  let cumul = 0; // en enquêtes × 60, pour rester en nombres entiers
  for (let t = d; t < limite; t += 1) {
    cumul += quotaParDefaut(Math.floor(t / 60) % 24);
    if (cumul >= objectif * 60) return versHeure(t + 1);
  }
  return versHeure(limite);
}

/** Quotas par défaut d'un segment, ajustés sur la dernière tranche pour faire exactement `objectif` enquêtes. */
export function quotasPourObjectif(segment, objectif) {
  const quotas = quotasParDefaut(segment);
  let ecart = objectif - quotas.reduce((a, q) => a + q.enquetes, 0);
  for (let i = quotas.length - 1; i >= 0 && ecart !== 0; i -= 1) {
    const nouveau = Math.max(0, quotas[i].enquetes + ecart);
    ecart -= nouveau - quotas[i].enquetes;
    quotas[i].enquetes = nouveau;
  }
  return quotas;
}

export function sommeQuotas(segment) {
  return (segment.quotas || []).reduce((a, q) => a + (Number(q.enquetes) || 0), 0);
}

// ---------- Courses et programmes ----------

/** Enquêtes d'un segment : la somme de ses quotas par heure. */
export function enquetesSegment(segment) {
  return segment.quotas?.length ? sommeQuotas(segment) : Number(segment.enquetes) || 0;
}

export function totalProgramme(programme) {
  return programme.segments.reduce((a, s) => a + enquetesSegment(s), 0);
}

export function enquetesSurLigne(programme, ligne) {
  return programme.segments.filter((s) => s.ligne === ligne).reduce((a, s) => a + enquetesSegment(s), 0);
}

/**
 * État de chaque ligne de la course. `enCours` : programme en cours de construction ou de modification
 * (ses enquêtes remplacent celles de la version enregistrée).
 */
export function etatLignes(course, enCours = null) {
  return course.lignes.map(({ ligne, commandees }) => {
    let autres = 0;
    const programmes = [];
    for (const p of course.programmes) {
      if (enCours && p.id === enCours.id) continue;
      const n = enquetesSurLigne(p, ligne);
      if (n) {
        autres += n;
        programmes.push({ id: p.id, numero: p.numero, enquetes: n });
      }
    }
    const ceProgramme = enCours ? enquetesSurLigne(enCours, ligne) : 0;
    return {
      ligne,
      commandees,
      programmees: autres + ceProgramme,
      disponibles: commandees - autres,
      ceProgramme,
      restantes: commandees - autres - ceProgramme,
      programmes: programmes.sort((a, b) => a.numero - b.numero),
    };
  });
}

export function programmesNecessaires(totalCommande, enquetesParProgramme) {
  if (!enquetesParProgramme || totalCommande <= 0) return 0;
  return Math.ceil(totalCommande / enquetesParProgramme);
}

export function decoupage(commandees, enquetesParProgramme) {
  if (!enquetesParProgramme) return { pleins: 0, reste: commandees };
  return { pleins: Math.floor(commandees / enquetesParProgramme), reste: commandees % enquetesParProgramme };
}

export function resumeCourse(course) {
  const etat = etatLignes(course);
  const commandees = etat.reduce((a, l) => a + l.commandees, 0);
  const programmees = etat.reduce((a, l) => a + l.programmees, 0);
  return {
    commandees,
    programmees,
    restantes: commandees - programmees,
    necessaires: programmesNecessaires(commandees, course.enquetesParProgramme),
    realises: course.programmes.length,
  };
}

export function prochainNumero(course) {
  return course.programmes.reduce((max, p) => Math.max(max, p.numero || 0), 0) + 1;
}

/**
 * Contrôle d'un programme avant enregistrement.
 * erreurs : bloquent l'enregistrement (surplus, quotas faux, segment incomplet).
 * alertes : à lire, sans bloquer (total ou durée différents des réglages de la course).
 */
export function verifierProgramme(course, programme, libelle = (id) => id) {
  const erreurs = [];
  const alertes = [];
  if (!programme.segments.length) erreurs.push("Le programme n'a aucun segment.");

  programme.segments.forEach((s, i) => {
    const nom = `Segment ${i + 1}${s.ligne ? ` (ligne ${libelle(s.ligne)})` : ""}`;
    if (!s.ligne) erreurs.push(`${nom} : choisir une ligne.`);
    else if (!course.lignes.some((l) => l.ligne === s.ligne)) erreurs.push(`${nom} : cette ligne n'est pas dans la course.`);
    if (!s.arretDepart && !s.arretFin) erreurs.push(`${nom} : choisir l'arrêt de départ et l'arrêt de fin.`);
    else if (!s.arretDepart) erreurs.push(`${nom} : choisir l'arrêt de départ.`);
    else if (!s.arretFin) erreurs.push(`${nom} : choisir l'arrêt de fin.`);
    const d = versMinutes(s.debut);
    const f = versMinutes(s.fin);
    if (d === null || f === null) erreurs.push(`${nom} : indiquer l'heure de début et l'heure de fin.`);
    else if (f <= d) erreurs.push(`${nom} : l'heure de fin doit être après l'heure de début.`);
    if (d !== null && f !== null && f > d && enquetesSegment(s) <= 0) {
      erreurs.push(`${nom} : aucune enquête dans les quotas par heure.`);
    }
    if (s.ligne && !String(s.sens || "").trim()) alertes.push(`${nom} : direction non renseignée.`);
    const precedent = programme.segments[i - 1];
    if (precedent && versMinutes(precedent.fin) !== null && d !== null && d < versMinutes(precedent.fin)) {
      erreurs.push(`${nom} : il commence avant la fin du segment précédent.`);
    }
  });

  for (const l of etatLignes(course, programme)) {
    if (l.restantes < 0) {
      erreurs.push(`Ligne ${libelle(l.ligne)} : ${pluriel(l.ceProgramme, "enquête programmée", "enquêtes programmées")} pour ${pluriel(Math.max(l.disponibles, 0), "restante", "restantes")}. Il ne faut jamais programmer plus que le reste de la ligne.`);
    }
  }

  const total = totalProgramme(programme);
  if (total && total !== course.enquetesParProgramme) {
    alertes.push(`Le programme compte ${pluriel(total, "enquête", "enquêtes")} au lieu de ${course.enquetesParProgramme}.`);
  }
  const premier = programme.segments[0];
  const dernier = programme.segments[programme.segments.length - 1];
  if (premier && dernier && versMinutes(premier.debut) !== null && versMinutes(dernier.fin) !== null) {
    const duree = versMinutes(dernier.fin) - versMinutes(premier.debut);
    const prevue = Math.round(course.dureeProgrammeHeures * 60);
    if (duree > 0 && duree !== prevue) {
      alertes.push(`Le programme dure ${texteDuree(duree)} au lieu de ${texteDuree(prevue)}.`);
    }
  }
  return { erreurs, alertes };
}

// ---------- Arrêts, pivots, accès ----------

export function distanceMetres(lat1, lon1, lat2, lon2) {
  const p = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * p) / 2) ** 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** Arrêts d'une ligne dans l'ordre d'un sens (nom du sens), ou tous les arrêts. */
export function arretsDuSens(fichier, nomSens) {
  const sens = fichier.ordre && nomSens ? fichier.ordre.sens.find((s) => s.nom === nomSens) : null;
  return sens ? sens.arrets.map((i) => fichier.arrets[i]) : fichier.arrets;
}

/** Arrêts de pivot entre la ligne A et la ligne B (A puis B), à `rayon` mètres ou moins, du plus proche au plus loin. */
export function pivotsEntre(fichierA, fichierB, rayon = RAYON_PIVOT) {
  const pivots = new Map();
  const ajouter = (arretA, arretB, distance) => {
    const cle = `${arretA}\u0000${arretB}`;
    if (!pivots.has(cle) || pivots.get(cle).distance > distance) pivots.set(cle, { arretA, arretB, distance });
  };
  for (const a of fichierA.arrets) {
    for (const [id, nom, d] of a.correspondances) if (id === fichierB.id && d <= rayon) ajouter(a.nom, nom, d);
  }
  for (const b of fichierB.arrets) {
    for (const [id, nom, d] of b.correspondances) if (id === fichierA.id && d <= rayon) ajouter(nom, b.nom, d);
  }
  return [...pivots.values()].sort((x, y) => x.distance - y.distance || x.arretA.localeCompare(y.arretA, "fr"));
}

/** Distance entre un arrêt de A et un arrêt de B : celle du jeu de données si connue, sinon entre les centres. */
export function distanceEntreArrets(fichierA, nomA, fichierB, nomB) {
  const a = fichierA.arrets.find((x) => x.nom === nomA);
  const b = fichierB.arrets.find((x) => x.nom === nomB);
  if (!a || !b) return null;
  const directe = a.correspondances.find(([id, nom]) => id === fichierB.id && nom === nomB)
    || b.correspondances.find(([id, nom]) => id === fichierA.id && nom === nomA);
  if (directe) return directe[2];
  return Math.round(distanceMetres(a.lat, a.lon, b.lat, b.lon));
}

/** Gare de RER, station de métro, arrêt de tramway (ou autre ligne non bus) la plus proche d'un arrêt. */
export function accesFerre(arret, lignesParId, rayon = Infinity) {
  for (const [id, nom, distance] of arret.correspondances) {
    const ligne = lignesParId.get(id);
    if (ligne && FAMILLES_FERREES.has(ligne.famille) && distance <= rayon) return { ligne, nom, distance };
  }
  return null;
}

// ---------- Suggestion du programme suivant ----------

const RANG = { paire: 0, complet: 1, complement: 2, seul: 3 };

/**
 * Programmes suggérés à partir des restes : paires de lignes reliées par un pivot (150 mètres ou moins)
 * dont la somme se rapproche des enquêtes par programme, programmes pleins sur une seule ligne, etc.
 * `fichiers` : Map identifiant de ligne -> fichier de la ligne (pour les pivots).
 */
export function suggestions(course, fichiers, nombre = 3) {
  const epp = course.enquetesParProgramme;
  const etat = etatLignes(course).filter((l) => l.restantes > 0);
  const candidats = [];

  for (let i = 0; i < etat.length; i += 1) {
    for (let j = i + 1; j < etat.length; j += 1) {
      const a = etat[i];
      const b = etat[j];
      const petitA = a.restantes < epp;
      const petitB = b.restantes < epp;
      if (!petitA && !petitB) continue;
      let qa;
      let qb;
      if (petitA && petitB) {
        const [petit, grand] = a.restantes <= b.restantes ? ["a", "b"] : ["b", "a"];
        const q = { a: a.restantes, b: b.restantes };
        q[grand] = Math.min(q[grand], epp - q[petit]);
        [qa, qb] = [q.a, q.b];
      } else if (petitA) {
        qa = a.restantes;
        qb = Math.min(b.restantes, epp - qa);
      } else {
        qb = b.restantes;
        qa = Math.min(a.restantes, epp - qb);
      }
      if (qa <= 0 || qb <= 0) continue;
      // La ligne qui a le plus d'enquêtes dans ce programme passe en premier.
      const [premier, second] = qa >= qb ? [[a.ligne, qa], [b.ligne, qb]] : [[b.ligne, qb], [a.ligne, qa]];
      const f1 = fichiers.get(premier[0]);
      const f2 = fichiers.get(second[0]);
      if (!f1 || !f2) continue;
      const pivot = pivotsEntre(f1, f2)[0];
      if (!pivot) continue;
      candidats.push({
        type: petitA && petitB ? "paire" : "complement",
        segments: [{ ligne: premier[0], enquetes: premier[1] }, { ligne: second[0], enquetes: second[1] }],
        total: qa + qb,
        pivot,
      });
    }
  }
  for (const l of etat) {
    if (l.restantes >= epp) candidats.push({ type: "complet", segments: [{ ligne: l.ligne, enquetes: epp }], total: epp, pivot: null });
    else candidats.push({ type: "seul", segments: [{ ligne: l.ligne, enquetes: l.restantes }], total: l.restantes, pivot: null });
  }

  candidats.sort((x, y) => Math.abs(epp - x.total) - Math.abs(epp - y.total)
    || RANG[x.type] - RANG[y.type]
    || (x.pivot?.distance ?? 0) - (y.pivot?.distance ?? 0));
  return candidats.slice(0, nombre);
}

/**
 * Choisit la direction d'un segment où l'arrêt de départ précède l'arrêt de fin, puis complète l'arrêt manquant :
 * départ vide -> premier arrêt de la direction ; fin vide -> terminus. Sans ordre connu, le segment est inchangé.
 * Si l'arrêt de départ est vide, on prend la direction où l'arrêt de fin vient le plus tard (le plus long trajet
 * avant le pivot) ; si l'arrêt de fin est vide, celle où le départ vient le plus tôt.
 */
export function ajusterSens(segment, fichier) {
  if (!fichier?.ordre?.sens.length) return segment;
  const noms = (sens) => sens.arrets.map((i) => fichier.arrets[i].nom);
  const evaluer = (sens) => {
    const liste = noms(sens);
    const d = segment.arretDepart ? liste.indexOf(segment.arretDepart) : null;
    const f = segment.arretFin ? liste.indexOf(segment.arretFin) : null;
    if (d === -1 || f === -1) return null;
    if (d !== null && f !== null) return d < f ? 0 : null;
    if (d === null && f !== null) return f >= 1 ? -f : null;      // départ à compléter : plus la fin est loin, mieux c'est
    if (d !== null && f === null) return d < liste.length - 1 ? d : null;
    return 0;
  };
  const candidats = fichier.ordre.sens.map((sens) => [sens, evaluer(sens)]).filter(([, note]) => note !== null);
  const actuel = candidats.find(([sens]) => sens.nom === segment.sens);
  const choisi = (segment.arretDepart && segment.arretFin && actuel)
    ? actuel
    : candidats.sort((x, y) => x[1] - y[1] || Number(y[0].nom === segment.sens) - Number(x[0].nom === segment.sens))[0];
  if (!choisi) {
    // Aucune direction ne convient : on garde celle qui contient l'arrêt de fin (ou de départ) et on vide l'autre.
    const garde = fichier.ordre.sens.find((sens) => noms(sens).includes(segment.arretFin || segment.arretDepart));
    if (garde) segment.sens = garde.nom;
    if (segment.arretDepart && segment.arretFin) segment.arretDepart = "";
    return segment;
  }
  segment.sens = choisi[0].nom;
  const liste = noms(choisi[0]);
  if (!segment.arretDepart && segment.arretFin !== liste[0]) segment.arretDepart = liste[0];
  if (!segment.arretFin && segment.arretDepart !== liste[liste.length - 1]) segment.arretFin = liste[liste.length - 1];
  return segment;
}

/**
 * Segments pré-remplis d'un programme à partir d'une suggestion. Le programme commence à 6 heures ;
 * chaque segment dure le temps que les quotas par défaut atteignent son nombre d'enquêtes.
 * Avec un pivot, le premier segment finit au pivot et le second y commence ; la direction est choisie en conséquence.
 */
export function segmentsSuggeres(suggestion, fichiers, course, debut = HEURE_DEBUT_DEFAUT) {
  let heure = debut;
  return suggestion.segments.map((s, i) => {
    const fichier = fichiers.get(s.ligne);
    const segment = {
      ligne: s.ligne,
      sens: fichier?.ordre ? fichier.ordre.sens[0].nom : null,
      arretDepart: "",
      arretFin: "",
      debut: heure,
      fin: finPourObjectif(heure, s.enquetes),
    };
    if (suggestion.pivot && i === 0) segment.arretFin = suggestion.pivot.arretA;
    if (suggestion.pivot && i === 1) segment.arretDepart = suggestion.pivot.arretB;
    ajusterSens(segment, fichier);
    segment.quotas = quotasPourObjectif(segment, s.enquetes);
    segment.enquetes = s.enquetes;
    heure = segment.fin;
    return segment;
  });
}
