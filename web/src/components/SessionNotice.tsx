import { SUIVRE_RECOS } from "../prompts";
import type { SessionStatus } from "../types";
import { CopyButton } from "./CopyButton";

type Props = { session: SessionStatus | undefined };

// Ce que la session Claude Code attend de la personne, au-dessus de son étape : une réponse à ses
// questions, ou une autorisation. Tout se passe dans le terminal ; la vue ne fait que le signaler.
export function SessionNotice({ session }: Props) {
  const ask = session?.ask ?? null;
  const wait = session?.wait ?? null;
  // Questions posées dans le sélecteur du terminal (wait « questions »), ou en fin de message (ask).
  const questions = wait?.kind === "questions" ? (wait.questions ?? []) : ask ? ask.questions : [];
  const permission = wait && wait.kind !== "questions" ? wait : null;
  if (!questions.length && !permission) return null;
  return (
    <>
      {permission && (
        <div className="notif notif--wait" role="status" aria-label="Claude attend ton autorisation">
          <span className="notif__glyph" aria-hidden="true">
            ⏸
          </span>
          <div className="notif__text">
            <strong className="eyebrow">Claude attend ton autorisation dans ton terminal</strong> {permission.message}
          </div>
        </div>
      )}
      {questions.length > 0 && (
        <div className="notif notif--ask" role="status" aria-label="Claude attend ta réponse">
          <span className="notif__glyph" aria-hidden="true">
            ?
          </span>
          <div className="notif__text">
            <strong className="eyebrow">Claude attend ta réponse dans ton terminal</strong>
            <ol className="notif__questions">
              {questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
            <p className="notif__hint">Réponds dans le terminal. Si tu préfères que Claude tranche, copie ce prompt et colle-le.</p>
          </div>
          <div className="banner__actions">
            <CopyButton text={SUIVRE_RECOS} label="Copier « Suis tes recos »" title="Prompt à coller dans ton terminal : Claude tranche selon ses recommandations" />
          </div>
        </div>
      )}
    </>
  );
}
