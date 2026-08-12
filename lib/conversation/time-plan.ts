import type { ConversationTiming } from "./types";

export type InterviewStage = "warmup" | "description" | "story" | "opinion" | "role_play" | "wrap";

export function normalizePracticeMinutes(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 5;
  return Math.min(20, Math.max(1, Math.round(numeric)));
}

export function createInterviewPlan(minutes: number): readonly InterviewStage[] {
  if (minutes <= 3) return ["warmup", "wrap"];
  if (minutes <= 7) return ["warmup", "description", "opinion", "wrap"];
  if (minutes <= 12) return ["warmup", "description", "story", "opinion", "wrap"];
  return ["warmup", "description", "story", "opinion", "role_play", "wrap"];
}

export function selectInterviewStage(timing: ConversationTiming | undefined, answeredResponses: number): InterviewStage {
  const minutes = normalizePracticeMinutes(timing?.plannedDurationMinutes);
  const plan = createInterviewPlan(minutes);
  const totalSeconds = minutes * 60;
  const remainingSeconds = Math.min(totalSeconds, Math.max(0, Number(timing?.remainingSeconds ?? totalSeconds)));
  const wrapWindow = Math.max(30, Math.round(totalSeconds * 0.1));
  if (remainingSeconds <= wrapWindow) return "wrap";

  const activeStages = plan.filter((stage) => stage !== "wrap");
  if (answeredResponses > activeStages.length) return "wrap";
  const elapsedRatio = 1 - remainingSeconds / totalSeconds;
  const timeIndex = Math.min(activeStages.length - 1, Math.floor((elapsedRatio / 0.9) * activeStages.length));
  const responseIndex = Math.min(activeStages.length - 1, Math.max(0, answeredResponses - 1));
  return activeStages[Math.max(timeIndex, responseIndex)] ?? "warmup";
}
