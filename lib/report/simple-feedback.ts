import type { AdaptiveRubricProfile, RubricDimensionKey } from "@/lib/conversation/adaptive-rubric";

export const simpleReportDisclaimer = "Practice feedback based on your transcript. This is not an official proficiency rating.";

export function createSimpleFeedback(profile: AdaptiveRubricProfile) {
  if (!profile.turnsAnalyzed || profile.languageUse.status === "not_assessed") {
    return { strengths: ["Your practice session is saved."], improvement: "There isn't enough transcribed speech to give specific feedback yet.", nextStep: "Try another short conversation. Check that your words appear in the transcript as you speak." };
  }
  const signals = profile.responseHistory.map(response => response.signals);
  const strengths: string[] = [];
  if (signals.some(signal => signal.directness === "answered")) strengths.push("You answered the questions and communicated your ideas.");
  if (signals.some(signal => signal.elaborationCount > 0)) strengths.push("You supported your ideas with reasons or examples.");
  if (signals.some(signal => signal.connectorCount > 0)) strengths.push("You used linking words to connect your ideas.");
  if (signals.some(signal => signal.repairStrategyCount > 0)) strengths.push("You found another way to explain your meaning.");
  if (!strengths.length) strengths.push("You took part in the conversation and practiced responding.");
  if (profile.languageUse.status === "mixed_language") return { strengths: strengths.slice(0, 2), improvement: `Keep your answer in ${profile.languageUse.targetLanguage} throughout.`, nextStep: `Replay one answer and say it again in ${profile.languageUse.targetLanguage}, replacing any English words.` };
  const focus = (Object.entries(profile.dimensions) as Array<[RubricDimensionKey, { score: number }]>).sort((left, right) => left[1].score - right[1].score)[0][0];
  const focusText: Record<RubricDimensionKey, [string, string]> = {
    communicationEffectiveness: ["Make your main idea clear before adding details.", "Record one answer again: give your main point, one reason, and one example."],
    vocabularyGrowth: ["Try a more precise word when you notice yourself repeating one.", "Replay one answer. Choose one repeated word and record the answer again with a more specific word."],
    curiosityInquiry: ["Keep the conversation moving with a question of your own.", "In your next conversation, add one short follow-up question after answering Maya."],
    confidenceFluency: ["Develop your answer one idea at a time.", "Practice one answer again with a short opening sentence, a brief pause, and one supporting detail."],
    strategicCommunication: ["Make the connection between your ideas easier to follow.", "Record one answer again and use a linking phrase to connect your point with a reason or example."],
  };
  return { strengths: strengths.slice(0, 2), improvement: focusText[focus][0], nextStep: focusText[focus][1] };
}
