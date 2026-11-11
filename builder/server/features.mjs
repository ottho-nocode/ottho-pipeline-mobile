// Déduit l'état de chaque feature US-XX. Les fichiers et Git font foi ; les runs
// ne servent qu'à l'état « en cours » et au verdict de la validation.
//
// La colonne `tests` du pipeline mobile est tenue par `validateur`, pas par `tester` : la
// validation n'est pas une suite automatisée mais la liste écran par écran que le client coche sur
// son propre téléphone, dont le verdict est enregistré comme preuve.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readGit } from "./git.mjs";

export const COLUMNS = ["spec", "plan", "code", "review", "tests", "merge"];
const COLUMN_AGENT = { spec: "spec-writer", plan: "architect", code: "developer", review: "code-reviewer", tests: "validateur" };
// Livrables à valider (cf. deliverables.mjs) : colonne qui, une fois faite, lève le blocage.
const VALIDATION_GATE = { "spec-writer": "plan", designer: "plan", architect: "code" };
const VALIDATION_ORDER = Object.keys(VALIDATION_GATE);
const US_RE = /(?<![A-Za-z])US-0*(\d{1,4})/i;
const CODE_COMMIT_RE = /^(?:feat|fix|refactor|perf)\((US-0*\d{1,4})\)/i;

export function usKey(text) {
  const m = US_RE.exec(text ?? "");
  return m ? `US-${m[1].padStart(2, "0")}` : null;
}

export function reviewVerdict(text) {
  const ok = text.lastIndexOf("APPROUVÉ");
  const ko = text.lastIndexOf("CORRECTIONS REQUISES");
  if (ok === -1 && ko === -1) return null;
  return ko > ok ? "ko" : "ok";
}

// Fichier de validation d'une feature : reviews/US-XX-<slug>-validation.md, écrit par `validateur`.
export const VALIDATION_RE = /^US-\d+.*-validation\.md$/i;
const VERDICT_RE = /^\s*[-*]?\s*Verdict\s*:\s*(VERTS|ROUGES)\b/gim;
const UNCHECKED_RE = /^\s*[-*]\s+\[ \]\s+/m;

/**
 * Verdict de la validation : « ok » quand le client a coché toute sa liste et que son verdict est
 * VERTS, « ko » quand il est ROUGES, null tant qu'il n'a pas encore essayé.
 *
 * C'est la seule preuve que la phase Validate ait : pas de simulateur, pas d'émulateur, l'œil du
 * client sur son propre téléphone. Elle est lue dans le fichier, pas dans le journal des agents :
 * une trace que personne n'a écrite ne prouve rien, et les fichiers font foi.
 */
export function validationVerdict(text) {
  const verdicts = [...text.matchAll(VERDICT_RE)];
  const last = verdicts.at(-1)?.[1];
  if (last === "ROUGES") return "ko";
  if (last !== "VERTS") return null;
  // Verdict VERTS mais un point encore décoché : la liste n'est pas finie.
  return UNCHECKED_RE.test(text) ? null : "ok";
}

export function specTitle(text, fileName) {
  const heading = /^#\s+(.+)$/m.exec(text)?.[1] ?? "";
  const cleaned = heading.replace(/^US-\d+\s*[—–:-]?\s*/i, "").trim();
  if (cleaned) return cleaned;
  return fileName.replace(/\.md$/i, "").replace(/^US-\d+-?/i, "").replace(/-/g, " ").trim();
}

export async function filesByUs(dir, keep = () => true) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return new Map();
  }
  const map = new Map();
  for (const name of names.sort()) {
    if (!/^US-\d+/i.test(name) || !keep(name)) continue;
    const key = usKey(name);
    if (!map.has(key)) map.set(key, name);
  }
  return map;
}

export async function readSnapshot(projectDir) {
  const [specs, plans, reviewFiles, validationFiles, e2e, git] = await Promise.all([
    filesByUs(join(projectDir, "specs")),
    filesByUs(join(projectDir, "plans")),
    // Revues et validations vivent dans le même dossier : chacune ne prend que ses fichiers.
    filesByUs(join(projectDir, "reviews"), (n) => !VALIDATION_RE.test(n)),
    filesByUs(join(projectDir, "reviews"), (n) => VALIDATION_RE.test(n)),
    filesByUs(join(projectDir, "e2e")),
    readGit(projectDir),
  ]);
  const reviews = new Map();
  for (const [key, name] of reviewFiles) {
    reviews.set(key, reviewVerdict(await readFile(join(projectDir, "reviews", name), "utf8").catch(() => "")));
  }
  // Verdict du client, écran par écran, enregistré par `validateur`.
  const validations = new Map();
  for (const [key, name] of validationFiles) {
    validations.set(key, validationVerdict(await readFile(join(projectDir, "reviews", name), "utf8").catch(() => "")));
  }
  const titles = new Map();
  for (const [key, name] of specs) {
    titles.set(key, specTitle(await readFile(join(projectDir, "specs", name), "utf8").catch(() => ""), name));
  }
  return { specs: new Set(specs.keys()), plans: new Set(plans.keys()), reviews, validations, e2e: new Set(e2e.keys()), titles, git };
}

function gitIndex(git) {
  const branchUs = new Set();
  const commitUs = new Set();
  const mergedUs = new Set();
  if (!git) return { branchUs, commitUs, mergedUs };
  for (const b of git.branches) if (b.startsWith("feature/") && usKey(b)) branchUs.add(usKey(b));
  for (const s of git.subjects) {
    const m = CODE_COMMIT_RE.exec(s);
    if (m) commitUs.add(usKey(m[1]));
  }
  for (const s of git.baseSubjects) if (usKey(s)) mergedUs.add(usKey(s));
  return { branchUs, commitUs, mergedUs };
}

const num = (us) => Number(us.slice(3));

export function deriveFeatures(snap, runs, deliverables = []) {
  const git = snap.git;
  const idx = gitIndex(git);
  const keys = new Set([...snap.specs, ...snap.plans, ...snap.reviews.keys(), ...idx.branchUs]);
  const features = [...keys]
    .sort((a, b) => num(a) - num(b))
    .map((us) => {
      const usRuns = runs.filter((r) => r.us === us);
      const running = (agent) => usRuns.some((r) => r.agent === agent && r.state === "running");
      // Preuve enregistrée par `validateur` dans reviews/ ; à défaut, le verdict de son dernier
      // passage (le journal des agents, quand les hooks du plugin ont tourné).
      const validation = snap.validations?.get(us) ?? null;
      const lastTests = usRuns.findLast((r) => r.agent === "validateur" && r.verdict)?.verdict ?? null;
      const review = snap.reviews.get(us);
      const columns = {
        spec: running("spec-writer") ? "running" : snap.specs.has(us) ? "done" : "todo",
        plan: running("architect") ? "running" : snap.plans.has(us) ? "done" : "todo",
        code: !git ? "na"
          : running("developer") ? "running"
          : idx.commitUs.has(us) ? "done"
          : idx.branchUs.has(us) ? "running"
          : "todo",
        review: running("code-reviewer") ? "running" : review === "ok" ? "done" : review === "ko" ? "ko" : "todo",
        tests: running("validateur") ? "running"
          : validation === "ko" || lastTests === "ROUGES" ? "ko"
          : validation === "ok" ? "done"
          : lastTests === "VERTS" && snap.e2e.has(us) ? "done"
          : "todo",
        merge: !git || !git.base ? "na" : idx.commitUs.has(us) && idx.mergedUs.has(us) ? "done" : "todo",
      };
      // Un livrable non validé bloque tant que l'étape qui le suit n'est pas faite.
      const toValidate = VALIDATION_ORDER.filter((agent) =>
        deliverables.some((d) => d.us === us && d.agent === agent && !d.validated && !["done", "na"].includes(columns[VALIDATION_GATE[agent]])),
      );
      return {
        us,
        title: snap.titles.get(us) ?? "",
        columns,
        next: nextStep(columns, usRuns, toValidate),
        agents: agentStates(columns, usRuns),
        toValidate,
      };
    });
  const byUs = new Map(features.map((f) => [f.us, f]));
  return {
    features,
    focus: pickFocus(features, runs),
    // Niveau projet : la charte attend sa validation tant qu'elle n'est pas validée ; le PRD
    // et l'architecture seulement tant que le projet n'a pas de feature et que l'étape
    // suivante n'est pas faite (un projet déjà lancé n'est pas bloqué après coup).
    deliverables: deliverables.map((d) => ({
      ...d,
      blocking:
        d.us === null
          ? !d.validated &&
            (d.kind === "charte" ||
              (snap.specs.size === 0 && (d.kind !== "prd" || !deliverables.some((x) => x.kind === "architecture"))))
          : Boolean(byUs.get(d.us)?.toValidate.includes(d.agent)),
    })),
  };
}

// Un agent qui tourne prime ; puis un livrable à valider ; sinon la première colonne non faite.
function nextStep(columns, usRuns, toValidate = []) {
  const active = usRuns.findLast((r) => r.state === "running");
  if (active) return { agent: active.agent, reason: "running" };
  if (toValidate.length) return { agent: toValidate[0], reason: "validate" };
  const col = COLUMNS.find((c) => columns[c] !== "done" && columns[c] !== "na");
  if (!col) return null;
  if (columns[col] === "ko") return { agent: "developer", reason: "fix" };
  return { agent: COLUMN_AGENT[col] ?? "soumission", reason: "todo" };
}

function agentStates(columns, usRuns) {
  const states = {};
  for (const r of usRuns) states[r.agent] = r.state; // ordre chronologique : le dernier état gagne
  for (const [col, agent] of Object.entries(COLUMN_AGENT)) {
    if (columns[col] === "done" && states[agent] !== "running") states[agent] = "done";
  }
  return states;
}

function pickFocus(features, runs) {
  const unfinished = new Set(features.filter((f) => f.next).map((f) => f.us));
  const recent = runs.findLast((r) => r.us && unfinished.has(r.us));
  return recent?.us ?? features.find((f) => f.next)?.us ?? features.at(-1)?.us ?? null;
}
