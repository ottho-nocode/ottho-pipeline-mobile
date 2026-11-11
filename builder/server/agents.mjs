// Charge les agents Claude Code depuis le plugin ottho-pipeline-mobile et depuis le
// projet (.claude/agents). Chaque carte du graphe vient d'ici.
//
// Le pipeline mobile a huit agents et cinq phases : `validateur` remplace `tester` (pas de
// simulateur, pas d'émulateur : l'œil du client sur son propre téléphone), et `soumission` tient
// la phase Release, qui est séquentielle après Validate et non transverse.
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { servicesOfTools } from "./services.mjs";

export const PHASE_OF = {
  brainstorming: "specify",
  "spec-writer": "specify",
  designer: "specify",
  architect: "plan",
  developer: "implement",
  "code-reviewer": "validate",
  validateur: "validate",
  soumission: "release",
};

export function toAgent(fileName, text, source) {
  const { data, body } = parseFrontmatter(text);
  const name = data.name || fileName.replace(/\.md$/, "");
  const tools = data.tools ? data.tools.split(",").map((t) => t.trim()).filter(Boolean) : [];
  return {
    id: `${source}:${name}`,
    name,
    source,
    description: data.description ?? "",
    model: data.model ?? "inherit",
    effort: data.effort ?? null,
    maxTurns: data.maxTurns ? Number(data.maxTurns) : null,
    tools,
    // Services externes (MCP) que l'agent sait appeler : Supabase, Stripe…
    services: servicesOfTools(tools),
    phase: PHASE_OF[name] ?? "transverse",
    body: body.trim(),
  };
}

async function readAgentsDir(dir, source) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const files = names.filter((n) => n.endsWith(".md")).sort();
  return Promise.all(files.map(async (f) => toAgent(f, await readFile(join(dir, f), "utf8"), source)));
}

export async function loadAgents({ pluginDir, projectDir }) {
  const plugin = pluginDir ? await readAgentsDir(join(pluginDir, "agents"), "plugin") : [];
  const project = await readAgentsDir(join(projectDir, ".claude", "agents"), "projet");
  return [...plugin, ...project];
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Dossier racine du plugin installé, ou null. Source principale : le registre
// de Claude Code ; repli : la version la plus haute du cache.
export const PLUGIN_NAME = "ottho-pipeline-mobile";

export async function findPluginDir(home = homedir()) {
  try {
    const raw = await readFile(join(home, ".claude", "plugins", "installed_plugins.json"), "utf8");
    const path = JSON.parse(raw).plugins?.[`${PLUGIN_NAME}@${PLUGIN_NAME}`]?.[0]?.installPath;
    if (path) return path;
  } catch {
    // registre absent ou illisible : on tente le cache
  }
  const cache = join(home, ".claude", "plugins", "cache", PLUGIN_NAME, PLUGIN_NAME);
  try {
    const versions = (await readdir(cache)).sort(compareVersions);
    if (versions.length) return join(cache, versions.at(-1));
  } catch {
    // plugin non installé
  }
  return null;
}
