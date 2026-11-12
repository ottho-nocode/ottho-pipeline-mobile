import { Background, BackgroundVariant, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import type { Acte, Etape, ParcoursState } from "../types";
import { ETAT_LABEL, Pastille, dureeRestante, etatDe, numero } from "../statuts";
import { Robot } from "../robots";
import { robotDeEtape } from "../etape-robots";
import { useFittedViewport } from "../useFittedViewport";
import type { Theme } from "../useTheme";

type Props = {
  state: ParcoursState;
  selected: string | null;
  onSelect: (id: string) => void;
  theme: Theme;
};

// Un acte par colonne, une étape par carte : le parcours se lit comme le pipeline d'agents, sur le
// même canevas. Les cartes ne se déplacent pas (le chemin est celui du parcours, pas un tableau à
// organiser) ; la vue se déplace et se zoome.
const COL_W = 292;
const ROW_H = 134;
// Un acte de neuf étapes ferait une colonne de plus de mille pixels : au-delà de MAX_ROWS, il se
// replie sur une colonne voisine. Le parcours se lit toujours de haut en bas, puis colonne suivante.
const MAX_ROWS = 4;
// Encombrement maximal d'une carte et d'un titre d'acte : sert à cadrer le canevas sans attendre
// les mesures de xyflow (même raison que dans PipelineGraph).
const NODE_BOX = { etape: { w: 252, h: ROW_H }, label: { w: 240, h: 24 } };

type EtapeData = {
  etape: Etape;
  etat: string;
  courante: boolean;
  selected: boolean;
  rangActe: number;
};
type LabelData = { label: string; index: string; faites: number; total: number };

// Carte d'étape, dessinée comme la carte d'agent : le visage du métier à gauche, le titre et
// l'état à droite. Le robot ne dit pas qu'un agent tourne (le parcours n'en appelle aucun) : il dit
// de quel métier relève l'étape. Voir etape-robots.ts.
function EtapeNode({ data }: NodeProps<Node<EtapeData, "etape">>) {
  const { etape, etat, courante, selected, rangActe } = data;
  const sous = etape.statut === "done" && etape.preuve ? etape.preuve : etape.statut === "blocked" || etape.statut === "skipped" ? etape.raison : etape.but;
  return (
    <div
      className={`etape-node is-${etat}${courante ? " is-courante" : ""}${selected ? " is-selected" : ""}`}
      data-etape={etape.id}
      data-etat={etat}
      aria-current={courante ? "step" : undefined}
    >
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <Robot name={robotDeEtape(etape.id, rangActe)} size={46} className="robot etape-node__robot" />
      <div className="etape-node__body">
        <div className="etape-node__head">
          <span className="etape-node__num">{numero(etape)}</span>
          <span className="etape-node__name">{etape.titre}</span>
          <Pastille etape={etape} />
        </div>
        <div className="etape-node__meta">
          <span className="etape-node__etat">{ETAT_LABEL[etat as keyof typeof ETAT_LABEL]}</span>
          {etape.duree && <span>{etape.duree}</span>}
          {!etape.connue && <span className="etape-node__inconnue">nouvelle</span>}
        </div>
        {sous && (
          <div className={etape.statut === "done" && etape.preuve ? "etape-node__sous is-preuve" : "etape-node__sous"} title={sous}>
            {sous}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}

function ActeNode({ data }: NodeProps<Node<LabelData, "label">>) {
  return (
    <div className="acte-label">
      <span className="acte-label__index">{data.index}</span>
      <span className="acte-label__nom">{data.label}</span>
      <span className="acte-label__compte">
        {data.faites}/{data.total}
      </span>
    </div>
  );
}

const nodeTypes = { etape: EtapeNode, label: ActeNode };

// Les étapes écartées par les réponses descendent en bas de leur colonne : elles restent visibles
// (la personne doit pouvoir vérifier ce que ses réponses ont retiré) mais ne coupent pas le chemin.
function rangees(acte: Acte, parId: Map<string, Etape>): Etape[] {
  const dedans = acte.etapes.map((id) => parId.get(id)).filter((e): e is Etape => Boolean(e));
  return [...dedans.filter((e) => e.applicable), ...dedans.filter((e) => !e.applicable)];
}

export function Chemin({ state, selected, onSelect, theme }: Props) {
  const parId = new Map(state.etapes.map((e) => [e.id, e]));
  const nodes: Node[] = [];
  // Chemin suivi par le trait : les étapes retenues, dans l'ordre des actes. Une étape écartée
  // n'est reliée à rien, sinon le trait passerait par une étape que la personne ne fera jamais.
  const chaine: { id: string; col: number }[] = [];
  // Cadrage d'ouverture : l'acte en cours, pas le parcours entier. Trente-quatre cartes tiennent
  // dans la scène, mais à un zoom où plus rien ne se lit : le canevas s'ouvre là où la personne en
  // est, et elle se déplace pour voir le reste.
  const focus: { x: number; y: number; w: number; h: number }[] = [];
  const acteCourant = state.courante ? (parId.get(state.courante)?.acte ?? null) : null;

  let col = 0;
  state.actes.forEach((acte, rang) => {
    const dedans = rangees(acte, parId);
    if (!dedans.length) return;
    const premiere = col;
    const vise = acteCourant ? acte.nom === acteCourant : rang === 0;
    const label = { x: premiere * COL_W, y: 0, ...NODE_BOX.label };
    nodes.push({
      id: `acte-${acte.nom}`,
      type: "label",
      position: { x: label.x, y: label.y },
      data: { label: acte.nom, index: String(rang + 1).padStart(2, "0"), faites: acte.faites, total: acte.total },
      selectable: false,
    });
    if (vise) focus.push(label);
    dedans.forEach((etape, i) => {
      const colonne = premiere + Math.floor(i / MAX_ROWS);
      const boite = { x: colonne * COL_W, y: 36 + (i % MAX_ROWS) * ROW_H, ...NODE_BOX.etape };
      nodes.push({
        id: etape.id,
        type: "etape",
        position: { x: boite.x, y: boite.y },
        data: { etape, etat: etatDe(etape), courante: etape.id === state.courante, selected: etape.id === selected, rangActe: rang },
      });
      if (vise) focus.push(boite);
      if (etape.applicable) chaine.push({ id: etape.id, col: colonne });
    });
    col = premiere + Math.max(1, Math.ceil(dedans.length / MAX_ROWS));
  });

  // Même colonne : du bas de l'une au haut de la suivante ; d'une colonne à l'autre : de droite à
  // gauche. L'arête qui mène à l'étape courante bat, comme celle d'un agent qui travaille.
  const edges: Edge[] = chaine.slice(1).map((to, i) => {
    const vertical = chaine[i].col === to.col;
    return {
      id: `${chaine[i].id}->${to.id}`,
      source: chaine[i].id,
      target: to.id,
      sourceHandle: vertical ? "bottom" : "right",
      targetHandle: vertical ? "top" : "left",
      animated: to.id === state.courante,
    };
  });

  const layoutKey = `${acteCourant ?? ""}|${nodes.map((n) => `${n.id}@${n.position.x},${n.position.y}`).join("|")}`;
  const { boxRef, viewport, setViewport } = useFittedViewport(focus, layoutKey, { padding: "28px" });

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

      <div className={state.courante ? "flow is-live" : "flow"} ref={boxRef}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode={theme}
          viewport={viewport}
          onViewportChange={setViewport}
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.3}
          onNodeClick={(_, node) => {
            if (node.type === "etape") onSelect(node.id);
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
        </ReactFlow>
      </div>

      {/* Le canevas n'est pas lisible au clavier ni au lecteur d'écran : la même liste, en texte. */}
      <ul className="sr-only">
        {state.etapes.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onSelect(e.id)}>
              {numero(e)} {e.titre} : {ETAT_LABEL[etatDe(e) as keyof typeof ETAT_LABEL]}
              {e.applicable ? "" : " (écartée par tes réponses)"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
