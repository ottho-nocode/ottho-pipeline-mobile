// Serveur local du Builder : état JSON, flux SSE, fichiers du build. Écoute sur 127.0.0.1 et refuse
// tout Host qui n'est pas local (anti DNS rebinding).
//
// Le Builder a deux modes, choisis d'après le projet observé (voir detectMode) :
//
//   - « parcours » : la vue des 34 étapes du parcours mobile. Le Builder lit, il n'écrit jamais dans
//     le dépôt du parcours : réponses, validations et preuves passent par Claude Code, dans le
//     terminal, qui écrit ottho.json. Aucune route d'écriture n'existe dans ce mode, donc : le jeton
//     ne protège que la lecture des fichiers du projet, pour qu'une page tierce ne puisse pas s'en
//     servir.
//   - « pipeline » : le pipeline d'agents SDD mobile (Specify, Plan, Implement, Validate, Release).
//     Comme le pipeline web, il lit le projet ; réponses, brief, validations et fichiers de marque
//     passent par le CLI. Seules écritures : .env.local (POST /api/config) et le lancement ou
//     l'arrêt de l'aperçu (POST /api/preview/start, /api/preview/stop), protégées par Origin + jeton
//     de lancement.
//
// Les hooks du plugin inscrivent leur session Claude Code (GET /api/health?session=) et la retirent à
// sa fermeture (POST /api/session-end, refusé à toute page) : le Builder s'arrête avec la dernière.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";
import { loadAgents } from "./agents.mjs";
import { deriveFeatures, readSnapshot } from "./features.mjs";
import { eventsPath, pairRuns, parseEvents, sessionStatus } from "./events.mjs";
import { actes, avancement, backendActif, backendLabel, choix, etapeCourante, etapesDeEtat, historique, produit, readEtat, reponses, ETAT_FILE } from "./etat.mjs";
import { PARCOURS_FILE, SKILLS_DIR, loadParcours, readSkill } from "./parcours.mjs";
import { readBranch, readGit } from "./git.mjs";
import { readExpo } from "./expo.mjs";
import { signature } from "./signature.mjs";
import { detectServices } from "./services.mjs";
import { createDevServer } from "./devserver.mjs";
import { readDatabase } from "./database.mjs";
import { configStatus, writeEnv } from "./envfile.mjs";
import { readBrief } from "./brief.mjs";
import { projectPhase } from "./project.mjs";
import { collectQuestions } from "./questions.mjs";
import { IMAGE_RE, PREVIEW_RE, collectDeliverables, readDeliverable } from "./deliverables.mjs";
import { staticPreview } from "./preview.mjs";
import { collectAssets } from "./assets.mjs";
import { listProjectDocs, readProjectFile } from "./viewer.mjs";
import { HttpError } from "./files.mjs";

export const APP_ID = "ottho-pipeline-mobile";
export const MODES = ["parcours", "pipeline"];

const exists = (path) => stat(path).then(() => true, () => false);

/**
 * Lequel des deux modes ce projet demande. Un projet du parcours se reconnaît sans ambiguïté : il
 * porte la carte des étapes, l'état du parcours ou ses skills d'étape. Tout autre projet est un
 * projet du pipeline : sans cette garde, loadParcours replierait sur sa table locale et un projet
 * quelconque se verrait affublé des 34 étapes.
 */
export async function detectMode(projectDir) {
  const marks = await Promise.all([
    exists(join(projectDir, PARCOURS_FILE)),
    exists(join(projectDir, ETAT_FILE)),
    exists(join(projectDir, SKILLS_DIR, "ottho-etape-00-bienvenue")),
  ]);
  return marks.some(Boolean) ? "parcours" : "pipeline";
}

const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };

// Fichier de maquette sous design/ uniquement (le chemin doit y rester une fois résolu).
async function designRead(projectDir, rel, pattern) {
  if (typeof rel !== "string" || !rel.startsWith("design/") || !pattern.test(rel)) return null;
  const root = resolve(projectDir, "design");
  const file = resolve(projectDir, rel);
  if (!file.startsWith(root + sep)) return null;
  const body = await readFile(file).catch(() => null);
  return body ? { body, file } : null;
}

// Image de maquette (zoning 390 x 844, exports Pencil) : servie avec une CSP qui interdit tout
// script (un SVG ne peut rien exécuter).
async function designFile(projectDir, rel) {
  const found = await designRead(projectDir, rel, IMAGE_RE);
  return found ? { body: found.body, type: IMAGE_TYPES[extname(found.file).toLowerCase()] } : null;
}

// Écran de canevas en aperçu statique : scripts retirés à la transformation, et la
// CSP n'autorise aucun script (seulement styles en ligne et Google Fonts).
const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data:";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/** L'état de la vue du parcours : les 34 étapes, l'étape courante, les preuves, la fabrication Expo. */
async function parcoursState({ projectDir }) {
  const [parcours, lu, branch, expo, text] = await Promise.all([
    loadParcours(projectDir),
    readEtat(projectDir),
    readBranch(projectDir),
    readExpo(projectDir),
    readFile(eventsPath(projectDir), "utf8").catch(() => ""),
  ]);
  const etapes = etapesDeEtat(parcours, lu.etat);
  const courante = etapeCourante(etapes);
  const { events, corrupt } = parseEvents(text);
  const runs = pairRuns(events.slice(-1000));
  // Ce que la session Claude Code attend de l'élève dans son terminal (questions, autorisation).
  const session = sessionStatus(events.slice(-1000));
  const backend = backendActif(lu.etat);
  return {
    branch,
    parcours: { source: parcours.source, actes: parcours.actes },
    etapes,
    // Identifiant seulement : l'interface retrouve l'étape dans `etapes`.
    courante: courante?.id ?? null,
    avancement: avancement(etapes),
    actes: actes(parcours, etapes),
    choix: choix(lu.etat),
    backend: { key: backend, label: backendLabel(backend) },
    produit: produit(lu.etat),
    // Ce que la fabrication Expo embarquera (identité, profils EAS), lu dans le projet.
    expo,
    reponses: reponses(lu.etat),
    historique: historique(lu.etat),
    etat: {
      exists: lu.exists,
      error: lu.error,
      currentStep: typeof lu.etat?.current_step === "string" ? lu.etat.current_step : null,
      updatedAt: typeof lu.etat?.updated_at === "string" ? lu.etat.updated_at : null,
    },
    // Journal des agents, quand les hooks du plugin ont tourné sur ce projet.
    runs: runs
      .slice(-100)
      .reverse()
      .map(({ report, ...run }) => ({ ...run, hasReport: Boolean(report) })),
    session,
    corrupt,
  };
}

/** L'état du pipeline d'agents mobile : agents, features US-XX, livrables, questions, base, Expo. */
async function pipelineState({ projectDir, pluginDir, claudeConfigPath }) {
  const [agents, snap, text, found, assets, services, database, brief, expo] = await Promise.all([
    loadAgents({ projectDir, pluginDir }),
    readSnapshot(projectDir),
    readFile(eventsPath(projectDir), "utf8").catch(() => ""),
    collectDeliverables(projectDir),
    collectAssets(projectDir),
    detectServices({ projectDir, claudeConfigPath }),
    readDatabase(projectDir),
    readBrief(projectDir),
    readExpo(projectDir, "pipeline"),
  ]);
  const { events, corrupt } = parseEvents(text);
  const runs = pairRuns(events.slice(-1000));
  // Questions et autorisation en attente dans la session principale (terminal central).
  const session = sessionStatus(events.slice(-1000));
  const { features, focus, deliverables } = deriveFeatures(snap, runs, found);
  // Réponses données dans le sélecteur du terminal : les questions correspondantes sont répondues.
  const terminalAnswers = events.filter((e) => e.type === "answered").flatMap((e) => (Array.isArray(e.pairs) ? e.pairs : []));
  const lastReplyAt = events.findLast((e) => e.type === "reply" || e.type === "answered")?.ts ?? null;
  const questions = await collectQuestions({ projectDir, runs, terminalAnswers, lastReplyAt });
  // Phase projet (avant la première feature) : Brief → Vision → PRD → Design → Architecture → Base.
  const phase = await projectPhase({ projectDir, snap, runs, deliverables, brief, database: database.app });
  return {
    git: snap.git !== null,
    // Branche courante du projet et nombre de fichiers non commités (barre du haut).
    branch: snap.git ? { name: snap.git.current || null, dirty: snap.git.dirty ?? 0 } : null,
    pluginFound: Boolean(pluginDir),
    agents,
    features,
    focus,
    // Le compte rendu reste côté serveur (chargé à la demande) : le flux reste léger.
    runs: runs
      .slice(-200)
      .reverse()
      .map(({ report, ...run }) => ({ ...run, hasReport: Boolean(report) })),
    questions,
    deliverables,
    assets,
    // Services externes branchés (noms seulement) : croisés avec agent.services dans l'interface.
    services,
    session,
    brief: { exists: brief.exists, complete: brief.complete },
    phase,
    // Base de données existante de l'application web du client : son adresse, l'état de ses clés,
    // le relevé de son schéma, ses migrations. Aucune valeur de clé n'en sort.
    database,
    // Ce que la fabrication Expo embarquera : le panneau de version de l'agent soumission.
    expo,
    corrupt,
  };
}

export async function buildState({ projectDir, pluginDir, claudeConfigPath, mode = undefined }) {
  const actual = mode ?? (await detectMode(projectDir));
  const body = actual === "pipeline" ? await pipelineState({ projectDir, pluginDir, claudeConfigPath }) : await parcoursState({ projectDir });
  return {
    app: APP_ID,
    mode: actual,
    project: { dir: projectDir, name: basename(projectDir) },
    ...body,
    generatedAt: new Date().toISOString(),
  };
}

const SMALL_BODY = 16 * 1024;
// Identifiant de session Claude Code (un UUID) transmis par les hooks.
const SESSION_RE = /^[A-Za-z0-9_-]{1,128}$/;
const isSession = (s) => typeof s === "string" && SESSION_RE.test(s);

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readRaw(req, limit) {
  return new Promise((ok, ko) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
    });
    req.on("end", () => (size > limit ? ko(new HttpError(413, "Corps trop gros.")) : ok(Buffer.concat(chunks))));
    req.on("error", ko);
  });
}

async function readJson(req, limit) {
  const raw = (await readRaw(req, limit)).toString("utf8");
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    throw new HttpError(400, "Corps invalide.");
  }
}

export function resolveStatic(distDir, urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const root = resolve(distDir);
  const file = resolve(root, rel);
  return file.startsWith(root + sep) ? file : null;
}

export async function startApp({
  projectDir,
  pluginDir = null,
  distDir,
  port,
  host = "127.0.0.1",
  pollMs = 1000,
  claudeConfigPath = undefined,
  // Mode du Builder. Détecté d'après le projet quand il n'est pas imposé (tests).
  mode = undefined,
  // Tests : plage de ports et lancement de « npm run dev » remplaçables.
  previewPorts = undefined,
  previewSpawn = undefined,
  // Arrêt automatique (--idle-exit) : aucun onglet branché (client SSE) depuis idleExitMs.
  idleExitMs = null,
  idleCheckMs = 30_000,
  onIdleExit = () => {},
  // Arrêt avec Claude Code : sessions ouvertes sur ce projet (sessions : celle qui a lancé le Builder).
  // Quand la dernière se ferme, arrêt après sessionGraceMs, sauf si une autre s'inscrit entre-temps
  // (un /clear ferme la session puis en ouvre une nouvelle aussitôt).
  sessions: initialSessions = [],
  sessionGraceMs = 10_000,
  onSessionsEnd = () => {},
}) {
  const actualMode = mode ?? (await detectMode(projectDir));
  // Le mode parcours n'écrit rien dans le dépôt qu'il observe : il n'a aucune route d'écriture, et
  // pas d'aperçu à lancer.
  const pipeline = actualMode === "pipeline";
  const clients = new Set();
  // Onglets branchés ou en cours de branchement (état en calcul) ; dernier instant où il y en avait
  // un (au départ : le lancement).
  let connecting = 0;
  const active = () => clients.size + connecting > 0;
  let lastActive = Date.now();
  const sessions = new Set(initialSessions.filter(isSession));
  let sessionsEnd = null;
  // Arrêt du serveur, défini une fois qu'il écoute.
  let stop = () => {};
  // Aperçu de l'app du projet : lancé seulement quand l'élève clique « Lancer l'aperçu ».
  const preview = pipeline
    ? createDevServer({
        projectDir,
        ports: previewPorts,
        ...(previewSpawn ? { spawn: previewSpawn } : {}),
        onChange: () => void push().catch(() => {}),
      })
    : null;
  // Jeton : la page le reçoit dans l'état, un site tiers ne peut ni le lire ni envoyer l'en-tête
  // sans pré-vol CORS (refusé).
  const token = randomBytes(24).toString("hex");
  let lastSig = null;
  let payload = null;
  let pending = null;

  async function doRefresh() {
    const sig = await signature(projectDir);
    if (sig === lastSig && payload) return false;
    lastSig = sig;
    const state = await buildState({ projectDir, pluginDir, claudeConfigPath, mode: actualMode });
    payload = JSON.stringify(
      pipeline ? { ...state, writeToken: token, preview: await preview.snapshot() } : { ...state, readToken: token },
    );
    return true;
  }
  // Un seul recalcul à la fois (poll et requêtes peuvent se croiser).
  const refresh = () => (pending ??= doRefresh().finally(() => (pending = null)));
  const broadcast = () => {
    for (const c of clients) c.write(`data: ${payload}\n\n`);
  };
  // Changement hors fichiers (aperçu qui démarre, s'arrête, plante) : recalcul et diffusion.
  const push = async () => {
    await pending;
    lastSig = null;
    await refresh();
    broadcast();
  };

  // Écritures : même contrôle pour toutes (Origin, jeton, corps JSON), puis recalcul et diffusion.
  // Vides en mode parcours : rien ne s'écrit dans le dépôt du parcours par le réseau.
  const WRITES = pipeline
    ? {
        "/api/config": {
          limit: 64 * 1024,
          async run(body) {
            if (!body || typeof body.values !== "object" || Array.isArray(body.values)) throw new HttpError(400, "Valeurs attendues.");
            return await writeEnv(projectDir, body.values);
          },
        },
        "/api/preview/start": {
          limit: SMALL_BODY,
          async run() {
            await preview.start();
          },
        },
        "/api/preview/stop": {
          limit: SMALL_BODY,
          async run() {
            preview.stop();
          },
        },
      }
    : {};

  async function handleWrite(req, res, actual, write) {
    const origins = [`http://127.0.0.1:${actual}`, `http://localhost:${actual}`];
    if (
      !origins.includes(req.headers.origin ?? "") ||
      req.headers["x-ottho-token"] !== token ||
      !(req.headers["content-type"] ?? "").startsWith("application/json")
    ) {
      sendJson(res, 403, { error: "Requête refusée." });
      return;
    }
    let result;
    try {
      result = await write.run(await readJson(req, write.limit));
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      sendJson(res, err.status, { error: err.message });
      return;
    }
    // Un recalcul lancé avant l'écriture ne doit pas masquer son effet.
    await pending;
    lastSig = null;
    await refresh();
    broadcast();
    sendJson(res, 200, { ok: true, ...(result ?? {}) });
  }

  const addSession = (session) => {
    if (!isSession(session)) return;
    sessions.add(session);
    clearTimeout(sessionsEnd);
    sessionsEnd = null;
  };

  // Fermeture d'une session Claude Code (hook SessionEnd). Jamais une page : un navigateur envoie
  // toujours l'en-tête Origin avec un POST. Seule une session inscrite compte, et son identifiant
  // n'est connu que des hooks : un site tiers ne peut pas arrêter le Builder.
  async function handleSessionEnd(req, res) {
    if (req.headers.origin !== undefined || !(req.headers["content-type"] ?? "").startsWith("application/json")) {
      sendJson(res, 403, { error: "Requête refusée." });
      return;
    }
    let body;
    try {
      body = await readJson(req, SMALL_BODY);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      sendJson(res, err.status, { error: err.message });
      return;
    }
    const ended = body?.project === projectDir && isSession(body.session) && sessions.delete(body.session);
    if (ended && sessions.size === 0) {
      clearTimeout(sessionsEnd);
      sessionsEnd = setTimeout(() => {
        sessionsEnd = null;
        if (sessions.size) return;
        // Même si la fermeture échoue, le processus ne reste pas en vie sans serveur.
        try {
          stop();
        } finally {
          onSessionsEnd();
        }
      }, sessionGraceMs);
    }
    sendJson(res, 200, { ok: true, ended, stopping: sessionsEnd !== null });
  }

  // Routes de lecture protégées par le jeton : les mêmes dans les deux modes, sauf /api/skill (la
  // fiche d'une étape du parcours) et les livrables du pipeline.
  const TOKEN_READS = pipeline
    ? ["/api/report", "/api/file", "/api/docs", "/api/config", "/api/brief"]
    : ["/api/report", "/api/file", "/api/docs", "/api/skill"];

  async function handleTokenRead(path, params, res) {
    if (path === "/api/file") {
      sendJson(res, 200, await readProjectFile(projectDir, params.get("path")));
    } else if (path === "/api/docs") {
      sendJson(res, 200, { docs: await listProjectDocs(projectDir) });
    } else if (path === "/api/skill") {
      // Texte de l'étape : le chemin se construit depuis son identifiant, jamais depuis l'URL.
      const skill = await readSkill(projectDir, params.get("id") ?? "");
      if (!skill) throw new HttpError(404, "Étape introuvable dans ce projet.");
      sendJson(res, 200, skill);
    } else if (path === "/api/brief") {
      sendJson(res, 200, await readBrief(projectDir));
    } else if (path === "/api/config") {
      // Services de l'app et variables définies dans .env.local : jamais la valeur d'un secret.
      sendJson(res, 200, await configStatus(projectDir));
    } else {
      const [agent, start] = String(params.get("key") ?? "").split("|");
      const text = await readFile(eventsPath(projectDir), "utf8").catch(() => "");
      const run = pairRuns(parseEvents(text).events).find((r) => r.agent === agent && r.start === start);
      if (!run) throw new HttpError(404, "Exécution introuvable.");
      sendJson(res, 200, { report: run.report });
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const actual = server.address().port;
      if (![`127.0.0.1:${actual}`, `localhost:${actual}`].includes(req.headers.host ?? "")) {
        res.writeHead(403).end();
        return;
      }
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/api/session-end") {
        if (req.method === "POST") await handleSessionEnd(req, res);
        else res.writeHead(405).end();
        return;
      }
      if (req.method === "POST" && WRITES[path]) {
        await handleWrite(req, res, actual, WRITES[path]);
        return;
      }
      if (req.method !== "GET") {
        // Route d'écriture appelée avec une autre méthode : 405 ; route inconnue : 404.
        res.writeHead(WRITES[path] ? 405 : 404).end();
        return;
      }
      if (path === "/api/health") {
        // Hook du plugin qui cherche le Builder de son projet : l'adresse qu'il annonce reste
        // valable (un simple sondage des ports, sans le projet, ne retient pas le Builder). Avec
        // session : la session Claude Code est inscrite (le Builder s'arrêtera avec elle).
        const params = new URL(req.url ?? "/", "http://local").searchParams;
        if (params.get("project") === projectDir) {
          lastActive = Date.now();
          addSession(params.get("session"));
        }
        sendJson(res, 200, { ok: true, app: APP_ID, project: projectDir });
        return;
      }
      if (TOKEN_READS.includes(path)) {
        // Historique et documents : compte rendu d'une exécution, liste des .md, lecture d'un
        // fichier (jeton exigé).
        const params = new URL(req.url ?? "/", "http://local").searchParams;
        if (params.get("token") !== token) {
          res.writeHead(403).end();
          return;
        }
        try {
          await handleTokenRead(path, params, res);
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          sendJson(res, err.status, { error: err.message });
        }
        return;
      }
      if (pipeline && path === "/api/design-preview") {
        const found = await designRead(projectDir, new URL(req.url ?? "/", "http://local").searchParams.get("path"), PREVIEW_RE);
        if (!found) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": PREVIEW_CSP,
          "X-Content-Type-Options": "nosniff",
        });
        res.end(staticPreview(found.body.toString("utf8")));
        return;
      }
      if (pipeline && path === "/api/design-file") {
        const found = await designFile(projectDir, new URL(req.url ?? "/", "http://local").searchParams.get("path"));
        if (!found) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": found.type,
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(found.body);
        return;
      }
      if (pipeline && path === "/api/deliverable") {
        const params = new URL(req.url ?? "/", "http://local").searchParams;
        try {
          sendJson(res, 200, await readDeliverable({ projectDir, us: params.get("us"), agent: params.get("agent") }));
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          sendJson(res, err.status, { error: err.message });
        }
        return;
      }
      if (path === "/api/state") {
        await refresh();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(payload);
        return;
      }
      if (path === "/api/stream") {
        // Onglet qui se branche : compté actif pendant le calcul de l'état. Fermeture écoutée dès
        // maintenant : un onglet refermé pendant ce calcul n'est jamais ajouté.
        connecting++;
        let gone = false;
        req.on("close", () => {
          gone = true;
          clients.delete(res);
          lastActive = Date.now();
        });
        try {
          await refresh();
          if (gone) return;
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
          res.write(`data: ${payload}\n\n`);
          clients.add(res);
        } finally {
          connecting--;
        }
        return;
      }
      const file = resolveStatic(distDir, req.url ?? "/");
      const body = file ? await readFile(file).catch(() => null) : null;
      if (!body) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch (err) {
      res.writeHead(500).end(String(err?.message ?? err));
    }
  });

  return new Promise((ok, ko) => {
    server.once("error", ko);
    server.listen(port, host, () => {
      const poll = setInterval(async () => {
        // Aucun onglet : rien à diffuser, rien n'est relu (Git compris). Un onglet qui se branche,
        // et /api/state, recalculent l'état eux-mêmes.
        if (!clients.size) return;
        try {
          if (await refresh()) broadcast();
        } catch {
          // état illisible un instant (écriture en cours) : prochain tour
        }
      }, pollMs);
      const ping = setInterval(() => {
        for (const c of clients) c.write(": ping\n\n");
      }, 25_000);
      const idle = idleExitMs
        ? setInterval(() => {
            if (active()) lastActive = Date.now();
            else if (Date.now() - lastActive >= idleExitMs) {
              // Même si la fermeture échoue, le processus ne reste pas en vie sans serveur.
              try {
                close();
              } finally {
                onIdleExit();
              }
            }
          }, idleCheckMs)
        : null;
      const close = () => {
        clearInterval(poll);
        clearInterval(ping);
        clearInterval(idle);
        clearTimeout(sessionsEnd);
        preview?.stop();
        for (const c of clients) c.end();
        server.closeAllConnections();
        server.close();
      };
      stop = close;
      ok({ server, port: server.address().port, close, mode: actualMode });
    });
  });
}
