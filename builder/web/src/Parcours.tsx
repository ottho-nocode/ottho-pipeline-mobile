import { useEffect, useState } from "react";
import type { ParcoursState } from "./types";
import { Bandeau } from "./components/Bandeau";
import { Chemin } from "./components/Chemin";
import { Colonne, enAttente } from "./components/Colonne";
import { DocsBrowser } from "./components/DocsBrowser";
import { EtapePanel } from "./components/EtapePanel";
import { FileViewer } from "./components/FileViewer";
import { JournalParcours } from "./components/JournalParcours";
import { SessionNotice } from "./components/SessionNotice";
import { SideRail, SideSplitter } from "./components/SideSplitter";
import { usePersisted } from "./usePersisted";
import { LEFT_PANEL, MAIN_MIN, usePanel } from "./useSidePanel";
import { useTheme } from "./useTheme";

// La vue du parcours en 34 étapes : cinq actes, l'étape courante, les preuves, les blocages, les
// étapes écartées, et le prompt à coller. Elle ne touche à rien : tout se passe dans le terminal.
export function Parcours({ state, online }: { state: ParcoursState; online: boolean }) {
  const { theme, toggle } = useTheme();
  // Colonne de gauche : largeur réglable, repliable (le chemin prend alors toute la largeur).
  const side = usePanel(LEFT_PANEL);
  // Journal du bas : caché ou affiché depuis la barre du haut, choix mémorisé.
  const [sections, setSections] = usePersisted("ottho-parcours-sections", { journal: true });
  // Actes dépliés à la main : ce choix l'emporte sur l'ouverture par défaut de l'acte courant.
  const [ouverts, setOuverts] = usePersisted<Record<string, boolean>>("ottho-parcours-actes", {});
  const [selected, setSelected] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState<string | null>(null);

  // Titre de l'onglet : le nom de l'outil et le projet ouvert.
  useEffect(() => {
    document.title = `Ottho Builder Mobile · ${state.project.name}`;
  }, [state.project.name]);

  const courante = state.courante ? (state.etapes.find((e) => e.id === state.courante) ?? null) : null;
  const etape = selected ? (state.etapes.find((e) => e.id === selected) ?? null) : null;
  const ouvrirEtape = (id: string) => {
    setSelected(id);
    setDocsOpen(false);
    setViewingFile(null);
    side.setOpen(true);
  };
  const leftWidth = Math.round(Math.max(LEFT_PANEL.min, Math.min(side.width, window.innerWidth - MAIN_MIN - 10)));
  const columns = [side.open ? `${leftWidth}px 10px` : "44px", "minmax(0, 1fr)"].join(" ");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">
            ottho<span className="brand__sep">/</span>builder mobile
          </span>
        </div>
        <h1 className="topbar__project" title={state.project.dir}>
          {state.project.name}
        </h1>
        {state.branch && (
          <span
            className="branch-chip"
            title={`Branche Git du projet : ${state.branch.name ?? "aucune (HEAD détachée)"}. ${
              state.branch.dirty ? `${state.branch.dirty} fichier(s) modifié(s) ou nouveau(x), pas encore commité(s).` : "Tout est commité."
            }`}
          >
            <span aria-hidden="true">⎇</span>
            <span className="branch-chip__name">{state.branch.name ?? "HEAD détachée"}</span>
            {state.branch.dirty > 0 && <span className="branch-chip__dirty">+{state.branch.dirty}</span>}
          </span>
        )}
        <span className={online ? "live on" : "live off"}>{online ? "en direct" : "hors ligne"}</span>
        <button
          type="button"
          className="tb-toggle"
          aria-expanded={docsOpen}
          onClick={() => {
            if (!docsOpen) side.setOpen(true);
            setDocsOpen(!docsOpen);
            setSelected(null);
            setViewingFile(null);
          }}
          title="Tous les documents Markdown du projet"
          aria-label="Documents"
        >
          <span aria-hidden="true">▤</span>
          <span className="tb-label">Documents</span>
        </button>
        <button
          type="button"
          className="tb-toggle"
          aria-pressed={sections.journal}
          aria-label="Journal"
          onClick={() => setSections((s) => ({ ...s, journal: !s.journal }))}
          title={sections.journal ? "Cacher le journal" : "Afficher le journal"}
        >
          <span aria-hidden="true">◷</span>
          <span className="tb-label">Journal</span>
        </button>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggle}
          aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
          title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
        >
          <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          <span className="tb-label">{theme === "dark" ? "Clair" : "Sombre"}</span>
        </button>
      </header>

      <div className={`layout${side.open ? "" : " is-collapsed"}`} style={{ gridTemplateColumns: columns }}>
        {side.open ? (
          <>
            {viewingFile ? (
              <FileViewer path={viewingFile} token={state.readToken} onClose={() => setViewingFile(null)} />
            ) : docsOpen ? (
              <DocsBrowser token={state.readToken} refreshKey={state.generatedAt} current={null} onOpen={setViewingFile} onClose={() => setDocsOpen(false)} />
            ) : etape ? (
              <EtapePanel etape={etape} courante={etape.id === state.courante} token={state.readToken} conditionLabel={etape.conditionLabel} onClose={() => setSelected(null)} />
            ) : (
              <Colonne state={state} onSelect={ouvrirEtape} />
            )}
            <SideSplitter
              edge="left"
              label="Largeur de la colonne de gauche"
              width={leftWidth}
              limits={side.limits}
              onResize={side.setWidth}
              onCollapse={() => side.setOpen(false)}
              collapseLabel="Fermer la colonne de gauche"
            />
          </>
        ) : (
          <SideRail waiting={enAttente(state)} onOpen={() => side.setOpen(true)} />
        )}

        <main className={sections.journal ? "main" : "main no-bottom"}>
          {state.parcours.source === "builder" && (
            <p className="notice">
              Le parcours de ce projet n'a pas pu être lu (<code>scripts/ottho-parcours.mjs</code> absent ou changé de forme) : les 34 étapes
              affichées sont celles que connaît le Builder, sans leur durée ni leur condition.
            </p>
          )}

          <div className="banner-stack">
            <SessionNotice session={state.session} />
            <Bandeau courante={courante} commence={state.etat.exists} onVoir={ouvrirEtape} />
          </div>

          <section className="chemin-zone">
            <Chemin
              state={state}
              ouverts={ouverts}
              onToggleActe={(nom) =>
                setOuverts((o) => ({ ...o, [nom]: !(o[nom] ?? nom === (courante?.acte ?? null)) }))
              }
              selected={selected}
              onSelect={ouvrirEtape}
            />
          </section>

          {sections.journal && (
            <section className="bottom bottom--single">
              <JournalParcours historique={state.historique} etapes={state.etapes} runs={state.runs} onSelect={ouvrirEtape} />
            </section>
          )}

          {state.corrupt > 0 && (
            <footer className="footer">
              <span>{state.corrupt} ligne(s) du journal des agents illisibles, ignorées.</span>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}
