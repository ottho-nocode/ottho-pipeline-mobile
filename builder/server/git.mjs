// Lecture de Git, sans rien y écrire. Deux usages :
//   - readBranch : branche courante et nombre de fichiers non commités, pour la barre du haut
//     (vue du parcours, qui n'a pas besoin de plus) ;
//   - readGit : instantané complet (branches, sujets de commits, base) dont le pipeline déduit
//     l'état des colonnes Code et Merge de chaque feature.
// null si le dossier n'est pas un dépôt.
// execFile (pas de shell) : aucun argument n'est interprété. --no-optional-locks : git status ne
// réécrit pas .git/index, que surveille la signature (sinon chaque lecture déclencherait la
// suivante). windowsHide : le Builder tourne sans console sous Windows, chaque git y ouvrirait une
// fenêtre.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

async function git(cwd, args) {
  const { stdout } = await run("git", ["--no-optional-locks", ...args], { cwd, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  return stdout.trim();
}

const isRepo = async (cwd) => {
  try {
    await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
};

export async function readBranch(cwd) {
  if (!(await isRepo(cwd))) return null;
  const [current, changes] = await Promise.all([
    git(cwd, ["branch", "--show-current"]).catch(() => ""),
    git(cwd, ["status", "--porcelain", "--untracked-files=normal"]).catch(() => ""),
  ]);
  return { name: current || null, dirty: changes.split("\n").filter(Boolean).length };
}

export async function readGit(cwd) {
  if (!(await isRepo(cwd))) return null;
  const lines = async (args) => (await git(cwd, args).catch(() => "")).split("\n").filter(Boolean);
  const branches = await lines(["branch", "--format=%(refname:short)"]);
  const base = branches.includes("develop") ? "develop" : branches.includes("main") ? "main" : null;
  const [subjects, baseSubjects, current, changes] = await Promise.all([
    lines(["log", "--all", "--format=%s", "--max-count=5000"]),
    base ? lines(["log", base, "--format=%s", "--max-count=5000"]) : [],
    git(cwd, ["branch", "--show-current"]).catch(() => ""),
    // Fichiers modifiés ou nouveaux, pas encore commités (fichiers ignorés exclus).
    lines(["status", "--porcelain", "--untracked-files=normal"]),
  ]);
  return { branches, base, subjects, baseSubjects, current, dirty: changes.length };
}
