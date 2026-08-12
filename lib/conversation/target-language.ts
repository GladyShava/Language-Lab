import type { ConversationTurn } from "./types";

export type TargetLanguageUseStatus = "on_target" | "mixed_language" | "not_assessed";

export interface TargetLanguageUseObservation {
  status: TargetLanguageUseStatus;
  targetLanguage: string;
  targetLocaleTag: string;
  englishWords: string[];
  affectedTurns: number;
  analyzedTurns: number;
  summary: string;
}

const languageNames: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  ja: "Japanese",
  sn: "Shona",
  zh: "Mandarin Chinese",
};

// Deliberately conservative: only clear English markers are used because names,
// loanwords and cognates can be valid in the target language.
const clearEnglishWords = new Set([
  "about", "also", "am", "and", "are", "because", "but", "can", "cannot", "could", "did", "do", "does",
  "don't", "enjoy", "from", "good", "had", "has", "have", "help", "how", "i", "i'm", "is", "it's", "like",
  "my", "need", "people", "really", "school", "should", "the", "then", "think", "this", "today", "tomorrow",
  "very", "want", "was", "were", "when", "where", "why", "will", "with", "work", "would", "yesterday", "you",
]);

const transcriptUnavailable = (text: string) => text.startsWith("[Spoken response recorded");

function localeRoot(localeTag: string) {
  return localeTag.toLocaleLowerCase().split(/[-_]/)[0];
}

function detectedEnglishWords(text: string): string[] {
  const words = text.toLocaleLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  return [...new Set(words.filter((word) => clearEnglishWords.has(word)))];
}

export function analyzeResponseLanguageUse(text: string, localeTag: string): TargetLanguageUseObservation {
  const root = localeRoot(localeTag);
  const targetLanguage = languageNames[root] ?? localeTag;
  if (!text.trim() || transcriptUnavailable(text)) {
    return { status: "not_assessed", targetLanguage, targetLocaleTag: localeTag, englishWords: [], affectedTurns: 0, analyzedTurns: 0, summary: "No usable transcript was available for this language check." };
  }
  if (root === "en") {
    return { status: "on_target", targetLanguage, targetLocaleTag: localeTag, englishWords: [], affectedTurns: 0, analyzedTurns: 1, summary: "English was the selected practice language." };
  }
  const englishWords = detectedEnglishWords(text);
  if (englishWords.length) {
    return { status: "mixed_language", targetLanguage, targetLocaleTag: localeTag, englishWords, affectedTurns: 1, analyzedTurns: 1, summary: `Clear English ${englishWords.length === 1 ? "word" : "words"} detected in a ${targetLanguage} response: ${englishWords.join(", ")}.` };
  }
  return { status: "on_target", targetLanguage, targetLocaleTag: localeTag, englishWords: [], affectedTurns: 0, analyzedTurns: 1, summary: `No clear English words were detected in the transcribed ${targetLanguage} response.` };
}

export function analyzeConversationLanguageUse(turns: readonly ConversationTurn[], localeTag: string): TargetLanguageUseObservation {
  const observations = turns.filter((turn) => turn.role === "learner").map((turn) => analyzeResponseLanguageUse(turn.text, localeTag));
  const analyzed = observations.filter((observation) => observation.status !== "not_assessed");
  const englishWords = [...new Set(analyzed.flatMap((observation) => observation.englishWords))];
  const affectedTurns = analyzed.filter((observation) => observation.status === "mixed_language").length;
  const targetLanguage = observations[0]?.targetLanguage ?? languageNames[localeRoot(localeTag)] ?? localeTag;
  if (!analyzed.length) {
    return { status: "not_assessed", targetLanguage, targetLocaleTag: localeTag, englishWords: [], affectedTurns: 0, analyzedTurns: 0, summary: "No usable transcript was available for this language check." };
  }
  if (affectedTurns) {
    return { status: "mixed_language", targetLanguage, targetLocaleTag: localeTag, englishWords, affectedTurns, analyzedTurns: analyzed.length, summary: `${affectedTurns} of ${analyzed.length} transcribed responses included clear English ${englishWords.length === 1 ? "word" : "words"}.` };
  }
  return { status: "on_target", targetLanguage, targetLocaleTag: localeTag, englishWords: [], affectedTurns: 0, analyzedTurns: analyzed.length, summary: `No clear English words were detected across ${analyzed.length} transcribed ${targetLanguage} ${analyzed.length === 1 ? "response" : "responses"}.` };
}

export function createTargetLanguageRedirect(localeTag: string, englishWords: readonly string[]): string {
  const root = localeRoot(localeTag);
  const words = englishWords.map((word) => `“${word}”`).join(", ");
  const redirects: Record<string, string> = {
    es: `He oído ${words} en inglés. Para esta práctica, responde solo en español. Reformula tu respuesta en español antes de continuar.`,
    fr: `J’ai entendu ${words} en anglais. Pour cette pratique, répondez uniquement en français. Reformulez votre réponse en français avant de continuer.`,
    ja: `英語の表現 ${words} が聞こえました。この練習では日本語だけで答えてください。続ける前に、日本語で言い換えてみましょう。`,
    sn: `Ndanzwa ${words} muchiRungu. Pachiitwa ichi, pindura nechiShona chete. Edza kutaurazve mhinduro yako nechiShona tisati taenderera mberi.`,
    zh: `我听到了英语词 ${words}。这次练习请只用中文回答。继续之前，请用中文重新表达你的回答。`,
  };
  return redirects[root] ?? `I heard ${words} in English. Please answer only in the selected practice language, then try your response again before we continue.`;
}
