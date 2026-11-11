// Crée un projet de démonstration du pipeline d'agents mobile et affiche son chemin.
//
// US-01 : cycle complet et fusionné, verdict de validation enregistré. US-02 : spec et zoning
// écrits et validés, branche créée, plan à faire, deux questions en attente (une dans la spec, une
// posée en direct par designer). US-03 : spec écrite, pas encore validée.
//
// Le projet pointe vers une base Supabase « existante » (celle de l'application web du client),
// dont le relevé coche une table sur deux : la seconde attend la vérification de ses policies RLS.
// Il porte aussi une application Expo, ce qui remplit le panneau de version.
//
// Pendant de scripts/demo-fixture.mjs, qui crée un projet du parcours en 34 étapes.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Les huit agents du pipeline mobile, avec leurs outils : le graphe les range dans ses cinq phases.
const AGENTS = {
  brainstorming: ["opus", "Read, WebFetch, Glob, Grep"],
  "spec-writer": ["opus", "Read, Write, Glob, Grep"],
  designer: ["opus", "Read, Write, WebFetch, Skill, mcp__pencil, mcp__figma"],
  architect: ["opus", "Read, Write, Glob, Grep, mcp__context7, mcp__supabase"],
  developer: ["sonnet", "Read, Write, Edit, Bash, Glob, Grep, mcp__context7, mcp__supabase"],
  "code-reviewer": ["opus", "Read, Glob, Grep, Bash, mcp__supabase"],
  validateur: ["sonnet", "Read, Write, Edit, Bash, Glob, Grep"],
  soumission: ["opus", "Read, Write, Edit, Bash, Glob, Grep, Skill"],
};

export async function createPipelineDemoProject(root) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), "ottho-pipeline-mobile-demo-")));
  const env = { ...process.env, GIT_AUTHOR_NAME: "demo", GIT_AUTHOR_EMAIL: "demo@local", GIT_COMMITTER_NAME: "demo", GIT_COMMITTER_EMAIL: "demo@local" };
  const g = (...args) => execFileSync("git", args, { cwd: dir, env, stdio: "pipe" });
  const w = async (rel, text) => {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), text);
  };
  const today = new Date().toISOString().slice(0, 10);

  // Zoning des écrans clés du projet, en 390 x 844 : le format du zoning mobile.
  await w("design/projet/Accueil.dc.html", '<!doctype html><html><body style="font-family:sans-serif"><h1>Mes chantiers</h1><p>Trois chantiers en cours</p></body></html>\n');
  await w("design/projet/Fiche.dc.html", '<!doctype html><html><body style="font-family:sans-serif"><h1>Fiche chantier</h1></body></html>\n');
  await w(
    "design/projet/canvas.json",
    JSON.stringify({
      order: ["Accueil.dc.html", "Fiche.dc.html"],
      boards: { "Accueil.dc.html": { title: "Mes chantiers", x: 0, y: 0, w: 390, h: 844 }, "Fiche.dc.html": { title: "Fiche chantier", x: 440, y: 0, w: 390, h: 844 } },
    }) + "\n",
  );

  // L'application Expo que les agents construisent : le panneau de version la lit.
  await w(
    "mobile-app/app.json",
    JSON.stringify(
      {
        expo: {
          name: "Chantiers",
          slug: "chantiers",
          version: "1.0.0",
          ios: { bundleIdentifier: "co.exemple.chantiers" },
          android: { package: "co.exemple.chantiers" },
          extra: { eas: { projectId: "11111111-2222-3333-4444-555555555555" } },
        },
      },
      null,
      2,
    ) + "\n",
  );
  await w(
    "mobile-app/eas.json",
    JSON.stringify(
      {
        cli: { version: ">= 18.5.0", appVersionSource: "remote" },
        build: { base: { node: "22.20.0" }, development: { distribution: "internal" }, preview: { distribution: "internal" }, production: {} },
        submit: { production: { ios: { appleTeamId: "AB12CD34EF" } } },
      },
      null,
      2,
    ) + "\n",
  );
  await w("mobile-app/package.json", JSON.stringify({ name: "chantiers", dependencies: { expo: "~54.0.0" } }, null, 2) + "\n");

  // Services externes : Supabase branché en lecture seule sur le projet de l'application web.
  await w(".mcp.json", JSON.stringify({ mcpServers: { supabase: { type: "http", url: "https://mcp.supabase.com/mcp?project_ref=demoprojetwebabcdefg&read_only=true" } } }, null, 2) + "\n");
  // Seule la clé publishable est embarquée : la clé service_role n'a rien à faire ici.
  await w(".env.local", "EXPO_PUBLIC_SUPABASE_URL=https://demoprojetwebabcdefg.supabase.co\nEXPO_PUBLIC_SUPABASE_ANON_KEY=cle-publique-de-demo\n");

  // Le relevé de la base existante : une table vérifiée, une qui attend ses policies.
  await w(
    "docs/base.md",
    `# Base existante · projet demoprojetwebabcdefg\n\nLue le ${today}. Ce document est un relevé : rien n'a été créé ni modifié.\n\n## Authentification\n\nE-mail et « Se connecter avec Apple ». Session de 30 jours. Le profil se crée à la première connexion.\n\n## Tables lues par l'application\n\n- [x] \`profiles\`\n- [ ] \`chantiers\`\n\n## Historique\n\n- ${today} : Relevé écrit par \`architect\`.\n`,
  );

  for (const [name, [model, tools]] of Object.entries(AGENTS)) {
    await w(`fake-plugin/agents/${name}.md`, `---\nname: ${name}\ndescription: Agent ${name} de démonstration\nmodel: ${model}\ntools: ${tools}\n---\n\n# ${name}\n\nPrompt système de démonstration.\n`);
  }

  await w("specs/US-01-connexion.md", `# US-01 : Connexion par e-mail\n\n## Historique\n\n- ${today} : Création par \`spec-writer\`.\n- ${today} : Validé par l'utilisateur.\n`);
  await w("plans/US-01-connexion.md", `# Plan US-01\n\n## Historique\n\n- ${today} : Création par \`architect\`.\n- ${today} : Validé par l'utilisateur.\n`);
  await w("reviews/US-01-connexion-review.md", "# Revue · US-01\n\n## Verdict\n\nAPPROUVÉ\n");
  await w(
    "reviews/US-01-connexion-validation.md",
    `# Validation · US-01 Connexion par e-mail\n\n## À vérifier sur ton téléphone\n\n- [x] **AC1** : Tu reçois le lien par e-mail et tu arrives connecté. _(Expo Go)_\n- [x] **AC2** : Tu rouvres l'application : tu es encore connecté. _(Expo Go)_\n\n## Verdict du client\n\n- Verdict : VERTS\n- Date : ${today}\n- Ce qui ne va pas : rien.\n`,
  );
  await w("e2e/US-01-connexion.md", "Liste écran par écran, cochée par le client.\n");

  g("init", "-q", "-b", "develop");
  g("add", ".");
  g("commit", "-q", "-m", "chore: init");
  g("checkout", "-q", "-b", "feature/US-01-connexion");
  await w("mobile-app/app/onboarding/sign-in.tsx", "export {};\n");
  g("add", ".");
  g("commit", "-q", "-m", "feat(US-01): écran de connexion par e-mail");
  g("checkout", "-q", "develop");
  g("merge", "-q", "--no-ff", "feature/US-01-connexion", "-m", "Merge branch 'feature/US-01-connexion' into develop");

  await w(
    "specs/US-02-liste-chantiers.md",
    `# US-02 : Liste des chantiers\n\n## Questions ouvertes\n\n- [ ] Faut-il voir les chantiers archivés ?\n- [x] La liste doit-elle marcher hors ligne ?\n  > Réponse (${today}) : oui, en lecture seule, depuis le cache.\n\n## Historique\n\n- ${today} : Création par \`spec-writer\`.\n- ${today} : Validé par l'utilisateur.\n`,
  );
  await w(
    "design/US-02-liste-chantiers.md",
    `# US-02 : Liste des chantiers (zoning)\n\n> Zoning : https://claude.ai/artifact/demo-zoning-chantiers\n\nUn écran en 390 × 844, quatre états : chargement, vide, erreur, rempli.\n\n## Audit de conformité\n\n13 contrôles passés : zones tactiles de 44 points, 3 onglets, 2 niveaux, aucun écran sans sortie,\nétat vide présent, aucun tableau conservé, chaque geste web traduit.\n\n## Historique\n\n- ${today} : Création par \`designer\`.\n- ${today} : Validé par l'utilisateur.\n`,
  );
  await w(
    "design/US-02-liste-chantiers/liste.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844"><rect width="390" height="844" fill="#fff"/><text x="24" y="60" font-family="sans-serif" font-size="24" font-weight="bold">Mes chantiers</text><rect x="24" y="90" width="342" height="88" rx="12" fill="none" stroke="#999"/><rect x="24" y="194" width="342" height="88" rx="12" fill="none" stroke="#999"/><rect x="24" y="760" width="342" height="48" rx="12" fill="#ff5a1f"/><text x="150" y="790" font-family="sans-serif" font-size="16" fill="#fff">Ajouter</text></svg>\n',
  );
  await w(
    "design/charte.md",
    `# Charte · Chantiers\n\n- Accent : #ff5a1f (action principale, onglet actif)\n- Texte : #17171c sur fond #ffffff ; thème sombre : #f5f5f7 sur #17171c\n- Police : Inter, 16 points minimum\n- Zones tactiles : 44 points de côté au minimum\n\n## Historique\n\n- ${today} : Création par \`designer\`.\n- ${today} : Validé par l'utilisateur.\n`,
  );
  await w("specs/US-03-photo-chantier.md", `# US-03 : Photo de chantier\n\n## Historique\n\n- ${today} : Création par \`spec-writer\`.\n`);
  g("checkout", "-q", "-b", "feature/US-02-liste-chantiers");

  const t0 = Date.now() - 3_600_000;
  const at = (min) => new Date(t0 + min * 60_000).toISOString();
  // Cycle de US-01 : chaque passage a ses fichiers produits et son compte rendu.
  const cycle = [
    ["spec-writer", 0, "designer", null, ["specs/US-01-connexion.md"]],
    ["designer", 4, "architect", null, ["design/US-01-connexion.md"]],
    ["architect", 8, "developer", null, ["plans/US-01-connexion.md", "docs/base.md"]],
    ["developer", 14, "code-reviewer", null, ["mobile-app/app/onboarding/sign-in.tsx"]],
    ["code-reviewer", 22, "validateur", "APPROUVÉ", ["reviews/US-01-connexion-review.md"]],
    ["validateur", 28, "soumission", "VERTS", ["reviews/US-01-connexion-validation.md"]],
  ];
  const lines = [];
  cycle.forEach(([agent, m, next, verdict, files], i) => {
    const id = `demo-${i}`;
    const agentId = `demo-agent-${i}`;
    lines.push({ v: 1, ts: at(m), type: "start", id, agent, source: "plugin", us: "US-01", branch: "feature/US-01-connexion" });
    lines.push({ v: 1, ts: at(m), type: "launch", id, agentId, agent, source: "plugin", us: "US-01" });
    for (const file of files) lines.push({ v: 1, ts: at(m + 1), type: "activity", agentId, agent, tool: "Write", detail: file });
    const report = `## Compte rendu de ${agent}\n\nFichiers : ${files.map((f) => `\`${f}\``).join(", ")}.${verdict ? `\n\nVerdict : ${verdict}` : ""}\n\n> **Prochaine étape recommandée** : invoquer \`${next}\``;
    lines.push({ v: 1, ts: at(m + 3), type: "end", id, agentId, agent, us: "US-01", next, verdict, questions: [], report });
  });
  lines.push({ v: 1, ts: at(35), type: "start", id: "demo-q", agent: "designer", source: "plugin", us: "US-02", branch: "feature/US-02-liste-chantiers" });
  lines.push({
    v: 1,
    ts: at(40),
    type: "end",
    id: "demo-q",
    agent: "designer",
    us: "US-02",
    next: "architect",
    verdict: null,
    questions: ["Une photo de chantier doit-elle rester visible hors ligne après sa prise ?"],
  });
  await w(".claude/pipeline-events.jsonl", lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return dir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await createPipelineDemoProject());
}
