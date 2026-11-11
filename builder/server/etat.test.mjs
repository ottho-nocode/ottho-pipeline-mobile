import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { actes, avancement, backendActif, choix, etapeApplicable, etapeCourante, etapesDeEtat, historique, produit, readEtat, reponses } from "./etat.mjs";
import { tempDir } from "./tmpdirs.mjs";

const parcours = {
  actes: ["Avant de coder", "Construire"],
  etapes: [
    { id: "00-bienvenue", numero: 0, acte: "Avant de coder", condition: "toujours", minutes: 5, titre: "Bienvenue" },
    { id: "01-ton-idee", numero: 1, acte: "Avant de coder", condition: "toujours", minutes: 30, titre: "Ton idée" },
    { id: "07-compte-apple", numero: 7, acte: "Avant de coder", condition: "ios", minutes: 120, titre: "Compte Apple" },
    { id: "15-ta-connexion", numero: 15, acte: "Construire", condition: "compte_utilisateur", minutes: 45, titre: "Connexion" },
    { id: "15b-sans-compte", numero: 16, acte: "Construire", condition: "sans_compte", minutes: 20, titre: "Sans compte" },
    { id: "18-ton-prix", numero: 18, acte: "Construire", condition: "paiement", minutes: 45, titre: "Ton prix" },
  ],
};

const etatDemo = {
  schema_version: 1,
  updated_at: "2026-11-01T10:00:00.000Z",
  product: { nom_provisoire: "app-coiffeur", idee: "Réservation avec caution", fonction_principale: "La caution" },
  branches: { ios: true, compte_utilisateur: true, paiement: false },
  answers: { mvp_top3: "Réservation, rappel, remise en ligne", vide: "   " },
  steps: {
    "00-bienvenue": { status: "done", updated_at: "2026-11-01T09:00:00.000Z", proof: "branches enregistrées" },
    "01-ton-idee": { status: "skipped", updated_at: "2026-11-01T09:10:00.000Z", skip_reason: "cadrage déjà fait" },
    "07-compte-apple": { status: "blocked", updated_at: "2026-11-01T09:20:00.000Z", blocked_reason: "justificatif manquant" },
  },
  current_step: "07-compte-apple",
  history: [
    { at: "2026-11-01T09:00:00.000Z", step: "00-bienvenue", status: "done", proof: "branches enregistrées" },
    { at: "2026-11-01T09:20:00.000Z", step: "07-compte-apple", status: "blocked", blocked_reason: "justificatif manquant" },
    { at: "2026-11-01T09:30:00.000Z", step: null },
  ],
};

test("readEtat : fichier absent, schéma inattendu, JSON cassé, lecture normale", async () => {
  const dir = await tempDir("opm-etat-");
  assert.deepEqual(await readEtat(dir), { exists: false, etat: null, error: null });

  await writeFile(join(dir, "ottho.json"), "{ pas du json");
  let lu = await readEtat(dir);
  assert.equal(lu.exists, true);
  assert.equal(lu.etat, null);
  assert.match(lu.error, /illisible/);

  await writeFile(join(dir, "ottho.json"), JSON.stringify({ schema_version: 2 }));
  lu = await readEtat(dir);
  assert.match(lu.error, /schéma v2/);

  await writeFile(join(dir, "ottho.json"), JSON.stringify(etatDemo));
  lu = await readEtat(dir);
  assert.equal(lu.error, null);
  assert.equal(lu.etat.current_step, "07-compte-apple");
});

test("etapeApplicable : toujours, branche à oui, branche à non, branche jamais répondue, condition inverse", () => {
  const branches = { ios: true, paiement: false, compte_utilisateur: true };
  assert.equal(etapeApplicable({ condition: "toujours" }, branches), true);
  assert.equal(etapeApplicable({ condition: "ios" }, branches), true);
  assert.equal(etapeApplicable({ condition: "paiement" }, branches), false);
  // Jamais répondue : l'étape n'est pas proposée tant que la question n'est pas posée.
  assert.equal(etapeApplicable({ condition: "android" }, branches), false);
  // « sans_compte » est l'inverse de « compte_utilisateur ».
  assert.equal(etapeApplicable({ condition: "sans_compte" }, branches), false);
  assert.equal(etapeApplicable({ condition: "sans_compte" }, { compte_utilisateur: false }), true);
  assert.equal(etapeApplicable({ condition: "sans_compte" }, {}), false);
});

test("etapesDeEtat : statut, preuve, raison de blocage et raison de saut, applicabilité", () => {
  const etapes = etapesDeEtat(parcours, etatDemo);
  const parId = Object.fromEntries(etapes.map((e) => [e.id, e]));

  assert.equal(parId["00-bienvenue"].statut, "done");
  assert.equal(parId["00-bienvenue"].statutLabel, "faite");
  assert.equal(parId["00-bienvenue"].preuve, "branches enregistrées");

  assert.equal(parId["01-ton-idee"].statut, "skipped");
  assert.equal(parId["01-ton-idee"].raison, "cadrage déjà fait");

  assert.equal(parId["07-compte-apple"].statut, "blocked");
  assert.equal(parId["07-compte-apple"].raison, "justificatif manquant");

  // Jamais touchée dans ottho.json : à faire, et non « inconnue ».
  assert.equal(parId["15-ta-connexion"].statut, "pending");
  assert.equal(parId["15-ta-connexion"].preuve, null);

  assert.equal(parId["15b-sans-compte"].applicable, false);
  assert.equal(parId["18-ton-prix"].applicable, false);
  assert.equal(parId["15-ta-connexion"].applicable, true);
});

test("etapeCourante : l'étape en cours l'emporte, sauf si les réponses l'écartent", () => {
  const etapes = etapesDeEtat(parcours, etatDemo);
  // Aucune « in_progress » ici : la première applicable ni faite ni sautée, donc l'étape bloquée.
  assert.equal(etapeCourante(etapes).id, "07-compte-apple");

  const enCours = etapesDeEtat(parcours, { ...etatDemo, steps: { ...etatDemo.steps, "15-ta-connexion": { status: "in_progress" } } });
  assert.equal(etapeCourante(enCours).id, "15-ta-connexion");

  // « en cours » sur une étape écartée par les réponses : on ne la propose pas.
  const egaree = etapesDeEtat(parcours, { ...etatDemo, steps: { ...etatDemo.steps, "18-ton-prix": { status: "in_progress" } } });
  assert.equal(etapeCourante(egaree).id, "07-compte-apple");

  // Tout fait : plus d'étape courante.
  const fini = etapesDeEtat(parcours, {
    ...etatDemo,
    steps: Object.fromEntries(parcours.etapes.map((e) => [e.id, { status: "done", proof: "ok" }])),
  });
  assert.equal(etapeCourante(fini), null);
});

test("avancement et actes : les étapes sautées et écartées sortent des totaux", () => {
  const etapes = etapesDeEtat(parcours, etatDemo);
  // Applicables : 00, 01 (sautée, exclue), 07, 15. Donc 3 au total, 1 faite.
  assert.deepEqual(avancement(etapes), { faites: 1, total: 3, minutesRestantes: 165 });

  const parActe = Object.fromEntries(actes(parcours, etapes).map((a) => [a.nom, a]));
  assert.deepEqual(
    { faites: parActe["Avant de coder"].faites, total: parActe["Avant de coder"].total },
    { faites: 1, total: 2 },
  );
  assert.deepEqual({ faites: parActe.Construire.faites, total: parActe.Construire.total }, { faites: 0, total: 1 });
  assert.deepEqual(parActe.Construire.etapes, ["15-ta-connexion", "15b-sans-compte", "18-ton-prix"]);
});

test("choix, backend, produit, réponses et historique : lisibles, sans rien inventer", () => {
  const parCle = Object.fromEntries(choix(etatDemo).map((c) => [c.key, c]));
  assert.equal(parCle.ios.reponse, "oui");
  assert.equal(parCle.paiement.reponse, "non");
  assert.equal(parCle.android.reponse, "pas encore répondu");
  assert.equal(parCle.android.valeur, null);

  assert.equal(backendActif(etatDemo), "supabase-nouveau");
  assert.equal(backendActif({}), "supabase-nouveau");
  assert.equal(backendActif({ answers: { supabase_existant: "oui" } }), "supabase-existant");

  assert.equal(produit(etatDemo).nom, "app-coiffeur");
  assert.equal(produit({}).nom, null);

  // Réponse vide : écartée.
  assert.deepEqual(reponses(etatDemo).map((r) => r.key), ["mvp_top3"]);

  const lignes = historique(etatDemo);
  // Plus récente d'abord, lignes sans étape ignorées.
  assert.deepEqual(lignes.map((l) => l.step), ["07-compte-apple", "00-bienvenue"]);
  assert.equal(lignes[0].statusLabel, "bloquée");
  assert.equal(lignes[0].reason, "justificatif manquant");
  assert.equal(lignes[1].proof, "branches enregistrées");
  assert.deepEqual(historique({}), []);
});
