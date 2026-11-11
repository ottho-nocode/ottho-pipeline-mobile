import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { APP_NAME, BASE_PORT, main, probe, resolveOptions } from "./cli.mjs";
import { tempDir } from "./tmpdirs.mjs";

async function projet(prefix = "opm-cli-") {
  const dir = await tempDir(prefix);
  await mkdir(join(dir, "scripts"), { recursive: true });
  await writeFile(join(dir, "scripts", "ottho-parcours.mjs"), 'export const ETAPES = [{ "id": "00-bienvenue", "condition": "toujours", "minutes": 5 }];\n');
  return dir;
}

test("resolveOptions : valeurs par défaut, port 4337 (jamais celui du Builder web)", () => {
  assert.equal(BASE_PORT, 4337);
  assert.deepEqual(resolveOptions([], "/p"), { projectDir: "/p", pluginDir: undefined, port: 4337, open: true, reopen: false, idleExitMs: null, sessions: [] });
});

test("resolveOptions : toutes les options", () => {
  assert.deepEqual(resolveOptions(["--project", "app", "--plugin", "p", "--port", "5000", "--no-open", "--reopen", "--idle-exit", "30", "--session", "abc-123"], "/p"), {
    projectDir: "/p/app",
    pluginDir: "/p/p",
    port: 5000,
    open: false,
    reopen: true,
    idleExitMs: 1_800_000,
    sessions: ["abc-123"],
  });
});

test("resolveOptions : option inconnue refusée, port et idle-exit invalides expliqués", () => {
  assert.throws(() => resolveOptions(["--inconnue", "/x"], "/p"));
  assert.throws(() => resolveOptions(["--port", "abc"], "/p"), /port/);
  for (const bad of ["0", "-5", "abc", ""]) assert.throws(() => resolveOptions(["--idle-exit", bad], "/p"), /idle-exit/, bad);
});

test("main : le mode est choisi d'après le projet, et rien ne s'écrit dans le dépôt du parcours", async (t) => {
  const parcours = await projet();
  const vueParcours = await main(["--project", parcours, "--port", "4396", "--no-open"], { log: () => {} });
  t.after(() => vueParcours.close());
  assert.equal(vueParcours.mode, "parcours");
  // Un projet quelconque ouvre le pipeline d'agents.
  const pipeline = await main(["--project", await tempDir("opm-pipe-cli-"), "--port", "4397", "--no-open"], { log: () => {} });
  t.after(() => pipeline.close());
  assert.equal(pipeline.mode, "pipeline");
});

test("brief : refusée sur un projet du parcours (son cadrage vit dans ses étapes)", async () => {
  const parcours = await projet();
  await assert.rejects(main(["brief", "--project", parcours, "--json", "x.json"], { log: () => {} }), /projet du parcours/);
});

test("brief : écrit docs/brief.md d'un projet du pipeline depuis un JSON", async () => {
  const dir = await tempDir("opm-brief-");
  const data = join(dir, "brief.json");
  await writeFile(data, JSON.stringify({ name: "Suivi de chantier", domaine: { domaine: "BTP" } }));
  const logs = [];
  assert.equal(await main(["brief", "--project", dir, "--json", data], { log: (m) => logs.push(m) }), null);
  assert.match(logs.at(-1), /brief\.md écrit \(incomplet/);
  assert.match(await readFile(join(dir, "docs", "brief.md"), "utf8"), /Suivi de chantier/);
});

test("probe : port libre, et port tenu par autre chose que nous", async (t) => {
  // Port haut sur lequel rien n'écoute : « free », et non une réponse inconnue.
  assert.equal(await probe(4489), "free");
  const dir = await projet();
  const app = await main(["--project", dir, "--port", "4391", "--no-open"], { log: () => {} });
  t.after(() => app.close());
  assert.deepEqual(await probe(4391), { app: "ottho-pipeline-mobile", project: dir });
});

test("main réutilise l'instance déjà ouverte sur le même projet", async (t) => {
  const dir = await projet();
  const logs = [];
  const args = ["--project", dir, "--port", "4392", "--no-open"];
  const first = await main(args, { log: (m) => logs.push(m) });
  t.after(() => first.close());
  assert.equal(logs.at(-1), `${APP_NAME} prêt : http://127.0.0.1:4392`);
  const second = await main(args, { log: (m) => logs.push(m) });
  assert.equal(second, null);
  assert.equal(logs.at(-1), `${APP_NAME} déjà ouvert : http://127.0.0.1:4392`);
});

test("main : port occupé par un autre projet, le Builder prend le suivant", async (t) => {
  const a = await projet();
  const b = await projet();
  const premier = await main(["--project", a, "--port", "4393", "--no-open"], { log: () => {} });
  t.after(() => premier.close());
  const logs = [];
  const second = await main(["--project", b, "--port", "4393", "--no-open"], { log: (m) => logs.push(m) });
  t.after(() => second?.close());
  assert.equal(second.port, 4394);
  assert.equal(logs.at(-1), `${APP_NAME} prêt : http://127.0.0.1:4394`);
});

test("--reopen : retrouve l'instance du projet sans rien lancer, sinon explique comment la lancer", async (t) => {
  const dir = await projet();
  const logs = [];
  await assert.rejects(main(["--project", dir, "--port", "4395", "--reopen", "--no-open"], { log: (m) => logs.push(m) }), /ne tourne pas pour ce projet/);

  const app = await main(["--project", dir, "--port", "4395", "--no-open"], { log: () => {} });
  t.after(() => app.close());
  const rien = await main(["--project", dir, "--port", "4395", "--reopen", "--no-open"], { log: (m) => logs.push(m) });
  assert.equal(rien, null);
  assert.equal(logs.at(-1), `${APP_NAME} déjà ouvert : http://127.0.0.1:4395`);
});
