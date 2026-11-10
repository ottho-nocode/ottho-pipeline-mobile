// La carte du parcours : les 34 étapes, leur acte, leur condition, leur durée, leur skill.
//
// Trois sources, croisées par identifiant :
//   1. le projet observé : le tableau ETAPES de scripts/ottho-parcours.mjs (condition, minutes, but,
//      et phase quand il la porte) ;
//   2. la table locale ci-dessous : numéro, acte et titre accentué des 34 étapes connues ;
//   3. le SKILL.md de l'étape (.agents/skills/ottho-etape-<id>/) : sa description et son chemin.
//
// Le tableau du projet est extrait par découpage de texte puis JSON.parse, jamais par import : le
// Builder ne charge aucun code du dépôt qu'il observe.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";

export const PARCOURS_FILE = "scripts/ottho-parcours.mjs";
export const SKILLS_DIR = join(".agents", "skills");

// Les cinq actes du parcours, du premier au dernier. Repris du compagnon visuel du dépôt du
// parcours (branche ottho-builder), qui les a éprouvés auprès de débutants.
export const ACTES = ["Avant de coder", "Construire", "Avant de publier", "Publier", "Après"];

// Table locale : l'ordre, l'acte et le titre accentué. Le dépôt du parcours écrit ses titres sans
// accents sur certaines branches ; l'interface, elle, est lue par des débutants.
export const ETAPES_CONNUES = [
  { id: "00-bienvenue", acte: "Avant de coder", titre: "Bienvenue, on fait connaissance" },
  { id: "01-ton-idee", acte: "Avant de coder", titre: "Ton idée tient la route" },
  { id: "02-ton-statut", acte: "Avant de coder", titre: "Tu as le droit de vendre une application" },
  { id: "03-ce-que-ca-coute", acte: "Avant de coder", titre: "Tu sais ce que tu vas payer" },
  { id: "04-ta-machine", acte: "Avant de coder", titre: "Ta machine est prête" },
  { id: "05-ton-materiel", acte: "Avant de coder", titre: "Tu peux tester sur un vrai téléphone" },
  { id: "06-tes-comptes", acte: "Avant de coder", titre: "Tes comptes sont créés" },
  { id: "07-compte-apple", acte: "Avant de coder", titre: "Ton compte Apple est actif" },
  { id: "08-compte-google", acte: "Avant de coder", titre: "Ton compte Google Play est actif" },
  { id: "09-ton-projet", acte: "Construire", titre: "Ton projet t'appartient vraiment" },
  { id: "10-identite", acte: "Construire", titre: "Ton application a un nom et une identité" },
  { id: "11-ce-que-fait-ton-app", acte: "Construire", titre: "Tu sais ce que ton application va faire" },
  { id: "12-le-plan", acte: "Construire", titre: "Le plan de fabrication est prêt" },
  { id: "13-ton-logo", acte: "Construire", titre: "Ton application a un logo" },
  { id: "14-tes-visuels", acte: "Construire", titre: "Tes écrans ont des images" },
  { id: "15-ta-connexion", acte: "Construire", titre: "Tes utilisateurs peuvent se connecter" },
  { id: "15b-sans-compte", acte: "Construire", titre: "Ton application s'ouvre sans créer de compte" },
  { id: "16-construire", acte: "Construire", titre: "Tu construis ton application, morceau par morceau" },
  { id: "17-quand-tout-va-mal", acte: "Avant de publier", titre: "Ton application se comporte bien quand tout va mal" },
  { id: "18-ton-prix", acte: "Avant de publier", titre: "Tu sais combien tu vends et comment" },
  { id: "19-signalement", acte: "Avant de publier", titre: "Les gens peuvent signaler un problème" },
  { id: "20-donnees-personnelles", acte: "Avant de publier", titre: "Tes utilisateurs maîtrisent leurs données" },
  { id: "21-tes-textes-legaux", acte: "Avant de publier", titre: "Tes textes légaux sont les tiens" },
  { id: "22-ton-site", acte: "Avant de publier", titre: "Ton site est en ligne" },
  { id: "23-verifier", acte: "Avant de publier", titre: "Tu vérifies que tout marche vraiment" },
  { id: "24-iphone-premier-envoi", acte: "Publier", titre: "Ton application tourne sur un vrai iPhone" },
  { id: "25-android-premier-envoi", acte: "Publier", titre: "Ton application tourne sur un vrai Android" },
  { id: "26-sauvegarder-tes-cles", acte: "Publier", titre: "Tes clés de signature sont à l'abri" },
  { id: "27-tes-testeurs", acte: "Publier", titre: "Tes testeurs utilisent ton application" },
  { id: "28-ta-fiche-store", acte: "Publier", titre: "Ta fiche magasin est prête" },
  { id: "29-controle-avant-envoi", acte: "Publier", titre: "Tu passes le contrôle avant envoi" },
  { id: "30-envoi-a-apple", acte: "Publier", titre: "Ton application part chez Apple" },
  { id: "31-publier-android", acte: "Publier", titre: "Ton application part chez Google" },
  { id: "32-apres-publication", acte: "Après", titre: "Ton application vit : avis, bugs, échéances" },
];

// Ce que dit une condition, en français, pour la fiche d'une étape écartée.
export const CONDITION_LABEL = {
  toujours: "pour tout le monde",
  ios: "si tu publies sur iPhone",
  android: "si tu publies sur Android",
  paiement: "si ton application fait payer",
  contenu_partage: "si tes utilisateurs voient le contenu des autres",
  compte_utilisateur: "si tes utilisateurs ont un compte",
  sans_compte: "si tes utilisateurs n'ont pas de compte",
  supabase: "si ton projet utilise Supabase",
};

export const conditionLabel = (condition) => CONDITION_LABEL[condition] ?? `si « ${condition} »`;

// Durée lisible. 0 : étape sans fin, on y revient (la dernière).
export function formaterDuree(minutes) {
  if (!Number.isFinite(minutes)) return null;
  if (minutes === 0) return "en continu";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`;
  const jours = Math.round(minutes / 1440);
  return `${jours} jour${jours > 1 ? "s" : ""}`;
}

// Le tableau ETAPES du projet, extrait sans exécuter son code. Les crochets sont équilibrés pour
// trouver la fin du littéral, puis le texte est relu comme du JSON (c'est ce qu'il est : clés et
// chaînes entre guillemets doubles). Rien d'exploitable : null si le format a changé.
export function extraireEtapes(source) {
  if (typeof source !== "string") return null;
  const start = source.indexOf("ETAPES");
  if (start === -1) return null;
  const open = source.indexOf("[", start);
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) {
      try {
        const parsed = JSON.parse(source.slice(open, i + 1));
        return Array.isArray(parsed) && parsed.every((e) => e && typeof e.id === "string") ? parsed : null;
      } catch {
        return null; // littéral valide en JavaScript mais pas en JSON (commentaire, apostrophe simple…)
      }
    }
  }
  return null;
}

// Identifiant d'étape : deux chiffres, une lettre facultative, puis des mots en minuscules. Aucun
// point, aucune barre oblique : le chemin du SKILL.md se construit sans échappatoire possible.
export const ETAPE_ID_RE = /^[0-9]{2}[a-z]?-[a-z0-9-]+$/;

export const skillPath = (id) => (ETAPE_ID_RE.test(id) ? `${SKILLS_DIR.split("\\").join("/")}/ottho-etape-${id}/SKILL.md` : null);

// Le texte du SKILL.md d'une étape (ce que Claude suivra), pour le lire dans l'interface.
export async function readSkill(projectDir, id) {
  const rel = skillPath(id);
  if (!rel) return null;
  const text = await readFile(join(projectDir, rel), "utf8").catch(() => null);
  if (text === null) return null;
  const { data, body } = parseFrontmatter(text);
  return { path: rel, description: data.description ?? "", content: body.trim() };
}

// Description et chemin du SKILL.md d'une étape, ou null si le dossier n'existe pas.
async function lireSkill(projectDir, id) {
  const rel = skillPath(id);
  if (!rel) return null;
  const text = await readFile(join(projectDir, rel), "utf8").catch(() => null);
  if (text === null) return null;
  const { data } = parseFrontmatter(text);
  return { skill: rel, description: data.description ?? "" };
}

/**
 * La carte du parcours pour un projet donné.
 *
 * `etapes` suit l'ordre du projet quand il est lisible, sinon celui de la table locale. Une étape
 * annoncée par le projet mais inconnue du Builder porte `connue: false` : elle est affichée telle
 * quelle plutôt que masquée. `source` dit d'où vient l'ordre, pour que l'interface puisse le signaler.
 */
export async function loadParcours(projectDir) {
  const text = await readFile(join(projectDir, PARCOURS_FILE), "utf8").catch(() => null);
  const duProjet = extraireEtapes(text);
  const locales = new Map(ETAPES_CONNUES.map((e, index) => [e.id, { ...e, numero: index }]));
  const base = duProjet ?? ETAPES_CONNUES.map((e) => ({ id: e.id }));
  const etapes = await Promise.all(
    base.map(async (brute, index) => {
      const locale = locales.get(brute.id) ?? null;
      const minutes = Number.isFinite(brute.minutes) ? brute.minutes : null;
      const skill = await lireSkill(projectDir, brute.id);
      return {
        id: brute.id,
        numero: locale ? locale.numero : index,
        rang: index,
        connue: Boolean(locale),
        // Titre accentué du Builder s'il connaît l'étape : le dépôt du parcours écrit sans accents
        // sur certaines branches, et l'interface est lue par des débutants.
        titre: locale?.titre ?? (typeof brute.titre === "string" ? brute.titre : brute.id),
        acte: typeof brute.phase === "string" && ACTES.includes(brute.phase) ? brute.phase : (locale?.acte ?? ACTES.at(-1)),
        condition: typeof brute.condition === "string" ? brute.condition : "toujours",
        conditionLabel: conditionLabel(typeof brute.condition === "string" ? brute.condition : "toujours"),
        but: typeof brute.but === "string" ? brute.but : "",
        minutes,
        duree: formaterDuree(minutes),
        skill: skill?.skill ?? null,
        description: skill?.description ?? "",
      };
    }),
  );
  return { etapes, source: duProjet ? "projet" : "builder", actes: ACTES };
}
