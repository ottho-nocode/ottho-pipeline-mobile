import type { Expo } from "../types";

// Ce que la fabrication Expo embarquera, lu dans site-config.ts et mobile-app/eas.json. Le parcours
// fait partir d'un modèle : tant qu'une valeur est encore celle du modèle, le build partirait sous
// l'identité de quelqu'un d'autre. On le dit, sans rien corriger : la correction se fait dans le
// terminal, aux étapes « Ton projet t'appartient vraiment » et « Ton application a un nom ».
export function Fabrication({ expo }: { expo: Expo }) {
  if (!expo.present) return null;
  const herite = expo.heritage.length > 0;
  return (
    <section className="col-section" aria-label="Ta fabrication">
      <h3>
        Ta fabrication <small>Expo</small>
      </h3>
      {herite && (
        <p className="alerte">
          {expo.heritage.length} valeur{expo.heritage.length > 1 ? "s" : ""} encore celle{expo.heritage.length > 1 ? "s" : ""} du modèle. Si tu fabriquais
          ton application maintenant, elle partirait sous l'identité de quelqu'un d'autre.
        </p>
      )}
      <dl className="fiche fiche--colonne">
        {expo.champs.map((c) => (
          <div key={c.key} className={c.heritee ? "fabrique is-heritee" : "fabrique"}>
            <dt>{c.label}</dt>
            <dd>
              {c.valeur ?? <span className="muted">pas encore renseigné</span>}
              {c.heritee && <span className="fabrique__tag">encore celle du modèle</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="fabrique__eas">
        {expo.relie ? "Projet EAS relié : la fabrication peut partir." : "Projet EAS pas encore relié : la fabrication ne partira pas tant qu'il manque."}
        {expo.profils.length > 0 && <> Profils de fabrication : {expo.profils.join(", ")}.</>}
        {expo.versionSource === "remote" && <> Le numéro de version est tenu par EAS.</>}
      </p>
      {expo.config && <p className="etape-panel__chemin">{expo.config}</p>}
    </section>
  );
}
