import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getSkill, type Skill } from "../api";
import { REPRENDRE, debloquer, recommencer } from "../prompts";
import { ETAT_LABEL, etatDe, numero } from "../statuts";
import type { Etape } from "../types";
import { CopyButton } from "./CopyButton";

type Props = { etape: Etape; courante: boolean; token: string; conditionLabel: string; onClose: () => void };

const quand = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null);

// Fiche d'une étape, dans la colonne de gauche : son état, sa preuve, ce qu'elle fait, et le prompt
// qui la lance ou la rejoue dans le terminal.
export function EtapePanel({ etape, courante, token, conditionLabel, onClose }: Props) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const etat = etatDe(etape);

  useEffect(() => {
    setSkill(null);
    setError(null);
    setOuvert(false);
  }, [etape.id]);

  useEffect(() => {
    if (!ouvert || skill) return;
    let alive = true;
    void getSkill(token, etape.id).then((r) => {
      if (!alive) return;
      if (r.ok) setSkill(r.skill);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [ouvert, skill, token, etape.id]);

  return (
    <aside className="card colonne etape-panel" aria-label={`Étape ${numero(etape)} : ${etape.titre}`}>
      <header className="colonne__tete">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          ← Retour
        </button>
        <span className="colonne__compte">{etape.acte}</span>
      </header>

      <p className="etape-panel__num">Étape {numero(etape)}</p>
      <h2>{etape.titre}</h2>
      <p className="etape-carte__meta">
        <span className={`etat-mot is-${etat}`}>{ETAT_LABEL[etat]}</span>
        {etape.duree && <span>Compte {etape.duree}</span>}
        {etape.majLe && <span>le {quand(etape.majLe)}</span>}
      </p>

      {etape.but && <p className="etape-carte__but">{etape.but}</p>}
      {!etape.applicable && (
        <p className="etape-panel__condition">
          Cette étape se joue {conditionLabel}. Tes réponses actuelles la mettent de côté : elle ne compte pas dans ton avancement.
        </p>
      )}
      {etape.statut === "done" && etape.preuve && (
        <div className="preuve">
          <span className="eyebrow">Preuve enregistrée</span>
          <p>{etape.preuve}</p>
        </div>
      )}
      {etape.statut === "blocked" && etape.raison && <p className="alerte">Bloquée : {etape.raison}</p>}
      {etape.statut === "skipped" && etape.raison && <p className="etape-panel__condition">Sautée : {etape.raison}</p>}
      {etape.description && <p className="etape-panel__desc">{etape.description}</p>}

      <div className="etape-carte__actions">
        {courante && etape.statut !== "blocked" && (
          <CopyButton text={REPRENDRE} label="Copier « /ottho »" className="btn btn--primary" title="À coller dans ton terminal Claude" />
        )}
        {etape.statut === "blocked" && (
          <CopyButton text={debloquer(etape.id, etape.raison)} label="Copier le prompt pour débloquer" className="btn btn--primary" title="À coller dans ton terminal Claude" />
        )}
        {(etape.statut === "done" || etape.statut === "skipped") && (
          <CopyButton text={recommencer(etape.id)} label="Copier « recommencer »" title={`À coller dans ton terminal Claude : ${recommencer(etape.id)}`} />
        )}
      </div>

      {etape.skill ? (
        <section className="col-section" aria-label="Fiche de l'étape">
          <h3>Ce que Claude va suivre</h3>
          <p className="etape-panel__chemin">{etape.skill}</p>
          <button type="button" className="btn btn--stage" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
            {ouvert ? "Masquer la fiche" : "Lire la fiche de l'étape"}
          </button>
          {ouvert && error && <p className="alerte">{error}</p>}
          {ouvert && !skill && !error && <p className="muted">Chargement…</p>}
          {ouvert && skill && (
            <div className="markdown etape-panel__skill">
              <ReactMarkdown>{skill.content}</ReactMarkdown>
            </div>
          )}
        </section>
      ) : (
        <p className="muted">La fiche de cette étape n'est pas dans ce projet (dossier .agents/skills absent ou renommé).</p>
      )}
    </aside>
  );
}
