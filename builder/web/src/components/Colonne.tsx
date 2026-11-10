import type { Etape, State } from "../types";
import { ETAT_LABEL, etatDe, numero } from "../statuts";
import { ETAPES, REPRENDRE, debloquer } from "../prompts";
import { CopyButton } from "./CopyButton";
import { Fabrication } from "./Fabrication";

type Props = { state: State; onSelect: (id: string) => void };

const quand = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null);

// Colonne de gauche, vue par défaut : ce qui attend la personne maintenant. Rien ne se fait ici,
// tout se passe dans le terminal Claude Code ; la colonne donne le prompt à coller.
export function Colonne({ state, onSelect }: Props) {
  const courante = state.courante ? (state.etapes.find((e) => e.id === state.courante) ?? null) : null;
  const bloquees = state.etapes.filter((e) => e.statut === "blocked" && e.applicable);
  const termine = !courante && state.etat.exists && !state.etat.error;
  return (
    <aside className="card colonne" aria-label="Ton étape et tes choix">
      <header className="colonne__tete">
        <span className="eyebrow">Maintenant</span>
        <span className="colonne__compte">
          {state.avancement.faites} / {state.avancement.total}
        </span>
      </header>

      {state.etat.error && (
        <p className="alerte" role="status">
          {state.etat.error}
        </p>
      )}

      {!state.etat.exists && (
        <div className="etape-carte is-depart">
          <h2>Le parcours n'a pas encore commencé</h2>
          <p>
            Rien n'est encore enregistré dans ce projet. Colle ce prompt dans ton terminal : Claude fait connaissance avec toi, puis
            enregistre tes réponses.
          </p>
          <CopyButton text={REPRENDRE} label="Copier « /ottho »" className="btn btn--primary" title="À coller dans ton terminal Claude" />
        </div>
      )}

      {courante && (
        <div className="etape-carte is-courante">
          <p className="etape-carte__situe">
            {courante.acte} · étape {numero(courante)} du parcours
          </p>
          <h2>{courante.titre}</h2>
          {courante.but && <p className="etape-carte__but">{courante.but}</p>}
          <p className="etape-carte__meta">
            <span className={`etat-mot is-${etatDe(courante)}`}>{ETAT_LABEL[etatDe(courante)]}</span>
            {courante.duree && <span>Compte {courante.duree}</span>}
          </p>
          {courante.statut === "blocked" && courante.raison && <p className="alerte">Bloquée : {courante.raison}</p>}
          <div className="etape-carte__actions">
            <CopyButton
              text={courante.statut === "blocked" ? debloquer(courante.id, courante.raison) : REPRENDRE}
              label={courante.statut === "blocked" ? "Copier le prompt pour débloquer" : "Copier « /ottho »"}
              className="btn btn--primary"
              title="À coller dans ton terminal Claude"
            />
            <button type="button" className="btn btn--ghost" onClick={() => onSelect(courante.id)}>
              Voir la fiche
            </button>
          </div>
          <p className="etape-carte__regle">Une étape par conversation. Quand celle-ci est finie, ouvre une nouvelle conversation et recolle le prompt.</p>
        </div>
      )}

      {termine && (
        <div className="etape-carte is-fini">
          <h2>Parcours terminé</h2>
          <p>Toutes les étapes qui te concernent sont faites. Ton application est publiée.</p>
        </div>
      )}

      {bloquees.length > 0 && (
        <section className="col-section" aria-label="Étapes bloquées">
          <h3>
            Bloqué{bloquees.length > 1 ? "s" : ""} <small>{bloquees.length}</small>
          </h3>
          <ul className="bloc-list">
            {bloquees.map((e) => (
              <li key={e.id}>
                <button type="button" className="bloc-list__item" onClick={() => onSelect(e.id)}>
                  <span className="bloc-list__titre">
                    {numero(e)} {e.titre}
                  </span>
                  {e.raison && <span className="bloc-list__raison">{e.raison}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="col-section" aria-label="Tes choix">
        <h3>Tes choix</h3>
        <ul className="choix-list">
          {state.choix.map((c) => (
            <li key={c.key} className={c.valeur === null ? "is-vide" : c.valeur ? "is-oui" : "is-non"}>
              <span className="choix-list__label">{c.label}</span>
              <span className="choix-list__valeur">{c.reponse}</span>
            </li>
          ))}
        </ul>
        <p className="choix-list__note">Ces réponses décident des étapes qui te concernent. Pour en changer, dis-le à Claude dans ton terminal.</p>
      </section>

      <section className="col-section" aria-label="Ton projet">
        <h3>Ton projet</h3>
        <dl className="fiche">
          {state.produit.nom && (
            <>
              <dt>Nom</dt>
              <dd>{state.produit.nom}</dd>
            </>
          )}
          <dt>Backend</dt>
          <dd>{state.backend.label}</dd>
          {state.produit.fonction && (
            <>
              <dt>Ce qui compte</dt>
              <dd>{state.produit.fonction}</dd>
            </>
          )}
        </dl>
        {state.etat.updatedAt && <p className="fiche__maj">Dernier changement enregistré le {quand(state.etat.updatedAt)}.</p>}
        <CopyButton text={ETAPES} label="Copier « /ottho etapes »" title="Voir tout le parcours dans ton terminal" />
      </section>

      <Fabrication expo={state.expo} />
    </aside>
  );
}

/** Nombre d'éléments qui attendent la personne (barre fine quand la colonne est fermée). */
export const enAttente = (state: State) => (state.courante ? 1 : 0) + state.etapes.filter((e: Etape) => e.statut === "blocked" && e.applicable).length;
