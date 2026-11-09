import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { estHeritee, lireChamp, readExpo } from "./expo.mjs";
import { tempDir } from "./tmpdirs.mjs";

const SITE = `export const SiteConfig = {
  title: "Mon salon",
  description: "Reservation avec caution",
  slug: 'nowstack',
  bundleId: "mobile.aiblueprint.dev",
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

async function projet({ site = SITE, eas = EAS } = {}) {
  const dir = await tempDir("opm-expo-");
  if (site !== null) await writeFile(join(dir, "site-config.ts"), site);
  if (eas !== null) {
    await mkdir(join(dir, "mobile-app"), { recursive: true });
    await writeFile(join(dir, "mobile-app", "eas.json"), eas);
  }
  return dir;
}

test("lireChamp : guillemets doubles, simples, et clé absente", () => {
  assert.equal(lireChamp(SITE, "title"), "Mon salon");
  assert.equal(lireChamp(SITE, "slug"), "nowstack");
  assert.equal(lireChamp(SITE, "absent"), null);
  assert.equal(lireChamp(null, "title"), null);
  // « version » ne doit pas être confondu avec une clé qui finit par le même mot.
  assert.equal(lireChamp('const x = { appVersion: "9.9.9", version: "1.2.0" };', "version"), "1.2.0");
});

test("estHeritee : valeurs du modèle et gabarit laissé en place", () => {
  assert.equal(estHeritee("NowStack"), true);
  assert.equal(estHeritee("dev.melvynx.nowstack"), true);
  assert.equal(estHeritee("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"), true);
  assert.equal(estHeritee("Mon salon"), false);
  assert.equal(estHeritee(null), false);
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

  assert.deepEqual(await readExpo(await projet({ site: null, eas: null })), { present: false });
});
