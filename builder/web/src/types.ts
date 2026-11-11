// Ce que le serveur pousse dans le flux SSE. Miroir de buildState (server/app.mjs).
//
// Le Builder a deux modes : la vue du parcours en 34 étapes (ParcoursState) et le pipeline d'agents
// SDD mobile (PipelineState). `mode` les distingue. Les types du pipeline gardent les noms de ceux
// du pipeline web, pour qu'un diff entre les deux dépôts reste lisible.

// ---------------------------------------------------------------------------------------------
// Le pipeline d'agents
// ---------------------------------------------------------------------------------------------

export type Phase = "specify" | "plan" | "implement" | "validate" | "release" | "transverse";
export type AgentStatus = "idle" | "running" | "done" | "interrupted";
export type CellStatus = "done" | "running" | "todo" | "ko" | "na";
export type Column = "spec" | "plan" | "code" | "review" | "tests" | "merge";

export type Agent = {
  id: string;
  name: string;
  source: "plugin" | "projet";
  description: string;
  model: string;
  effort: string | null;
  maxTurns: number | null;
  tools: string[];
  // Services externes (MCP) que l'agent sait appeler, ex. ["supabase", "stripe"].
  services?: string[];
  phase: Phase;
  body: string;
};

// Service externe branché pour le projet, et par où (projet, local, utilisateur, connecteur claude.ai).
export type SupabaseTarget = { via: string; project: string | null; readOnly: boolean };
export type Service = { key: string; label: string; via: string[]; needsAuth?: boolean; targets?: SupabaseTarget[] };
// Base de données de l'app du projet, lue dans ses .env (adresse seulement).
export type AppDatabase = { kind: string; project: string | null; host: string; source: string };

// Clé Supabase attendue : « définie » ou non, jamais sa valeur.
export type DatabaseKey = { name: string; source: string };
// Clé secrète que le binaire livré sur les stores embarquerait : interdit, sans exception.
export type SecretLeak = { name: string; source: string; reason: "préfixe public" | "code embarqué" };
// Relevé de la base existante, écrit par l'architecte en la lisant : les tables que l'application
// lit et, pour chacune, si ses policies RLS ont été vérifiées.
export type SurveyTable = { name: string; rls: boolean };
export type DatabaseSurvey = { exists: boolean; file: string; tables: SurveyTable[] };
// Tout ce que le panneau « Base de données » montre. L'application mobile ne crée aucun backend :
// elle se branche sur la base existante de l'application web du client.
export type Database = {
  app: AppDatabase | null;
  publishable: DatabaseKey | null;
  serviceRole: DatabaseKey | null;
  leaks: SecretLeak[];
  survey: DatabaseSurvey;
  unchecked: string[];
  migrations: string[];
};

// Aperçu de l'app du projet (serveur local lancé par le pipeline).
export type Preview = {
  status: "idle" | "starting" | "running" | "failed";
  mode: "static" | "npm" | "none";
  command: string | null;
  url: string | null;
  // Adresse affichée dans le cadre de l'aperçu : relais local qui retire les protections
  // anti-cadre de l'app (absente d'un serveur plus ancien : url).
  frameUrl?: string | null;
  error: string | null;
  log: string;
};

// Configuration des services de l'app (.env.local) : jamais la valeur d'un secret.
export type ConfigField = { name: string; label: string; secret: boolean; required: boolean; set: boolean; value?: string };
export type ConfigService = { key: string; label: string; fields: ConfigField[] };
export type ConfigStatus = { file: string; prefix: string; services: ConfigService[]; other: string[] };

// Brief du projet (onboarding), écrit dans docs/brief.md par Claude (commande brief du CLI) :
// canevas en six blocs du module « De l'idée au projet validé ». Les blocs (champs, consignes,
// critères) viennent du serveur.
export type BriefField = { key: string; label: string; type: "text" | "textarea" | "number"; help?: string };
export type BriefBlock = { key: string; title: string; intro: string; multiple?: boolean; fields: BriefField[]; rubric: string[] };
export type BriefValues = Record<string, string>;
export type Brief = { name: string; [block: string]: string | BriefValues | BriefValues[] };

// Phase projet, avant la première feature.
export type PhaseKey = "brief" | "vision" | "prd" | "design" | "architecture" | "base" | "features";
export type PhaseStage = { key: PhaseKey; label: string; agent: string | null; state: "todo" | "started" | "running" | "validate" | "done" };
export type ProjectPhase = { stages: PhaseStage[]; next: { key: PhaseKey; agent: string | null; state: PhaseStage["state"] } | null };

export type SessionStatus = {
  ask: { ts: string; session: string | null; questions: string[] } | null;
  wait: { ts: string; session: string | null; message: string; kind?: "questions"; questions?: string[] } | null;
};

export type Feature = {
  us: string;
  title: string;
  columns: Record<Column, CellStatus>;
  next: { agent: string; reason: "todo" | "running" | "fix" | "validate" } | null;
  agents: Record<string, Exclude<AgentStatus, "idle">>;
  toValidate: string[];
};

export type Asset = { path: string; name: string; kind: "image" | "font" | "document"; size: number };

export type Screen = { path: string; title: string; x: number | null; y: number | null; w: number; h: number };

export type Deliverable = {
  us: string | null;
  agent: string;
  kind?: "charte" | "prd" | "architecture";
  file: string;
  validated: boolean;
  validatedAt: string | null;
  blocking: boolean;
  mockups?: { links: string[]; linkKinds?: string[]; screens: Screen[]; images: string[]; pen: string[] };
};

export type Run = {
  id: string | null;
  agentId: string | null;
  agent: string;
  source: string;
  us: string | null;
  branch: string | null;
  start: string;
  end: string | null;
  next: string | null;
  verdict: string | null;
  questions: string[];
  activity: Step | null;
  // Dernier signe de vie : lancement, puis chaque action.
  lastSeen?: string;
  steps: number;
  trail: Step[];
  files: string[];
  hasReport: boolean;
  state: "running" | "done" | "interrupted";
};

export type Step = { tool: string; detail: string; ts: string };

export type Question = {
  id: string;
  origin: "livrable" | "direct";
  us: string | null;
  askedBy: string;
  text: string;
  answered: boolean;
  answer: string | null;
  answeredAt: string | null;
  // Répondue dans le sélecteur du terminal (pas encore consignée dans le livrable).
  answeredIn?: "terminal";
  askedAt: string | null;
  line: number | null;
  // Livrable où Claude consigne la réponse.
  target: { file: string };
};

export type PipelineState = {
  app: string;
  mode: "pipeline";
  project: { dir: string; name: string };
  git: boolean;
  pluginFound: boolean;
  agents: Agent[];
  features: Feature[];
  focus: string | null;
  runs: Run[];
  questions: Question[];
  deliverables: Deliverable[];
  assets: Asset[];
  services?: Service[];
  brief?: { exists: boolean; complete: boolean };
  phase?: ProjectPhase;
  // Branche Git courante du projet et fichiers non commités.
  branch?: { name: string | null; dirty: number } | null;
  // Ce que la session principale (Claude Code, dans le terminal) attend : réponse à ses questions, autorisation.
  session?: SessionStatus;
  database: Database;
  // Ce que la fabrication Expo embarquera : le panneau de version de l'agent soumission.
  expo: Expo;
  preview?: Preview;
  writeToken: string;
  corrupt: number;
  generatedAt: string;
};

// ---------------------------------------------------------------------------------------------
// La vue du parcours en 34 étapes
// ---------------------------------------------------------------------------------------------

export type Statut = "pending" | "in_progress" | "done" | "skipped" | "blocked";

export type Etape = {
  id: string;
  // Rang dans la table du Builder (numéro affiché), et rang dans l'ordre lu du projet.
  numero: number;
  rang: number;
  // false : étape annoncée par le projet mais inconnue du Builder (parcours plus récent).
  connue: boolean;
  titre: string;
  acte: string;
  condition: string;
  // Ce que dit la condition, en français : « si tu publies sur iPhone ».
  conditionLabel: string;
  but: string;
  minutes: number | null;
  duree: string | null;
  skill: string | null;
  description: string;
  statut: Statut;
  statutLabel: string;
  // false : écartée par les réponses de la personne (branche à non).
  applicable: boolean;
  preuve: string | null;
  raison: string | null;
  majLe: string | null;
};

export type Acte = { nom: string; etapes: string[]; faites: number; total: number; minutesRestantes: number };
export type Avancement = { faites: number; total: number; minutesRestantes: number };
export type Choix = { key: string; label: string; valeur: boolean | null; reponse: string };
export type Produit = { nom: string | null; idee: string | null; utilisateurs: string | null; alternative: string | null; fonction: string | null };
export type Reponse = { key: string; value: string };

// Ce que la fabrication Expo embarquera, lu dans site-config.ts et mobile-app/eas.json.
export type ExpoChamp = { key: string; label: string; valeur: string | null; heritee: boolean };
export type Expo =
  | { present: false }
  | {
      present: true;
      config: string | null;
      easFile: string | null;
      champs: ExpoChamp[];
      profils: string[];
      versionSource: string | null;
      relie: boolean;
      heritage: string[];
    };
export type LigneHistorique = { at: string; step: string; status: Statut; statusLabel: string; proof: string | null; reason: string | null };

export type ParcoursState = {
  app: string;
  mode: "parcours";
  project: { dir: string; name: string };
  branch: { name: string | null; dirty: number } | null;
  // source « builder » : le parcours du projet n'a pas pu être lu, la table du Builder a servi.
  parcours: { source: "projet" | "builder"; actes: string[] };
  etapes: Etape[];
  courante: string | null;
  avancement: Avancement;
  actes: Acte[];
  choix: Choix[];
  backend: { key: string; label: string };
  produit: Produit;
  expo: Expo;
  reponses: Reponse[];
  historique: LigneHistorique[];
  etat: { exists: boolean; error: string | null; currentStep: string | null; updatedAt: string | null };
  runs: Run[];
  session?: SessionStatus;
  corrupt: number;
  readToken: string;
  generatedAt: string;
};

// Ce que le serveur pousse dans le flux SSE, selon le mode du projet observé (server/app.mjs).
export type State = ParcoursState | PipelineState;
