import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveFeatures, readSnapshot, usKey, reviewVerdict, specTitle, validationVerdict } from "./features.mjs";
import { tempDir } from "./tmpdirs.mjs";

function snap(over = {}) {
  return {
    specs: new Set(),
    plans: new Set(),
    reviews: new Map(),
    validations: new Map(),
    e2e: new Set(),
    titles: new Map(),
    git: { branches: [], base: "develop", subjects: [], baseSubjects: [], current: "" },
    ...over,
  };
}
const run = (agent, us, state = "done", extra = {}) => ({
  id: null, agent, source: "plugin", us, branch: null,
  start: "2026-09-26T10:00:00Z", end: state === "done" ? "2026-09-26T10:05:00Z" : null,
  next: null, verdict: null, state, ...extra,
});
const one = (s, runs = []) => deriveFeatures(s, runs).features[0];

test("usKey normalise et ignore les faux positifs", () => {
  assert.equal(usKey("feature/US-3-paiement"), "US-03");
  assert.equal(usKey("US-012"), "US-12");
  assert.equal(usKey("US-100"), "US-100");
  assert.equal(usKey("BONUS-3"), null);
  assert.equal(usKey(null), null);
});

test("reviewVerdict : la dernière occurrence gagne", () => {
  assert.equal(reviewVerdict("Verdict : APPROUVÉ"), "ok");
  assert.equal(reviewVerdict("APPROUVÉ / CORRECTIONS REQUISES\n\nVerdict : CORRECTIONS REQUISES"), "ko");
  assert.equal(reviewVerdict("brouillon"), null);
});

test("specTitle : titre du markdown, sinon slug du fichier", () => {
  assert.equal(specTitle("# US-03 — Paiement Stripe\n", "US-03-x.md"), "Paiement Stripe");
  assert.equal(specTitle("", "US-04-export-csv.md"), "export csv");
});

test("spec seule → spec fait, prochain agent architect", () => {
  const f = one(snap({ specs: new Set(["US-01"]) }));
  assert.equal(f.columns.spec, "done");
  assert.equal(f.columns.plan, "todo");
  assert.deepEqual(f.next, { agent: "architect", reason: "todo" });
});

test("agent actif → colonne en cours et bandeau « running »", () => {
  const s = snap({ plans: new Set(["US-01"]) });
  const f = one(s, [run("spec-writer", "US-01", "running")]);
  assert.equal(f.columns.spec, "running");
  assert.deepEqual(f.next, { agent: "spec-writer", reason: "running" });
  assert.equal(f.agents["spec-writer"], "running");
});

test("commit feat(US-XX) → code fait ; branche seule → code en cours mais developer à lancer", () => {
  const base = { specs: new Set(["US-01"]), plans: new Set(["US-01"]) };
  const withCommit = one(snap({ ...base, git: { ...snap().git, subjects: ["feat(US-01): formulaire"] } }));
  assert.equal(withCommit.columns.code, "done");
  const branchOnly = one(snap({ ...base, git: { ...snap().git, branches: ["develop", "feature/US-01-inscription"] } }));
  assert.equal(branchOnly.columns.code, "running");
  assert.deepEqual(branchOnly.next, { agent: "developer", reason: "todo" });
});

test("review en échec → ✗ et developer en correction", () => {
  const f = one(snap({
    specs: new Set(["US-01"]), plans: new Set(["US-01"]),
    reviews: new Map([["US-01", "ko"]]),
    git: { ...snap().git, subjects: ["feat(US-01): x"] },
  }));
  assert.equal(f.columns.review, "ko");
  assert.deepEqual(f.next, { agent: "developer", reason: "fix" });
});

test("tests : ROUGES → ✗ ; VERTS + fichier e2e → fait ; VERTS sans e2e → à faire", () => {
  const base = {
    specs: new Set(["US-01"]), plans: new Set(["US-01"]), reviews: new Map([["US-01", "ok"]]),
    git: { ...snap().git, subjects: ["feat(US-01): x"] },
  };
  const rouge = one(snap(base), [run("validateur", "US-01", "done", { verdict: "ROUGES" })]);
  assert.equal(rouge.columns.tests, "ko");
  const vert = one(snap({ ...base, e2e: new Set(["US-01"]) }), [run("validateur", "US-01", "done", { verdict: "VERTS" })]);
  assert.equal(vert.columns.tests, "done");
  assert.equal(vert.agents.validateur, "done");
  const sansE2e = one(snap(base), [run("validateur", "US-01", "done", { verdict: "VERTS" })]);
  assert.equal(sansE2e.columns.tests, "todo");
});

test("merge : commits présents sur la base → fait ; tout fait → next null", () => {
  const f = one(snap({
    specs: new Set(["US-01"]), plans: new Set(["US-01"]), reviews: new Map([["US-01", "ok"]]), e2e: new Set(["US-01"]),
    git: { ...snap().git, subjects: ["feat(US-01): x"], baseSubjects: ["feat(US-01): x"] },
  }), [run("validateur", "US-01", "done", { verdict: "VERTS" })]);
  assert.equal(f.columns.merge, "done");
  assert.equal(f.next, null);
});

test("merge à faire → soumission", () => {
  const f = one(snap({
    specs: new Set(["US-01"]), plans: new Set(["US-01"]), reviews: new Map([["US-01", "ok"]]), e2e: new Set(["US-01"]),
    git: { ...snap().git, subjects: ["feat(US-01): x"] },
  }), [run("validateur", "US-01", "done", { verdict: "VERTS" })]);
  assert.deepEqual(f.next, { agent: "soumission", reason: "todo" });
});

test("sans Git → code et merge indisponibles", () => {
  const f = one(snap({ specs: new Set(["US-01"]), git: null }));
  assert.equal(f.columns.code, "na");
  assert.equal(f.columns.merge, "na");
});

test("run interrompu : ni en cours ni fait", () => {
  const f = one(snap({ specs: new Set(["US-01"]) }), [run("architect", "US-01", "interrupted")]);
  assert.equal(f.columns.plan, "todo");
  assert.equal(f.agents.architect, "interrupted");
});

test("liste = union specs, plans, branches, triée par numéro ; focus = activité récente", () => {
  const s = snap({
    specs: new Set(["US-10"]), plans: new Set(["US-02"]),
    git: { ...snap().git, branches: ["feature/US-05-x"] },
  });
  const { features, focus } = deriveFeatures(s, [run("architect", "US-10")]);
  assert.deepEqual(features.map((f) => f.us), ["US-02", "US-05", "US-10"]);
  assert.equal(focus, "US-10");
});

const deliv = (agent, validated, us = "US-01") => ({ us, agent, file: `x/${us}.md`, validated, validatedAt: null });

test("validation : spec à valider tant que le plan n'est pas fait, puis architect", () => {
  const s = snap({ specs: new Set(["US-01"]) });
  const { features, deliverables } = deriveFeatures(s, [], [deliv("spec-writer", false)]);
  assert.deepEqual(features[0].next, { agent: "spec-writer", reason: "validate" });
  assert.equal(deliverables[0].blocking, true);
  assert.deepEqual(deriveFeatures(s, [], [deliv("spec-writer", true)]).features[0].next, { agent: "architect", reason: "todo" });
});

test("validation : une étape déjà dépassée ne bloque plus (ancien projet)", () => {
  const s = snap({ specs: new Set(["US-01"]), plans: new Set(["US-01"]) });
  const { features, deliverables } = deriveFeatures(s, [], [deliv("spec-writer", false)]);
  assert.deepEqual(features[0].next, { agent: "developer", reason: "todo" });
  assert.equal(deliverables[0].blocking, false);
});

test("validation : maquette après la spec ; plan non validé bloque developer même si la branche existe", () => {
  const s = snap({ specs: new Set(["US-01"]) });
  const both = [deliv("spec-writer", true), deliv("designer", false)];
  assert.deepEqual(deriveFeatures(s, [], both).features[0].next, { agent: "designer", reason: "validate" });
  const planned = snap({ specs: new Set(["US-01"]), plans: new Set(["US-01"]), git: { ...snap().git, branches: ["feature/US-01-x"] } });
  const f = deriveFeatures(planned, [], [deliv("spec-writer", true), deliv("architect", false)]).features[0];
  assert.equal(f.columns.code, "running");
  assert.deepEqual(f.next, { agent: "architect", reason: "validate" });
});

test("validation : un agent en cours reste prioritaire ; livrable sans feature jamais bloquant", () => {
  const s = snap({ specs: new Set(["US-01"]) });
  const { features, deliverables } = deriveFeatures(s, [run("designer", "US-01", "running")], [deliv("spec-writer", false), deliv("spec-writer", false, "US-09")]);
  assert.deepEqual(features[0].next, { agent: "designer", reason: "running" });
  assert.equal(deliverables[1].blocking, false);
});

test("validationVerdict : la preuve du client, cochée écran par écran", () => {
  const liste = "## À vérifier sur ton téléphone\n\n- [x] **AC1** — Tu vois tes chantiers.\n- [x] **AC2** — L'état vide s'affiche.\n";
  assert.equal(validationVerdict(`${liste}\n## Verdict du client\n\n- Verdict : VERTS\n- Date : 2026-11-10\n`), "ok");
  assert.equal(validationVerdict(`${liste}\n## Verdict du client\n\n- Verdict : ROUGES\n- Date : 2026-11-10\n`), "ko");
  // Le client n'a pas encore essayé : pas de verdict, donc rien de prouvé.
  assert.equal(validationVerdict(`${liste}\n## Verdict du client\n\n- Verdict : <à venir>\n`), null);
  // Verdict VERTS mais un point encore décoché : la liste n'est pas finie.
  assert.equal(validationVerdict(`- [x] AC1\n- [ ] AC2\n\n- Verdict : VERTS\n`), null);
  assert.equal(validationVerdict(""), null);
});

test("colonne Validation : la preuve enregistrée dans reviews/ fait foi, sans journal des agents", async () => {
  const dir = await tempDir("op-valid-");
  await mkdir(join(dir, "specs"), { recursive: true });
  await mkdir(join(dir, "plans"), { recursive: true });
  await mkdir(join(dir, "reviews"), { recursive: true });
  await writeFile(join(dir, "specs", "US-01-connexion.md"), "# US-01 — Connexion\n");
  await writeFile(join(dir, "plans", "US-01-connexion.md"), "# Plan US-01\n");
  await writeFile(join(dir, "reviews", "US-01-connexion-review.md"), "Verdict : APPROUVÉ\n");
  // Pas encore de validation : la colonne reste à faire.
  let snap = await readSnapshot(dir);
  assert.equal(snap.reviews.get("US-01"), "ok");
  assert.equal(deriveFeatures(snap, []).features[0].columns.tests, "todo");

  // Le client a coché sa liste et donné son verdict : la colonne passe, sans aucun événement d'agent.
  await writeFile(
    join(dir, "reviews", "US-01-connexion-validation.md"),
    "## À vérifier sur ton téléphone\n\n- [x] AC1 — Tu vois tes chantiers.\n\n## Verdict du client\n\n- Verdict : VERTS\n- Date : 2026-11-10\n",
  );
  snap = await readSnapshot(dir);
  assert.equal(snap.validations.get("US-01"), "ok");
  // Le fichier de validation ne doit pas être pris pour la revue.
  assert.equal(snap.reviews.get("US-01"), "ok");
  assert.equal(deriveFeatures(snap, []).features[0].columns.tests, "done");

  // Verdict ROUGES : à corriger, et la prochaine étape repart chez developer.
  await writeFile(join(dir, "reviews", "US-01-connexion-validation.md"), "- [x] AC1\n\n- Verdict : ROUGES\n");
  const f = deriveFeatures(await readSnapshot(dir), []).features[0];
  assert.equal(f.columns.tests, "ko");
  assert.deepEqual(f.next, { agent: "developer", reason: "fix" });
});
