import type { Etape, Statut } from "./types";

// Pastille et texte pour chaque état. Jamais la couleur seule : un symbole et un mot, toujours.
export const PASTILLE: Record<Statut | "ecartee", string> = {
  done: "✓",
  in_progress: "◉",
  blocked: "▲",
  pending: "○",
  skipped: "⊘",
  ecartee: "◌",
};

export const ETAT_LABEL: Record<Statut | "ecartee", string> = {
  done: "faite",
  in_progress: "en cours",
  blocked: "bloquée",
  pending: "à faire",
  skipped: "sautée",
  ecartee: "selon tes réponses",
};

/** L'état affiché d'une étape : son statut, ou « écartée » si les réponses la mettent de côté. */
export const etatDe = (etape: Etape): Statut | "ecartee" => (etape.applicable ? etape.statut : "ecartee");

/** Durée restante lisible, à partir de minutes. */
export function dureeRestante(minutes: number): string {
  if (minutes <= 0) return "moins d'une heure";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `environ ${Math.round(minutes / 60)} h`;
  const jours = Math.round(minutes / 1440);
  return `environ ${jours} jour${jours > 1 ? "s" : ""}`;
}

// Numéro affiché : le préfixe de l'identifiant (00, 15b, 16…), celui qu'on retrouve dans le nom de
// la skill et dans « /ottho recommencer <id> ». Jamais le rang dans la liste, qui décalerait tout
// après l'étape 15b.
export const numero = (etape: Etape) => /^(\d{2}[a-z]?)/.exec(etape.id)?.[1] ?? String(etape.numero).padStart(2, "0");

/** Pastille d'une étape : décorative, le texte à côté porte le sens. */
export function Pastille({ etape }: { etape: Etape }) {
  const etat = etatDe(etape);
  return (
    <span className={`pastille is-${etat}`} aria-hidden="true">
      {PASTILLE[etat]}
    </span>
  );
}
