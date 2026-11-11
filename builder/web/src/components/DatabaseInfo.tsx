import { VIA, supabaseDashboard, targetText } from "../services";
import type { AppDatabase, Database, Service } from "../types";

function AppLine({ db }: { db: AppDatabase | null }) {
  if (!db) return <>aucune base branchée (ni SUPABASE_URL ni DATABASE_URL dans les .env du projet)</>;
  if (db.kind === "supabase" && db.project)
    return (
      <>
        Supabase, projet <code>{db.project}</code> <span className="muted">({db.source})</span>{" "}
        <a href={supabaseDashboard(db.project)} target="_blank" rel="noreferrer">
          Ouvrir ↗
        </a>
      </>
    );
  if (db.kind === "sqlite")
    return (
      <>
        SQLite, fichier <code>{db.host}</code> <span className="muted">({db.source})</span>
      </>
    );
  return (
    <>
      {db.kind === "postgres" ? "PostgreSQL" : db.kind} sur <code>{db.host}</code> <span className="muted">({db.source})</span>
    </>
  );
}

// L'application mobile ne crée aucun backend : elle se branche sur la base Supabase existante de
// l'application web du client. Ce panneau montre donc trois choses, et aucune n'est une création :
// la base vers laquelle le client pointe, l'état de ses clés (une clé service_role embarquée est
// extractible du binaire livré sur les stores), et le relevé de son schéma, où chaque table lue par
// l'application attend que ses policies RLS soient vérifiées. Les migrations sont montrées, jamais
// appliquées.
export function DatabaseInfo({ database, supabase, onConfigure }: { database: Database; supabase: Service | undefined; onConfigure?: () => void }) {
  const { app, publishable, serviceRole, leaks, survey, unchecked, migrations } = database;
  const targets = supabase?.targets ?? [];
  const wide = targets.some((t) => !t.project);
  const agentRefs = targets.map((t) => t.project).filter((p): p is string => Boolean(p));
  const mismatch = Boolean(app?.project && agentRefs.length && !agentRefs.includes(app.project));
  return (
    <section className="col-section db" aria-label="Base de données">
      <h3>
        Base de données <small>existante</small>
      </h3>
      {leaks.length > 0 && (
        <p className="alerte">
          ⚠ Clé secrète à portée du binaire livré sur les stores : elle en est extractible. Retire-la avant toute build.
          <ul className="db__leaks">
            {leaks.map((l) => (
              <li key={`${l.name}-${l.source}`}>
                <code>{l.name}</code> dans <code>{l.source}</code> <span className="muted">({l.reason})</span>
              </li>
            ))}
          </ul>
        </p>
      )}
      <dl className="db__list">
        <dt>App</dt>
        <dd>
          <AppLine db={app} />
          {onConfigure && (
            <>
              {" "}
              <button type="button" className="linklike" onClick={onConfigure}>
                {app ? "Modifier" : "Brancher"} →
              </button>
            </>
          )}
        </dd>
        <dt>Clés</dt>
        <dd>
          {publishable ? (
            <>
              <code>{publishable.name}</code> définie <span className="muted">({publishable.source})</span>. Seule une clé anon ou publishable peut être
              embarquée.
            </>
          ) : (
            "aucune clé publishable définie : l'application ne lira rien."
          )}
          {serviceRole && (
            <>
              {" "}
              <code>{serviceRole.name}</code> est définie <span className="muted">({serviceRole.source})</span> : elle doit rester côté serveur, jamais dans
              le bundle.
            </>
          )}
        </dd>
        <dt>Schéma</dt>
        <dd>
          {!survey.exists ? (
            <>
              pas encore relevé : <code>{survey.file}</code> est absent. L'architecte lit la base existante, il n'en conçoit aucune.
            </>
          ) : survey.tables.length === 0 ? (
            <>
              <code>{survey.file}</code> ne liste aucune table sous « Tables lues par l'application ».
            </>
          ) : (
            <>
              {survey.tables.length} table{survey.tables.length > 1 ? "s" : ""} lue{survey.tables.length > 1 ? "s" : ""} par l'application{" "}
              <span className="muted">({survey.file})</span>
              <ul className="db__tables">
                {survey.tables.map((t) => (
                  <li key={t.name} className={t.rls ? "is-ok" : "is-todo"}>
                    <span aria-hidden="true">{t.rls ? "✓" : "○"}</span> <code>{t.name}</code> {t.rls ? "RLS vérifiée" : "RLS à vérifier"}
                  </li>
                ))}
              </ul>
            </>
          )}
        </dd>
        <dt>Agents</dt>
        <dd>
          {!supabase ? (
            "Supabase n'est pas branché : les agents ne peuvent pas lire la base."
          ) : (
            <ul className="db__targets">
              {targets.map((t, i) => (
                <li key={`${t.via}-${i}`}>
                  {targetText(t)} <span className="muted">({VIA[t.via] ?? t.via})</span>
                  {t.project && (
                    <>
                      {" "}
                      <a href={supabaseDashboard(t.project)} target="_blank" rel="noreferrer">
                        Ouvrir ↗
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </dd>
        {migrations.length > 0 && (
          <>
            <dt>Migrations</dt>
            <dd>
              {migrations.length} migration{migrations.length > 1 ? "s" : ""} dans <code>supabase/migrations/</code>. Aucune n'est appliquée sans ton accord
              explicite : c'est la base de ton application web.
            </dd>
          </>
        )}
      </dl>
      {unchecked.length > 0 && (
        <p className="db__warn">
          ⚠ La RLS est la seule frontière réelle entre les données de tes utilisateurs. {unchecked.length} table
          {unchecked.length > 1 ? "s" : ""} attend{unchecked.length > 1 ? "ent" : ""} la vérification de ses policies : {unchecked.join(", ")}. À faire avant
          la première build.
        </p>
      )}
      {wide && (
        <p className="db__warn">
          ⚠ Les agents peuvent atteindre n'importe quel projet de ton compte Supabase, <strong>celui de ton application web compris</strong>. Limite-les en
          lecture : ajoute <code>?project_ref={app?.project ?? "REF_DU_PROJET"}&amp;read_only=true</code> à l'adresse du serveur, ou{" "}
          <code>--project-ref=… --read-only</code> à sa commande.
        </p>
      )}
      {mismatch && <p className="db__warn">⚠ L'application et les agents ne visent pas le même projet Supabase.</p>}
    </section>
  );
}
