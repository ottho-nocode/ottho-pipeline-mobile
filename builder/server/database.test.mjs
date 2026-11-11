import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SURVEY_FILE, detectAppDatabase, detectKeys, listMigrations, readDatabase, readSurvey, scanBundledSecrets } from "./database.mjs";
import { tempDir } from "./tmpdirs.mjs";

const project = async (files) => {
  const dir = await tempDir("op-db-");
  for (const [rel, text] of Object.entries(files)) await writeFile(join(dir, rel), text);
  return dir;
};

test("detectAppDatabase : projet Supabase de l'app, le .env.local l'emporte ; aucune clé ne sort", async () => {
  const dir = await project({
    ".env": "NEXT_PUBLIC_SUPABASE_URL=https://aaaaaaaaaaaaaaaaaaaa.supabase.co\n",
    ".env.local": 'NEXT_PUBLIC_SUPABASE_URL="https://bbbbbbbbbbbbbbbbbbbb.supabase.co"\nSUPABASE_SERVICE_ROLE_KEY=eyJSECRET\n',
  });
  const db = await detectAppDatabase(dir);
  assert.deepEqual(db, { kind: "supabase", project: "bbbbbbbbbbbbbbbbbbbb", host: "bbbbbbbbbbbbbbbbbbbb.supabase.co", source: ".env.local" });
  assert.doesNotMatch(JSON.stringify(db), /SECRET|eyJ/);
});

test("detectAppDatabase : DATABASE_URL, hôte seulement (jamais l'identifiant ni le mot de passe)", async () => {
  const pg = await detectAppDatabase(await project({ ".env": "DATABASE_URL=postgresql://postgres:MotDePasse@db.cccccccccccccccccccc.supabase.co:5432/postgres\n" }));
  assert.deepEqual(pg, { kind: "supabase", project: "cccccccccccccccccccc", host: "db.cccccccccccccccccccc.supabase.co", source: ".env" });
  const other = await detectAppDatabase(await project({ ".env": "DATABASE_URL=postgres://u:p@localhost:5432/app\n" }));
  assert.deepEqual(other, { kind: "postgres", project: null, host: "localhost", source: ".env" });
  const sqlite = await detectAppDatabase(await project({ ".env": 'DATABASE_URL="file:./dev.db"\n' }));
  assert.deepEqual(sqlite, { kind: "sqlite", project: null, host: "./dev.db", source: ".env" });
  assert.doesNotMatch(JSON.stringify([pg, other]), /MotDePasse|u:p/);
});

test("detectAppDatabase : aucun .env ou aucune base, null", async () => {
  assert.equal(await detectAppDatabase(await project({})), null);
  assert.equal(await detectAppDatabase(await project({ ".env": "PORT=3000\n# SUPABASE_URL=https://x.supabase.co\n" })), null);
});

test("detectKeys : « définie » ou non, jamais la valeur ; clé secrète sous préfixe public signalée", async () => {
  const dir = await project({
    ".env.local":
      "EXPO_PUBLIC_SUPABASE_URL=https://aaaaaaaaaaaaaaaaaaaa.supabase.co\n" +
      "EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJPUBLIC\n" +
      "SUPABASE_SERVICE_ROLE_KEY=eyJSECRET\n",
  });
  const keys = await detectKeys(dir);
  assert.deepEqual(keys.publishable, { name: "EXPO_PUBLIC_SUPABASE_ANON_KEY", source: ".env.local" });
  assert.deepEqual(keys.serviceRole, { name: "SUPABASE_SERVICE_ROLE_KEY", source: ".env.local" });
  assert.deepEqual(keys.leaks, []);
  assert.doesNotMatch(JSON.stringify(keys), /eyJ/);
});

test("detectKeys : clé service_role sous préfixe public → fuite (le binaire livré l'embarquerait)", async () => {
  const dir = await project({ ".env.local": "EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=eyJSECRET\n" });
  const keys = await detectKeys(dir);
  assert.deepEqual(keys.leaks, [{ name: "EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", source: ".env.local", reason: "préfixe public" }]);
});

test("scanBundledSecrets : clé service_role citée dans le code embarqué", async () => {
  const dir = await tempDir("op-db-");
  await mkdir(join(dir, "mobile-app", "lib"), { recursive: true });
  await writeFile(join(dir, "mobile-app", "lib", "client.ts"), "const k = process.env.SUPABASE_SERVICE_ROLE_KEY;\n");
  await writeFile(join(dir, "mobile-app", "lib", "ok.ts"), "const k = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;\n");
  assert.deepEqual(await scanBundledSecrets(dir), ["mobile-app/lib/client.ts"]);
});

test("readSurvey : tables lues par l'application, RLS cochée ou non", async () => {
  const dir = await tempDir("op-db-");
  await mkdir(join(dir, "docs"), { recursive: true });
  assert.deepEqual(await readSurvey(dir), { exists: false, file: SURVEY_FILE, tables: [] });
  await writeFile(
    join(dir, "docs", "base.md"),
    "# Base existante\n\n## Tables lues par l'application\n\n- [x] `profiles`\n- [ ] entitlements\n- [x] profiles\n\n## Suite\n\n- [ ] autre_chose\n",
  );
  const survey = await readSurvey(dir);
  assert.equal(survey.exists, true);
  assert.deepEqual(survey.tables, [{ name: "profiles", rls: true }, { name: "entitlements", rls: false }]);
});

test("listMigrations : comptées, jamais appliquées", async () => {
  const dir = await tempDir("op-db-");
  assert.deepEqual(await listMigrations(dir), []);
  await mkdir(join(dir, "supabase", "migrations"), { recursive: true });
  await writeFile(join(dir, "supabase", "migrations", "0002_b.sql"), "-- b");
  await writeFile(join(dir, "supabase", "migrations", "0001_a.sql"), "-- a");
  await writeFile(join(dir, "supabase", "migrations", "notes.md"), "ignoré");
  assert.deepEqual(await listMigrations(dir), ["0001_a.sql", "0002_b.sql"]);
});

test("readDatabase : la base existante, ses clés, son relevé, ses migrations ; aucune valeur de clé", async () => {
  const dir = await tempDir("op-db-");
  await mkdir(join(dir, "docs"), { recursive: true });
  await writeFile(
    join(dir, ".env.local"),
    "EXPO_PUBLIC_SUPABASE_URL=https://dddddddddddddddddddd.supabase.co\nEXPO_PUBLIC_SUPABASE_ANON_KEY=eyJPUBLIC\n",
  );
  await writeFile(join(dir, "docs", "base.md"), "## Tables lues par l'application\n\n- [x] profiles\n- [ ] entitlements\n");
  const db = await readDatabase(dir);
  assert.equal(db.app.project, "dddddddddddddddddddd");
  assert.equal(db.publishable.name, "EXPO_PUBLIC_SUPABASE_ANON_KEY");
  assert.equal(db.serviceRole, null);
  assert.deepEqual(db.leaks, []);
  assert.deepEqual(db.unchecked, ["entitlements"]);
  assert.deepEqual(db.migrations, []);
  assert.doesNotMatch(JSON.stringify(db), /eyJ/);
});
