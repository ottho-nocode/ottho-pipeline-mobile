// Signature bon marché de tout ce qui influence l'état affiché. Recalculée chaque seconde : si elle
// change, l'état est reconstruit et poussé dans le flux SSE.
//
// Les deux modes du Builder sont surveillés d'un seul coup : les fichiers du parcours (ottho.json,
// la carte des étapes, la configuration Expo) et ceux du pipeline (specs, plans, reviews, livrables
// de projet, .env). Un projet n'a jamais les deux, et un chemin absent coûte un stat qui échoue.
//
// Les 95 skills du parcours ne sont pas parcourues en profondeur : seule la liste des dossiers de
// .agents/skills compte (une étape qui apparaît ou disparaît), pas le contenu de chaque fichier.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { ETAT_FILE } from "./etat.mjs";
import { EAS_FILE, SITE_CONFIG } from "./expo.mjs";
import { PARCOURS_FILE, SKILLS_DIR } from "./parcours.mjs";

const FILES = [
  ETAT_FILE,
  PARCOURS_FILE,
  SITE_CONFIG,
  EAS_FILE,
  ".claude/pipeline-events.jsonl",
  ".git/HEAD",
  ".git/index",
  ".git/packed-refs",
  ".git/logs/HEAD",
  "package.json",
  "app.json",
  "app.config.ts",
  // Pipeline : livrables de niveau projet et configuration des services de l'app.
  "docs/PRD.md",
  "docs/brief.md",
  "docs/vision.md",
  "docs/architecture.md",
  "docs/devops.md",
  "CLAUDE.md",
  ".mcp.json",
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
];
// Dossiers lus à plat : le nom des entrées et leur date, sans descendre.
const SHALLOW = [SKILLS_DIR, "docs", ".git/refs/heads"];
// Dossiers du pipeline, lus en profondeur : le contenu de chaque livrable compte (la validation
// vit dans son « Historique », le verdict d'une revue dans son texte).
const DEEP = ["specs", "design", "plans", "reviews", "e2e", "docs/questions", ".claude/agents"];

async function fileSig(path) {
  try {
    const s = await stat(path);
    return `${s.size}:${s.mtimeMs}`;
  } catch {
    return "-";
  }
}

async function shallowSig(path) {
  let names;
  try {
    names = await readdir(path);
  } catch {
    return "-";
  }
  const info = await stat(path).catch(() => null);
  return `${names.length}:${info ? info.mtimeMs : "-"}:${names.sort().join(",")}`;
}

async function deepSig(path) {
  let names;
  try {
    names = await readdir(path, { recursive: true });
  } catch {
    return "-";
  }
  const parts = await Promise.all(names.sort().map(async (n) => `${n}=${await fileSig(join(path, n))}`));
  return parts.join(",");
}

export async function signature(projectDir, now = Date.now()) {
  const parts = await Promise.all([
    ...FILES.map((f) => fileSig(join(projectDir, f))),
    ...SHALLOW.map((d) => shallowSig(join(projectDir, d))),
    ...DEEP.map((d) => deepSig(join(projectDir, d))),
  ]);
  // La minute courante en fait partie : une exécution d'agent passe « interrompue » après 30 min
  // sans qu'aucun fichier ne bouge.
  parts.push(String(Math.floor(now / 60_000)));
  return parts.join("|");
}
