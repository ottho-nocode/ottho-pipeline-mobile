// Point d'entrée : options, réutilisation d'une instance existante, choix du port (4337 puis les 9
// suivants), ouverture du navigateur.
//
// Le Builder fait partie du plugin ottho-pipeline-mobile : son hook de démarrage le lance (ou à la
// main, node <plugin>/bin/cli.mjs --project <dossier>, Ctrl+C l'arrête). --reopen ne lance rien : il
// retrouve l'instance du projet. --idle-exit l'arrête seul quand plus aucun onglet n'est ouvert.
// --session <id> : session Claude Code qui le lance ; il s'arrête quand la dernière session inscrite
// se ferme. Sans --plugin : le plugin qui contient ce Builder, sinon le plugin installé.
//
// Le Builder sert les deux modes (voir server/app.mjs) : la vue du parcours en 34 étapes et le
// pipeline d'agents mobile. La sous-commande `brief` écrit docs/brief.md depuis Claude Code (ou
// l'enregistre comme exemple), sans rien lancer : elle n'a de sens que pour un projet du pipeline.
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { findPluginDir, PLUGIN_NAME } from "./agents.mjs";
import { APP_ID, detectMode, startApp } from "./app.mjs";
import { BRIEF_FILE, cleanBrief, isEmptyBrief, listPresets, missingBlocks, readBrief, savePreset, writeBrief } from "./brief.mjs";
import { eventsPath, rotateIfNeeded } from "./events.mjs";
import { HttpError, localDate } from "./files.mjs";

export const BASE_PORT = 4337;
export const PORT_COUNT = 10;
export const APP_NAME = "Ottho Builder Mobile";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
// Dossier des données du Builder (exemples de brief). OTTHO_MOBILE_HOME : autre dossier (tests).
const builderHome = () => process.env.OTTHO_MOBILE_HOME || join(homedir(), ".ottho-pipeline-mobile");
// Commande qui lance ce Builder, pour les messages (chemin entre guillemets).
const CLI_COMMAND = `node ${JSON.stringify(CLI)}`;

export function resolveOptions(argv, cwd) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: "string" },
      plugin: { type: "string" },
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
    pluginDir: values.plugin ? resolve(cwd, values.plugin) : undefined,
    port,
    open: !values["no-open"],
    reopen: Boolean(values.reopen),
    idleExitMs: idle === null ? null : idle * 60_000,
    sessions: values.session ? [values.session] : [],
  };
}

// Plugin ottho-pipeline-mobile qui contient ce Builder (<plugin>/builder/server/cli.mjs), ou null.
export async function ownPluginDir(cliUrl = import.meta.url) {
  const root = fileURLToPath(new URL("../../", cliUrl));
  try {
    const manifest = JSON.parse(await readFile(join(root, ".claude-plugin", "plugin.json"), "utf8"));
    return manifest?.name === PLUGIN_NAME ? resolve(root) : null;
  } catch {
    return null; // Builder hors du plugin (copie isolée)
  }
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

const BRIEF_USAGE = `usage : ${CLI_COMMAND} brief [--project <dossier>] --list | --preset <nom> | --json <fichier> | --save <nom>`;

// Brief écrit depuis Claude Code (les skills posent les six blocs puis appellent cette commande) :
// exemple enregistré dans <home>/briefs ou fichier JSON, avec les gardes et sauvegardes de writeBrief.
// --save fait l'inverse : le brief du projet devient un exemple de <home>/briefs.
async function briefCommand(argv, { cwd, log }) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { project: { type: "string" }, list: { type: "boolean" }, preset: { type: "string" }, json: { type: "string" }, save: { type: "string" } },
    }));
  } catch {
    throw new Error(BRIEF_USAGE);
  }
  if ([values.list, values.preset, values.json, values.save].filter((v) => v !== undefined).length !== 1) throw new Error(BRIEF_USAGE);
  const presetsDir = join(builderHome(), "briefs");
  const presets = values.list || values.preset !== undefined ? await listPresets(presetsDir) : [];
  if (values.list) {
    if (!presets.length) log("Aucun exemple de brief enregistré.");
    for (const p of presets) log(`${p.slug}\t${p.name}`);
    return null;
  }
  // Une faute de frappe dans --project ne doit pas créer un dossier ailleurs.
  const projectDir = resolve(cwd, values.project ?? ".");
  const isDir = await stat(projectDir).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw new Error(`dossier de projet introuvable : ${projectDir}`);
  // Le brief appartient au pipeline : un projet du parcours cadre son produit dans ses propres
  // étapes, et le Builder n'écrit rien dans son dépôt.
  if ((await detectMode(projectDir)) === "parcours") {
    throw new Error(`${projectDir} est un projet du parcours : son cadrage se fait dans ses étapes (/ottho), pas avec cette commande.`);
  }
  if (values.save !== undefined) return savePresetCommand(projectDir, presetsDir, values.save, log);
  let data;
  if (values.preset !== undefined) {
    const wanted = values.preset.toLowerCase();
    const preset = presets.find((p) => p.slug.toLowerCase() === wanted || p.name.toLowerCase() === wanted);
    if (!preset) {
      const known = presets.length ? `Exemples : ${presets.map((p) => p.slug).join(", ")}` : "Aucun exemple enregistré.";
      throw new Error(`exemple inconnu : ${values.preset}. ${known}`);
    }
    data = preset.brief;
  } else {
    let raw;
    try {
      raw = await readFile(resolve(cwd, values.json), "utf8");
    } catch (err) {
      throw new Error(`impossible de lire ${values.json} (${err.code ?? err.message})`);
    }
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error(`JSON invalide dans ${values.json} : ${err.message}`);
    }
  }
  let complete;
  try {
    ({ complete } = await writeBrief(projectDir, data, localDate()));
  } catch (err) {
    // Champ invalide (400), brief vide sur un brief rempli (409) : le message suffit.
    throw err instanceof HttpError ? new Error(err.message) : err;
  }
  const missing = missingBlocks(cleanBrief(data)).map((label) => label[0].toLowerCase() + label.slice(1));
  log(`${join(projectDir, BRIEF_FILE)} écrit (${complete ? "complet" : `incomplet : ${missing.join(", ")}`}).`);
  return null;
}

// Brief du projet enregistré comme exemple (même nom : l'exemple précédent est remplacé).
async function savePresetCommand(projectDir, presetsDir, name, log) {
  const { exists, data } = await readBrief(projectDir);
  const file = join(projectDir, BRIEF_FILE);
  if (!exists) throw new Error(`aucun brief à enregistrer : ${file} est absent.`);
  // Brief vide, ou écrit à la main (sans les données du canevas) : rien à reprendre.
  if (isEmptyBrief(data)) throw new Error(`aucun brief à enregistrer : ${file} est vide (ou n'a pas les données du canevas).`);
  let saved;
  try {
    saved = await savePreset(presetsDir, name, data);
  } catch (err) {
    throw err instanceof HttpError ? new Error(err.message) : err;
  }
  const replaced = saved.replaced ? " Il remplace l'exemple précédent du même nom." : "";
  log(`Exemple « ${name.trim()} » enregistré (${join(presetsDir, `${saved.slug}.json`)}).${replaced}`);
  return null;
}

export async function main(argv, { cwd = process.cwd(), log = console.log } = {}) {
  if (argv[0] === "brief") return briefCommand(argv.slice(1), { cwd, log });
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
      `${APP_NAME} ne tourne pas pour ce projet. Il démarre avec Claude Code dans un projet du parcours ou du pipeline mobile, et la commande /parcours ou /pipeline le rouvre. À la main :\n  ${CLI_COMMAND} --project ${JSON.stringify(opts.projectDir)}`,
    );
  }
  const mode = await detectMode(opts.projectDir);
  // Les agents du plugin ne servent qu'au pipeline : la vue du parcours n'affiche pas de graphe.
  const pluginDir = mode === "pipeline" ? (opts.pluginDir ?? (await ownPluginDir()) ?? (await findPluginDir())) : null;
  const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
  // Le journal des agents est tronqué quand il devient trop gros, mais jamais dans le dépôt du
  // parcours : là, le Builder ne touche à rien, ce journal appartient au plugin qui le produit.
  if (mode === "pipeline") await rotateIfNeeded(eventsPath(opts.projectDir));

  for (let port = opts.port; port < opts.port + PORT_COUNT; port++) {
    const found = await probe(port);
    if (found === "free") {
      try {
        // OTTHO_MOBILE_CLAUDE_CONFIG : autre configuration Claude Code (tests), à la place de ~/.claude.json.
        const claudeConfigPath = process.env.OTTHO_MOBILE_CLAUDE_CONFIG || undefined;
        const app = await startApp({
          projectDir: opts.projectDir,
          pluginDir,
          distDir,
          port,
          mode,
          claudeConfigPath,
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
        if (mode === "pipeline" && !pluginDir) log(`Plugin ${PLUGIN_NAME} introuvable : seuls les agents du projet sont affichés.`);
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
