import { NextResponse } from "next/server";
import { anonymizeResponse, containsObviousPersonalInfo } from "@/lib/community/anonymize";
import { demoCommunityLibrary } from "@/lib/community/demo-library";
import { listSharedExamples, shareCommunityExample, withdrawCommunityExample } from "@/lib/community/store";
import { getPracticeStore, type PracticeStorageMode } from "@/lib/practice/store";

const modeOf = (value: unknown): PracticeStorageMode => value === "memory" ? "memory" : "d1";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const objectiveId = url.searchParams.get("objectiveId") ?? "";
  const mode = modeOf(url.searchParams.get("mode"));
  if (!objectiveId) return NextResponse.json({ error: "objectiveId is required" }, { status: 400 });
  try {
    const shared = await listSharedExamples(objectiveId, mode);
    return NextResponse.json({ examples: [...demoCommunityLibrary.filter((item) => item.objectiveId === objectiveId), ...shared] });
  } catch {
    return NextResponse.json({ examples: demoCommunityLibrary.filter((item) => item.objectiveId === objectiveId) });
  }
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  const mode = modeOf(body.storageMode);

  if (action === "withdraw") {
    const code = String(body.withdrawalCode ?? "").trim();
    if (!code) return NextResponse.json({ error: "Enter your withdrawal code." }, { status: 400 });
    const count = await withdrawCommunityExample(code, mode);
    return count ? NextResponse.json({ withdrawn: true, count }) : NextResponse.json({ error: "That code is not active or was not found." }, { status: 404 });
  }

  const sessionId = String(body.sessionId ?? "");
  const messageId = String(body.messageId ?? "");
  const snapshot = await getPracticeStore(mode).get(sessionId);
  const turn = snapshot?.turns.find((item) => item.id === messageId && item.role === "learner");
  if (!snapshot || !turn) return NextResponse.json({ error: "Choose a response from an available practice session." }, { status: 404 });

  if (action === "preview") {
    const result = anonymizeResponse(turn.text);
    return NextResponse.json({ preview: result, objectiveId: snapshot.objectiveId, languagePackId: snapshot.languagePackId });
  }

  if (action === "share") {
    if (body.consentConfirmed !== true || body.reviewConfirmed !== true) {
      return NextResponse.json({ error: "Both review and explicit consent are required." }, { status: 403 });
    }
    const reviewedText = String(body.reviewedText ?? turn.text).trim();
    const result = anonymizeResponse(reviewedText);
    if (result.text.length < 20) return NextResponse.json({ error: "The anonymous example is too short to share." }, { status: 400 });
    if (containsObviousPersonalInfo(result.text)) return NextResponse.json({ error: "Please remove the remaining personal information before sharing." }, { status: 400 });
    const saved = await shareCommunityExample({
      languagePackId: snapshot.languagePackId, objectiveId: snapshot.objectiveId, sessionId,
      content: result.text, styleLabel: result.styleLabel, vocabulary: result.vocabulary,
    }, mode);
    return NextResponse.json(saved);
  }

  return NextResponse.json({ error: "Unsupported community action." }, { status: 400 });
}
