import { NextResponse } from "next/server";
import { getLanguagePackDefinition } from "@/lib/language-packs/registry";
import { listRecordings } from "@/lib/practice/recording-store";
import { getPracticeStore, type PracticeStorageMode } from "@/lib/practice/store";
import { createPracticeReport } from "@/lib/report/practice-report";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const mode: PracticeStorageMode = url.searchParams.get("mode") === "memory" ? "memory" : "d1";
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

  const snapshot = await getPracticeStore(mode).get(sessionId);
  if (!snapshot) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const definition = getLanguagePackDefinition(snapshot.languagePackId);
  const recordings = await listRecordings(sessionId, mode);
  const bytes = await createPracticeReport({
    snapshot,
    languageName: definition?.pack.displayName ?? snapshot.localeTag,
    recordings,
  });
  const date = new Date(snapshot.turns[0]?.occurredAt ?? Date.now()).toISOString().slice(0, 10);

  return new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="opi-practice-report-${date}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
