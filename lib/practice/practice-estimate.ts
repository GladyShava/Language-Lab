import type { ConversationTurn } from "@/lib/conversation/types";
import { assessResponse } from "@/lib/conversation/response-assessment";

export type PracticeLevel = "Novice" | "Intermediate" | "Advanced" | "Superior";
export type FactCriterion = "Functions and tasks" | "Accuracy" | "Context and content" | "Text type";

export interface PracticeEstimate {
  level: PracticeLevel | null;
  label: string;
  evidenceStatus: "ready" | "limited";
  summary: string;
  observations: Array<{
    label: FactCriterion;
    detail: string;
    status: "observed" | "limited" | "not_assessed";
  }>;
  sampleSummary: string;
  nextFocus: string;
  basis: string;
  disclaimer: string;
  sourceLabel: string;
  sourceUrl: string;
}

const spokenOnly = (text: string) => text.startsWith("[Spoken response recorded");
const words = (text: string) => text.match(/[\p{L}\p{M}'-]+/gu) ?? [];
const includesAny = (text: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));
const ACTFL_SOURCE_URL = "https://www.actfl.org/proficiency-guidelines-overview";
const ACTFL_SOURCE_LABEL = "ACTFL Proficiency Guidelines 2024";

const pastPatterns = [/\b(yesterday|last|ago|was|were|went|had|did|visited|learned|worked|studied)\b/i];
const futurePatterns = [/\b(tomorrow|next|will|going to|plan to|hope to|would)\b/i];
const opinionPatterns = [/\b(i think|i believe|in my opinion|because|however|although|advantage|disadvantage|for example)\b/i];
const hypotheticalPatterns = [/\b(if|would|could|might|imagine|suppose)\b/i];
const abstractPatterns = [/\b(society|government|education|technology|community|economy|policy|global|ethical|impact)\b/i];

export function createPracticeEstimate(turns: readonly ConversationTurn[], completed: boolean): PracticeEstimate {
  const learnerTurns = turns.filter((turn) => turn.role === "learner" && !spokenOnly(turn.text));
  const responseWords = learnerTurns.map((turn) => words(turn.text).length);
  const totalWords = responseWords.reduce((sum, count) => sum + count, 0);
  const longestResponse = Math.max(0, ...responseWords);
  const paragraphResponses = responseWords.filter((count) => count >= 35).length;
  const extendedResponses = responseWords.filter((count) => count >= 85).length;
  const combined = learnerTurns.map((turn) => turn.text).join(" ");
  const past = includesAny(combined, pastPatterns);
  const future = includesAny(combined, futurePatterns);
  const opinion = includesAny(combined, opinionPatterns);
  const hypothetical = includesAny(combined, hypotheticalPatterns);
  const abstract = includesAny(combined, abstractPatterns);
  const timeFrameCount = [past, future].filter(Boolean).length + (learnerTurns.length > 0 ? 1 : 0);
  const answeredResponses = turns.flatMap((turn, index) => {
    if (turn.role !== "learner" || spokenOnly(turn.text)) return [];
    const prompt = [...turns.slice(0, index)].reverse().find((candidate) => candidate.role === "coach");
    if (!prompt) return [];
    return [assessResponse(prompt.text, turn.text).outcome === "answered"];
  });
  const answeredCount = answeredResponses.filter(Boolean).length;
  const onTopicShare = answeredResponses.length ? answeredCount / answeredResponses.length : 0;

  const disclaimer = "This ACTFL-informed feedback is an unofficial AI practice estimate. It is not an ACTFL OPI rating, certification, pass/fail result, or readiness decision.";
  const basis = "The estimate organizes transcript evidence using ACTFL's 2024 FACT framework: Functions and tasks, Accuracy, Context and content, and Text type. It is not a holistic ACTFL rating because this prototype does not analyze pronunciation, stress, intonation, fluency, or other audio-based evidence.";

  if (!completed || learnerTurns.length < 3 || totalWords < 35) {
    return {
      level: null,
      label: "More evidence needed",
      evidenceStatus: "limited",
      summary: completed
        ? "There is not enough usable speech across different tasks for responsible ACTFL-informed feedback."
        : "Finish the conversation to receive ACTFL-informed practice feedback.",
      observations: [
        {
          label: "Functions and tasks",
          detail: "Complete several different speaking tasks so the app can identify sustained abilities.",
          status: "limited",
        },
        {
          label: "Accuracy",
          detail: "Not assessed. Pronunciation, fluency, grammar in speech, and comprehensibility require audio analysis.",
          status: "not_assessed",
        },
        {
          label: "Context and content",
          detail: "More on-topic responses across familiar and less familiar topics are needed.",
          status: "limited",
        },
        {
          label: "Text type",
          detail: "More connected speech is needed to identify a consistent response length and organization.",
          status: "limited",
        },
      ],
      sampleSummary: `${learnerTurns.length} transcribed responses · ${totalWords} words`,
      nextFocus: "Answer each prompt in complete sentences and continue through the full conversation.",
      basis,
      disclaimer,
      sourceLabel: ACTFL_SOURCE_LABEL,
      sourceUrl: ACTFL_SOURCE_URL,
    };
  }

  let level: PracticeLevel = "Intermediate";
  if (learnerTurns.length >= 7 && extendedResponses >= 2 && paragraphResponses >= 4 && timeFrameCount === 3 && opinion && hypothetical && abstract) {
    level = "Superior";
  } else if (learnerTurns.length >= 6 && paragraphResponses >= 2 && timeFrameCount === 3 && opinion) {
    level = "Advanced";
  } else if (longestResponse < 8 && totalWords < 55) {
    level = "Novice";
  }

  const textType = extendedResponses >= 2
    ? "Extended responses appear in the transcript."
    : paragraphResponses >= 2
      ? "The sample includes connected, paragraph-length responses."
      : longestResponse >= 12
        ? "The sample is primarily sentence-level, with some connected ideas."
        : "The sample is primarily words, phrases, and short sentences.";
  const functions = [
    learnerTurns.length ? "exchanging personal information" : null,
    past ? "past narration" : null,
    future ? "future reference" : null,
    opinion ? "supported opinions" : null,
    hypothetical ? "hypothetical language" : null,
  ].filter(Boolean);

  const summaries: Record<PracticeLevel, string> = {
    Novice: "The transcript contains evidence most similar to Novice-level functions and text type.",
    Intermediate: "The transcript contains evidence most similar to Intermediate-level functions and text type.",
    Advanced: "The transcript contains evidence most similar to Advanced-level functions and text type.",
    Superior: "The transcript contains evidence most similar to Superior-level functions and text type.",
  };
  const nextFocus: Record<PracticeLevel, string> = {
    Novice: "Build complete original sentences about familiar routines, people, and places.",
    Intermediate: "Connect sentences into organized paragraphs and narrate clearly in past, present, and future.",
    Advanced: "Sustain multiple organized paragraphs on societal topics and develop supported, hypothetical arguments.",
    Superior: "Practice maintaining precise, well-organized extended discourse across unfamiliar and abstract topics.",
  };

  return {
    level,
    label: `${level}-like evidence`,
    evidenceStatus: "ready",
    summary: summaries[level],
    observations: [
      {
        label: "Functions and tasks",
        detail: functions.length
          ? functions.join(", ").replace(/^./, (letter) => letter.toUpperCase())
          : "Familiar-topic responses were observed.",
        status: "observed",
      },
      {
        label: "Accuracy",
        detail: "Not assessed from the transcript. Pronunciation, fluency, stress, intonation, and overall comprehensibility require audio analysis.",
        status: "not_assessed",
      },
      {
        label: "Context and content",
        detail: `${answeredCount} of ${answeredResponses.length} transcribed responses addressed the prompt. ${abstract ? "The sample also included a broader societal or abstract topic." : "The available content focused mainly on familiar topics."}`,
        status: onTopicShare >= 0.75 ? "observed" : "limited",
      },
      { label: "Text type", detail: textType, status: "observed" },
    ],
    sampleSummary: `${learnerTurns.length} transcribed responses · ${totalWords} words`,
    nextFocus: nextFocus[level],
    basis,
    disclaimer,
    sourceLabel: ACTFL_SOURCE_LABEL,
    sourceUrl: ACTFL_SOURCE_URL,
  };
}
