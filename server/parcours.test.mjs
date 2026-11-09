import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ACTES, ETAPES_CONNUES, extraireEtapes, formaterDuree, loadParcours, readSkill, skillPath } from "./parcours.mjs";
import { tempDir } from "./tmpdirs.mjs";

const SOURCE = `#!/usr/bin/env node
// Un commentaire avant, avec un crochet [ qui ne doit rien casser.
export const ETAPES = [
  { "id": "00-bienvenue", "titre": "Bienvenue, on fait connaissance", "condition": "toujours", "minutes": 5, "but": "Comprendre ou tu en es" },
  { "id": "07-compte-apple", "titre": "Ton compte Apple est actif", "condition": "ios", "minutes": 120, "but": "99 $/an" },
  { "id": "99-etape-inedite", "titre": "Une etape que le Builder ne connait pas", "condition": "toujours", "minutes": 15, "but": "Nouveaute du parcours" }
];

export function etapeApplicable() { return true; }
`;

async function projetDemo(etapes = SOURCE, { skills = ["00-bienvenue"] } = {}) {
  const dir = await tempDir("opm-parcours-");
  await mkdir(join(dir, "scripts"), { recursive: true });
  if (etapes !== null) await writeFile(join(dir, "scripts", "ottho-parcours.mjs"), etapes);
  for (const id of skills) {
    await mkdir(join(dir, ".agents", "skills", `ottho-etape-${id}`), { recursive: true });
    await writeFile(
      join(dir, ".agents", "skills", `ottho-etape-${id}`, "SKILL.md"),
      `---\nname: ottho-etape-${id}\ndescription: Etape ${id} du parcours.\n---\n\n# Etape ${id}\n\nLe corps de la fiche.\n`,
    );
  }
  return dir;
}

test("la table du Builder couvre les 34 étapes, toutes rattachées à un acte connu", () => {
  assert.equal(ETAPES_CONNUES.length, 34);
  assert.equal(new Set(ETAPES_CONNUES.map((e) => e.id)).size, 34);
  for (const etape of ETAPES_CONNUES) assert.ok(ACTES.includes(etape.acte), `${etape.id} : acte inconnu ${etape.acte}`);
  // Les titres du Builder sont accentués : c'est ce qui le distingue de la source servie.
  assert.match(ETAPES_CONNUES.find((e) => e.id === "01-ton-idee").titre, /Ton idée tient la route/);
});

test("extraireEtapes : lit le tableau du projet sans exécuter son code, et rend null si la forme a changé", () => {
  const etapes = extraireEtapes(SOURCE);
  assert.equal(etapes.length, 3);
  assert.equal(etapes[1].condition, "ios");
  // Pas de tableau, tableau en JavaScript non JSON, ou source illisible : repli, jamais d'exception.
  assert.equal(extraireEtapes("export const AUTRE = 1;"), null);
  assert.equal(extraireEtapes("export const ETAPES = [{ id: '00-x' }];"), null);
  assert.equal(extraireEtapes(null), null);
  assert.equal(extraireEtapes('export const ETAPES = ["texte"];'), null);
  // Crochet dans une chaîne : le découpage ne s'arrête pas dessus.
  assert.equal(extraireEtapes('export const ETAPES = [{ "id": "00-a]b" }];')[0].id, "00-a]b");
});

test("formaterDuree : minutes, heures, jours, et l'étape sans fin", () => {
  assert.equal(formaterDuree(5), "5 min");
  assert.equal(formaterDuree(120), "2 h");
  assert.equal(formaterDuree(20160), "14 jours");
  assert.equal(formaterDuree(1440), "1 jour");
  assert.equal(formaterDuree(0), "en continu");
  assert.equal(formaterDuree(null), null);
});

test("loadParcours : l'ordre et les durées viennent du projet, les titres accentués et les actes du Builder", async () => {
  const dir = await projetDemo();
  const { etapes, source } = await loadParcours(dir);
  assert.equal(source, "projet");
  assert.equal(etapes.length, 3);

  const [bienvenue, apple, inedite] = etapes;
  // Titre accentué du Builder, pas celui (sans accents) du projet.
  assert.equal(bienvenue.titre, "Bienvenue, on fait connaissance");
  assert.equal(bienvenue.acte, "Avant de coder");
  assert.equal(bienvenue.duree, "5 min");
  assert.equal(bienvenue.but, "Comprendre ou tu en es");
  assert.equal(bienvenue.skill, ".agents/skills/ottho-etape-00-bienvenue/SKILL.md");
  assert.equal(bienvenue.description, "Etape 00-bienvenue du parcours.");
  assert.equal(bienvenue.connue, true);

  assert.equal(apple.condition, "ios");
  assert.equal(apple.conditionLabel, "si tu publies sur iPhone");
  // Skill absente du projet : le chemin reste null, l'étape s'affiche quand même.
  assert.equal(apple.skill, null);

  // Étape inconnue du Builder : son titre et son rang viennent du projet, elle est signalée.
  assert.equal(inedite.connue, false);
  assert.equal(inedite.titre, "Une etape que le Builder ne connait pas");
  assert.equal(inedite.acte, "Après");
});

test("loadParcours : parcours illisible ou absent, la table du Builder prend le relais et le dit", async () => {
  for (const source of [null, "export const ETAPES = [{ id: 'cassé' }];"]) {
    const dir = await projetDemo(source, { skills: [] });
    const parcours = await loadParcours(dir);
    assert.equal(parcours.source, "builder");
    assert.equal(parcours.etapes.length, 34);
    assert.equal(parcours.etapes[0].id, "00-bienvenue");
    // Sans le projet, ni durée ni but : le Builder ne les invente pas.
    assert.equal(parcours.etapes[0].duree, null);
    assert.equal(parcours.etapes[0].but, "");
    assert.equal(parcours.etapes[0].condition, "toujours");
  }
});

test("skillPath et readSkill : le chemin se construit depuis l'identifiant, jamais depuis l'URL", async () => {
  assert.equal(skillPath("15b-sans-compte"), ".agents/skills/ottho-etape-15b-sans-compte/SKILL.md");
  for (const mauvais of ["../../etc/passwd", "00-bienvenue/../..", "/absolu", "", "SANS-chiffres", "00-Bienvenue"]) {
    assert.equal(skillPath(mauvais), null, mauvais);
  }
  const dir = await projetDemo();
  const skill = await readSkill(dir, "00-bienvenue");
  assert.equal(skill.path, ".agents/skills/ottho-etape-00-bienvenue/SKILL.md");
  assert.match(skill.content, /^# Etape 00-bienvenue/);
  assert.equal(skill.description, "Etape 00-bienvenue du parcours.");
  assert.equal(await readSkill(dir, "../../etc/passwd"), null);
  assert.equal(await readSkill(dir, "07-compte-apple"), null);
});
