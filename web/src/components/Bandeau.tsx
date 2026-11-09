import { REPRENDRE, debloquer } from "../prompts";
import { numero } from "../statuts";
import type { Etape } from "../types";
import { CopyButton } from "./CopyButton";

type Props = { courante: Etape | null; commence: boolean; onVoir: (id: string) => void };

// Haut de la scène : toujours la même phrase au même endroit, et le prompt à coller. La personne
// n'a jamais à chercher quoi faire maintenant.
export function Bandeau({ courante, commence, onVoir }: Props) {
  if (!commence) {
    return (
      <div className="banner">
        <span>
          <span className="eyebrow">Première étape</span>
          Colle <code>/ottho</code> dans ton terminal : Claude démarre le parcours avec toi.
        </span>
        <div className="banner__actions">
          <CopyButton text={REPRENDRE} label="Copier « /ottho »" title="À coller dans ton terminal Claude" />
        </div>
      </div>
    );
  }
  if (!courante) {
    return (
      <div className="banner is-fini">
        <span>
          <span className="eyebrow">Parcours terminé</span>
          Toutes les étapes qui te concernent sont faites.
        </span>
      </div>
    );
  }
  const bloquee = courante.statut === "blocked";
  return (
    <div className={bloquee ? "banner is-bloquee" : "banner"}>
      <span className="banner__texte">
        <span className="eyebrow">{bloquee ? "Étape bloquée" : "Ton étape"}</span>
        <button type="button" className="banner__lien" onClick={() => onVoir(courante.id)}>
          {numero(courante)} {courante.titre}
        </button>
        {bloquee && courante.raison ? ` · ${courante.raison}` : courante.duree ? ` · compte ${courante.duree}` : ""}
      </span>
      <div className="banner__actions">
        <CopyButton
          text={bloquee ? debloquer(courante.id, courante.raison) : REPRENDRE}
          label={bloquee ? "Copier le prompt pour débloquer" : "Copier « /ottho »"}
          title="À coller dans ton terminal Claude"
        />
      </div>
    </div>
  );
}
