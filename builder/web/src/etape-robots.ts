// Quel robot porte chaque étape du parcours.
//
// Le parcours n'appelle aucun agent : ses 34 étapes sont des skills, jouées une par conversation.
// Les robots ne disent donc pas « cet agent travaille », mais « voilà le métier de cette étape » :
// le même visage que dans le pipeline, pour que les deux vues se lisent pareil.
//
// Les noms sont ceux des robots livrés dans assets/robots/ (voir robots.tsx). Une étape absente de
// la table retombe sur le métier de son acte, et une étape inconnue du Builder sur brainstorming :
// une étape ajoutée au parcours garde ainsi un visage sans toucher à ce fichier.
import type { Acte } from "./types";

const PAR_ETAPE: Record<string, string> = {
  "00-bienvenue": "brainstorming",
  "01-ton-idee": "brainstorming",
  "02-ton-statut": "spec-writer",
  "03-ce-que-ca-coute": "spec-writer",
  "04-ta-machine": "architect",
  "05-ton-materiel": "architect",
  "06-tes-comptes": "architect",
  "07-compte-apple": "architect",
  "08-compte-google": "architect",
  "09-ton-projet": "architect",
  "10-identite": "designer",
  "11-ce-que-fait-ton-app": "spec-writer",
  "12-le-plan": "architect",
  "13-ton-logo": "designer",
  "14-tes-visuels": "designer",
  "15-ta-connexion": "developer",
  "15b-sans-compte": "developer",
  "16-construire": "developer",
  "17-quand-tout-va-mal": "code-reviewer",
  "18-ton-prix": "spec-writer",
  "19-signalement": "developer",
  "20-donnees-personnelles": "code-reviewer",
  "21-tes-textes-legaux": "spec-writer",
  "22-ton-site": "developer",
  "23-verifier": "validateur",
  "24-iphone-premier-envoi": "soumission",
  "25-android-premier-envoi": "soumission",
  "26-sauvegarder-tes-cles": "architect",
  "27-tes-testeurs": "validateur",
  "28-ta-fiche-store": "designer",
  "29-controle-avant-envoi": "code-reviewer",
  "30-envoi-a-apple": "soumission",
  "31-publier-android": "soumission",
  "32-apres-publication": "validateur",
};

// Les actes portent le nom que leur donne le parcours ; la correspondance est faite sur leur rang,
// qui ne bouge pas, pour qu'un acte renommé ne perde pas son visage.
const PAR_RANG = ["brainstorming", "developer", "code-reviewer", "soumission", "validateur"];

export function robotDeEtape(id: string, rangActe?: number): string {
  const connu = PAR_ETAPE[id];
  if (connu) return connu;
  const parActe = rangActe === undefined ? undefined : PAR_RANG[rangActe];
  return parActe ?? "brainstorming";
}

// Rang de l'acte qui contient cette étape (0 pour le premier), undefined si elle n'est nulle part.
export function rangDeActe(actes: Acte[], id: string): number | undefined {
  const rang = actes.findIndex((acte) => acte.etapes.includes(id));
  return rang === -1 ? undefined : rang;
}
