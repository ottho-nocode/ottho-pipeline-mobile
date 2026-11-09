// Branche Git du projet et nombre de fichiers non commités, pour la barre du haut. null si le
// dossier n'est pas un dépôt.
// execFile (pas de shell) : aucun argument n'est interprété. --no-optional-locks : git status ne
// réécrit pas .git/index, que surveille la signature. windowsHide : le Builder tourne sans console
// sous Windows, chaque git y ouvrirait une fenêtre.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

async function git(cwd, args) {
  const { stdout } = await run("git", ["--no-optional-locks", ...args], { cwd, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  return stdout.trim();
}

export async function readBranch(cwd) {
  try {
    await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return null;
  }
  const [current, changes] = await Promise.all([
    git(cwd, ["branch", "--show-current"]).catch(() => ""),
    git(cwd, ["status", "--porcelain", "--untracked-files=normal"]).catch(() => ""),
  ]);
  return { name: current || null, dirty: changes.split("\n").filter(Boolean).length };
}
