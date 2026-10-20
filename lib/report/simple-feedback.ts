import type { AdaptiveRubricProfile, RubricDimensionKey } from "@/lib/conversation/adaptive-rubric";

export const simpleReportDisclaimer = "This report provides transcript-based practice feedback. It is not an official proficiency assessment.";

export function createSimpleFeedback(profile: AdaptiveRubricProfile) {
  if (!profile.turnsAnalyzed || profile.languageUse.status === "not_assessed") {
    return { strengths: ["The practice session has been saved."], improvement: "The available transcript is insufficient for specific observations.", nextStep: "Complete another short conversation and confirm that the transcript captures the spoken responses." };
  }
  const signals = profile.responseHistory.map(response => response.signals);
  const strengths: string[] = [];
  if (signals.some(signal => signal.directness === "answered")) strengths.push("Responses addressed the questions and communicated relevant ideas.");
  if (signals.some(signal => signal.elaborationCount > 0)) strengths.push("Reasons or examples were used to support ideas.");
  if (signals.some(signal => signal.connectorCount > 0)) strengths.push("Linking words helped connect ideas.");
  if (signals.some(signal => signal.repairStrategyCount > 0)) strengths.push("Alternative wording was used to clarify meaning.");
  if (!strengths.length) strengths.push("The session included practice in responding to questions.");
  if (profile.languageUse.status === "mixed_language") return { strengths: strengths.slice(0, 2), improvement: `Maintain consistent use of ${profile.languageUse.targetLanguage} throughout each response.`, nextStep: `Review one response and re-record it entirely in ${profile.languageUse.targetLanguage}, replacing any English words.` };
  const focus = (Object.entries(profile.dimensions) as Array<[RubricDimensionKey, { score: number }]>).sort((left, right) => left[1].score - right[1].score)[0][0];
  const focusText: Record<RubricDimensionKey, [string, string]> = {
    communicationEffectiveness: ["State the main idea clearly before presenting supporting details.", "Re-record one response using a clear main point, one supporting reason, and one concrete example."],
    vocabularyGrowth: ["Use more precise vocabulary to reduce unnecessary repetition.", "Review one response, identify a repeated word, and re-record the response using a more precise alternative."],
    curiosityInquiry: ["Extend the exchange with a relevant follow-up question.", "During the next conversation, include one relevant follow-up question after responding to Maya."],
    confidenceFluency: ["Organize each response around one idea at a time.", "Re-record one response with a clear opening sentence, a brief pause, and one supporting detail."],
    strategicCommunication: ["Clarify the relationship between ideas using appropriate linking phrases.", "Re-record one response and use a linking phrase to connect the main point with a supporting reason or example."],
  };
  return { strengths: strengths.slice(0, 2), improvement: focusText[focus][0], nextStep: focusText[focus][1] };
}
