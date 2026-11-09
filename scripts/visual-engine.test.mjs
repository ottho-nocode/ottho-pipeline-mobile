import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_LABEL, NOT_FOUND, NOT_STARTED, PORTS, UNSAFE, engineOf, estProjetParcours, main, parsePorts, pluginRootOf, shellQuote } from "./visual-engine.mjs";

const SCRIPT = fileURLToPath(new URL("./visual-engine.mjs", import.meta.url));
const PLUGIN = dirname(dirname(SCRIPT));
// Les vrais Builders de l'utilisateur écoutent sur 4337 à 4346 : jamais sondés ici.
const assertTestPort = (port) => assert.ok(!PORTS.includes(port), `port réservé aux vrais Builders : ${port}`);

async function freePort() {
  const port = await new Promise((res, rej) => {
    const s = createNetServer().on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const { port: p } = s.address();
      s.close(() => res(p));
    });
  });
  assertTestPort(port);
  return port;
}

// Faux Builder dans ce processus : répond au health pour ce projet.
async function fakeBuilder(project, { app = "ottho-pipeline-mobile" } = {}) {
  const vues = [];
  const server = createServer((req, res) => {
    vues.push(req.url);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, app, project }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  assertTestPort(port);
  return {
    port,
    vues,
    url: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise((r) => server.close(r));
    },
  };
}

// Fausse CLI du Builder : note son lancement, puis répond au health pour son --project.
const FAKE_CLI = `import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
const argv = process.argv.slice(2);
appendFileSync(process.env.FAKE_RECORD, JSON.stringify({ argv, pid: process.pid, cwd: process.cwd() }) + "\\n");
console.log("faux Builder");
setTimeout(() => process.exit(0), 20000); // filet : jamais de processus orphelin durable
if (process.env.FAKE_MODE === "crash") { console.error("faux Builder : échec"); process.exit(1); }
const project = argv[argv.indexOf("--project") + 1];
createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, app: "ottho-pipeline-mobile", project }));
}).listen(Number(process.env.FAKE_PORT), "127.0.0.1");
`;

// Projet du parcours temporaire, faux dossier personnel, fausse CLI du Builder.
async function setup(t, { files = { "scripts/ottho-parcours.mjs": "export const ETAPES = [];" }, mode } = {}) {
  const root = await mkdtemp(join(tmpdir(), "opm-engine-"));
  const dir = join(root, "projet");
  await mkdir(dir);
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, rel);
    await mkdir(content === null ? path : dirname(path), { recursive: true });
    if (content !== null) await writeFile(path, content);
  }
  const cli = join(root, "fake-cli.mjs");
  await writeFile(cli, FAKE_CLI);
  const record = join(root, "record.json");
  const port = await freePort();
  const env = { HOME: root, OTTHO_PARCOURS_CLI: cli, CLAUDE_PROJECT_DIR: dir, FAKE_RECORD: record, FAKE_PORT: String(port) };
  if (mode) env.FAKE_MODE = mode;
  t.after(async () => {
    for (const { pid } of launches(record)) {
      try {
        process.kill(pid);
      } catch {
        // déjà arrêtée
      }
    }
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  });
  return { root, dir, cli, record, port, env };
}

const sessionStart = (cwd, source = "startup") => JSON.stringify({ session_id: "s1", hook_event_name: "SessionStart", source, cwd });
const launches = (record) => (existsSync(record) ? readFileSync(record, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

test("estProjetParcours : les marqueurs du parcours, jamais ceux du Builder web ni un dossier vide", async (t) => {
  const ctx = await setup(t, { files: {} });
  const env = { HOME: ctx.root };
  // Dossier vide : pas un projet du parcours (le Builder web, lui, s'y ouvre).
  assert.equal(estProjetParcours(ctx.dir, env), false);
  // Marqueurs du Builder web : sans effet ici, les deux Builders ne se marchent pas dessus.
  await mkdir(join(ctx.dir, "docs"), { recursive: true });
  await writeFile(join(ctx.dir, "docs", "brief.md"), "# Brief");
  assert.equal(estProjetParcours(ctx.dir, env), false);

  for (const marqueur of ["scripts/ottho-parcours.mjs", "ottho.json", ".agents/skills/ottho/SKILL.md"]) {
    const dir = join(ctx.root, `p-${marqueur.replace(/\W/g, "-")}`);
    await mkdir(join(dir, dirname(marqueur)), { recursive: true });
    await writeFile(join(dir, marqueur), "x");
    assert.equal(estProjetParcours(dir, env), true, marqueur);
  }
  // Le dossier personnel, où Claude Code s'ouvre souvent sans projet.
  await writeFile(join(ctx.root, "ottho.json"), "{}");
  assert.equal(estProjetParcours(ctx.root, env), false);
});

test("Builder déjà lancé pour le projet : adresse et contexte, rien n'est lancé ni écrit", async (t) => {
  const ctx = await setup(t);
  const builder = await fakeBuilder(ctx.dir);
  t.after(builder.close);
  const out = JSON.parse(await main({ stdin: sessionStart("/ailleurs"), env: ctx.env, ports: [ctx.port, builder.port] }));
  assert.equal(out.systemMessage, `${APP_LABEL} : ${builder.url}`);
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  const context = out.hookSpecificOutput.additionalContext;
  assert.match(context, /en lecture seule/);
  assert.match(context, /Il n'écrit rien/);
  assert.ok(context.includes(builder.url));
  assert.ok(context.includes(`node '${join(PLUGIN, "scripts", "visual-engine.mjs")}' --open --project '${ctx.dir}'`));
  // La session est inscrite auprès du Builder (il s'arrêtera avec elle).
  assert.ok(builder.vues.some((u) => u.includes("session=s1")), "session inscrite");
  assert.ok(!existsSync(ctx.record), "la fausse CLI n'a pas été lancée");
  assert.ok(!existsSync(join(ctx.dir, ".claude")));
});

test("Builder absent : lancé détaché avec les bons arguments, journal et verrou dans .claude", async (t) => {
  const ctx = await setup(t);
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port] }));
  assert.equal(out.systemMessage, `${APP_LABEL} : http://127.0.0.1:${ctx.port}`);
  const [lance] = launches(ctx.record);
  // Pas de --plugin : le Builder du parcours n'en a pas besoin, ses étapes vivent dans le projet.
  assert.deepEqual(lance.argv, ["--project", ctx.dir, "--idle-exit", "30", "--session", "s1"]);
  assert.ok(existsSync(join(ctx.dir, ".claude", "ottho-parcours.log")));
  // Verrou retiré une fois le Builder debout.
  assert.ok(!existsSync(join(ctx.dir, ".claude", "ottho-parcours.lock")));
});

test("source compact ou clear : lancé sans ouvrir le navigateur", async (t) => {
  const ctx = await setup(t);
  await main({ stdin: sessionStart(ctx.dir, "compact"), env: ctx.env, ports: [ctx.port] });
  assert.ok(launches(ctx.record)[0].argv.includes("--no-open"));
});

test("dossier qui n'est pas un projet du parcours : rien, pas un mot", async (t) => {
  const ctx = await setup(t, { files: {} });
  assert.equal(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port] }), "");
  assert.equal(launches(ctx.record).length, 0);
});

test("plugin incomplet (bin/cli.mjs absent) : message clair, rien n'est lancé", async (t) => {
  const ctx = await setup(t);
  const env = { ...ctx.env, OTTHO_PARCOURS_CLI: join(ctx.root, "absent.mjs") };
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env, ports: [ctx.port] }));
  assert.equal(out.systemMessage, NOT_FOUND);
  assert.equal(launches(ctx.record).length, 0);
});

test("Builder qui s'arrête aussitôt : on le dit, et le journal reste à lire", async (t) => {
  const ctx = await setup(t, { mode: "crash" });
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port], waitMs: 1500 }));
  assert.equal(out.systemMessage, NOT_STARTED);
  assert.match(readFileSync(join(ctx.dir, ".claude", "ottho-parcours.log"), "utf8"), /échec/);
});

test(".claude en lien symbolique (dépôt piégé) : refus, rien n'est écrit ni lancé", async (t) => {
  const ctx = await setup(t);
  const ailleurs = join(ctx.root, "ailleurs");
  await mkdir(ailleurs);
  await symlink(ailleurs, join(ctx.dir, ".claude"));
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [ctx.port] }));
  assert.equal(out.systemMessage, UNSAFE);
  assert.equal(launches(ctx.record).length, 0);
  assert.ok(!existsSync(join(ailleurs, "ottho-parcours.log")));
});

test("--end : la session est retirée du Builder, rien n'est lancé", async (t) => {
  const ctx = await setup(t);
  const recu = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      recu.push({ url: req.url, method: req.method, body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, app: "ottho-pipeline-mobile", project: ctx.dir }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  t.after(() => new Promise((r) => server.close(r)));

  assert.equal(await main({ argv: ["--end"], stdin: sessionStart(ctx.dir), env: ctx.env, ports: [port] }), "");
  const fin = recu.find((r) => r.url === "/api/session-end");
  assert.ok(fin, "fin de session envoyée");
  assert.deepEqual(JSON.parse(fin.body), { project: ctx.dir, session: "s1" });
  assert.equal(launches(ctx.record).length, 0);
});

test("--open (commande /parcours) : ouvre le navigateur sur le Builder qui tourne, sortie en une ligne", async (t) => {
  const ctx = await setup(t, { files: {} }); // même hors projet du parcours
  const builder = await fakeBuilder(ctx.dir);
  t.after(builder.close);
  const ouverts = [];
  const out = await main({ argv: ["--open", "--project", ctx.dir], env: ctx.env, ports: [builder.port], open: (u) => ouverts.push(u) });
  assert.equal(out, `${APP_LABEL} : ${builder.url}\n`);
  assert.deepEqual(ouverts, [builder.url]);
});

test("--open : dossier introuvable, dit en une ligne, rien n'est sondé", async (t) => {
  const ctx = await setup(t);
  const absent = join(ctx.root, "nulle-part");
  assert.equal(await main({ argv: ["--open", "--project", absent], env: ctx.env, ports: [ctx.port] }), `${APP_LABEL} : dossier de projet introuvable : ${absent}\n`);
});

test("un Builder web sur un port sondé n'est jamais pris pour le nôtre", async (t) => {
  const ctx = await setup(t);
  const web = await fakeBuilder(ctx.dir, { app: "ottho-pipeline" });
  t.after(web.close);
  const out = JSON.parse(await main({ stdin: sessionStart(ctx.dir), env: ctx.env, ports: [web.port, ctx.port] }));
  // Le nôtre a été lancé malgré la réponse du Builder web.
  assert.equal(out.systemMessage, `${APP_LABEL} : http://127.0.0.1:${ctx.port}`);
  assert.equal(launches(ctx.record).length, 1);
});

test("engineOf, pluginRootOf, parsePorts, shellQuote", async (t) => {
  const ctx = await setup(t);
  assert.deepEqual(engineOf(ctx.env), { node: process.execPath, cli: ctx.cli });
  assert.equal(engineOf({ OTTHO_PARCOURS_CLI: join(ctx.root, "absent.mjs") }), null);
  // Le Builder livré avec ce plugin existe bien à sa place.
  assert.deepEqual(engineOf({}, PLUGIN), { node: process.execPath, cli: join(PLUGIN, "bin", "cli.mjs") });
  assert.equal(pluginRootOf({ CLAUDE_PLUGIN_ROOT: "/p" }), "/p");
  assert.deepEqual(parsePorts("4600-4602"), [4600, 4601, 4602]);
  assert.deepEqual(parsePorts("4600,4602"), [4600, 4602]);
  assert.equal(parsePorts("abc"), null);
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});
