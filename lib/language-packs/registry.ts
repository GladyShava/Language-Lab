import { englishDemoPack } from "./en-US";
import { additionalStarterPacks } from "./starter-packs";
import type { LanguagePackDefinition } from "./types";

const packs = new Map<string, LanguagePackDefinition>([
  [englishDemoPack.pack.id, englishDemoPack],
  ...additionalStarterPacks.map((definition) => [definition.pack.id, definition] as const),
]);

export const defaultLanguagePackId = englishDemoPack.pack.id;

export function listLanguagePackDefinitions(): LanguagePackDefinition[] {
  return [...packs.values()];
}

export function getLanguagePackDefinition(id: string): LanguagePackDefinition | null {
  return packs.get(id) ?? null;
}

export function getDefaultLanguagePackDefinition(): LanguagePackDefinition {
  const pack = getLanguagePackDefinition(defaultLanguagePackId);
  if (!pack) throw new Error(`Default language pack ${defaultLanguagePackId} is not registered.`);
  return pack;
}

export function registerLanguagePack(definition: LanguagePackDefinition): void {
  if (packs.has(definition.pack.id)) throw new Error(`Language pack ${definition.pack.id} is already registered.`);
  if (definition.objectives.some((objective) => objective.languagePackId !== definition.pack.id)) {
    throw new Error("Every objective must belong to the language pack being registered.");
  }
  packs.set(definition.pack.id, definition);
}
