import type { ConversationContext, ConversationProvider } from "./types";
import { adjustInterviewStage, createAdaptivePrompt, createConnectedAdaptivePrompt, createPersonalizedAdaptiveFollowUp } from "./adaptive-prompts";
import { evaluateAdaptiveConversation } from "./adaptive-rubric";
import { assessResponse, countAnsweredResponses, createRepairResponse } from "./response-assessment";
import { getLocalizedInterviewScript } from "./interview-scripts";
import { selectInterviewStage, type InterviewStage } from "./time-plan";
import { analyzeResponseLanguageUse, createTargetLanguageRedirect } from "./target-language";

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;
const transcriptUnavailable = (text: string) => text.startsWith("[Spoken response recorded");
const responseUnits = (text: string, localeTag: string) => {
  if (/^(ja|zh)/i.test(localeTag)) return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return countWords(text);
};

const localizedPromptIndex: Record<InterviewStage, number> = {
  warmup: 0,
  description: 1,
  story: 2,
  opinion: 3,
  role_play: 5,
  wrap: 6,
};

const normalizePrompt = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const alternatePrompts: Record<InterviewStage, readonly string[]> = {
  warmup: [
    "Walk me through a typical day in your life. Which part of it do you enjoy most?",
    "Tell me about someone who has influenced you. What did you learn from that person?",
  ],
  description: [
    "Describe a place where you feel comfortable. What makes the atmosphere there distinctive?",
    "Describe a person you work or study with and explain what makes that person memorable.",
  ],
  story: [
    "Tell me about a time when a plan changed unexpectedly. What happened, and how did you respond?",
    "Describe a recent challenge from beginning to end. What did the experience teach you?",
  ],
  opinion: [
    "Some people learn best alone, while others prefer a group. Which approach do you prefer, and why?",
    "What is one change that would improve your community? Explain who would benefit and why.",
  ],
  role_play: [
    "Imagine a hotel cannot find your reservation. Explain the problem to me and ask for a practical solution.",
    "Imagine you need to change an important appointment at short notice. Explain the situation and negotiate a new time with me.",
  ],
  wrap: [
    "Before we finish, what is one thing you are looking forward to this week?",
    "To end on an easy question, how would you like to spend your next free day?",
  ],
};

function chooseUnaskedPrompt(candidates: readonly string[], coachTurns: readonly string[]): string {
  const asked = new Set(coachTurns.map(normalizePrompt));
  return candidates.find((candidate) => !asked.has(normalizePrompt(candidate))) ?? candidates.at(-1) ?? "What would you like to talk about next?";
}

export class MockConversationProvider implements ConversationProvider {
  readonly name = "adaptive-opi-practice-v2";
  async createOpeningTurn(context: Omit<ConversationContext, "turns"> & { participantName?: string }): Promise<string> {
    const name = context.participantName?.trim() || "there";
    const localized = getLocalizedInterviewScript(context.languagePackId);
    if (localized) return localized.opening(name);
    return `Hi ${name}, my name is Maya. I will be your interviewer today. To begin, tell me about yourself.`;
  }

  async createFollowUp(context: ConversationContext): Promise<string> {
    const learnerTurns = context.turns.filter((turn) => turn.role === "learner");
    const latest = learnerTurns.at(-1)?.text.trim() ?? "";
    const localized = getLocalizedInterviewScript(context.languagePackId);
    if (localized) {
      if (!latest || transcriptUnavailable(latest)) return localized.noSpeech;
      const latestLanguageUse = analyzeResponseLanguageUse(latest, context.localeTag);
      if (latestLanguageUse.status === "mixed_language") return createTargetLanguageRedirect(context.localeTag, latestLanguageUse.englishWords);
      if (responseUnits(latest, context.localeTag) < 6) return localized.elaborate;
      const answeredCount = learnerTurns.filter((turn) => !transcriptUnavailable(turn.text) && analyzeResponseLanguageUse(turn.text, context.localeTag).status !== "mixed_language" && responseUnits(turn.text, context.localeTag) >= 6).length;
      const profile = evaluateAdaptiveConversation(context.turns, context.localeTag);
      const stage = adjustInterviewStage(selectInterviewStage(context.timing, answeredCount), profile.currentStage);
      const coachTurns = context.turns.filter((turn) => turn.role === "coach").map((turn) => turn.text);
      const preferredIndex = localizedPromptIndex[stage];
      const stageCandidates = stage === "wrap"
        ? localized.followUps.slice(6)
        : [...localized.followUps.slice(preferredIndex, 6), ...localized.followUps.slice(0, preferredIndex)];
      return chooseUnaskedPrompt(stageCandidates, coachTurns);
    }
    const currentPrompt = [...context.turns].reverse().find((turn) => turn.role === "coach")?.text ?? "";
    const assessment = assessResponse(currentPrompt, latest);
    if (assessment.outcome !== "answered") return createRepairResponse(assessment);

    const turnNumber = countAnsweredResponses(context.turns);
    const profile = evaluateAdaptiveConversation(context.turns, context.localeTag);
    const plannedStage = adjustInterviewStage(selectInterviewStage(context.timing, turnNumber), profile.currentStage);

    const coachTurns = context.turns.filter((turn) => turn.role === "coach").map((turn) => turn.text);
    if (plannedStage === "wrap") {
      return chooseUnaskedPrompt([createAdaptivePrompt("wrap", profile, latest), ...alternatePrompts.wrap], coachTurns);
    }

    let nextPrompt: string;
    if (turnNumber === 1) {
      nextPrompt = createPersonalizedAdaptiveFollowUp(profile, latest) ?? createAdaptivePrompt("warmup", profile, latest);
    } else {
      nextPrompt = createConnectedAdaptivePrompt(plannedStage, profile, latest);
    }
    return chooseUnaskedPrompt([nextPrompt, createAdaptivePrompt(plannedStage, profile, latest), ...alternatePrompts[plannedStage]], coachTurns);
  }

  async createClosingTurn(context: ConversationContext): Promise<string> {
    const localized = getLocalizedInterviewScript(context.languagePackId);
    if (localized) return localized.closing;
    return "Thank you for practicing with me today. Your conversation has been saved, and you can now review your recording and transcript.";
  }
}
