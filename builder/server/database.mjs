// Base de données de l'application, lue dans les fichiers du projet. Le pipeline mobile ne crée
// aucun backend : l'application se branche sur la base Supabase existante de l'application web du
// client. L'architecte ne conçoit donc pas de schéma, il lit celui qui existe.
//
// Rien ne sort d'ici qu'un secret : l'adresse du projet (sa référence n'est pas un secret) et,
// pour chaque clé attendue, « définie » ou non, jamais sa valeur.
//
// Trois choses sont vérifiées, qui sont les contraintes dures d'une application mobile :
//
//   1. Seule la clé anon ou publishable peut être embarquée. La clé `service_role` est extractible
//      du binaire livré sur les stores : sous un préfixe public (EXPO_PUBLIC_, NEXT_PUBLIC_…) ou
//      dans le dossier de l'application mobile, elle est signalée comme fuite.
//   2. La RLS est la seule frontière réelle entre les données des utilisateurs. Le relevé de la
//      base (docs/base.md, écrit par l'architecte en lisant la base) coche chaque table dont les
//      policies ont été vérifiées ; tant qu'une table reste décochée, la première build ne part pas.
//   3. Aucune migration n'est appliquée sans validation explicite : les migrations présentes dans
//      le projet sont comptées et montrées, jamais jouées.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// Du plus général au plus particulier : le dernier qui définit la variable l'emporte (comme Next,
// Vite, Expo). L'application Expo vit dans `mobile-app/` : ses propres .env l'emportent sur ceux
// de la racine, qui restent lus (un projet peut tenir les deux au même endroit).
const FILES = [
  ".env",
  ".env.development",
  ".env.local",
  ".env.development.local",
  "mobile-app/.env",
  "mobile-app/.env.development",
  "mobile-app/.env.local",
  "mobile-app/.env.development.local",
];
const PUBLIC_PREFIX = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|NUXT_PUBLIC_)/;
const SUPABASE_URL = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|NUXT_PUBLIC_)?SUPABASE_URL$/;
const PUBLISHABLE = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|NUXT_PUBLIC_)?SUPABASE_(?:ANON_KEY|PUBLISHABLE_KEY)$/;
const SERVICE_ROLE = /SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY)$/;
const DATABASE_URL = /^(?:DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|DIRECT_URL)$/;
const SUPABASE_HOST = /^(?:db\.)?([a-z0-9]{20})\.supabase\.(?:co|in)$/;

// Relevé de la base existante, écrit par l'architecte : les tables que l'application lit, cochées
// une fois leurs policies RLS vérifiées.
export const SURVEY_FILE = "docs/base.md";
const TABLES_HEADING_RE = /^#{2,3}\s*(?:\d+[.)]\s*)?Tables lues par l['’]application\b/i;
const SECTION_END_RE = /^(#{1,6}\s|---\s*$)/;
const TABLE_ITEM_RE = /^\s?[-*]\s+\[([ xX])\]\s+`?([A-Za-z_][A-Za-z0-9_.]*)`?/;
// Dossiers où vit le code embarqué dans le binaire livré sur les stores.
const BUNDLED_DIRS = ["mobile-app", "app", "src"];
const MIGRATIONS_DIR = "supabase/migrations";

function parseEnv(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    vars[m[1]] = value;
  }
  return vars;
}

function describe(value, source) {
  if (value.startsWith("file:")) return { kind: "sqlite", project: null, host: value.slice(5), source };
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const ref = SUPABASE_HOST.exec(url.hostname)?.[1] ?? null;
  // Adresse du « pooler » Supabase : le projet est dans l'identifiant (postgres.<ref>), pas le secret.
  const pooled = /\.pooler\.supabase\.com$/.test(url.hostname) ? (/^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username))?.[1] ?? null) : null;
  const project = ref ?? pooled;
  return { kind: project ? "supabase" : url.protocol.startsWith("postgres") ? "postgres" : url.protocol.replace(/:$/, ""), project, host: url.hostname, source };
}

export async function detectAppDatabase(projectDir) {
  let supabase = null;
  let database = null;
  for (const file of FILES) {
    const text = await readFile(join(projectDir, file), "utf8").catch(() => null);
    if (text === null) continue;
    for (const [key, value] of Object.entries(parseEnv(text))) {
      if (!value) continue;
      if (SUPABASE_URL.test(key)) supabase = describe(value, file) ?? supabase;
      else if (DATABASE_URL.test(key)) database = describe(value, file) ?? database;
    }
  }
  return supabase ?? database;
}

/**
 * Les clés Supabase définies dans les .env du projet : « définie » ou non, jamais la valeur.
 * leaks : clés secrètes exposées sous un préfixe public, que le binaire livré embarquerait.
 */
export async function detectKeys(projectDir) {
  let publishable = null;
  let serviceRole = null;
  const leaks = [];
  for (const file of FILES) {
    const text = await readFile(join(projectDir, file), "utf8").catch(() => null);
    if (text === null) continue;
    for (const [key, value] of Object.entries(parseEnv(text))) {
      if (!value) continue;
      if (PUBLISHABLE.test(key)) publishable = { name: key, source: file };
      else if (SERVICE_ROLE.test(key)) {
        serviceRole = { name: key, source: file };
        // Clé secrète sous un préfixe public : elle part dans le bundle, donc dans le binaire.
        if (PUBLIC_PREFIX.test(key)) leaks.push({ name: key, source: file, reason: "préfixe public" });
      }
    }
  }
  return { publishable, serviceRole, leaks };
}

/** Clé `service_role` citée dans le code embarqué (donc extractible du binaire livré). */
export async function scanBundledSecrets(projectDir, dirs = BUNDLED_DIRS) {
  const found = [];
  for (const dir of dirs) {
    let names;
    try {
      names = await readdir(join(projectDir, dir), { recursive: true });
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (!/\.(?:[cm]?[jt]sx?|json)$/i.test(name) || /(?:^|[\\/])node_modules[\\/]/.test(name)) continue;
      const rel = `${dir}/${name.split("\\").join("/")}`;
      const text = await readFile(join(projectDir, dir, name), "utf8").catch(() => null);
      if (text !== null && /SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY)/.test(text)) found.push(rel);
      if (found.length >= 20) return found;
    }
  }
  return found;
}

/**
 * Le relevé de la base existante : les tables que l'application lit et, pour chacune, si ses
 * policies RLS ont été vérifiées. `exists: false` tant que l'architecte n'a pas lu la base.
 */
export async function readSurvey(projectDir) {
  const text = await readFile(join(projectDir, SURVEY_FILE), "utf8").catch(() => null);
  if (text === null) return { exists: false, file: SURVEY_FILE, tables: [] };
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const start = lines.findIndex((l) => TABLES_HEADING_RE.test(l));
  const tables = [];
  if (start !== -1) {
    for (let i = start + 1; i < lines.length && !SECTION_END_RE.test(lines[i]); i++) {
      const m = TABLE_ITEM_RE.exec(lines[i]);
      if (m && !tables.some((t) => t.name === m[2])) tables.push({ name: m[2], rls: m[1] !== " " });
    }
  }
  return { exists: true, file: SURVEY_FILE, tables };
}

/** Migrations présentes dans le projet. Elles sont comptées, jamais appliquées par le Builder. */
export async function listMigrations(projectDir) {
  try {
    return (await readdir(join(projectDir, MIGRATIONS_DIR))).filter((n) => n.endsWith(".sql")).sort();
  } catch {
    return [];
  }
}

/**
 * Tout ce que le panneau « Base de données » montre : la base existante vers laquelle le client
 * pointe, l'état de ses clés, le relevé de son schéma et ses migrations en attente.
 */
export async function readDatabase(projectDir) {
  const [app, keys, survey, migrations, bundled] = await Promise.all([
    detectAppDatabase(projectDir),
    detectKeys(projectDir),
    readSurvey(projectDir),
    listMigrations(projectDir),
    scanBundledSecrets(projectDir),
  ]);
  const leaks = [...keys.leaks, ...bundled.map((file) => ({ name: "SUPABASE_SERVICE_ROLE_KEY", source: file, reason: "code embarqué" }))];
  const unchecked = survey.tables.filter((t) => !t.rls).map((t) => t.name);
  return {
    app,
    // Clés : « définie » ou non, jamais la valeur.
    publishable: keys.publishable,
    serviceRole: keys.serviceRole,
    // Clé secrète que le binaire livré sur les stores embarquerait : interdit, sans exception.
    leaks,
    survey,
    // Tables lues par l'application dont les policies RLS ne sont pas encore vérifiées.
    unchecked,
    migrations,
  };
}
