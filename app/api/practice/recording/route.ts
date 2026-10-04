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
  const diagnosticId = crypto.randomUUID();
  let data: FormData;
  try {
    data = await request.formData();
  } catch (caught) {
    console.error("[Beyond Hello] Recording request could not be parsed", { diagnosticId, failureLocation: "application-route", error: caught instanceof Error ? caught.message : "Unknown form-data error" });
    const response = NextResponse.json({ error: "The recording upload could not be read.", diagnosticId }, { status: 400 });
    response.headers.set("x-recording-diagnostic-id", diagnosticId);
    return response;
  }
  const file = data.get("audio");
  const sessionId = String(data.get("sessionId") ?? "");
  const messageId = String(data.get("messageId") ?? "");
  const fluentExampleId = String(data.get("fluentExampleId") ?? "");
  const sentenceText = String(data.get("sentenceText") ?? "");
  const sentenceIndex = Number(data.get("sentenceIndex") ?? -1);
  const consentGranted = data.get("consentGranted") === "true";
  const durationMs = Number(data.get("durationMs") ?? 0);
  const mode = parseMode(data.get("mode"));
  const clientUploadId = String(data.get("clientUploadId") ?? "");

  const details = {
    diagnosticId,
    clientUploadId,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
    sizeBytes: file instanceof File ? file.size : 0,
    mimeType: file instanceof File ? file.type : "missing",
    storageMode: mode,
  };
  console.info("[Beyond Hello] Recording request received", details);

  const json = (body: Record<string, unknown>, status = 200) => {
    const response = NextResponse.json({ ...body, diagnosticId }, { status });
    response.headers.set("x-recording-diagnostic-id", diagnosticId);
    return response;
  };

  if (!(file instanceof File) || !file.type.startsWith("audio/")) return json({ error: "A valid audio recording is required." }, 400);
  const isShadowAttempt = Boolean(fluentExampleId && sentenceText && Number.isInteger(sentenceIndex) && sentenceIndex >= 0);
  if (!sessionId || (!messageId && !isShadowAttempt)) return json({ error: "Session and practice context are required." }, 400);
  if (!consentGranted) return json({ error: "Recording consent is required." }, 403);
  if (file.size > 15 * 1024 * 1024) {
    console.warn("[Beyond Hello] Recording rejected by application size check", { ...details, failureLocation: "application-route", maximumBytes: 15 * 1024 * 1024 });
    return json({ error: "Recording must be smaller than 15 MB." }, 413);
  }

  try {
    const saved = await saveRecording({
      id: crypto.randomUUID(),
      sessionId,
      messageId: messageId || null,
      mimeType: file.type,
      durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
      bytes: await file.arrayBuffer(),
      shadowAttempt: isShadowAttempt ? { fluentExampleId, sentenceIndex, sentenceText } : undefined,
    }, mode);
    console.info("[Beyond Hello] Recording stored", details);
    return json({ recording: saved });
  } catch (caught) {
    console.error("[Beyond Hello] Recording storage failed", { ...details, failureLocation: "recording-store", error: caught instanceof Error ? caught.message : "Unknown storage error" });
    return json({ error: "The recording reached the application but could not be stored." }, 500);
  }
}
