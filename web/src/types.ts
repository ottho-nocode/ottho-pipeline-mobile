// Ce que le serveur pousse dans le flux SSE. Miroir de buildState (server/app.mjs).

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

export type Step = { tool: string; detail: string; ts: string };

export type Run = {
  id: string | null;
  agent: string;
  source: string;
  start: string;
  end: string | null;
  lastSeen?: string;
  steps: number;
  trail: Step[];
  files: string[];
  questions: string[];
  hasReport: boolean;
  state: "running" | "done" | "interrupted";
};

export type SessionStatus = {
  ask: { ts: string; session: string | null; questions: string[] } | null;
  wait: { ts: string; session: string | null; message: string; kind?: "questions"; questions?: string[] } | null;
};

export type State = {
  app: string;
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
