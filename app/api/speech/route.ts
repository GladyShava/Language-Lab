import { NextResponse } from "next/server";
import { getCreateAIConfig } from "@/lib/createai/runtime-env";

const allowedVoices = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
const requestWindows = new Map<string, { count: number; resetAt: number }>();
const audioCache = new Map<string, { bytes: Uint8Array; contentType: string }>();

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; }
  catch { return false; }
}

function withinRateLimit(request: Request): boolean {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || current.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 30) return false;
  current.count += 1;
  return true;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function findAudioValue(payload: unknown): { value: string; contentType?: string } | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return findAudioValue(JSON.parse(trimmed)); }
      catch { return { value: trimmed }; }
    }
    return { value: trimmed };
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const contentType = [record.content_type, record.contentType, record.mime_type, record.mimeType].find((value) => typeof value === "string") as string | undefined;
  for (const key of ["audio_response", "audio", "audio_base64", "base64", "data", "response"]) {
    if (record[key] !== undefined) {
      const found = findAudioValue(record[key]);
      if (found) return { ...found, contentType: found.contentType ?? contentType };
    }
  }
  return null;
}

function decodeAudioPayload(payload: unknown): { bytes: Uint8Array; contentType: string } | null {
  const found = findAudioValue(payload);
  if (!found) return null;
  const dataUri = found.value.match(/^data:(audio\/[\w.+-]+);base64,([\s\S]+)$/);
  const encoded = dataUri?.[2] ?? found.value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  try {
    return { bytes: decodeBase64(encoded), contentType: dataUri?.[1] ?? found.contentType ?? "audio/mpeg" };
  } catch {
    return null;
  }
}

function audioResponse(audio: { bytes: Uint8Array; contentType: string }, voice: string, cacheStatus: "HIT" | "MISS"): Response {
  return new Response(Uint8Array.from(audio.bytes).buffer, {
    headers: {
      "content-type": audio.contentType,
      "cache-control": "private, max-age=3600",
      "x-maya-voice": voice,
      "x-maya-audio-cache": cacheStatus,
    },
  });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin speech requests are not allowed." }, { status: 403 });
  if (!withinRateLimit(request)) return NextResponse.json({ error: "Too many speech requests. Please wait a moment." }, { status: 429 });

  const { token, baseUrl, voice: configuredVoice } = getCreateAIConfig();
  if (!token) return NextResponse.json({ error: "Maya's enhanced voice is not configured." }, { status: 503 });

  let body: { text?: unknown; localeTag?: unknown; voice?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "A valid JSON request is required." }, { status: 400 }); }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const localeTag = typeof body.localeTag === "string" ? body.localeTag.slice(0, 20) : "en-US";
  const requestedVoice = typeof body.voice === "string" ? body.voice : configuredVoice;
  const voice = allowedVoices.has(requestedVoice) ? requestedVoice : "nova";
  if (!text || text.length > 1_500) return NextResponse.json({ error: "Speech text must contain between 1 and 1,500 characters." }, { status: 400 });

  const cacheKey = `${voice}\u0000${localeTag}\u0000${text}`;
  const cached = audioCache.get(cacheKey);
  if (cached) return audioResponse(cached, voice, "HIT");

  try {
    const upstream = await fetch(`${baseUrl}/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        endpoint: "speech",
        request_source: "override_params",
        agentic: false,
        query: text,
        model_provider: "openai",
        model_name: "tts1",
        voice,
        model_params: { system_prompt: `Speak naturally and clearly in ${localeTag}. Use a warm, conversational coaching tone.` },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!upstream.ok) {
      console.error("[Beyond Hello] CreateAI speech request failed", { status: upstream.status });
      return NextResponse.json({ error: "Maya's enhanced voice is temporarily unavailable." }, { status: 502 });
    }

    const upstreamType = upstream.headers.get("content-type") ?? "";
    const audio = upstreamType.startsWith("audio/")
      ? { bytes: new Uint8Array(await upstream.arrayBuffer()), contentType: upstreamType.split(";")[0] }
      : decodeAudioPayload(await upstream.json());
    if (!audio?.bytes.length) {
      console.error("[Beyond Hello] CreateAI returned an unsupported speech response", { contentType: upstreamType });
      return NextResponse.json({ error: "Maya's enhanced voice returned an unsupported audio format." }, { status: 502 });
    }

    if (audioCache.size >= 24) audioCache.delete(audioCache.keys().next().value as string);
    audioCache.set(cacheKey, audio);
    return audioResponse(audio, voice, "MISS");
  } catch (error) {
    console.error("[Beyond Hello] CreateAI speech request could not complete", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Maya's enhanced voice is temporarily unavailable." }, { status: 502 });
  }
}
