// Signature bon marché de tout ce qui influence l'état affiché. Recalculée chaque seconde : si elle
// change, l'état est reconstruit et poussé dans le flux SSE.
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
  "package.json",
  "app.json",
];
// Dossiers lus à plat : le nom des entrées et leur date, sans descendre.
const SHALLOW = [SKILLS_DIR, "docs", ".git/refs/heads"];

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

export async function signature(projectDir, now = Date.now()) {
  const parts = await Promise.all([
    ...FILES.map((f) => fileSig(join(projectDir, f))),
    ...SHALLOW.map((d) => shallowSig(join(projectDir, d))),
  ]);
  // La minute courante en fait partie : une exécution d'agent passe « interrompue » après 30 min
  // sans qu'aucun fichier ne bouge.
  parts.push(String(Math.floor(now / 60_000)));
  return parts.join("|");
}
