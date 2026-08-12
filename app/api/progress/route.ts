import { NextResponse } from "next/server";
import { evaluateAdaptiveConversation, rubricDimensionDefinitions } from "@/lib/conversation/adaptive-rubric";
import { getLanguagePackDefinition } from "@/lib/language-packs/registry";
import { getPracticeStore, type PracticeSnapshot, type PracticeStorageMode } from "@/lib/practice/store";

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

async function completedSessions(participantKey: string) {
  const sources: Array<{ mode: PracticeStorageMode; sessions: PracticeSnapshot[] }> = [];
  for (const mode of ["d1", "memory"] as const) {
    try {
      sources.push({ mode, sessions: await getPracticeStore(mode).listCompleted(participantKey) });
    } catch {
      sources.push({ mode, sessions: [] });
    }
  }
  const seen = new Set<string>();
  return sources.flatMap(({ mode, sessions }) => sessions.map((snapshot) => ({ mode, snapshot })))
    .filter(({ snapshot }) => !seen.has(snapshot.sessionId) && Boolean(seen.add(snapshot.sessionId)))
    .sort((left, right) => String(left.snapshot.endedAt ?? left.snapshot.startedAt).localeCompare(String(right.snapshot.endedAt ?? right.snapshot.startedAt)));
}

export async function GET(request: Request) {
  const [, participantKey = ""] = decodeURIComponent(cookieValue(request, "opi_profile")).split(":", 2);
  if (!participantKey) return NextResponse.json({ error: "Sign in to view your practice progress." }, { status: 401 });
  const completed = await completedSessions(participantKey);
  const sessions = completed.map(({ mode, snapshot }) => {
    const profile = evaluateAdaptiveConversation(snapshot.turns, snapshot.localeTag);
    const start = new Date(snapshot.startedAt ?? snapshot.turns[0]?.occurredAt ?? Date.now()).getTime();
    const end = new Date(snapshot.endedAt ?? snapshot.turns.at(-1)?.occurredAt ?? start).getTime();
    const pack = getLanguagePackDefinition(snapshot.languagePackId);
    return {
      sessionId: snapshot.sessionId,
      storageMode: mode,
      completedAt: snapshot.endedAt ?? snapshot.turns.at(-1)?.occurredAt ?? snapshot.startedAt ?? new Date().toISOString(),
      languagePackId: snapshot.languagePackId,
      languageName: pack?.pack.displayName ?? snapshot.localeTag,
      durationMinutes: Math.max(1, Math.round(Math.max(0, end - start) / 60000)),
      responseCount: profile.turnsAnalyzed,
      stage: profile.currentStage,
      overallScore: profile.overallScore,
      dimensions: Object.fromEntries(rubricDimensionDefinitions.map((definition) => [definition.key, profile.dimensions[definition.key].score])),
      recommendation: profile.recommendation,
      languageUse: profile.languageUse,
    };
  });
  return NextResponse.json({
    sessions,
    disclaimer: "Practice trends organize coaching evidence only. They are not ACTFL levels, official ratings, pass/fail results, certification, or readiness decisions.",
  });
}
