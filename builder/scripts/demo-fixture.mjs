// Crée un projet de parcours de démonstration pour Ottho Builder Mobile et affiche son chemin.
//
// L'état posé ressemble à un parcours commencé pour de vrai : trois étapes faites avec leur preuve,
// une en cours, une bloquée avec sa raison, une sautée, des branches qui écartent deux étapes, et
// une question en attente dans le terminal. Les titres du parcours de démo sont écrits sans accents,
// comme ceux du vrai dépôt : la vue doit afficher les siens, accentués.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ETAPES_CONNUES } from "../server/parcours.mjs";

// condition, minutes et but, tels que le dépôt du parcours les écrit (sans accents).
const DETAILS = {
  "00-bienvenue": ["toujours", 5, "Comprendre ou tu en es et ce qui t'attend"],
  "01-ton-idee": ["toujours", 30, "Verifier que quelqu'un veut ton app avant de depenser"],
  "02-ton-statut": ["toujours", 45, "Choisir entre publier a ton nom ou creer une micro-entreprise"],
  "03-ce-que-ca-coute": ["toujours", 10, "Le budget total, sans surprise"],
  "04-ta-machine": ["toujours", 60, "Installer les outils, verifier l'espace disque"],
  "05-ton-materiel": ["toujours", 15, "Verifier iPhone/Android, version minimale, ou emulateur"],
  "06-tes-comptes": ["toujours", 90, "Convex, Expo, et les comptes developpeur"],
  "07-compte-apple": ["ios", 120, "99 $/an, verification d'identite, contrats"],
  "08-compte-google": ["android", 90, "25 $, verification d'identite, enregistrement"],
  "09-ton-projet": ["toujours", 30, "Purger tout l'heritage de la boilerplate"],
  "10-identite": ["toujours", 45, "Nom, identifiants, couleurs, verification que le nom est libre"],
  "11-ce-que-fait-ton-app": ["toujours", 60, "Le cahier des charges, en francais simple"],
  "12-le-plan": ["toujours", 30, "Decoupage en morceaux realisables"],
  "13-ton-logo": ["toujours", 30, "Generation et choix du logo"],
  "14-tes-visuels": ["toujours", 30, "Images d'accueil, remplacement des images heritees"],
  "15-ta-connexion": ["compte_utilisateur", 45, "E-mail, et boutons Google/Apple si choisis"],
  "15b-sans-compte": ["sans_compte", 20, "Retirer l obligation de connexion pour un jeu ou un outil personnel"],
  "16-construire": ["toujours", 480, "La boucle de developpement guidee"],
  "17-quand-tout-va-mal": ["toujours", 60, "Erreurs visibles, mode hors-ligne, ecrans de chargement"],
  "18-ton-prix": ["paiement", 45, "Prix, abonnement ou achat unique, test sans payer"],
  "19-signalement": ["contenu_partage", 60, "Signalement, blocage, moderation - exige par Apple"],
  "20-donnees-personnelles": ["compte_utilisateur", 60, "Export RGPD et vraie suppression"],
  "21-tes-textes-legaux": ["toujours", 60, "Auditer et remplacer 188 lignes ecrites pour un tiers"],
  "22-ton-site": ["toujours", 45, "Page vitrine, mentions legales, URL de support"],
  "23-verifier": ["toujours", 45, "Test complet avant d'engager de l'argent"],
  "24-iphone-premier-envoi": ["ios", 90, "Premiere fabrication et TestFlight"],
  "25-android-premier-envoi": ["android", 90, "Premiere fabrication et piste de test"],
  "26-sauvegarder-tes-cles": ["android", 20, "Le keystore : perte definitive si non sauvegarde"],
  "27-tes-testeurs": ["android", 20160, "12 testeurs pendant 14 jours - exigence Google"],
  "28-ta-fiche-store": ["toujours", 90, "Captures, description, categorie, classification d'age"],
  "29-controle-avant-envoi": ["toujours", 45, "Tout ce qu'Apple et Google vont reprocher"],
  "30-envoi-a-apple": ["ios", 60, "Soumission et attente de relecture"],
  "31-publier-android": ["android", 60, "Publication et deploiement progressif"],
  "32-apres-publication": ["toujours", 0, "Refus, mises a jour, renouvellements, retour arriere"],
};

// Titre sans accents, comme le dépôt du parcours l'écrit sur la branche servie.
const sansAccents = (texte) => texte.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/'/g, " ");

const etapesDemo = () =>
  ETAPES_CONNUES.map((e) => {
    const [condition, minutes, but] = DETAILS[e.id];
    return { id: e.id, titre: sansAccents(e.titre), condition, minutes, but };
  });

const parcoursSource = (etapes) => `#!/usr/bin/env node
/** Parcours de demonstration : meme forme que le vrai scripts/ottho-parcours.mjs. */
export const ETAPES = ${JSON.stringify(etapes, null, 2)};

export function etapeApplicable(etape, branches) {
  branches = branches || {};
  if (etape.condition === "toujours") return true;
  if (etape.condition === "sans_compte") return branches.compte_utilisateur === false;
  return branches[etape.condition] === true;
}
`;

const skillSource = (etape, but) => `---
name: ottho-etape-${etape.id}
description: Etape ${etape.id} du parcours Ottho de demonstration. ${but}. Utiliser pour l'etape ${etape.id}.
disable-model-invocation: true
---

# Etape ${etape.id} — ${etape.titre}

**Duree : ${DETAILS[etape.id][1]} minutes.**

## 1. Ou on en est

\`\`\`bash
node scripts/ottho-state.mjs status
\`\`\`

## 2. Ce qui va se passer

${but}.

## 3. La preuve

L'etape se termine sur une preuve verifiable, enregistree avec :

\`\`\`bash
node scripts/ottho-state.mjs complete ${etape.id} --proof "<preuve>"
\`\`\`
`;

export async function createDemoProject(root) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), "ottho-parcours-demo-")));
  const env = { ...process.env, GIT_AUTHOR_NAME: "demo", GIT_AUTHOR_EMAIL: "demo@local", GIT_COMMITTER_NAME: "demo", GIT_COMMITTER_EMAIL: "demo@local" };
  const g = (...args) => execFileSync("git", args, { cwd: dir, env, stdio: "pipe" });
  const w = async (rel, text) => {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), text);
  };

  const etapes = etapesDemo();
  await w("scripts/ottho-parcours.mjs", parcoursSource(etapes));
  for (const etape of etapes) await w(`.agents/skills/ottho-etape-${etape.id}/SKILL.md`, skillSource(etape, etape.but));
  await w(
    ".agents/skills/ottho/SKILL.md",
    "---\nname: ottho\ndescription: Le guide du parcours de demonstration.\n---\n\n# Ottho Builder Mobile\n\nUne etape = une session.\n",
  );

  const h = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  const steps = {
    "00-bienvenue": { status: "done", updated_at: h(600), proof: "5 branches enregistrees (ios, android, contenu_partage, compte_utilisateur = oui ; paiement = non), parcours personnalise affiche : 32 etapes sur 34" },
    "01-ton-idee": { status: "done", updated_at: h(540), proof: "idee, utilisateurs, alternative et fonction principale enregistres" },
    "02-ton-statut": { status: "done", updated_at: h(300), proof: "micro-entreprise creee, numero SIRET recu le 12 du mois" },
    "03-ce-que-ca-coute": { status: "skipped", updated_at: h(280), skip_reason: "budget deja valide hors du parcours" },
    "04-ta-machine": { status: "in_progress", updated_at: h(30) },
    "06-tes-comptes": { status: "blocked", updated_at: h(20), blocked_reason: "la verification d'identite Apple attend un justificatif de domicile de moins de trois mois" },
  };
  const history = Object.entries(steps)
    .map(([step, v]) => ({ at: v.updated_at, step, status: v.status, ...(v.proof ? { proof: v.proof } : {}), ...(v.blocked_reason ? { reason: v.blocked_reason } : {}), ...(v.skip_reason ? { reason: v.skip_reason } : {}) }))
    .sort((a, b) => a.at.localeCompare(b.at));
  await w(
    "ottho.json",
    JSON.stringify(
      {
        schema_version: 1,
        created_at: h(600),
        updated_at: h(20),
        product: {
          idee: "Systeme de reservation avec caution pour coiffeurs independants.",
          nom_provisoire: "app-coiffeur",
          utilisateurs: "Coiffeurs independants en France, salon solo de 1 a 2 fauteuils.",
          alternative_actuelle: "A la main : appels, rappels le soir, relances SMS.",
          fonction_principale: "La caution a la reservation, qui engage la cliente.",
        },
        branches: { ios: true, android: true, paiement: false, contenu_partage: true, compte_utilisateur: true },
        answers: {
          mvp_top3: "1) Reservation avec caution. 2) Rappel J-1 par SMS. 3) Remise en ligne du creneau libere.",
          frein_principal: "Mes clientes vont-elles accepter de laisser une caution ?",
        },
        steps,
        current_step: "04-ta-machine",
        history,
      },
      null,
      2,
    ) + "\n",
  );

  // L'application Expo : le nom est deja celui de la personne, les identifiants viennent encore du
  // modele. C'est ce que les etapes 09 et 10 corrigent, et ce qu'un build enverrait tel quel.
  await w(
    "site-config.ts",
    `export const SiteConfig = {
  title: "Mon salon",
  description: "Reservation avec caution",
  slug: "nowstack",
  bundleId: "mobile.aiblueprint.dev",
  androidPackage: "dev.melvynx.nowstack",
  appleTeamId: "UUFHFWGCU4",
  easProjectId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  version: "1.0.0",
};
`,
  );
  await w(
    "mobile-app/eas.json",
    JSON.stringify(
      {
        cli: { version: ">= 18.5.0", appVersionSource: "remote" },
        build: { base: { node: "22.20.0" }, development: { extends: "base", developmentClient: true }, preview: { extends: "base" }, production: { extends: "base", autoIncrement: true } },
        submit: { production: {} },
      },
      null,
      2,
    ) + "\n",
  );
  await w("mobile-app/app.config.ts", "import { SiteConfig } from '../site-config.ts';\nexport default () => ({ name: SiteConfig.title });\n");

  await w("docs/mobile-store-deployment.md", "# Publier sur les magasins\n\nNotes de demonstration.\n");
  await w("README.md", "# Projet de demonstration\n\nParcours mobile Ottho, etat de demonstration.\n");
  await w("package.json", JSON.stringify({ name: "app-coiffeur-demo", private: true }, null, 2) + "\n");

  // Une question en attente dans le terminal : la vue doit la signaler au-dessus de l'étape.
  const events = [
    { v: 1, ts: h(25), type: "start", id: "demo-1", agent: "claude", source: "session" },
    { v: 1, ts: h(24), type: "activity", agent: "claude", tool: "Bash", detail: "node scripts/ottho-state.mjs status" },
    { v: 1, ts: h(22), type: "ask", agent: "claude", source: "session", session: "demo-session", questions: ["Tu veux publier sur iPhone, sur Android, ou les deux ?"] },
  ];
  await w(".claude/pipeline-events.jsonl", events.map((l) => JSON.stringify(l)).join("\n") + "\n");

  g("init", "-q", "-b", "main");
  g("add", ".");
  g("commit", "-q", "-m", "chore: parcours de demonstration");
  return dir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await createDemoProject());
}
