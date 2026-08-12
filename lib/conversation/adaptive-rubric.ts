import { assessResponse, type ResponseOutcome } from "./response-assessment";
import type { ConversationTurn } from "./types";
import { analyzeConversationLanguageUse, type TargetLanguageUseObservation } from "./target-language";

export const adaptiveStages = ["Emerging", "Developing", "Expanding", "Confident", "Advanced"] as const;
export type AdaptiveStage = typeof adaptiveStages[number];

export const rubricDimensionDefinitions = [
  { key: "communicationEffectiveness", label: "Communication Effectiveness", weight: 0.30 },
  { key: "vocabularyGrowth", label: "Vocabulary Growth", weight: 0.20 },
  { key: "curiosityInquiry", label: "Curiosity & Inquiry", weight: 0.15 },
  { key: "confidenceFluency", label: "Confidence & Fluency", weight: 0.15 },
  { key: "strategicCommunication", label: "Strategic Communication", weight: 0.20 },
] as const;

export type RubricDimensionKey = typeof rubricDimensionDefinitions[number]["key"];

export interface ResponseSignals {
  wordCount: number;
  sentenceCount: number;
  averageSentenceLength: number;
  uniqueWordRatio: number;
  repetitionRatio: number;
  fillerCount: number;
  hesitationCount: number;
  connectorCount: number;
  elaborationCount: number;
  questionCount: number;
  inquiryCount: number;
  repairStrategyCount: number;
  comparisonCount: number;
  directness: ResponseOutcome;
}

export interface RubricDimensionScore {
  key: RubricDimensionKey;
  label: string;
  score: number;
  weight: number;
  evidence: string;
}

export interface ResponseRubricResult {
  turnId: string;
  weightedScore: number;
  targetStage: AdaptiveStage;
  stageAfterTurn: AdaptiveStage;
  dimensions: Record<RubricDimensionKey, RubricDimensionScore>;
  signals: ResponseSignals;
}

export interface AdaptiveRubricProfile {
  currentStage: AdaptiveStage;
  overallScore: number;
  dimensions: Record<RubricDimensionKey, RubricDimensionScore>;
  strengths: string[];
  growthAreas: string[];
  recommendation: string;
  strongerPhrase: string;
  runningSummary: string;
  turnsAnalyzed: number;
  stageHistory: AdaptiveStage[];
  responseHistory: ResponseRubricResult[];
  languageUse: TargetLanguageUseObservation;
  disclaimer: string;
}

const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "because", "but", "by", "for", "from", "i", "in", "is", "it", "my", "of", "on", "or", "that", "the", "this", "to", "was", "we", "with"]);
const clampScore = (value: number) => Math.min(5, Math.max(1, Math.round(value)));
const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const matches = (text: string, expression: RegExp) => text.match(expression)?.length ?? 0;

function tokenize(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{M}'-]+/gu) ?? [];
}

function directnessFor(prompt: string, response: string, localeTag: string): ResponseOutcome {
  if (/^en\b/i.test(localeTag)) return assessResponse(prompt, response).outcome;
  const units = /^(ja|zh)/i.test(localeTag) ? (response.match(/[\p{L}\p{N}]/gu) ?? []).length : tokenize(response).length;
  if (units < 3) return "did_not_answer";
  if (units < 10) return "partially_answered";
  return "answered";
}

export function extractResponseSignals(prompt: string, response: string, localeTag = "en-US"): ResponseSignals {
  const words = tokenize(response);
  const contentWords = words.filter((word) => !stopWords.has(word));
  const uniqueWords = new Set(contentWords);
  const mostFrequent = contentWords.reduce((counts, word) => counts.set(word, (counts.get(word) ?? 0) + 1), new Map<string, number>());
  const repeatedWords = [...mostFrequent.values()].filter((count) => count > 1).reduce((total, count) => total + count - 1, 0);
  const sentences = response.split(/[.!?。！？]+/u).map((item) => item.trim()).filter(Boolean);
  const questionCount = matches(response, /[?？]/g);
  const fillerCount = matches(response, /\b(um+|uh+|erm+|hmm+|you know)\b/gi) + matches(response, /(?:^|[,;])\s*like\s*[,;]/gi);
  const hesitationCount = matches(response, /\.{3,}|--+|\b(maybe|perhaps|i guess|i am not sure|i'm not sure)\b/gi);
  const connectorCount = matches(response, /\b(because|however|although|therefore|while|whereas|since|so that|on the other hand|as a result|for example|for instance)\b/gi);
  const elaborationCount = matches(response, /\b(because|for example|for instance|this means|the reason|such as|in particular)\b/gi);
  const inquiryCount = matches(response, /\b(why|how|what if|could you|would you|do you think|what do you think)\b/gi);
  const repairStrategyCount = matches(response, /\b(i mean|what i mean is|another way to say it|it is like|it's like|similar to|the word i am looking for|i do not know the exact word|i don't know the exact word|in other words)\b/gi);
  const comparisonCount = matches(response, /\b(compared with|compared to|unlike|whereas|more than|less than|similar to|on the other hand|both|in contrast)\b/gi);

  return {
    wordCount: words.length,
    sentenceCount: Math.max(1, sentences.length),
    averageSentenceLength: oneDecimal(words.length / Math.max(1, sentences.length)),
    uniqueWordRatio: contentWords.length ? oneDecimal(uniqueWords.size / contentWords.length) : 0,
    repetitionRatio: contentWords.length ? oneDecimal(repeatedWords / contentWords.length) : 0,
    fillerCount,
    hesitationCount,
    connectorCount,
    elaborationCount,
    questionCount,
    inquiryCount,
    repairStrategyCount,
    comparisonCount,
    directness: directnessFor(prompt, response, localeTag),
  };
}

function evidenceFor(key: RubricDimensionKey, signals: ResponseSignals): string {
  switch (key) {
    case "communicationEffectiveness":
      return signals.directness === "answered" ? "The response addressed the prompt and communicated a developed idea." : signals.directness === "partially_answered" ? "The response began to address the prompt but needed more development." : "The response did not yet provide a usable answer to the prompt.";
    case "vocabularyGrowth":
      return signals.repetitionRatio > 0.2 ? "Several content words were repeated; more precise alternatives could add variety." : "The response used varied content words with limited repetition.";
    case "curiosityInquiry":
      return signals.questionCount || signals.inquiryCount ? "The response showed inquiry by asking or framing a follow-up question." : "The response answered Maya but did not yet extend the exchange with a question.";
    case "confidenceFluency":
      return signals.fillerCount + signals.hesitationCount > 2 ? "Frequent fillers or hesitation markers interrupted the flow." : "The response sustained its message with limited textual hesitation markers.";
    case "strategicCommunication":
      return signals.repairStrategyCount ? "The response used paraphrasing or repair language to keep communicating." : signals.connectorCount ? "The response used connectors to organize and support its meaning." : "The response could use a connector, comparison or repair phrase to manage the message more strategically.";
  }
}

export function scoreResponse(prompt: string, response: string, localeTag = "en-US", turnId = "response"): Omit<ResponseRubricResult, "stageAfterTurn"> {
  const signals = extractResponseSignals(prompt, response, localeTag);
  const directnessBase = signals.directness === "answered" ? 3 : signals.directness === "partially_answered" ? 2 : 1;
  const communicationEffectiveness = clampScore(directnessBase + (signals.wordCount >= 18 ? 1 : 0) + (signals.elaborationCount >= 1 ? 1 : 0));
  const vocabularyGrowth = clampScore(1 + (signals.wordCount >= 8 ? 1 : 0) + (signals.uniqueWordRatio >= 0.65 ? 1 : 0) + (signals.wordCount >= 20 ? 1 : 0) + (signals.connectorCount >= 2 ? 1 : 0) - (signals.repetitionRatio > 0.25 ? 1 : 0));
  const curiosityInquiry = clampScore(2 + (signals.inquiryCount >= 1 ? 1 : 0) + (signals.questionCount >= 1 ? 1 : 0) + (signals.questionCount >= 2 ? 1 : 0));
  const confidenceFluency = clampScore(2 + (signals.wordCount >= 10 ? 1 : 0) + (signals.wordCount >= 24 && signals.averageSentenceLength >= 8 ? 1 : 0) + (signals.connectorCount >= 1 ? 1 : 0) - Math.min(2, signals.fillerCount + signals.hesitationCount));
  const strategicCommunication = clampScore(1 + (signals.directness === "answered" ? 1 : 0) + (signals.connectorCount >= 1 ? 1 : 0) + (signals.repairStrategyCount >= 1 ? 1 : 0) + (signals.comparisonCount >= 1 ? 1 : 0));
  const rawScores: Record<RubricDimensionKey, number> = { communicationEffectiveness, vocabularyGrowth, curiosityInquiry, confidenceFluency, strategicCommunication };
  const dimensions = Object.fromEntries(rubricDimensionDefinitions.map((definition) => [definition.key, {
    ...definition,
    score: rawScores[definition.key],
    evidence: evidenceFor(definition.key, signals),
  }])) as Record<RubricDimensionKey, RubricDimensionScore>;
  const weightedScore = oneDecimal(rubricDimensionDefinitions.reduce((total, definition) => total + dimensions[definition.key].score * definition.weight, 0));
  const targetStage = weightedScore < 1.8 ? "Emerging" : weightedScore < 2.6 ? "Developing" : weightedScore < 3.4 ? "Expanding" : weightedScore < 4.2 ? "Confident" : "Advanced";
  return { turnId, weightedScore, targetStage, dimensions, signals };
}

function emptyDimensions(): Record<RubricDimensionKey, RubricDimensionScore> {
  return Object.fromEntries(rubricDimensionDefinitions.map((definition) => [definition.key, {
    ...definition,
    score: 2,
    evidence: "Waiting for enough conversation evidence.",
  }])) as Record<RubricDimensionKey, RubricDimensionScore>;
}

function recommendationFor(key: RubricDimensionKey): string {
  const recommendations: Record<RubricDimensionKey, string> = {
    communicationEffectiveness: "Answer the question directly, then add one reason and one concrete example.",
    vocabularyGrowth: "Replace one repeated general word with a more precise word that fits your meaning.",
    curiosityInquiry: "End one response with a natural question that keeps the conversation moving.",
    confidenceFluency: "Use a short opening sentence, pause, and then add details instead of filling the silence.",
    strategicCommunication: "When a word is missing, describe it with a comparison or say, 'Another way to explain it is...'.",
  };
  return recommendations[key];
}

function strongerPhraseFor(profile: Pick<AdaptiveRubricProfile, "dimensions" | "responseHistory">): string {
  const latest = profile.responseHistory.at(-1)?.signals;
  if (latest && latest.repairStrategyCount === 0 && profile.dimensions.strategicCommunication.score <= 3) return "I do not know the exact word, but it is similar to...";
  if (latest && latest.elaborationCount === 0) return "One reason this matters is...";
  if (latest && latest.comparisonCount === 0) return "Compared with the alternative...";
  return "A more precise way to describe it is...";
}

export function evaluateAdaptiveConversation(turns: readonly ConversationTurn[], localeTag = "en-US"): AdaptiveRubricProfile {
  const learnerTurns = turns.filter((turn) => turn.role === "learner");
  const languageUse = analyzeConversationLanguageUse(turns, localeTag);
  if (!learnerTurns.length) {
    const dimensions = emptyDimensions();
    return {
      currentStage: "Developing",
      overallScore: 2,
      dimensions,
      strengths: ["Ready to begin a supported conversation."],
      growthAreas: ["Complete the first response so Maya can personalize the coaching."],
      recommendation: "Answer Maya's first question in two or three complete sentences.",
      strongerPhrase: "One thing that is important to me is...",
      runningSummary: "No student response has been analyzed yet.",
      turnsAnalyzed: 0,
      stageHistory: [],
      responseHistory: [],
      languageUse,
      disclaimer: "Coaching stages and rubric scores organize practice evidence only. They are not ACTFL levels, official proficiency ratings, pass/fail results or readiness decisions.",
    };
  }

  let stageIndex = 1;
  const responseHistory: ResponseRubricResult[] = [];
  let activePrompt = "";
  for (const turn of turns) {
    if (turn.role === "coach") { activePrompt = turn.text; continue; }
    const scored = scoreResponse(activePrompt, turn.text, localeTag, turn.id);
    const targetIndex = adaptiveStages.indexOf(scored.targetStage);
    if (targetIndex > stageIndex) stageIndex += 1;
    else if (targetIndex < stageIndex) stageIndex -= 1;
    responseHistory.push({ ...scored, stageAfterTurn: adaptiveStages[stageIndex] });
  }

  const recent = responseHistory.slice(-3);
  const dimensions = Object.fromEntries(rubricDimensionDefinitions.map((definition) => {
    const score = oneDecimal(recent.reduce((total, result) => total + result.dimensions[definition.key].score, 0) / recent.length);
    return [definition.key, { ...definition, score, evidence: recent.at(-1)!.dimensions[definition.key].evidence }];
  })) as Record<RubricDimensionKey, RubricDimensionScore>;
  const overallScore = oneDecimal(rubricDimensionDefinitions.reduce((total, definition) => total + dimensions[definition.key].score * definition.weight, 0));
  const ranked = [...rubricDimensionDefinitions].sort((a, b) => dimensions[b.key].score - dimensions[a.key].score);
  const strengths = ranked.slice(0, 2).map((definition) => `${definition.label}: ${dimensions[definition.key].evidence}`);
  const growthAreas = ranked.slice(-2).reverse().map((definition) => `${definition.label}: ${dimensions[definition.key].evidence}`);
  const lowest = ranked.at(-1)!.key;
  const currentStage = adaptiveStages[stageIndex];
  const profileBase = { dimensions, responseHistory };

  return {
    currentStage,
    overallScore,
    dimensions,
    strengths,
    growthAreas,
    recommendation: recommendationFor(lowest),
    strongerPhrase: strongerPhraseFor(profileBase),
    runningSummary: `${strengths[0]} Current growth focus: ${rubricDimensionDefinitions.find((definition) => definition.key === lowest)!.label}.`,
    turnsAnalyzed: responseHistory.length,
    stageHistory: responseHistory.map((result) => result.stageAfterTurn),
    responseHistory,
    languageUse,
    disclaimer: "Coaching stages and rubric scores organize practice evidence only. They are not ACTFL levels, official proficiency ratings, pass/fail results or readiness decisions.",
  };
}
