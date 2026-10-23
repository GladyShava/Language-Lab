import type { AdaptiveRubricProfile } from "@/lib/conversation/adaptive-rubric";

export const simpleReportDisclaimer = "This report provides transcript-based practice feedback. It is not an official proficiency assessment.";

export function createSimpleFeedback(profile: AdaptiveRubricProfile) {
  if (!profile.turnsAnalyzed || profile.languageUse.status === "not_assessed") {
    return { strengths: ["The practice session has been saved."], improvement: "The available transcript is insufficient for specific observations.", nextStep: "Complete another short conversation and confirm that the transcript captures the spoken responses." };
  }
  const signals = profile.responseHistory.map(response => response.signals);
  const strengths: string[] = [];
  // Reasons and linking words often describe the same sentence. Report the
  // more informative observation once, rather than listing both as strengths.
  const hasElaboration = signals.some(signal => signal.elaborationCount > 0);
  if (hasElaboration) strengths.push("You supported your ideas with reasons or examples.");
  else if (signals.some(signal => signal.connectorCount > 0)) strengths.push("You used linking words to connect your ideas.");
  if (signals.some(signal => signal.repairStrategyCount > 0)) strengths.push("You clarified meaning by using alternative wording.");
  if (!strengths.length && signals.some(signal => signal.directness === "answered")) strengths.push("You answered the questions directly.");
  if (!strengths.length) strengths.push("You practised responding to interview questions.");
  if (profile.languageUse.status === "mixed_language") return { strengths: strengths.slice(0, 2), improvement: `Maintain consistent use of ${profile.languageUse.targetLanguage} throughout each response.`, nextStep: `Review one response and re-record it entirely in ${profile.languageUse.targetLanguage}, replacing any English words.` };
  const averageWords = signals.reduce((total, signal) => total + signal.wordCount, 0) / signals.length;
  // Prioritize observable needs in the transcript. A student is not required
  // to ask the interviewer questions, so that rubric score is not a default task.
  type PracticeFocus = "communicationEffectiveness" | "vocabularyGrowth" | "narrative" | "confidenceFluency" | "strategicCommunication";
  const focus: PracticeFocus = averageWords < 12 ? "communicationEffectiveness"
    : signals.some(signal => signal.repetitionRatio > 0.25) ? "vocabularyGrowth"
    : signals.every(signal => signal.connectorCount === 0) ? "strategicCommunication"
    : hasElaboration ? "narrative" : "confidenceFluency";
  const focusText: Record<PracticeFocus, [string, string]> = {
    communicationEffectiveness: ["Develop a longer response around one main idea.", hasElaboration ? "Choose one short response and expand it into three connected sentences." : "Re-record one response using a clear main point, one supporting reason, and one concrete example."],
    vocabularyGrowth: ["Use more precise vocabulary to reduce unnecessary repetition.", "Review one response, identify a repeated word, and re-record the response using a more precise alternative."],
    narrative: ["Develop a connected account of a past experience.", "Describe one past experience in three stages: the situation, what happened, and the outcome."],
    confidenceFluency: ["Organize each response around one idea at a time.", "Re-record one response with a clear opening sentence, a brief pause, and one supporting detail."],
    strategicCommunication: ["Clarify the relationship between ideas using appropriate linking phrases.", "Re-record one response and use a linking phrase to connect the main point with a supporting reason or example."],
  };
  return { strengths: strengths.slice(0, 2), improvement: focusText[focus][0], nextStep: focusText[focus][1] };
}
