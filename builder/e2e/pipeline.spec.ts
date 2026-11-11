import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createPipelineDemoProject } from "../scripts/demo-pipeline.mjs";

// Le pipeline d'agents mobile, sur un projet qui n'est pas un projet du parcours : les huit agents
// dans leurs cinq phases, la table des features, le panneau de livrables, celui de la base
// existante et celui de la version.
//
// Pendant de e2e/parcours.spec.ts, qui couvre la vue du parcours en 34 étapes. Les deux vues
// tournent sur le même Builder, et aucune ne doit déteindre sur l'autre.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

type Builder = { proc: ChildProcess; url: string };

// Services : jamais la vraie configuration Claude Code de la machine.
async function startBuilder(project: string, port: number, home: string, plugin: string): Promise<Builder> {
  const proc = spawn(process.execPath, ["bin/cli.mjs", "--project", project, "--plugin", plugin, "--port", String(port), "--no-open"], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, OTTHO_MOBILE_CLAUDE_CONFIG: join(project, "absent.json"), OTTHO_MOBILE_HOME: home },
  });
  const url = await new Promise<string>((ok, ko) => {
    let out = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      ko(new Error(`Builder pas prêt en 15 s : ${out}`));
    }, 15_000);
    proc.stdout!.on("data", (d) => {
      out += String(d);
      const m = /prêt : (http:\/\/\S+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        ok(m[1]);
      }
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      ko(new Error(`Builder arrêté avant d'être prêt (code ${code}) : ${out}`));
    });
  });
  return { proc, url };
}

async function stopBuilder(builder: Builder | undefined) {
  if (!builder || builder.proc.exitCode !== null || builder.proc.signalCode !== null) return;
  const exited = new Promise((ok) => builder.proc.once("exit", ok));
  builder.proc.kill();
  await exited;
}

// Un agent se choisit en cliquant sa carte dans le graphe.
const carte = (page: Page, nom: string) => page.locator(`.agent-node[data-agent="${nom}"]`);
// Le titre d'une colonne du graphe : son numéro d'ordre et son nom.
const phase = (page: Page, nom: string) => page.locator(".phase-label").filter({ hasText: nom });

let builder: Builder | undefined;
let dir: string;
let home: string;

test.beforeAll(async () => {
  dir = await createPipelineDemoProject();
  home = await mkdtemp(join(tmpdir(), "opm-home-"));
  builder = await startBuilder(dir, 4398, home, join(dir, "fake-plugin"));
  // baseURL de cette suite : 4398 pris par autre chose, les tests viseraient le mauvais Builder.
  if (builder.url !== "http://127.0.0.1:4398") {
    await stopBuilder(builder);
    throw new Error(`Port 4398 occupé : le Builder a démarré sur ${builder.url}`);
  }
});

test.afterAll(async () => {
  await stopBuilder(builder);
  for (const d of [dir, home]) if (d) rmSync(d, { recursive: true, force: true });
});

test("les huit agents, rangés dans les cinq phases du pipeline mobile", async ({ page }) => {
  await page.goto("/");
  for (const [nom, index] of [["Specify", "01"], ["Plan", "02"], ["Implement", "03"], ["Validate", "04"], ["Release", "05"]]) {
    await expect(phase(page, nom)).toBeVisible();
    await expect(phase(page, nom)).toContainText(index);
  }
  for (const agent of ["brainstorming", "spec-writer", "designer", "architect", "developer", "code-reviewer", "validateur", "soumission"]) {
    await expect(carte(page, agent)).toBeVisible();
  }
  // Les agents du pipeline web n'existent pas ici.
  for (const absent of ["tester", "devops", "doc-writer"]) {
    await expect(page.locator(`.agent-node[data-agent="${absent}"]`)).toHaveCount(0);
  }
});

test("la table des features : six colonnes, dont Validation, tenue par validateur", async ({ page }) => {
  await page.goto("/");
  const table = page.getByLabel("Avancement des features");
  for (const col of ["Spec", "Plan", "Code", "Review", "Validation", "Merge"]) {
    await expect(table.getByRole("columnheader", { name: col, exact: true })).toBeVisible();
  }
  // US-01 : cycle complet, la validation est faite. US-03 : spec seule.
  await expect(table.getByLabel("Validation : fait")).toHaveCount(1);
  await expect(table.getByRole("button", { name: "US-01", exact: true })).toBeVisible();
  await expect(table.getByRole("button", { name: "US-03", exact: true })).toBeVisible();
});

test("le panneau de livrables : la spec validée se relit, sa question répondue est consignée", async ({ page }) => {
  await page.goto("/");
  await carte(page, "spec-writer").click();
  const colonne = page.getByLabel("Livrables et questions");
  await expect(colonne.getByRole("heading", { name: "Livrable" })).toBeVisible();
  await expect(colonne.locator(".deliv__file")).toHaveText("specs/US-02-liste-chantiers.md");
  await expect(colonne.getByText(/Validé le/)).toBeVisible();
  // La réponse donnée par l'utilisateur est lisible, la question en attente aussi.
  await expect(colonne.getByText(/Faut-il voir les chantiers archivés/)).toBeVisible();
  await expect(colonne.getByText(/en lecture seule, depuis le cache/)).toBeVisible();
});

test("le panneau de base de données : la base existante, l'état des clés, les tables et leur RLS", async ({ page }) => {
  await page.goto("/");
  const base = page.getByLabel("Base de données");
  await expect(base.getByRole("heading", { name: /Base de données/ })).toBeVisible();
  await expect(base.getByText("existante")).toBeVisible();
  // L'adresse du projet, jamais une valeur de clé.
  await expect(base.getByText("demoprojetwebabcdefg").first()).toBeVisible();
  await expect(base.getByText(/EXPO_PUBLIC_SUPABASE_ANON_KEY/)).toBeVisible();
  await expect(base.getByText(/Seule une clé anon ou publishable peut être embarquée/)).toBeVisible();
  await expect(base.getByText("cle-publique-de-demo")).toHaveCount(0);
  // Le relevé : une table vérifiée, une qui attend ses policies.
  await expect(base.getByText(/profiles/).first()).toBeVisible();
  await expect(base.getByText(/RLS à vérifier/)).toBeVisible();
  await expect(base.getByText(/La RLS est la seule frontière réelle/)).toBeVisible();
});

test("le panneau de version : ce que la fabrication Expo embarquera, sans valeur héritée", async ({ page }) => {
  await page.goto("/");
  await carte(page, "soumission").click();
  const fabrication = page.getByLabel("Ta fabrication");
  await expect(fabrication.getByText("Chantiers", { exact: true })).toBeVisible();
  await expect(fabrication.getByText("co.exemple.chantiers", { exact: true }).first()).toBeVisible();
  await expect(fabrication.getByText("AB12CD34EF")).toBeVisible();
  await expect(fabrication.getByText(/Projet EAS relié/)).toBeVisible();
  await expect(fabrication.getByText(/development, preview, production/)).toBeVisible();
  // Lu dans l'application, pas dans un modèle : rien n'est signalé comme hérité.
  await expect(fabrication.getByText("encore celle du modèle")).toHaveCount(0);
  await expect(fabrication.getByText("mobile-app/app.json")).toBeVisible();
});

test("la prochaine étape et le journal des agents suivent le projet", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Prochaine étape/).first()).toBeVisible();
  const journal = page.getByLabel("Journal des agents");
  await expect(journal.getByText(/validateur/).first()).toBeVisible();
  await expect(journal.getByText("VERTS").first()).toBeVisible();
});

test("rien de la vue du parcours ne déteint sur le pipeline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ton parcours")).toHaveCount(0);
  await expect(page.getByText(/étapes sur/)).toHaveCount(0);
  await expect(page.getByLabel("Ton étape et tes choix")).toHaveCount(0);
});
