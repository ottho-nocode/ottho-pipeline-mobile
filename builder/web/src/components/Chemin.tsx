import type { Acte, Etape, State } from "../types";
import { ETAT_LABEL, Pastille, dureeRestante, etatDe, numero } from "../statuts";

type Props = {
  state: State;
  // Actes dépliés : l'acte de l'étape courante l'est par défaut, le choix de la personne l'emporte.
  ouverts: Record<string, boolean>;
  onToggleActe: (nom: string) => void;
  selected: string | null;
  onSelect: (id: string) => void;
};

const parId = (etapes: Etape[]) => new Map(etapes.map((e) => [e.id, e]));

// Le chemin du parcours : cinq actes empilés, l'acte en cours déplié en cartes d'étape, les autres
// en ligne de pastilles. Les étapes écartées par les réponses descendent en bas de leur acte.
export function Chemin({ state, ouverts, onToggleActe, selected, onSelect }: Props) {
  const etapes = parId(state.etapes);
  const courante = state.courante ? (etapes.get(state.courante) ?? null) : null;
  const acteCourant = courante?.acte ?? null;
  const estOuvert = (acte: Acte) => ouverts[acte.nom] ?? acte.nom === acteCourant;
  return (
    <section className="chemin" aria-label="Le parcours, acte par acte">
      <header className="chemin__tete">
        <div>
          <span className="eyebrow">Ton parcours</span>
          <p className="chemin__compte">
            <strong>
              {state.avancement.faites} étape{state.avancement.faites === 1 ? "" : "s"} sur {state.avancement.total}
            </strong>
            {state.avancement.total > state.avancement.faites && <> · il reste {dureeRestante(state.avancement.minutesRestantes)}</>}
          </p>
        </div>
        <div className="chemin__barre" role="img" aria-label={`${state.avancement.faites} étapes faites sur ${state.avancement.total}`}>
          <span style={{ width: `${state.avancement.total ? (state.avancement.faites / state.avancement.total) * 100 : 0}%` }} />
        </div>
      </header>

      <ol className="chemin__actes">
        {state.actes.map((acte, index) => {
          const dedans = acte.etapes.map((id) => etapes.get(id)).filter((e): e is Etape => Boolean(e));
          if (dedans.length === 0) return null;
          const ouvert = estOuvert(acte);
          const retenues = dedans.filter((e) => e.applicable);
          const ecartees = dedans.filter((e) => !e.applicable);
          return (
            <li key={acte.nom} className={`acte${acte.nom === acteCourant ? " is-courant" : ""}${ouvert ? " is-ouvert" : ""}`}>
              <button
                type="button"
                className="acte__tete"
                aria-expanded={ouvert}
                onClick={() => onToggleActe(acte.nom)}
                title={ouvert ? `Replier « ${acte.nom} »` : `Déplier « ${acte.nom} »`}
                // Lu en une phrase : le nom de l'acte, son avancement, puis ce que fait le bouton.
                aria-label={`${acte.nom}, ${acte.faites} étape${acte.faites === 1 ? "" : "s"} faite${acte.faites === 1 ? "" : "s"} sur ${acte.total}. ${ouvert ? "Replier" : "Déplier"}.`}
              >
                <span className="acte__rang" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="acte__nom">{acte.nom}</span>
                <span className="acte__compte">
                  {acte.faites} faite{acte.faites === 1 ? "" : "s"} sur {acte.total}
                </span>
                <span className="acte__avance" aria-hidden="true">
                  <span style={{ width: `${acte.total ? (acte.faites / acte.total) * 100 : 0}%` }} />
                </span>
                <span className="acte__chevron" aria-hidden="true">
                  {ouvert ? "⌄" : "›"}
                </span>
              </button>

              {!ouvert && (
                <ul className="acte__pastilles" aria-label={`${acte.nom} : ${acte.faites} étapes faites sur ${acte.total}`}>
                  {dedans.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className={`pastille-btn${e.id === state.courante ? " is-courante" : ""}`}
                        onClick={() => onSelect(e.id)}
                        title={`${numero(e)} ${e.titre} : ${ETAT_LABEL[etatDe(e)]}`}
                      >
                        <Pastille etape={e} />
                        <span className="sr-only">
                          {numero(e)} {e.titre} : {ETAT_LABEL[etatDe(e)]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {ouvert && (
                <>
                  <ul className="acte__etapes">
                    {retenues.map((e) => (
                      <li key={e.id}>
                        <CarteEtape etape={e} courante={e.id === state.courante} selected={e.id === selected} onSelect={onSelect} />
                      </li>
                    ))}
                  </ul>
                  {ecartees.length > 0 && (
                    <div className="acte__ecartees">
                      <h4>Selon tes réponses, ces étapes ne te concernent pas</h4>
                      <ul>
                        {ecartees.map((e) => (
                          <li key={e.id}>
                            <CarteEtape etape={e} courante={false} selected={e.id === selected} onSelect={onSelect} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CarteEtape({ etape, courante, selected, onSelect }: { etape: Etape; courante: boolean; selected: boolean; onSelect: (id: string) => void }) {
  const etat = etatDe(etape);
  return (
    <button
      type="button"
      className={`etape is-${etat}${courante ? " is-courante" : ""}${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(etape.id)}
      aria-current={courante ? "step" : undefined}
    >
      <Pastille etape={etape} />
      <span className="etape__num" aria-hidden="true">
        {numero(etape)}
      </span>
      <span className="etape__corps">
        <span className="etape__titre">{etape.titre}</span>
        <span className="etape__meta">
          <span className="etape__etat">{ETAT_LABEL[etat]}</span>
          {etape.duree && <span className="etape__duree">{etape.duree}</span>}
          {!etape.connue && <span className="etape__inconnue">nouvelle étape du parcours</span>}
        </span>
        {etape.statut === "done" && etape.preuve && <span className="etape__preuve">{etape.preuve}</span>}
        {etape.statut === "blocked" && etape.raison && <span className="etape__raison">Bloquée : {etape.raison}</span>}
        {etape.statut === "skipped" && etape.raison && <span className="etape__raison">Sautée : {etape.raison}</span>}
        {etape.statut !== "done" && etape.but && <span className="etape__but">{etape.but}</span>}
      </span>
    </button>
  );
}
