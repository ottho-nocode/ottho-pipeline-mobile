import type { Etape, LigneHistorique, Run } from "../types";
import { PASTILLE } from "../statuts";

const hhmm = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Props = { historique: LigneHistorique[]; etapes: Etape[]; runs: Run[]; onSelect: (id: string) => void };

// Le journal du parcours : ce que Claude a enregistré dans ottho.json, de la plus récente à la plus
// ancienne. S'il a tourné des agents sur ce projet, leur dernière action apparaît en tête.
export function JournalParcours({ historique, etapes, runs, onSelect }: Props) {
  const titres = new Map(etapes.map((e) => [e.id, e.titre]));
  const enCours = runs.find((r) => r.state === "running") ?? null;
  return (
    <section className="card journal-card" aria-label="Journal du parcours">
      <h2>Journal</h2>
      {enCours && (
        <p className="journal-card__agent">
          <span className="state-running" aria-hidden="true">
            ◉
          </span>{" "}
          {enCours.agent} travaille {enCours.trail?.length ? `· ${enCours.trail.at(-1)?.tool} ${enCours.trail.at(-1)?.detail}` : ""}
        </p>
      )}
      {historique.length === 0 ? (
        <p className="muted">Rien d'enregistré pour l'instant. Dès que tu finis une étape dans ton terminal, elle s'inscrit ici.</p>
      ) : (
        <ol className="journal">
          {historique.map((ligne, i) => (
            <li key={`${ligne.at}-${ligne.step}-${i}`}>
              <button type="button" onClick={() => onSelect(ligne.step)} title={`Voir l'étape ${ligne.step}`}>
                <time dateTime={ligne.at}>{hhmm(ligne.at)}</time>
                <span className={`pastille is-${ligne.status}`} aria-hidden="true">
                  {PASTILLE[ligne.status]}
                </span>{" "}
                <span className="journal__titre">{titres.get(ligne.step) ?? ligne.step}</span> <span className="journal__etat">{ligne.statusLabel}</span>
                {ligne.proof && <span className="journal__preuve"> · {ligne.proof}</span>}
                {ligne.reason && <span className="journal__raison"> · {ligne.reason}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
