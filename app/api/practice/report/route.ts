import { NextResponse } from "next/server";
import { getLanguagePackDefinition } from "@/lib/language-packs/registry";
import { listRecordings } from "@/lib/practice/recording-store";
import { getPracticeStore, type PracticeStorageMode } from "@/lib/practice/store";
import { createPracticeReport } from "@/lib/report/practice-report";
import { validateRecoverySnapshot } from "@/lib/practice/recovery";
import type { PracticeSnapshot } from "@/lib/practice/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const mode: PracticeStorageMode = url.searchParams.get("mode") === "memory" ? "memory" : "d1";
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

  const snapshot = await getPracticeStore(mode).get(sessionId);
  if (!snapshot) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (snapshot.status !== "completed") return NextResponse.json({ error: "Finish the conversation before downloading its report." }, { status: 409 });
  return renderReport(request, snapshot, mode);
}

export async function POST(request: Request) {
  let body: { snapshot?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid report request" }, { status: 400 }); }
  const snapshot = validateRecoverySnapshot(body?.snapshot);
  if (!snapshot || snapshot.status !== "completed") return NextResponse.json({ error: "A completed practice transcript is required" }, { status: 400 });
  return renderReport(request, snapshot, "memory");
}

async function renderReport(request: Request, snapshot: PracticeSnapshot, mode: PracticeStorageMode) {
  const definition = getLanguagePackDefinition(snapshot.languagePackId);
  const recordings = await listRecordings(snapshot.sessionId, mode).catch(() => []);
  const reportText = `${snapshot.title}\n${snapshot.turns.map((turn) => turn.text).join("\n")}`;
  let unicodeFontBytes: Uint8Array | undefined;
  if (/[^\x00-\x7F]/u.test(reportText)) {
    try {
      const fontResponse = await fetch(new URL("/fonts/NotoSansCJKsc-Regular.otf", request.url));
      if (fontResponse.ok) unicodeFontBytes = new Uint8Array(await fontResponse.arrayBuffer());
    } catch {
      unicodeFontBytes = undefined;
    }
  }
  const bytes = await createPracticeReport({
    snapshot,
    languageName: definition?.pack.displayName ?? snapshot.localeTag,
    recordings,
    unicodeFontBytes,
  });
  const date = new Date(snapshot.turns[0]?.occurredAt ?? Date.now()).toISOString().slice(0, 10);

  return new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="beyond-hello-practice-report-${date}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
