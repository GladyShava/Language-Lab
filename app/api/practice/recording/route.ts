import { NextResponse } from "next/server";
import { listRecordings, listShadowAttempts, readRecording, saveRecording } from "@/lib/practice/recording-store";

const parseMode = (value: FormDataEntryValue | string | null) => value === "d1" ? "d1" as const : "memory" as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = parseMode(url.searchParams.get("mode"));
  const sessionId = url.searchParams.get("sessionId");
  if (sessionId && url.searchParams.get("kind") === "shadow") return NextResponse.json({ attempts: await listShadowAttempts(sessionId, mode) });
  if (sessionId) return NextResponse.json({ recordings: await listRecordings(sessionId, mode) });

  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Recording id is required." }, { status: 400 });
  const recording = await readRecording(id, mode);
  if (!recording) return NextResponse.json({ error: "Recording not found." }, { status: 404 });
  return new Response(recording.bytes, { headers: { "content-type": recording.mimeType, "cache-control": "private, max-age=3600", "accept-ranges": "bytes" } });
}

export async function POST(request: Request) {
  const data = await request.formData();
  const file = data.get("audio");
  const sessionId = String(data.get("sessionId") ?? "");
  const messageId = String(data.get("messageId") ?? "");
  const fluentExampleId = String(data.get("fluentExampleId") ?? "");
  const sentenceText = String(data.get("sentenceText") ?? "");
  const sentenceIndex = Number(data.get("sentenceIndex") ?? -1);
  const consentGranted = data.get("consentGranted") === "true";
  const durationMs = Number(data.get("durationMs") ?? 0);
  const mode = parseMode(data.get("mode"));

  if (!(file instanceof File) || !file.type.startsWith("audio/")) return NextResponse.json({ error: "A valid audio recording is required." }, { status: 400 });
  const isShadowAttempt = Boolean(fluentExampleId && sentenceText && Number.isInteger(sentenceIndex) && sentenceIndex >= 0);
  if (!sessionId || (!messageId && !isShadowAttempt)) return NextResponse.json({ error: "Session and practice context are required." }, { status: 400 });
  if (!consentGranted) return NextResponse.json({ error: "Recording consent is required." }, { status: 403 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Recording must be smaller than 15 MB." }, { status: 413 });

  const saved = await saveRecording({
    id: crypto.randomUUID(),
    sessionId,
    messageId: messageId || null,
    mimeType: file.type,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
    bytes: await file.arrayBuffer(),
    shadowAttempt: isShadowAttempt ? { fluentExampleId, sentenceIndex, sentenceText } : undefined,
  }, mode);
  return NextResponse.json({ recording: saved });
}
