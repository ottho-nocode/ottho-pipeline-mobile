// Ce que la fabrication Expo embarquera, lu dans le projet : nom, version, identifiants iOS et
// Android, équipe Apple, projet EAS, profils de build.
//
// Deux fichiers portent tout : `site-config.ts` à la racine (source unique, relue par
// mobile-app/app.config.ts au moment du « Read app config » d'EAS Build) et `mobile-app/eas.json`
// (les profils). Le premier est du TypeScript : il est lu par expression régulière sur les clés
// simples, jamais importé ni exécuté.
//
// Le parcours fait partir l'élève d'un modèle. Tant qu'une valeur est encore celle du modèle, elle
// est signalée : c'est exactement ce que demandent les étapes « Ton projet t'appartient vraiment »
// et « Ton application a un nom et une identité ».
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SITE_CONFIG = "site-config.ts";
export const EAS_FILE = join("mobile-app", "eas.json");
export const APP_CONFIG = join("mobile-app", "app.config.ts");

// Valeurs du modèle dont part le parcours. Une valeur encore identique n'appartient pas à l'élève.
const HERITAGE = new Set([
  "NowStack",
  "nowstack",
  "mobile.aiblueprint.dev",
  "dev.melvynx.nowstack",
  "UUFHFWGCU4",
  "6e0db714-6ada-41eb-b74d-22e7e7039802",
]);

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
export const estHeritee = (valeur) => valeur !== null && (HERITAGE.has(valeur) || valeur.startsWith("xxxxxxxx"));

/**
 * Ce que le build Expo embarquera, ou `{ present: false }` si le projet n'a pas d'application Expo
 * (dossier mobile-app absent, ou site-config.ts illisible).
 */
export async function readExpo(projectDir) {
  const [site, eas, appConfig] = await Promise.all([
    readFile(join(projectDir, SITE_CONFIG), "utf8").catch(() => null),
    readFile(join(projectDir, EAS_FILE), "utf8").catch(() => null),
    readFile(join(projectDir, APP_CONFIG), "utf8").catch(() => null),
  ]);
  if (site === null && eas === null && appConfig === null) return { present: false };

  const champs = CHAMPS.map(({ key, label }) => {
    const valeur = lireChamp(site, key);
    return { key, label, valeur, heritee: estHeritee(valeur) };
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
