import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { estHeritee, lireChamp, lireMotifs, readExpo } from "./expo.mjs";
import { tempDir } from "./tmpdirs.mjs";

// Le détecteur du projet est la seule source des valeurs du modèle. Celles-ci sont inventées : le
// Builder ne porte dans son code ni le nom ni les identifiants de l'auteur d'un modèle réel.
const DETECTEUR = `export const HERITAGE_PATTERNS = [
  { "id": "marque", "pattern": "Modele Mobile" },
  { "id": "identifiant-app", "pattern": "mobile.modele-exemple.dev" },
  { "id": "slug-modele", "pattern": "modele-mobile" },
];
`;

const SITE = `export const SiteConfig = {
  title: "Mon salon",
  description: "Reservation avec caution",
  slug: 'modele-mobile',
  bundleId: "mobile.modele-exemple.dev",
  androidPackage: "com.monsalon.app",
  appleTeamId: "AB12CD34EF",
  easProjectId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  version: "1.2.0",
  urls: { website: "https://monsalon.fr" },
};
`;

const EAS = JSON.stringify({
  cli: { version: ">= 18.5.0", appVersionSource: "remote" },
  build: { base: { node: "22.20.0" }, development: {}, preview: {}, production: {} },
});

async function projet({ site = SITE, eas = EAS, detecteur = DETECTEUR } = {}) {
  const dir = await tempDir("opm-expo-");
  if (site !== null) await writeFile(join(dir, "site-config.ts"), site);
  if (detecteur !== null) {
    await mkdir(join(dir, "scripts"), { recursive: true });
    await writeFile(join(dir, "scripts", "ottho-heritage.mjs"), detecteur);
  }
  if (eas !== null) {
    await mkdir(join(dir, "mobile-app"), { recursive: true });
    await writeFile(join(dir, "mobile-app", "eas.json"), eas);
  }
  return dir;
}

test("lireChamp : guillemets doubles, simples, et clé absente", () => {
  assert.equal(lireChamp(SITE, "title"), "Mon salon");
  assert.equal(lireChamp(SITE, "slug"), "modele-mobile");
  assert.equal(lireChamp(SITE, "absent"), null);
  assert.equal(lireChamp(null, "title"), null);
  // « version » ne doit pas être confondu avec une clé qui finit par le même mot.
  assert.equal(lireChamp('const x = { appVersion: "9.9.9", version: "1.2.0" };', "version"), "1.2.0");
});

test("lireMotifs : clé citée ou nue, motif trop court écarté, source absente", () => {
  assert.deepEqual(lireMotifs(`[{ "pattern": "MonModele" }, { pattern: 'dev.mon.app' }]`), ["monmodele", "dev.mon.app"]);
  assert.deepEqual(lireMotifs(`{ "pattern": "ab" }`), []);
  assert.deepEqual(lireMotifs(null), []);
});

test("estHeritee : valeurs du modèle, casse ignorée, gabarit laissé en place", () => {
  const motifs = lireMotifs(DETECTEUR);
  assert.equal(estHeritee("Modele Mobile", motifs), true);
  assert.equal(estHeritee("mobile.modele-exemple.dev", motifs), true);
  // La casse ne doit pas faire manquer une valeur du modèle.
  assert.equal(estHeritee("MODELE-MOBILE", motifs), true);
  assert.equal(estHeritee("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", motifs), true);
  assert.equal(estHeritee("Mon salon", motifs), false);
  assert.equal(estHeritee(null, motifs), false);
  // Sans motifs, aucune valeur du modèle n'est connue : seul le gabarit reste signalé.
  assert.equal(estHeritee("mobile.modele-exemple.dev"), false);
  assert.equal(estHeritee("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"), true);
});

test("readExpo : ce que la fabrication embarquera, et ce qui vient encore du modèle", async () => {
  const expo = await readExpo(await projet());
  assert.equal(expo.present, true);
  const parCle = Object.fromEntries(expo.champs.map((c) => [c.key, c]));
  assert.equal(parCle.title.valeur, "Mon salon");
  assert.equal(parCle.title.heritee, false);
  assert.equal(parCle.androidPackage.heritee, false);
  // Slug, identifiant iOS et projet EAS encore ceux du modèle.
  assert.deepEqual(expo.heritage, ["slug", "bundleId", "easProjectId"]);
  assert.equal(expo.relie, false);
  assert.deepEqual(expo.profils, ["development", "preview", "production"]);
  assert.equal(expo.versionSource, "remote");
});

test("readExpo : projet EAS relié, eas.json cassé, et projet sans application Expo", async () => {
  const relie = await readExpo(await projet({ site: SITE.replace("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "9f0c2e11-aaaa-bbbb-cccc-123456789abc") }));
  assert.equal(relie.relie, true);

  // eas.json illisible : pas de profils, le reste de la fiche reste lisible.
  const casse = await readExpo(await projet({ eas: "{ pas du json" }));
  assert.deepEqual(casse.profils, []);
  assert.equal(casse.versionSource, null);
  assert.equal(casse.champs.length, 7);

  assert.deepEqual(await readExpo(await projet({ site: null, eas: null, detecteur: null })), { present: false });

  // Projet sans détecteur d'héritage : plus de motifs du modèle, seul le gabarit est signalé.
  const sansDetecteur = await readExpo(await projet({ detecteur: null }));
  assert.deepEqual(sansDetecteur.heritage, ["easProjectId"]);
});

test("readExpo pipeline : app.json de l'application, aucun héritage (pas de modèle derrière elle)", async () => {
  const dir = await tempDir("opm-expo-pipe-");
  await mkdir(join(dir, "mobile-app"), { recursive: true });
  await writeFile(
    join(dir, "mobile-app", "app.json"),
    JSON.stringify({
      expo: {
        name: "Suivi chantier",
        slug: "suivi-chantier",
        version: "1.0.0",
        ios: { bundleIdentifier: "co.exemple.suivi" },
        android: { package: "co.exemple.suivi" },
        extra: { eas: { projectId: "11111111-2222-3333-4444-555555555555" } },
      },
    }),
  );
  await writeFile(join(dir, "mobile-app", "eas.json"), EAS);
  const expo = await readExpo(dir, "pipeline");
  assert.equal(expo.present, true);
  assert.equal(expo.config, join("mobile-app", "app.json"));
  const valeur = (key) => expo.champs.find((c) => c.key === key).valeur;
  assert.equal(valeur("title"), "Suivi chantier");
  assert.equal(valeur("bundleId"), "co.exemple.suivi");
  assert.equal(valeur("androidPackage"), "co.exemple.suivi");
  assert.equal(valeur("easProjectId"), "11111111-2222-3333-4444-555555555555");
  assert.deepEqual(expo.profils, ["development", "preview", "production"]);
  assert.equal(expo.relie, true);
  // Pas de modèle derrière une application du pipeline : rien n'est signalé comme hérité.
  assert.deepEqual(expo.heritage, []);
  assert.equal(expo.champs.every((c) => c.heritee === false), true);
});

test("readExpo pipeline : app.config.ts lu par clés, équipe Apple prise dans eas.json", async () => {
  const dir = await tempDir("opm-expo-ts-");
  await mkdir(join(dir, "mobile-app"), { recursive: true });
  await writeFile(
    join(dir, "mobile-app", "app.config.ts"),
    '// @ts-nocheck\nconst expoConfig = (ctx) => ({\n  ...ctx.config,\n  name: "Chantier",\n  slug: "chantier",\n  version: "2.1.0",\n  ios: { bundleIdentifier: "co.exemple.chantier" },\n  extra: { eas: { projectId: "aaaa-bbbb" } },\n});\nexport default expoConfig;\n',
  );
  await writeFile(
    join(dir, "mobile-app", "eas.json"),
    JSON.stringify({ cli: { appVersionSource: "remote" }, build: { base: {}, preview: {} }, submit: { production: { ios: { appleTeamId: "AB12CD34EF" } } } }),
  );
  const expo = await readExpo(dir, "pipeline");
  const valeur = (key) => expo.champs.find((c) => c.key === key).valeur;
  assert.equal(expo.config, join("mobile-app", "app.config.ts"));
  assert.equal(valeur("title"), "Chantier");
  assert.equal(valeur("bundleId"), "co.exemple.chantier");
  assert.equal(valeur("appleTeamId"), "AB12CD34EF");
  assert.equal(valeur("androidPackage"), null);
  assert.deepEqual(expo.profils, ["preview"]);
  assert.equal(expo.versionSource, "remote");
});

test("readExpo pipeline : projet sans application Expo", async () => {
  assert.deepEqual(await readExpo(await tempDir("opm-expo-rien-"), "pipeline"), { present: false });
});
