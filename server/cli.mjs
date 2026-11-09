// Point d'entrée : options, réutilisation d'une instance existante, choix du port (4337 puis les 9
// suivants), ouverture du navigateur.
//
// Le Builder fait partie du plugin ottho-pipeline-mobile : son hook de démarrage le lance (ou à la
// main, node <plugin>/bin/cli.mjs --project <dossier>, Ctrl+C l'arrête). --reopen ne lance rien : il
// retrouve l'instance du projet. --idle-exit l'arrête seul quand plus aucun onglet n'est ouvert.
// --session <id> : session Claude Code qui le lance ; il s'arrête quand la dernière session inscrite
// se ferme.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { APP_ID, startApp } from "./app.mjs";
import { eventsPath, rotateIfNeeded } from "./events.mjs";

export const BASE_PORT = 4337;
export const PORT_COUNT = 10;
export const APP_NAME = "Ottho Builder Mobile";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
// Commande qui lance ce Builder, pour les messages (chemin entre guillemets).
const CLI_COMMAND = `node ${JSON.stringify(CLI)}`;

export function resolveOptions(argv, cwd) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: "string" },
      port: { type: "string" },
      "no-open": { type: "boolean" },
      reopen: { type: "boolean" },
      "idle-exit": { type: "string" },
      session: { type: "string" },
    },
  });
  const port = values.port === undefined ? BASE_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`port invalide : ${values.port}`);
  const idle = values["idle-exit"] === undefined ? null : Number(values["idle-exit"]);
  if (idle !== null && !(Number.isFinite(idle) && idle > 0)) throw new Error(`--idle-exit invalide : ${values["idle-exit"]} (nombre de minutes attendu)`);
  return {
    projectDir: resolve(cwd, values.project ?? "."),
    port,
    open: !values["no-open"],
    reopen: Boolean(values.reopen),
    idleExitMs: idle === null ? null : idle * 60_000,
    sessions: values.session ? [values.session] : [],
  };
}

// "free" si rien n'écoute, sinon ce que répond /api/health (app null si ce n'est pas nous).
export async function probe(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    const body = await res.json().catch(() => ({}));
    return { app: body.app ?? null, project: body.project ?? null };
  } catch (err) {
    return err?.cause?.code === "ECONNREFUSED" ? "free" : { app: null, project: null };
  }
}

export function openBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {}); // pas de navigateur : l'URL est déjà affichée
  child.unref();
}

const mine = (found, projectDir) => found !== "free" && found.app === APP_ID && found.project === projectDir;

export async function main(argv, { cwd = process.cwd(), log = console.log } = {}) {
  const opts = resolveOptions(argv, cwd);
  if (opts.reopen) {
    for (let port = opts.port; port < opts.port + PORT_COUNT; port++) {
      if (mine(await probe(port), opts.projectDir)) {
        const url = `http://127.0.0.1:${port}`;
        log(`${APP_NAME} déjà ouvert : ${url}`);
        if (opts.open) openBrowser(url);
        return null;
      }
    }
    throw new Error(
      `${APP_NAME} ne tourne pas pour ce projet. Il démarre avec Claude Code dans un projet du parcours, et la commande /parcours le rouvre. À la main :\n  ${CLI_COMMAND} --project ${JSON.stringify(opts.projectDir)}`,
    );
  }
  const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
  await rotateIfNeeded(eventsPath(opts.projectDir));

  for (let port = opts.port; port < opts.port + PORT_COUNT; port++) {
    const found = await probe(port);
    if (found === "free") {
      try {
        const app = await startApp({
          projectDir: opts.projectDir,
          distDir,
          port,
          idleExitMs: opts.idleExitMs,
          onIdleExit: () => {
            log(`${APP_NAME} arrêté : aucun onglet ouvert depuis ${opts.idleExitMs / 60_000} min.`);
            process.exit(0);
          },
          sessions: opts.sessions,
          onSessionsEnd: () => {
            log(`${APP_NAME} arrêté : Claude Code fermé sur ce projet.`);
            process.exit(0);
          },
        });
        const url = `http://127.0.0.1:${app.port}`;
        log(`${APP_NAME} prêt : ${url}`);
        if (opts.open) openBrowser(url);
        return app;
      } catch (err) {
        if (err.code === "EADDRINUSE") continue;
        throw err;
      }
    }
    if (mine(found, opts.projectDir)) {
      const url = `http://127.0.0.1:${port}`;
      log(`${APP_NAME} déjà ouvert : ${url}`);
      if (opts.open) openBrowser(url);
      return null;
    }
  }
  throw new Error(`aucun port libre entre ${opts.port} et ${opts.port + PORT_COUNT - 1}`);
}
