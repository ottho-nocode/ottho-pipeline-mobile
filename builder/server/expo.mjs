// Ce que la fabrication Expo embarquera, lu dans le projet : nom, version, identifiants iOS et
// Android, équipe Apple, projet EAS, profils de build. C'est le panneau de version : la soumission
// n'est pas une colonne de user story, c'est une étape de version.
//
// La source change selon le mode du Builder (voir server/app.mjs) :
//
//   - parcours : `site-config.ts` à la racine (source unique du modèle dont part l'élève, relue par
//     mobile-app/app.config.ts au moment du « Read app config » d'EAS Build). Le parcours fait
//     partir d'un modèle : tant qu'une valeur est encore celle du modèle, elle est signalée, ce que
//     demandent les étapes « Ton projet t'appartient vraiment » et « Ton application a un nom ».
//   - pipeline : `app.config.ts` ou `app.json` de l'application, qui n'a pas de modèle derrière
//     elle. La notion de valeur héritée n'a donc plus de sens : il reste les champs Expo, les
//     profils de `eas.json` et le lien EAS.
//
// Dans les deux cas, `mobile-app/eas.json` porte les profils. Les fichiers TypeScript sont lus par
// expression régulière sur les clés simples, jamais importés ni exécutés : un `app.config.ts` est
// une fonction, et le Builder ne charge aucun code du dépôt qu'il observe.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SITE_CONFIG = "site-config.ts";
export const EAS_FILE = join("mobile-app", "eas.json");
export const APP_CONFIG = join("mobile-app", "app.config.ts");
// Pipeline : l'application Expo peut vivre dans mobile-app/ ou à la racine, et porter sa
// configuration en TypeScript (app.config.ts) ou en JSON (app.json). Le premier trouvé l'emporte.
export const PIPELINE_CONFIGS = [
  join("mobile-app", "app.config.ts"),
  join("mobile-app", "app.config.js"),
  join("mobile-app", "app.json"),
  "app.config.ts",
  "app.config.js",
  "app.json",
];

// Valeurs du modèle dont part le parcours. Une valeur encore identique n'appartient pas à l'élève.
//
// Ces valeurs ne sont pas recopiées ici : elles sont lues dans le détecteur d'héritage du dépôt du
// parcours, qui en est la source unique (tableau `HERITAGE_PATTERNS`). Le fichier est lu en texte,
// jamais importé ni exécuté, comme site-config.ts. Un projet sans ce fichier ne fait signaler que
// le gabarit laissé en place : ce Builder ne porte dans son code l'identité de personne.
export const HERITAGE_SOURCE = join("scripts", "ottho-heritage.mjs");

// Gabarit livré en place d'une valeur que la personne doit créer elle-même (le projet EAS).
const GABARIT = "xxxxxxxx";

// Un motif plus court serait trop ambigu pour être cherché dans la valeur d'un champ.
const MOTIF_MIN = 4;

const MOTIF_RE = /(?:^|[\s{,])["']?pattern["']?\s*:\s*(["'`])((?:\\.|(?!\1).)*)\1/gm;

/** Les motifs du modèle déclarés par le détecteur du projet, en minuscules. */
export function lireMotifs(source) {
  const motifs = [];
  if (typeof source !== "string") return motifs;
  for (const m of source.matchAll(MOTIF_RE)) {
    if (m[2].length >= MOTIF_MIN) motifs.push(m[2].toLowerCase());
  }
  return motifs;
}

const CHAMPS = [
  { key: "title", label: "Nom de l'application" },
  { key: "slug", label: "Identifiant court (slug)" },
  { key: "version", label: "Version" },
  { key: "bundleId", label: "Identifiant iOS" },
  { key: "androidPackage", label: "Identifiant Android" },
  { key: "appleTeamId", label: "Équipe Apple" },
  { key: "easProjectId", label: "Projet EAS" },
];

/** Valeur d'une clé simple de site-config.ts (chaîne entre guillemets), ou null. */
export function lireChamp(source, key) {
  const re = new RegExp(`(^|[\\s{,])${key}\\s*:\\s*(["'\`])((?:\\\\.|(?!\\2).)*)\\2`, "m");
  const m = re.exec(source ?? "");
  return m ? m[3] : null;
}

/** Une valeur est-elle encore celle du modèle (ou le gabarit « xxxxxxxx » laissé en place) ? */
export function estHeritee(valeur, motifs = []) {
  if (valeur === null) return false;
  if (valeur.startsWith(GABARIT)) return true;
  const valeurBasse = valeur.toLowerCase();
  return motifs.some((motif) => valeurBasse.includes(motif));
}

// Chemin d'une valeur dans la configuration Expo, pour chaque champ affiché.
const EXPO_PATH = {
  title: ["name"],
  slug: ["slug"],
  version: ["version"],
  bundleId: ["ios", "bundleIdentifier"],
  androidPackage: ["android", "package"],
  easProjectId: ["extra", "eas", "projectId"],
};

const dig = (obj, path) => path.reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);

/** La configuration Expo d'un projet du pipeline, lue en JSON ou par expression régulière. */
function lireConfigExpo(source, file) {
  let data = null;
  if (file.endsWith(".json")) {
    try {
      const lu = JSON.parse(source);
      data = lu?.expo && typeof lu.expo === "object" ? lu.expo : lu;
    } catch {
      // app.json en cours d'écriture ou cassé : on retombe sur la lecture par clés.
    }
  }
  return Object.fromEntries(
    Object.entries(EXPO_PATH).map(([key, path]) => {
      const fromJson = data ? dig(data, path) : undefined;
      if (typeof fromJson === "string" && fromJson) return [key, fromJson];
      // app.config.ts : la dernière clé du chemin suffit (bundleIdentifier, package, projectId…).
      return [key, lireChamp(source, path.at(-1))];
    }),
  );
}

/** L'équipe Apple vit dans les profils de soumission de eas.json, pas dans la configuration Expo. */
function lireAppleTeam(eas) {
  if (eas === null) return null;
  try {
    for (const profil of Object.values(JSON.parse(eas)?.submit ?? {})) {
      const team = profil?.ios?.appleTeamId;
      if (typeof team === "string" && team) return team;
    }
  } catch {
    // eas.json en cours d'écriture ou cassé : on tente la lecture par clé.
  }
  return lireChamp(eas, "appleTeamId");
}

/**
 * Ce que le build Expo embarquera, ou `{ present: false }` si le projet n'a pas d'application Expo.
 *
 * mode « parcours » : lu dans site-config.ts, valeurs encore héritées du modèle signalées.
 * mode « pipeline » : lu dans app.config.ts ou app.json, sans notion d'héritage.
 */
export async function readExpo(projectDir, mode = "parcours") {
  if (mode === "pipeline") return readExpoPipeline(projectDir);
  const [site, eas, appConfig, detecteur] = await Promise.all([
    readFile(join(projectDir, SITE_CONFIG), "utf8").catch(() => null),
    readFile(join(projectDir, EAS_FILE), "utf8").catch(() => null),
    readFile(join(projectDir, APP_CONFIG), "utf8").catch(() => null),
    readFile(join(projectDir, HERITAGE_SOURCE), "utf8").catch(() => null),
  ]);
  if (site === null && eas === null && appConfig === null) return { present: false };

  const motifs = lireMotifs(detecteur);
  const champs = CHAMPS.map(({ key, label }) => {
    const valeur = lireChamp(site, key);
    return { key, label, valeur, heritee: estHeritee(valeur, motifs) };
  });

  let profils = [];
  let versionSource = null;
  if (eas !== null) {
    try {
      const lu = JSON.parse(eas);
      profils = Object.keys(lu?.build ?? {}).filter((nom) => nom !== "base");
      versionSource = typeof lu?.cli?.appVersionSource === "string" ? lu.cli.appVersionSource : null;
    } catch {
      // eas.json en cours d'écriture ou cassé : pas de profils, le reste reste lisible.
    }
  }

  const easProjectId = champs.find((c) => c.key === "easProjectId");
  return {
    present: true,
    config: site !== null ? SITE_CONFIG : null,
    easFile: eas !== null ? EAS_FILE : null,
    champs,
    profils,
    versionSource,
    // Projet EAS relié : condition d'un `eas build`, et ce que l'étape « tes comptes » met en place.
    relie: Boolean(easProjectId?.valeur) && !easProjectId.heritee,
    // Au moins une valeur encore héritée du modèle : la fabrication partirait sous l'identité d'un autre.
    heritage: champs.filter((c) => c.heritee).map((c) => c.key),
  };
}

async function readExpoPipeline(projectDir) {
  let config = null;
  let source = null;
  for (const rel of PIPELINE_CONFIGS) {
    const text = await readFile(join(projectDir, rel), "utf8").catch(() => null);
    if (text !== null) {
      config = rel;
      source = text;
      break;
    }
  }
  const eas = await readFile(join(projectDir, EAS_FILE), "utf8").catch(() => null);
  if (source === null && eas === null) return { present: false };

  const lu = source === null ? {} : lireConfigExpo(source, config);
  const appleTeamId = eas === null ? null : lireAppleTeam(eas);
  const champs = CHAMPS.map(({ key, label }) => ({
    key,
    label,
    valeur: (key === "appleTeamId" ? appleTeamId : lu[key]) ?? null,
    // Pas de modèle derrière une application du pipeline : rien n'est hérité.
    heritee: false,
  }));

  let profils = [];
  let versionSource = null;
  if (eas !== null) {
    try {
      const json = JSON.parse(eas);
      profils = Object.keys(json?.build ?? {}).filter((nom) => nom !== "base");
      versionSource = typeof json?.cli?.appVersionSource === "string" ? json.cli.appVersionSource : null;
    } catch {
      // eas.json en cours d'écriture ou cassé : pas de profils, le reste reste lisible.
    }
  }

  return {
    present: true,
    config,
    easFile: eas !== null ? EAS_FILE : null,
    champs,
    profils,
    versionSource,
    // Projet EAS relié : condition d'un `eas build`, et ce que l'agent soumission met en place.
    relie: Boolean(champs.find((c) => c.key === "easProjectId")?.valeur),
    heritage: [],
  };
}
