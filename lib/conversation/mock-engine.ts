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
      return localized.followUps[localizedPromptIndex[stage]] ?? localized.followUps[0];
    }
    const currentPrompt = [...context.turns].reverse().find((turn) => turn.role === "coach")?.text ?? "";
    const assessment = assessResponse(currentPrompt, latest);
    if (assessment.outcome !== "answered") return createRepairResponse(assessment);

    const turnNumber = countAnsweredResponses(context.turns);
    const profile = evaluateAdaptiveConversation(context.turns, context.localeTag);
    const plannedStage = adjustInterviewStage(selectInterviewStage(context.timing, turnNumber), profile.currentStage);

    if (plannedStage === "wrap") return createAdaptivePrompt("wrap", profile, latest);

    if (turnNumber === 1) {
      return createPersonalizedAdaptiveFollowUp(profile, latest) ?? createAdaptivePrompt("warmup", profile, latest);
    }
    return createConnectedAdaptivePrompt(plannedStage, profile, latest);
  }

  async createClosingTurn(context: ConversationContext): Promise<string> {
    const localized = getLocalizedInterviewScript(context.languagePackId);
    if (localized) return localized.closing;
    return "Thank you for practicing with me today. Your conversation has been saved, and you can now review your recording and transcript.";
  }
}
