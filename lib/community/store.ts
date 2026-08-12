import { and, asc, eq } from "drizzle-orm";
import { communityExamples, consents } from "@/db/schema";
import type { PracticeStorageMode } from "@/lib/practice/store";

export interface SharedCommunityExample {
  id: string;
  objectiveId: string;
  content: string;
  styleLabel: string;
  vocabulary: string[];
  source: "community";
}

interface MemoryCommunityState {
  examples: Map<string, SharedCommunityExample & { consentId: string; status: "approved" | "withdrawn" }>;
  consentHashes: Map<string, { consentId: string; status: "granted" | "revoked" }>;
}

const globalState = globalThis as typeof globalThis & { __opiCommunityState?: MemoryCommunityState };
const memory = globalState.__opiCommunityState ??= { examples: new Map(), consentHashes: new Map() };

async function loadDb() {
  const { getDb } = await import("@/db");
  return getDb();
}

export async function hashWithdrawalCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createWithdrawalCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 24).toUpperCase();
}

export async function listSharedExamples(objectiveId: string, mode: PracticeStorageMode): Promise<SharedCommunityExample[]> {
  if (mode === "memory") {
    return [...memory.examples.values()].filter((item) => item.objectiveId === objectiveId && item.status === "approved").map((item) => ({ id: item.id, objectiveId: item.objectiveId, content: item.content, styleLabel: item.styleLabel, vocabulary: item.vocabulary, source: item.source }));
  }
  const db = await loadDb();
  const rows = await db.select().from(communityExamples).where(and(eq(communityExamples.objectiveId, objectiveId), eq(communityExamples.moderationStatus, "approved"))).orderBy(asc(communityExamples.publishedAt));
  return rows.map((row) => ({
    id: row.id,
    objectiveId: row.objectiveId,
    content: row.content,
    styleLabel: row.styleLabel,
    vocabulary: JSON.parse(row.vocabularyNotes) as string[],
    source: "community" as const,
  }));
}

export async function shareCommunityExample(input: {
  languagePackId: string;
  objectiveId: string;
  sessionId: string;
  content: string;
  styleLabel: string;
  vocabulary: string[];
}, mode: PracticeStorageMode) {
  const withdrawalCode = createWithdrawalCode();
  const withdrawalHash = await hashWithdrawalCode(withdrawalCode);
  const now = new Date();
  const consentId = crypto.randomUUID();
  const example: SharedCommunityExample = {
    id: crypto.randomUUID(), objectiveId: input.objectiveId, content: input.content,
    styleLabel: input.styleLabel, vocabulary: input.vocabulary, source: "community",
  };

  if (mode === "memory") {
    memory.consentHashes.set(withdrawalHash, { consentId, status: "granted" });
    memory.examples.set(example.id, { ...example, consentId, status: "approved" });
  } else {
    await loadDb().then(async (db) => {
      await db.insert(consents).values({
        id: consentId, participantKey: withdrawalHash, sessionId: input.sessionId,
        scope: "community_sharing", status: "granted", policyVersion: "community-v1",
        grantedAt: now, revokedAt: null, source: "share_flow", createdAt: now, updatedAt: now,
      });
      await db.insert(communityExamples).values({
        id: example.id, languagePackId: input.languagePackId, objectiveId: input.objectiveId,
        contributorKey: withdrawalHash, contributorDisplayName: null, consentId,
        content: input.content, audioStorageKey: null, styleLabel: input.styleLabel,
        vocabularyNotes: JSON.stringify(input.vocabulary), moderationStatus: "approved",
        publishedAt: now, createdAt: now, updatedAt: now,
      });
    });
  }
  return { example, withdrawalCode };
}

export async function withdrawCommunityExample(code: string, mode: PracticeStorageMode): Promise<number> {
  const hash = await hashWithdrawalCode(code);
  if (mode === "memory") {
    const consent = memory.consentHashes.get(hash);
    if (!consent || consent.status !== "granted") return 0;
    consent.status = "revoked";
    let count = 0;
    for (const example of memory.examples.values()) {
      if (example.consentId === consent.consentId && example.status === "approved") { example.status = "withdrawn"; count += 1; }
    }
    return count;
  }
  const db = await loadDb();
  const [consent] = await db.select().from(consents).where(and(eq(consents.participantKey, hash), eq(consents.scope, "community_sharing"), eq(consents.status, "granted"))).limit(1);
  if (!consent) return 0;
  const now = new Date();
  await db.update(consents).set({ status: "revoked", revokedAt: now, updatedAt: now }).where(eq(consents.id, consent.id));
  await db.update(communityExamples).set({ moderationStatus: "withdrawn", updatedAt: now }).where(eq(communityExamples.consentId, consent.id));
  return 1;
}
