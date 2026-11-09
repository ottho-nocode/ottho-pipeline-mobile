// Lecture de ottho.json, la source de vérité du parcours, écrit par scripts/ottho-state.mjs dans le
// dépôt du parcours. Rien n'est exécuté, rien n'est écrit : le fichier est lu, c'est tout.
//
// Trois règles du moteur du parcours sont reproduites ici, à l'identique :
//   1. une étape conditionnelle ne s'applique que si sa branche vaut vrai ; une condition « sans_x »
//      est l'inverse de la branche « x » ; une branche jamais répondue vaut faux ;
//   2. l'étape courante est celle marquée « in_progress » si elle s'applique, sinon la première
//      applicable qui n'est ni faite ni sautée ;
//   3. les étapes sautées sortent des totaux d'avancement.
//
// Une étape absente de `steps` est à faire : le moteur n'y inscrit une ligne qu'au premier passage,
// et `counts.pending` du script vaut donc 0 sur un parcours à peine commencé.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const ETAT_FILE = "ottho.json";
export const SCHEMA_VERSION = 1;
export const STATUTS = ["pending", "in_progress", "done", "skipped", "blocked"];

// Libellé de chaque statut, en toutes lettres : jamais un symbole seul, ni la couleur seule.
export const STATUT_LABEL = {
  pending: "à faire",
  in_progress: "en cours",
  done: "faite",
  skipped: "sautée",
  blocked: "bloquée",
};

// Les branches du produit, dans l'ordre où le parcours les pose, et la question qu'elles tranchent.
export const BRANCHES = [
  { key: "ios", label: "iPhone" },
  { key: "android", label: "Android" },
  { key: "compte_utilisateur", label: "Comptes utilisateur" },
  { key: "paiement", label: "Paiement dans l'application" },
  { key: "contenu_partage", label: "Contenu partagé entre utilisateurs" },
  { key: "supabase", label: "Backend Supabase" },
];

/** Lecture brute du fichier. `exists` false : le parcours n'a pas encore commencé. */
export async function readEtat(projectDir) {
  const text = await readFile(join(projectDir, ETAT_FILE), "utf8").catch(() => null);
  if (text === null) return { exists: false, etat: null, error: null };
  try {
    const etat = JSON.parse(text);
    if (etat?.schema_version !== SCHEMA_VERSION) {
      return { exists: true, etat: null, error: `ottho.json utilise le schéma v${etat?.schema_version} ; ce Builder lit le v${SCHEMA_VERSION}.` };
    }
    return { exists: true, etat, error: null };
  } catch {
    return { exists: true, etat: null, error: "ottho.json est illisible (JSON invalide) : il a été modifié à la main ou tronqué." };
  }
}

export function etapeApplicable(etape, branches = {}) {
  if (etape.condition === "toujours") return true;
  if (etape.condition.startsWith("sans_")) {
    // « sans_compte » est l'inverse de la branche « compte_utilisateur ».
    const inverse = etape.condition === "sans_compte" ? "compte_utilisateur" : etape.condition.slice(5);
    return branches[inverse] === false;
  }
  return branches[etape.condition] === true;
}

const statutDe = (steps, id) => {
  const brut = steps?.[id]?.status;
  return STATUTS.includes(brut) ? brut : "pending";
};

/**
 * Le parcours tel qu'il se présente à cette personne : chaque étape avec son statut, sa preuve, sa
 * raison de blocage, et le fait qu'elle s'applique. Ordre de `parcours.etapes`.
 */
export function etapesDeEtat(parcours, etat) {
  const steps = etat?.steps ?? {};
  const branches = etat?.branches ?? {};
  return parcours.etapes.map((etape) => {
    const ligne = steps[etape.id] ?? null;
    const statut = statutDe(steps, etape.id);
    return {
      ...etape,
      statut,
      statutLabel: STATUT_LABEL[statut],
      applicable: etapeApplicable(etape, branches),
      preuve: typeof ligne?.proof === "string" ? ligne.proof : null,
      // « blocked_reason » pour une étape bloquée, « skip_reason » pour une étape écartée à la main.
      raison: typeof ligne?.blocked_reason === "string" ? ligne.blocked_reason : typeof ligne?.skip_reason === "string" ? ligne.skip_reason : null,
      majLe: typeof ligne?.updated_at === "string" ? ligne.updated_at : null,
    };
  });
}

/** L'étape courante : « en cours » si elle s'applique, sinon la première applicable à faire. */
export function etapeCourante(etapes) {
  const enCours = etapes.find((e) => e.statut === "in_progress" && e.applicable);
  if (enCours) return enCours;
  return etapes.find((e) => e.applicable && e.statut !== "done" && e.statut !== "skipped") ?? null;
}

/** Avancement : les étapes sautées sortent des totaux, comme dans le compagnon du parcours. */
export function avancement(etapes) {
  const applicables = etapes.filter((e) => e.applicable && e.statut !== "skipped");
  const faites = applicables.filter((e) => e.statut === "done");
  const restantes = applicables.filter((e) => e.statut !== "done");
  const minutes = restantes.reduce((somme, e) => somme + (e.minutes ?? 0), 0);
  return { faites: faites.length, total: applicables.length, minutesRestantes: minutes };
}

/** Les actes, dans l'ordre, avec leurs étapes et leur avancement. */
export function actes(parcours, etapes) {
  const connus = parcours.actes ?? [];
  const noms = [...connus, ...etapes.map((e) => e.acte).filter((a) => !connus.includes(a))];
  return noms.map((nom) => {
    const dedans = etapes.filter((e) => e.acte === nom);
    return { nom, etapes: dedans.map((e) => e.id), ...avancement(dedans) };
  });
}

/** Les choix du produit, en toutes lettres. `valeur` null : la question n'a pas encore été posée. */
export function choix(etat) {
  const branches = etat?.branches ?? {};
  return BRANCHES.map((b) => {
    const valeur = typeof branches[b.key] === "boolean" ? branches[b.key] : null;
    return { key: b.key, label: b.label, valeur, reponse: valeur === null ? "pas encore répondu" : valeur ? "oui" : "non" };
  });
}

/** Le backend visé, comme le calcule le moteur du parcours. */
export function backendActif(etat) {
  if (etat?.branches?.supabase !== true) return "convex";
  return etat?.answers?.supabase_existant === "oui" ? "supabase-existant" : "supabase-nouveau";
}

const BACKEND_LABEL = {
  convex: "Convex",
  "supabase-nouveau": "Supabase (projet à créer)",
  "supabase-existant": "Supabase (projet déjà en place)",
};

export const backendLabel = (backend) => BACKEND_LABEL[backend] ?? backend;

/** Les dernières lignes de l'historique, de la plus récente à la plus ancienne. */
export function historique(etat, max = 60) {
  const lignes = Array.isArray(etat?.history) ? etat.history : [];
  return lignes
    .filter((h) => h && typeof h.at === "string" && typeof h.step === "string")
    .slice(-max)
    .reverse()
    .map((h) => ({
      at: h.at,
      step: h.step,
      status: STATUTS.includes(h.status) ? h.status : "pending",
      statusLabel: STATUT_LABEL[STATUTS.includes(h.status) ? h.status : "pending"],
      proof: typeof h.proof === "string" ? h.proof : null,
      reason: typeof h.reason === "string" ? h.reason : typeof h.blocked_reason === "string" ? h.blocked_reason : null,
    }));
}

/** Les réponses enregistrées (answers), en paires lisibles. */
export function reponses(etat) {
  const answers = etat?.answers ?? {};
  return Object.entries(answers)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([key, value]) => ({ key, value }));
}

/** Le produit tel que décrit aux premières étapes (product de ottho.json). */
export function produit(etat) {
  const product = etat?.product ?? {};
  const champ = (key) => (typeof product[key] === "string" && product[key].trim() ? product[key] : null);
  return {
    nom: champ("nom_provisoire"),
    idee: champ("idee"),
    utilisateurs: champ("utilisateurs"),
    alternative: champ("alternative_actuelle"),
    fonction: champ("fonction_principale"),
  };
}
