// Phase projet, avant la première feature : Brief → Vision → PRD → Design → Architecture → Base →
// 1re feature (skill project-bootstrap du plugin). Chaque étape est lue dans les fichiers
// du projet et le journal des agents ; un agent de l'étape qui tourne sans feature la met
// « en cours ». Un projet qui a déjà des features n'a plus de prochaine étape projet.
//
// Le pipeline mobile n'a pas d'agent `devops` : l'étape « Infra » du pipeline web devient
// « Base », et elle ne crée rien. L'application mobile se branche sur la base Supabase de
// l'application web du client : l'étape est faite quand cette base est branchée (son adresse est
// lue dans les .env du projet par database.mjs), et c'est `architect` qui la lit.
import { stat } from "node:fs/promises";
import { join } from "node:path";

const has = (projectDir, rel) => stat(join(projectDir, rel)).then(() => true, () => false);

export async function projectPhase({ projectDir, snap, runs, deliverables, brief, database = null }) {
  const project = runs.filter((r) => r.us === null);
  const running = (agent) => project.some((r) => r.agent === agent && r.state === "running");
  const done = (agent) => project.some((r) => r.agent === agent && r.state === "done");
  const doc = (kind) => deliverables.find((d) => d.kind === kind) ?? null;
  const prd = doc("prd");
  const architecture = doc("architecture");
  const charte = doc("charte");
  const vision = await has(projectDir, "docs/vision.md");
  const features = snap.specs.size > 0;
  const livrable = (d) => (d ? (d.validated ? "done" : "validate") : "todo");
  // Brief incomplet mais projet déjà plus loin (vision, PRD…) : il n'est plus la prochaine étape.
  const beyondBrief = done("brainstorming") || vision || Boolean(prd || charte || architecture);
  const stages = [
    { key: "brief", label: "Brief", agent: null, state: brief.complete || beyondBrief ? "done" : brief.exists ? "started" : "todo" },
    { key: "vision", label: "Vision", agent: "brainstorming", state: running("brainstorming") ? "running" : done("brainstorming") || vision || prd ? "done" : "todo" },
    { key: "prd", label: "PRD", agent: "spec-writer", state: running("spec-writer") ? "running" : livrable(prd) },
    // Design (charte, zoning des écrans clés en 390 x 844) avant l'architecture ; déjà architecturé
    // sans design (projet commencé avant) : l'étape ne bloque pas.
    { key: "design", label: "Design", agent: "designer", state: running("designer") ? "running" : charte ? livrable(charte) : architecture ? "done" : "todo" },
    { key: "architecture", label: "Architecture", agent: "architect", state: running("architect") ? "running" : livrable(architecture) },
    // Base existante branchée : l'adresse du projet Supabase du client est lue dans les .env.
    { key: "base", label: "Base", agent: "architect", state: database ? "done" : "todo" },
    { key: "features", label: "1re feature", agent: "spec-writer", state: features ? "done" : "todo" },
  ];
  const next = features ? null : (stages.find((s) => s.state === "running") ?? stages.find((s) => s.state !== "done") ?? null);
  return { stages, next: next ? { key: next.key, agent: next.agent, state: next.state } : null };
}
