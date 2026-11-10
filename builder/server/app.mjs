// Serveur local du Builder : état JSON, flux SSE, fichiers du build. Écoute sur 127.0.0.1 et refuse
// tout Host qui n'est pas local (anti DNS rebinding).
//
// Le Builder lit, il n'écrit jamais dans le dépôt du parcours : réponses, validations et preuves
// passent par Claude Code, dans le terminal, qui écrit ottho.json avec scripts/ottho-state.mjs.
// Aucune route d'écriture, donc : le jeton ne protège que la lecture des fichiers du projet, pour
// qu'une page tierce ne puisse pas s'en servir.
//
// Les hooks du plugin inscrivent leur session Claude Code (GET /api/health?session=) et la retirent à
// sa fermeture (POST /api/session-end, refusé à toute page) : le Builder s'arrête avec la dernière.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { eventsPath, pairRuns, parseEvents, sessionStatus } from "./events.mjs";
import { actes, avancement, backendActif, backendLabel, choix, etapeCourante, etapesDeEtat, historique, produit, readEtat, reponses } from "./etat.mjs";
import { loadParcours, readSkill } from "./parcours.mjs";
import { readBranch } from "./git.mjs";
import { readExpo } from "./expo.mjs";
import { signature } from "./signature.mjs";
import { listProjectDocs, readProjectFile } from "./viewer.mjs";
import { HttpError } from "./files.mjs";

export const APP_ID = "ottho-pipeline-mobile";

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

export async function buildState({ projectDir }) {
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
    app: APP_ID,
    project: { dir: projectDir, name: basename(projectDir) },
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

export function startApp({
  projectDir,
  distDir,
  port,
  host = "127.0.0.1",
  pollMs = 1000,
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
  const clients = new Set();
  // Onglets branchés ou en cours de branchement (état en calcul) ; dernier instant où il y en avait
  // un (au départ : le lancement).
  let connecting = 0;
  const active = () => clients.size + connecting > 0;
  let lastActive = Date.now();
  const sessions = new Set(initialSessions.filter(isSession));
  let sessionsEnd = null;
  let stop = () => {};
  // Jeton de lecture : la page le reçoit dans l'état, un site tiers ne peut pas le lire.
  const token = randomBytes(24).toString("hex");
  let lastSig = null;
  let payload = null;
  let pending = null;

  async function doRefresh() {
    const sig = await signature(projectDir);
    if (sig === lastSig && payload) return false;
    lastSig = sig;
    payload = JSON.stringify({ ...(await buildState({ projectDir })), readToken: token });
    return true;
  }
  // Un seul recalcul à la fois (poll et requêtes peuvent se croiser).
  const refresh = () => (pending ??= doRefresh().finally(() => (pending = null)));
  const broadcast = () => {
    for (const c of clients) c.write(`data: ${payload}\n\n`);
  };

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
      if (req.method !== "GET") {
        res.writeHead(404).end();
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
      if (path === "/api/file" || path === "/api/docs" || path === "/api/skill" || path === "/api/report") {
        const params = new URL(req.url ?? "/", "http://local").searchParams;
        if (params.get("token") !== token) {
          res.writeHead(403).end();
          return;
        }
        try {
          if (path === "/api/file") {
            sendJson(res, 200, await readProjectFile(projectDir, params.get("path")));
          } else if (path === "/api/docs") {
            sendJson(res, 200, { docs: await listProjectDocs(projectDir) });
          } else if (path === "/api/skill") {
            // Texte de l'étape : le chemin se construit depuis son identifiant, jamais depuis l'URL.
            const skill = await readSkill(projectDir, params.get("id") ?? "");
            if (!skill) throw new HttpError(404, "Étape introuvable dans ce projet.");
            sendJson(res, 200, skill);
          } else {
            const [agent, start] = String(params.get("key") ?? "").split("|");
            const text = await readFile(eventsPath(projectDir), "utf8").catch(() => "");
            const run = pairRuns(parseEvents(text).events).find((r) => r.agent === agent && r.start === start);
            if (!run) throw new HttpError(404, "Exécution introuvable.");
            sendJson(res, 200, { report: run.report });
          }
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
        // Aucun onglet : rien à diffuser, rien n'est relu (Git compris).
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
        for (const c of clients) c.end();
        server.closeAllConnections();
        server.close();
      };
      stop = close;
      ok({ server, port: server.address().port, close });
    });
  });
}
