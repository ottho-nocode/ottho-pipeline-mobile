import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { APP_ID, buildState, resolveStatic, startApp } from "./app.mjs";
import { tempDir } from "./tmpdirs.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (promise, ms) => Promise.race([promise, new Promise((_, ko) => setTimeout(() => ko(new Error(`délai de ${ms} ms dépassé`)), ms))]);

const PARCOURS = `export const ETAPES = [
  { "id": "00-bienvenue", "titre": "Bienvenue", "condition": "toujours", "minutes": 5, "but": "Faire connaissance" },
  { "id": "04-ta-machine", "titre": "Ta machine", "condition": "toujours", "minutes": 60, "but": "Installer les outils" },
  { "id": "07-compte-apple", "titre": "Compte Apple", "condition": "ios", "minutes": 120, "but": "99 $/an" }
];
`;

const ETAT = {
  schema_version: 1,
  updated_at: "2026-11-01T10:00:00.000Z",
  product: { nom_provisoire: "app-demo" },
  branches: { ios: false, android: true },
  answers: {},
  steps: {
    "00-bienvenue": { status: "done", updated_at: "2026-11-01T09:00:00.000Z", proof: "branches enregistrées" },
    "04-ta-machine": { status: "in_progress", updated_at: "2026-11-01T09:30:00.000Z" },
  },
  current_step: "04-ta-machine",
  history: [{ at: "2026-11-01T09:00:00.000Z", step: "00-bienvenue", status: "done", proof: "branches enregistrées" }],
};

async function fixture({ etat = ETAT, parcours = PARCOURS } = {}) {
  const dir = await tempDir("opm-app-");
  await mkdir(join(dir, "scripts"), { recursive: true });
  await writeFile(join(dir, "scripts", "ottho-parcours.mjs"), parcours);
  if (etat) await writeFile(join(dir, "ottho.json"), JSON.stringify(etat, null, 2));
  await mkdir(join(dir, ".agents", "skills", "ottho-etape-04-ta-machine"), { recursive: true });
  await writeFile(
    join(dir, ".agents", "skills", "ottho-etape-04-ta-machine", "SKILL.md"),
    "---\nname: ottho-etape-04-ta-machine\ndescription: Installe les outils.\n---\n\n# Etape 04\n\nInstalle Node, Xcode et Expo.\n",
  );
  await writeFile(join(dir, "README.md"), "# Projet de test\n");
  return dir;
}

function rawGet(port, path, host) {
  return new Promise((ok, ko) => {
    const req = http.request({ host: "127.0.0.1", port, path, headers: { Host: host } }, (res) => {
      res.resume();
      ok(res.statusCode);
    });
    req.on("error", ko);
    req.end();
  });
}

test("resolveStatic refuse de sortir du dossier dist", () => {
  assert.equal(resolveStatic("/srv/dist", "/"), resolve("/srv/dist/index.html"));
  assert.equal(resolveStatic("/srv/dist", "/assets/a.js?v=1"), resolve("/srv/dist/assets/a.js"));
  assert.equal(resolveStatic("/srv/dist", "/../package.json"), null);
  assert.equal(resolveStatic("/srv/dist", "/..%2fpackage.json"), null);
  assert.equal(resolveStatic("/srv/dist", "/%E0%A4%A"), null);
});

test("buildState : le parcours, l'étape courante, les actes et les choix d'un projet réel", async () => {
  const dir = await fixture();
  const state = await buildState({ projectDir: dir });
  assert.equal(state.app, APP_ID);
  assert.equal(state.parcours.source, "projet");
  assert.equal(state.courante, "04-ta-machine");
  // ios à non : l'étape Apple est écartée, elle sort des totaux.
  assert.deepEqual(state.avancement, { faites: 1, total: 2, minutesRestantes: 60 });
  assert.equal(state.etapes.find((e) => e.id === "07-compte-apple").applicable, false);
  assert.equal(state.etapes.find((e) => e.id === "00-bienvenue").preuve, "branches enregistrées");
  assert.equal(state.etat.exists, true);
  assert.equal(state.etat.error, null);
  assert.equal(state.historique.length, 1);
  assert.equal(state.produit.nom, "app-demo");
  assert.ok(state.actes.length >= 1);
});

test("buildState : parcours jamais commencé, et ottho.json illisible", async () => {
  const vierge = await buildState({ projectDir: await fixture({ etat: null }) });
  assert.equal(vierge.etat.exists, false);
  // Aucune réponse : seules les étapes « toujours » s'appliquent, et la première est la courante.
  assert.equal(vierge.courante, "00-bienvenue");
  assert.equal(vierge.avancement.faites, 0);

  const dir = await fixture();
  await writeFile(join(dir, "ottho.json"), "{ cassé");
  const casse = await buildState({ projectDir: dir });
  assert.match(casse.etat.error, /illisible/);
  // Le parcours reste affiché malgré l'état illisible : la personne voit quand même où elle va.
  assert.equal(casse.etapes.length, 3);
});

test("API : health, state, Host étranger refusé, aucune route d'écriture", async (t) => {
  const dir = await fixture();
  const app = await startApp({ projectDir: dir, distDir: dir, port: 0 });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;

  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, app: APP_ID, project: dir });

  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.courante, "04-ta-machine");
  assert.ok(state.readToken.length > 20);

  assert.equal(await rawGet(app.port, "/api/health", "evil.example"), 403);
  assert.equal(await rawGet(app.port, "/api/health", `localhost:${app.port}`), 200);

  // Rien ne s'écrit par le réseau : toute autre méthode est refusée.
  for (const path of ["/api/state", "/api/config", "/api/skill"]) {
    assert.equal((await fetch(`${base}${path}`, { method: "POST" })).status, 404, path);
  }
});

test("lecture de fichiers : jeton exigé, fiche d'étape par identifiant, documents du projet", async (t) => {
  const dir = await fixture();
  const app = await startApp({ projectDir: dir, distDir: dir, port: 0 });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  const { readToken } = await (await fetch(`${base}/api/state`)).json();
  const t_ = encodeURIComponent(readToken);

  // Sans jeton (ou avec un mauvais) : refusé.
  for (const url of [`/api/docs`, `/api/docs?token=faux`, `/api/skill?id=04-ta-machine`]) {
    assert.equal((await fetch(`${base}${url}`)).status, 403, url);
  }

  const skill = await (await fetch(`${base}/api/skill?id=04-ta-machine&token=${t_}`)).json();
  assert.equal(skill.path, ".agents/skills/ottho-etape-04-ta-machine/SKILL.md");
  assert.match(skill.content, /Installe Node, Xcode et Expo/);

  // Identifiant qui tente de sortir du dossier, ou étape sans fiche : 404, jamais un fichier étranger.
  for (const id of ["../../etc/passwd", "00-bienvenue", "", "..%2f..%2fottho.json"]) {
    assert.equal((await fetch(`${base}/api/skill?id=${encodeURIComponent(id)}&token=${t_}`)).status, 404, id);
  }

  const { docs } = await (await fetch(`${base}/api/docs?token=${t_}`)).json();
  assert.deepEqual(docs.map((d) => d.path), ["README.md"]);
  const file = await (await fetch(`${base}/api/file?path=README.md&token=${t_}`)).json();
  assert.equal(file.content, "# Projet de test\n");
  // ottho.json n'est pas un document consultable par cette route (extension non texte autorisée).
  assert.equal((await fetch(`${base}/api/file?path=.claude/x.md&token=${t_}`)).status, 404);
});

test("SSE : état initial, puis nouvel état dès que ottho.json change", async (t) => {
  const dir = await fixture();
  const app = await startApp({ projectDir: dir, distDir: dir, port: 0, pollMs: 100 });
  t.after(() => app.close());
  const res = await fetch(`http://127.0.0.1:${app.port}/api/stream`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const first = dec.decode((await reader.read()).value);
  assert.match(first, /^data: /);
  assert.match(first, /"courante":"04-ta-machine"/);

  // Claude enregistre l'étape dans le terminal : la vue suit, sans rien écrire elle-même.
  const avance = {
    ...ETAT,
    steps: { ...ETAT.steps, "04-ta-machine": { status: "done", updated_at: "2026-11-01T11:00:00.000Z", proof: "node -v répond v22" } },
  };
  await writeFile(join(dir, "ottho.json"), JSON.stringify(avance, null, 2));

  let chunk = "";
  await within(
    (async () => {
      while (!chunk.includes("node -v répond v22")) chunk += dec.decode((await reader.read()).value);
    })(),
    5000,
  );
  assert.match(chunk, /"courante":null|"courante":"07-compte-apple"/);
  await reader.cancel();
});

test("arrêt automatique : sans onglet ouvert, le Builder s'arrête après idleExitMs", async (t) => {
  const dir = await fixture();
  let arrets = 0;
  let fini;
  const stopped = new Promise((ok) => (fini = ok));
  const app = await startApp({
    projectDir: dir,
    distDir: dir,
    port: 0,
    idleExitMs: 150,
    idleCheckMs: 30,
    onIdleExit: () => {
      arrets++;
      fini();
    },
  });
  t.after(() => app.close());
  await within(stopped, 3000);
  await assert.rejects(fetch(`http://127.0.0.1:${app.port}/api/health`));
  await sleep(120);
  assert.equal(arrets, 1);
});

const endSession = (port, body, headers = {}) =>
  fetch(`http://127.0.0.1:${port}/api/session-end`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("arrêt avec Claude Code : la dernière session inscrite qui se ferme arrête le Builder", async (t) => {
  const dir = await fixture();
  let calls = 0;
  let ended;
  const stopped = new Promise((ok) => (ended = ok));
  const app = await startApp({
    projectDir: dir,
    distDir: dir,
    port: 0,
    sessions: ["s1"],
    sessionGraceMs: 100,
    onSessionsEnd: () => {
      calls++;
      ended();
    },
  });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  // Deuxième session sur le même projet : inscrite par le health du hook.
  assert.equal((await fetch(`${base}/api/health?project=${encodeURIComponent(dir)}&session=s2`)).status, 200);
  assert.deepEqual(await (await endSession(app.port, { project: dir, session: "s1" })).json(), { ok: true, ended: true, stopping: false });
  await sleep(300);
  assert.equal(calls, 0, "s2 encore ouverte");
  assert.deepEqual(await (await endSession(app.port, { project: dir, session: "s2" })).json(), { ok: true, ended: true, stopping: true });
  await within(stopped, 3000);
  assert.equal(calls, 1);
});

test("fin de session : refusée à une page (Origin), sans JSON, ou en GET", async (t) => {
  const dir = await fixture();
  let calls = 0;
  const app = await startApp({ projectDir: dir, distDir: dir, port: 0, sessions: ["s1"], sessionGraceMs: 50, onSessionsEnd: () => calls++ });
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.port}`;
  assert.equal((await endSession(app.port, { project: dir, session: "s1" }, { Origin: base })).status, 403);
  assert.equal((await endSession(app.port, { project: dir, session: "s1" }, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await endSession(app.port, { project: dir, session: "s1" }, { "Content-Type": "text/plain" })).status, 403);
  assert.equal((await fetch(`${base}/api/session-end`)).status, 405);
  assert.equal(await rawGet(app.port, "/api/session-end", "evil.example"), 403);
  // Session d'un autre projet : ignorée, le Builder ne s'arrête pas.
  assert.equal((await (await endSession(app.port, { project: `${dir}-autre`, session: "s1" })).json()).ended, false);
  await sleep(200);
  assert.equal(calls, 0);
});
