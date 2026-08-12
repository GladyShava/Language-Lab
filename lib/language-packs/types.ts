import type { ConversationObjective, FluentExample, LanguagePack } from "../domain/models";

export interface LanguagePackDefinition {
  pack: LanguagePack;
  objectives: readonly ConversationObjective[];
  fluentExamples: readonly FluentExample[];
}
