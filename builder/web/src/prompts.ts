// Prompts copiés par la vue, à coller dans le terminal Claude Code. Le parcours tient en quatre
// commandes du guide (skill « ottho ») : une étape par session, jamais deux d'affilée.

/** Reprendre le parcours là où il en est : Claude charge la skill de l'étape courante. */
export const REPRENDRE = "/ottho";

/** Refaire une étape déjà faite ou sautée (le guide remet son statut à zéro, puis la rejoue). */
export const recommencer = (id: string) => `/ottho recommencer ${id}`;

/** Voir tout le parcours dans le terminal. */
export const ETAPES = "/ottho etapes";

/** Où j'en suis, résumé par le guide. */
export const OU_J_EN_SUIS = "/ottho ou-j-en-suis";

/** Une étape bloquée : on demande à Claude de reprendre le blocage, raison en main. */
export const debloquer = (id: string, raison: string | null) =>
  `/ottho\n\nL'étape ${id} est marquée bloquée dans ottho.json${raison ? ` pour cette raison : ${raison}` : ""}. Reprends ce blocage avec moi avant d'aller plus loin.`;

/** Questions posées dans le terminal : laisser Claude trancher selon ses recommandations. */
export const SUIVRE_RECOS = "Suis tes recommandations pour ces questions : tranche selon la recommandation par défaut de chacune et dis-moi ce que tu as retenu.";

// ---------------------------------------------------------------------------------------------
// Pipeline d'agents
// ---------------------------------------------------------------------------------------------

// Cadrage d'un nouveau projet : renvoie Claude à la procédure du plugin (skill project-bootstrap,
// étape 0) : exemples de brief enregistrés d'abord, sinon les six blocs du canevas, puis docs/brief.md.
export const BRIEF_PROMPT =
  "Lance le cadrage du projet avec la méthode Ottho mobile (skill project-bootstrap, étape 0) : propose-moi d'abord les exemples de brief enregistrés, sinon pose-moi les 6 blocs du canevas un par un, puis écris docs/brief.md.";

// Questions en texte : laisser l'IA trancher (dans le sélecteur, le plugin ajoute ce choix).
export const FOLLOW_RECO_PROMPT =
  "Suis tes recommandations pour ces questions : tranche selon la recommandation par défaut de chacune et consigne-la comme réponse dans le livrable concerné.";

// Validation d'un livrable : Claude la note en fin d'« Historique » du fichier, lu par le Builder.
export const validatePrompt = (label: string, file: string) => `Je valide ${label} (${file}).`;
