import type { Expo } from "../types";

// Lien vers le projet EAS, par son identifiant : ce que l'agent soumission ouvre pour suivre une build.
const easDashboard = (projectId: string) => `https://expo.dev/projects/${encodeURIComponent(projectId)}`;

// Le panneau de version : ce que la fabrication Expo embarquera. La soumission n'est pas une colonne
// de user story, c'est une étape de version, et elle a donc son panneau à part.
//
// La source change selon le mode du Builder (voir server/expo.mjs) :
//
//   - parcours : site-config.ts, le fichier du modèle dont part l'élève. Tant qu'une valeur est
//     encore celle du modèle, le build partirait sous l'identité de quelqu'un d'autre. On le dit,
//     sans rien corriger : la correction se fait dans le terminal, aux étapes « Ton projet
//     t'appartient vraiment » et « Ton application a un nom ».
//   - pipeline : app.config.ts ou app.json de l'application, qui n'a pas de modèle derrière elle.
//     La notion de valeur héritée n'a plus de sens : restent les champs Expo, les profils eas.json
//     et le lien EAS.
export function Fabrication({ expo }: { expo: Expo }) {
  if (!expo.present) return null;
  const herite = expo.heritage.length > 0;
  const easProjectId = expo.champs.find((c) => c.key === "easProjectId");
  const lien = expo.relie && easProjectId?.valeur ? easDashboard(easProjectId.valeur) : null;
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
        {lien && (
          <>
            {" "}
            <a href={lien} target="_blank" rel="noreferrer">
              Suivre les builds ↗
            </a>
          </>
        )}
      </p>
      {expo.config && <p className="etape-panel__chemin">{expo.config}</p>}
      {expo.easFile && <p className="etape-panel__chemin">{expo.easFile}</p>}
    </section>
  );
}
