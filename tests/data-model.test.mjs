import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("defines every requested persistent entity", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  for (const table of [
    "studentProfiles",
    "languagePacks",
    "conversationObjectives",
    "practiceSessions",
    "messages",
    "recordings",
    "fluentExamples",
    "communityExamples",
    "consents",
  ]) assert.match(schema, new RegExp(`export const ${table} = sqliteTable`));
});

test("ships one registered English demo pack without an English-only repository contract", async () => {
  const [registry, demoPack, repository] = await Promise.all([
    readFile(new URL("lib/language-packs/registry.ts", root), "utf8"),
    readFile(new URL("lib/language-packs/en-US.ts", root), "utf8"),
    readFile(new URL("lib/domain/repository.ts", root), "utf8"),
  ]);
  assert.match(registry, /registerLanguagePack/);
  assert.match(registry, /englishDemoPack/);
  assert.match(demoPack, /localeTag:\s*"en-US"/);
  assert.match(repository, /listObjectives\(languagePackId: string\)/);
  assert.doesNotMatch(repository, /English/);
});

test("registers modular starter packs for the planned practice languages", async () => {
  const [registry, starterPacks] = await Promise.all([
    readFile(new URL("lib/language-packs/registry.ts", root), "utf8"),
    readFile(new URL("lib/language-packs/starter-packs.ts", root), "utf8"),
  ]);
  assert.match(registry, /additionalStarterPacks/);
  for (const localeTag of ["es-ES", "fr-FR", "ja-JP", "zh-CN", "sn-ZW"]) {
    assert.match(starterPacks, new RegExp(`localeTag:\\s*"${localeTag}"`));
  }
});

test("requires consent references for recordings and community examples", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  const consentReferences = schema.match(/consentId:[\s\S]{0,140}references\(\(\) => consents\.id/g) ?? [];
  assert.equal(consentReferences.length, 2);
});

test("community examples store anonymous presentation metadata without shared audio", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  assert.match(schema, /styleLabel: text\("style_label"\)/);
  assert.match(schema, /vocabularyNotes: text\("vocabulary_notes"\)/);
  assert.match(schema, /audioStorageKey: text\("audio_storage_key"\)/);
});

test("student accounts use a unique ASU email and hashed password fields", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  assert.match(schema, /asuEmail: text\("asu_email"\)/);
  assert.match(schema, /passwordHash: text\("password_hash"\)/);
  assert.match(schema, /passwordSalt: text\("password_salt"\)/);
  assert.match(schema, /student_profiles_asu_email_idx/);
});
