import { NextResponse } from "next/server";
import { conversationProvider } from "@/lib/conversation/provider";
import { evaluateAdaptiveConversation } from "@/lib/conversation/adaptive-rubric";
import type { ConversationTiming, ConversationTurn } from "@/lib/conversation/types";
import { normalizePracticeMinutes } from "@/lib/conversation/time-plan";
import { getLanguagePackDefinition, listLanguagePackDefinitions } from "@/lib/language-packs/registry";
import { createPracticeEstimate } from "@/lib/practice/practice-estimate";
import { getPracticeStore, startWithAvailableStore, type PracticeSnapshot, type PracticeStorageMode } from "@/lib/practice/store";

const newTurn = (role: "coach" | "learner", text: string, sequence: number): ConversationTurn => ({
  id: crypto.randomUUID(), role, text, sequence, occurredAt: new Date().toISOString(),
});

const timingFromBody = (body: Record<string, unknown>): ConversationTiming => {
  const plannedDurationMinutes = normalizePracticeMinutes(body.practiceMinutes);
  const totalSeconds = plannedDurationMinutes * 60;
  const requestedRemaining = Number(body.remainingSeconds ?? totalSeconds);
  return {
    plannedDurationMinutes,
    remainingSeconds: Number.isFinite(requestedRemaining) ? Math.min(totalSeconds, Math.max(0, Math.round(requestedRemaining))) : totalSeconds,
  };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const mode = (url.searchParams.get("mode") ?? "d1") as PracticeStorageMode;
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  const snapshot = await getPracticeStore(mode).get(sessionId);
  return snapshot
    ? NextResponse.json({ snapshot, storageMode: mode, practiceEstimate: createPracticeEstimate(snapshot.turns, snapshot.status === "completed"), rubricProfile: evaluateAdaptiveConversation(snapshot.turns, snapshot.localeTag) })
    : NextResponse.json({ error: "Session not found" }, { status: 404 });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const action = body.action;

  if (action === "start" || action === "start_shadow") {
    const requestedLanguagePackId = String(body.languagePackId ?? "");
    const pack = getLanguagePackDefinition(requestedLanguagePackId)
      ?? listLanguagePackDefinitions().find((definition) => definition.pack.localeTag === requestedLanguagePackId)
      ?? null;
    if (!pack) return NextResponse.json({ error: "Choose a valid language pack." }, { status: 400 });
    const languagePackId = pack.pack.id;
    const requestedObjectiveId = String(body.objectiveId ?? "");
    const objective = pack.objectives.find((item) => item.id === requestedObjectiveId)
      ?? pack.objectives.find((item) => item.slug === "tell-me-about-yourself")
      ?? pack.objectives[0];
    const sessionId = crypto.randomUUID();
    const participantName = String(body.participantName ?? "").trim().replace(/[^\p{L}\p{M}' -]/gu, "").split(/\s+/)[0].slice(0, 40);
    const timing = timingFromBody(body);
    const opening = action === "start" ? await conversationProvider.createOpeningTurn({ languagePackId, localeTag: pack.pack.localeTag, objectiveId: objective.id, participantName, timing }) : null;
    const snapshot: PracticeSnapshot = {
      sessionId,
      languagePackId,
      localeTag: pack.pack.localeTag,
      objectiveId: objective.id,
      title: action === "start_shadow" ? `Shadow practice: ${objective.title}` : objective.title,
      status: "active",
      turns: opening ? [newTurn("coach", opening, 1)] : [],
    };
    const requestedParticipantKey = String(body.participantKey ?? "").trim();
    const participantKey = requestedParticipantKey || crypto.randomUUID();
    const storageMode = await startWithAvailableStore(snapshot, pack, participantKey);
    return NextResponse.json({ snapshot, storageMode, engine: conversationProvider.name, rubricProfile: evaluateAdaptiveConversation(snapshot.turns, snapshot.localeTag) });
  }

  const sessionId = String(body.sessionId ?? "");
  const storageMode = (body.storageMode ?? "d1") as PracticeStorageMode;
  const store = getPracticeStore(storageMode);
  const snapshot = await store.get(sessionId);
  if (!snapshot) return NextResponse.json({ error: "Practice session not found. Please start again." }, { status: 404 });

  if (action === "respond") {
    const text = String(body.text ?? "").trim();
    const hasRecording = body.hasRecording === true;
    if (!text && !hasRecording) return NextResponse.json({ error: "Record a spoken response before continuing." }, { status: 400 });
    if (text.length > 4000) return NextResponse.json({ error: "Keep each response under 4,000 characters." }, { status: 400 });
    const pack = getLanguagePackDefinition(snapshot.languagePackId);
    if (!pack) return NextResponse.json({ error: "Language pack is unavailable." }, { status: 409 });
    const learnerText = text || "[Spoken response recorded. Automatic transcript unavailable.]";
    const learner = newTurn("learner", learnerText, snapshot.turns.length + 1);
    const timing = timingFromBody(body);
    if (body.completeAfterResponse === true) {
      const closingText = await conversationProvider.createClosingTurn({
        languagePackId: snapshot.languagePackId,
        localeTag: pack.pack.localeTag,
        objectiveId: snapshot.objectiveId,
        turns: [...snapshot.turns, learner],
        timing: { ...timing, remainingSeconds: 0 },
      });
      const closing = newTurn("coach", closingText, learner.sequence + 1);
      await store.append(sessionId, [learner, closing]);
      await store.complete(sessionId);
      const completedTurns = [...snapshot.turns, learner, closing];
      return NextResponse.json({ turns: [learner, closing], completed: true, storageMode, engine: conversationProvider.name, rubricProfile: evaluateAdaptiveConversation(completedTurns, pack.pack.localeTag) });
    }
    const coachText = await conversationProvider.createFollowUp({
      languagePackId: snapshot.languagePackId,
      localeTag: pack.pack.localeTag,
      objectiveId: snapshot.objectiveId,
      turns: [...snapshot.turns, learner],
      timing,
    });
    const coach = newTurn("coach", coachText, learner.sequence + 1);
    await store.append(sessionId, [learner, coach]);
    const updatedTurns = [...snapshot.turns, learner, coach];
    return NextResponse.json({ turns: [learner, coach], storageMode, engine: conversationProvider.name, rubricProfile: evaluateAdaptiveConversation(updatedTurns, pack.pack.localeTag) });
  }

  if (action === "complete") {
    if (snapshot.status !== "completed") {
      const closingText = await conversationProvider.createClosingTurn({
        languagePackId: snapshot.languagePackId,
        localeTag: snapshot.localeTag,
        objectiveId: snapshot.objectiveId,
        turns: snapshot.turns,
        timing: { ...timingFromBody(body), remainingSeconds: 0 },
      });
      const closing = newTurn("coach", closingText, snapshot.turns.length + 1);
      await store.append(sessionId, [closing]);
      await store.complete(sessionId);
      return NextResponse.json({ completed: true, sessionId, storageMode, turns: [closing], rubricProfile: evaluateAdaptiveConversation([...snapshot.turns, closing], snapshot.localeTag) });
    }
    await store.complete(sessionId);
    return NextResponse.json({ completed: true, sessionId, storageMode, turns: [], rubricProfile: evaluateAdaptiveConversation(snapshot.turns, snapshot.localeTag) });
  }

  return NextResponse.json({ error: "Unsupported practice action." }, { status: 400 });
}
