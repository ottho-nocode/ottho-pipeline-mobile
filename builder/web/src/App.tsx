import { Parcours } from "./Parcours";
import { Pipeline } from "./Pipeline";
import { useLiveState } from "./useLiveState";

// Le Builder sert deux vues, choisies par le serveur d'après le projet observé (server/app.mjs,
// detectMode) : la vue du parcours en 34 étapes pour un projet du parcours mobile, le pipeline
// d'agents SDD mobile pour tout autre projet. Les deux vues ne partagent que ce routage et les
// composants communs : chacune a son état, ses prompts et ses règles.
export function App() {
  const { state, online } = useLiveState();
  if (!state) return <main className="loading">Connexion au projet…</main>;
  return state.mode === "pipeline" ? <Pipeline state={state} online={online} /> : <Parcours state={state} online={online} />;
}
