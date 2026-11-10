import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createDemoProject } from "../scripts/demo-fixture.mjs";
import { REPRENDRE, recommencer } from "../web/src/prompts";

// La vue est en lecture seule : ses actions sont des prompts copiés pour le terminal Claude.
// Le presse-papiers du navigateur de test (en mémoire) doit donc être lisible.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

type Builder = { proc: ChildProcess; url: string };

// Lance le Builder sur un projet et attend son adresse (ligne « prêt : http://… »).
async function startBuilder(project: string, port: number): Promise<Builder> {
  const proc = spawn(process.execPath, ["bin/cli.mjs", "--project", project, "--port", String(port), "--no-open"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const url = await new Promise<string>((ok, ko) => {
    let out = "";
    // Pas prêt en 15 s : arrêté (aucun processus orphelin sur le port).
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

// Clic sur un bouton « Copier… » : renvoie le texte copié, le presse-papiers vidé d'abord.
async function copyFrom(page: Page, button: Locator): Promise<string> {
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await button.click();
  return page.evaluate(() => navigator.clipboard.readText());
}

let projet: string;
let builder: Builder | undefined;

test.beforeAll(async () => {
  projet = await createDemoProject();
  builder = await startBuilder(projet, 4399);
});

test.afterAll(async () => {
  await stopBuilder(builder);
});

test.beforeEach(async ({ page }) => {
  await page.goto(builder!.url);
  await expect(page.locator(".chemin")).toBeVisible();
});

test("le chemin montre les 34 étapes, leur acte et leur état", async ({ page }) => {
  // Cinq actes, dans l'ordre du parcours.
  await expect(page.locator(".acte__nom")).toHaveText(["Avant de coder", "Construire", "Avant de publier", "Publier", "Après"]);

  // L'acte de l'étape courante est déplié, les autres sont des lignes de pastilles.
  const premier = page.locator(".acte").first();
  await expect(premier.locator(".acte__tete")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".acte").nth(1).locator(".acte__tete")).toHaveAttribute("aria-expanded", "false");

  // Avancement : les étapes sautées et écartées sortent des totaux.
  await expect(page.locator(".chemin__compte")).toContainText("3 étapes sur 31");

  // Les 34 étapes sont là, repliées ou non.
  const titres = await page.locator(".etape__titre, .pastille-btn .sr-only").count();
  expect(titres).toBeGreaterThanOrEqual(34);
});

test("l'étape courante est mise en avant, avec le prompt à coller", async ({ page }) => {
  const carte = page.locator(".etape-carte.is-courante");
  await expect(carte.locator("h2")).toHaveText("Ta machine est prête");
  await expect(carte).toContainText("Avant de coder");
  await expect(carte).toContainText("en cours");
  await expect(carte).toContainText("Compte 1 h");

  // Le prompt copié est celui qui relance le parcours dans le terminal.
  expect(await copyFrom(page, carte.getByRole("button", { name: /Copier « \/ottho »/ }))).toBe(REPRENDRE);

  // Le bandeau du haut dit la même chose, au même endroit, quoi qu'il arrive.
  await expect(page.locator(".banner").last()).toContainText("Ta machine est prête");
});

test("une étape faite montre sa preuve, une étape bloquée sa raison", async ({ page }) => {
  const faite = page.locator(".etape.is-done").first();
  await expect(faite.locator(".etape__etat")).toHaveText("faite");
  await expect(faite.locator(".etape__preuve")).toContainText("5 branches enregistrees");

  const bloquee = page.locator(".etape.is-blocked").first();
  await expect(bloquee.locator(".etape__raison")).toContainText("justificatif de domicile");

  // Le blocage remonte aussi dans la colonne de gauche, avec sa raison.
  await expect(page.locator(".bloc-list__raison")).toContainText("justificatif de domicile");
});

test("les étapes écartées par les réponses sont à part, jamais mélangées au reste", async ({ page }) => {
  // L'acte « Construire » contient l'étape « sans compte », écartée puisque l'app a des comptes.
  await page.getByRole("button", { name: /^Construire,.*Déplier\.$/ }).click();
  const ecartees = page.locator(".acte__ecartees").first();
  await expect(ecartees.locator("h4")).toHaveText("Selon tes réponses, ces étapes ne te concernent pas");
  await expect(ecartees.locator(".etape__titre")).toHaveText("Ton application s'ouvre sans créer de compte");
  await expect(ecartees.locator(".etape__etat")).toHaveText("selon tes réponses");

  // Et « Tes choix » dit pourquoi, en toutes lettres.
  await expect(page.locator(".choix-list li", { hasText: "Paiement dans l'application" })).toContainText("non");
});

test("la fiche d'une étape : son état, sa preuve, son texte, et le prompt pour la refaire", async ({ page }) => {
  const faite = page.locator(".etape.is-done").first();
  await faite.click();
  const panel = page.locator(".etape-panel");
  await expect(panel.locator("h2")).toHaveText("Bienvenue, on fait connaissance");
  await expect(panel.locator(".etape-panel__num")).toHaveText("Étape 00");
  await expect(panel.locator(".preuve")).toContainText("5 branches enregistrees");

  // Le texte de l'étape (son SKILL.md) se lit sur demande, jamais chargé d'office.
  await expect(panel.locator(".etape-panel__skill")).toHaveCount(0);
  await panel.getByRole("button", { name: "Lire la fiche de l'étape" }).click();
  await expect(panel.locator(".etape-panel__skill")).toContainText("Comprendre ou tu en es");

  expect(await copyFrom(page, panel.getByRole("button", { name: /Copier « recommencer »/ }))).toBe(recommencer("00-bienvenue"));
});

test("la fabrication Expo : ce qui partirait, et ce qui vient encore du modèle", async ({ page }) => {
  const fabrication = page.locator("section", { has: page.getByRole("heading", { name: /Ta fabrication/ }) }).last();
  await expect(fabrication.locator(".alerte")).toContainText("encore celles du modèle");
  await expect(fabrication.locator(".fabrique", { hasText: "Nom de l'application" })).toContainText("Mon salon");
  const slug = fabrication.locator(".fabrique", { hasText: "Identifiant court" });
  await expect(slug).toHaveClass(/is-heritee/);
  await expect(slug.locator(".fabrique__tag")).toHaveText("encore celle du modèle");
  await expect(fabrication.locator(".fabrique__eas")).toContainText("Projet EAS pas encore relié");
  await expect(fabrication.locator(".fabrique__eas")).toContainText("development, preview, production");
});

test("la vue suit ottho.json sans rien écrire : une étape validée dans le terminal remonte seule", async ({ page }) => {
  const fichier = join(projet, "ottho.json");
  const avant = await readFile(fichier, "utf8");
  const etat = JSON.parse(avant);
  // Ce que Claude écrit dans le terminal quand la personne a fini son étape.
  etat.steps["04-ta-machine"] = { status: "done", updated_at: new Date().toISOString(), proof: "node -v répond v22.20.0" };
  etat.history.push({ at: new Date().toISOString(), step: "04-ta-machine", status: "done", proof: "node -v répond v22.20.0" });
  etat.current_step = "05-ton-materiel";
  writeFileSync(fichier, JSON.stringify(etat, null, 2));

  await expect(page.locator(".etape-carte.is-courante h2")).toHaveText("Tu peux tester sur un vrai téléphone", { timeout: 10_000 });
  await expect(page.locator(".chemin__compte")).toContainText("4 étapes sur 31");
  await expect(page.locator(".journal")).toContainText("node -v répond v22.20.0");

  // Remise en l'état : le test suivant retrouve le projet de démo tel quel.
  writeFileSync(fichier, avant);
  await expect(page.locator(".etape-carte.is-courante h2")).toHaveText("Ta machine est prête", { timeout: 10_000 });
});

test("replier un acte le garde replié après une mise à jour de l'état", async ({ page }) => {
  await page.getByRole("button", { name: /^Avant de coder,.*Replier\.$/ }).click();
  await expect(page.locator(".acte").first().locator(".acte__tete")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".acte").first().locator(".acte__pastilles")).toBeVisible();

  await page.reload();
  await expect(page.locator(".acte").first().locator(".acte__tete")).toHaveAttribute("aria-expanded", "false");
});

test("une question posée dans le terminal est signalée au-dessus de l'étape", async ({ page }) => {
  const notif = page.locator(".notif--ask");
  await expect(notif).toContainText("Claude attend ta réponse dans ton terminal");
  await expect(notif.locator("li")).toHaveText("Tu veux publier sur iPhone, sur Android, ou les deux ?");
});
