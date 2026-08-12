import { and, asc, eq } from "drizzle-orm";
import { consents, recordings, shadowAttempts } from "@/db/schema";

export interface SavedRecording {
  id: string;
  sessionId: string;
  messageId: string | null;
  mimeType: string;
  durationMs: number;
  playbackUrl: string;
}

interface RecordingPayload extends Omit<SavedRecording, "playbackUrl"> {
  bytes: ArrayBuffer;
  shadowAttempt?: { fluentExampleId: string; sentenceIndex: number; sentenceText: string };
}

export interface SavedShadowAttempt {
  id: string;
  recordingId: string;
  fluentExampleId: string;
  sentenceIndex: number;
  sentenceText: string;
  attemptNumber: 2;
  playbackUrl: string;
}

const globalRecordings = globalThis as typeof globalThis & { __opiRecordings?: Map<string, RecordingPayload> };
const memoryRecordings = globalRecordings.__opiRecordings ??= new Map<string, RecordingPayload>();

async function loadPersistence() {
  const [{ getDb, getMediaBucket }] = await Promise.all([import("@/db")]);
  return { db: getDb(), bucket: getMediaBucket() };
}

export async function saveRecording(input: RecordingPayload, mode: "d1" | "memory"): Promise<SavedRecording> {
  if (mode === "d1") {
    try {
      const { db, bucket } = await loadPersistence();
      const now = new Date();
      const consentId = `consent_recording_${input.sessionId}`;
      const storageKey = `practice/${input.sessionId}/${input.id}`;
      await db.insert(consents).values({
        id: consentId,
        participantKey: `session_${input.sessionId}`,
        sessionId: input.sessionId,
        scope: "recording_storage",
        status: "granted",
        policyVersion: "prototype-1",
        grantedAt: now,
        revokedAt: null,
        source: "session_setup",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
      await bucket.put(storageKey, input.bytes, { httpMetadata: { contentType: input.mimeType } });
      await db.insert(recordings).values({
        id: input.id,
        sessionId: input.sessionId,
        messageId: input.messageId,
        consentId,
        storageKey,
        mimeType: input.mimeType,
        durationMs: input.durationMs,
        byteSize: input.bytes.byteLength,
        transcriptStatus: "not_requested",
        recordedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      if (input.shadowAttempt) {
        await db.insert(shadowAttempts).values({
          id: `shadow_${input.id}`,
          sessionId: input.sessionId,
          fluentExampleId: input.shadowAttempt.fluentExampleId,
          recordingId: input.id,
          sentenceIndex: input.shadowAttempt.sentenceIndex,
          sentenceText: input.shadowAttempt.sentenceText,
          attemptNumber: 2,
          createdAt: now,
          updatedAt: now,
        });
      }
      return { id: input.id, sessionId: input.sessionId, messageId: input.messageId, mimeType: input.mimeType, durationMs: input.durationMs, playbackUrl: `/api/practice/recording?id=${input.id}&mode=d1` };
    } catch {
      return saveRecording(input, "memory");
    }
  }

  memoryRecordings.set(input.id, input);
  return { id: input.id, sessionId: input.sessionId, messageId: input.messageId, mimeType: input.mimeType, durationMs: input.durationMs, playbackUrl: `/api/practice/recording?id=${input.id}&mode=memory` };
}

export async function listRecordings(sessionId: string, mode: "d1" | "memory"): Promise<SavedRecording[]> {
  if (mode === "d1") {
    try {
      const { db } = await loadPersistence();
      const rows = await db.select({ id: recordings.id, sessionId: recordings.sessionId, messageId: recordings.messageId, mimeType: recordings.mimeType, durationMs: recordings.durationMs })
        .from(recordings).where(and(eq(recordings.sessionId, sessionId), eq(recordings.transcriptStatus, "not_requested"))).orderBy(asc(recordings.recordedAt));
      const durable = rows.filter((row): row is typeof row & { messageId: string } => Boolean(row.messageId)).map((row) => ({ ...row, playbackUrl: `/api/practice/recording?id=${row.id}&mode=d1` }));
      const preview = await listRecordings(sessionId, "memory");
      return [...durable, ...preview.filter((item) => !durable.some((saved) => saved.id === item.id))];
    } catch { return listRecordings(sessionId, "memory"); }
  }
  return [...memoryRecordings.values()].filter((item) => item.sessionId === sessionId && item.messageId).map(({ bytes: _bytes, shadowAttempt: _shadowAttempt, ...item }) => ({ ...item, playbackUrl: `/api/practice/recording?id=${item.id}&mode=memory` }));
}

export async function listShadowAttempts(sessionId: string, mode: "d1" | "memory"): Promise<SavedShadowAttempt[]> {
  if (mode === "d1") {
    try {
      const { db } = await loadPersistence();
      const rows = await db.select().from(shadowAttempts).where(eq(shadowAttempts.sessionId, sessionId)).orderBy(asc(shadowAttempts.createdAt));
      const durable = rows.map((row) => ({ id: row.id, recordingId: row.recordingId, fluentExampleId: row.fluentExampleId, sentenceIndex: row.sentenceIndex, sentenceText: row.sentenceText, attemptNumber: 2 as const, playbackUrl: `/api/practice/recording?id=${row.recordingId}&mode=d1` }));
      const preview = await listShadowAttempts(sessionId, "memory");
      return [...durable, ...preview.filter((item) => !durable.some((saved) => saved.id === item.id))];
    } catch { return listShadowAttempts(sessionId, "memory"); }
  }
  return [...memoryRecordings.values()].filter((item) => item.sessionId === sessionId && item.shadowAttempt).map((item) => ({
    id: `shadow_${item.id}`,
    recordingId: item.id,
    fluentExampleId: item.shadowAttempt!.fluentExampleId,
    sentenceIndex: item.shadowAttempt!.sentenceIndex,
    sentenceText: item.shadowAttempt!.sentenceText,
    attemptNumber: 2,
    playbackUrl: `/api/practice/recording?id=${item.id}&mode=memory`,
  }));
}

export async function readRecording(id: string, mode: "d1" | "memory"): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  if (mode === "d1") {
    try {
      const { db, bucket } = await loadPersistence();
      const [row] = await db.select({ storageKey: recordings.storageKey, mimeType: recordings.mimeType }).from(recordings).where(eq(recordings.id, id)).limit(1);
      if (!row) return readRecording(id, "memory");
      const object = await bucket.get(row.storageKey);
      if (!object) return null;
      return { bytes: await object.arrayBuffer(), mimeType: row.mimeType };
    } catch { return readRecording(id, "memory"); }
  }
  const item = memoryRecordings.get(id);
  return item ? { bytes: item.bytes, mimeType: item.mimeType } : null;
}
