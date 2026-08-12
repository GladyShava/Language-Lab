import { and, asc, eq } from "drizzle-orm";
import { conversationObjectives, fluentExamples, languagePacks, messages, practiceSessions } from "@/db/schema";
import type { ConversationTurn } from "@/lib/conversation/types";
import type { LanguagePackDefinition } from "@/lib/language-packs/types";

export type PracticeStorageMode = "d1" | "memory";

export interface PracticeSnapshot {
  sessionId: string;
  languagePackId: string;
  localeTag: string;
  objectiveId: string;
  title: string;
  status: "active" | "completed";
  turns: ConversationTurn[];
  startedAt?: string;
  endedAt?: string;
}

export interface PracticeStore {
  start(snapshot: PracticeSnapshot, pack: LanguagePackDefinition, participantKey: string): Promise<void>;
  get(sessionId: string): Promise<PracticeSnapshot | null>;
  append(sessionId: string, turns: ConversationTurn[]): Promise<void>;
  complete(sessionId: string): Promise<void>;
  listCompleted(participantKey: string): Promise<PracticeSnapshot[]>;
}

async function loadDb() {
  const { getDb } = await import("@/db");
  return getDb();
}

class D1PracticeStore implements PracticeStore {
  async start(snapshot: PracticeSnapshot, definition: LanguagePackDefinition, participantKey: string): Promise<void> {
    const db = await loadDb();
    const now = new Date();
    await db.insert(languagePacks).values({ ...definition.pack, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(conversationObjectives).values(definition.objectives.map((objective) => ({ ...objective, createdAt: now, updatedAt: now }))).onConflictDoNothing();
    await db.insert(fluentExamples).values(definition.fluentExamples.map((example) => ({ ...example, createdAt: now, updatedAt: now }))).onConflictDoNothing();
    await db.insert(practiceSessions).values({
      id: snapshot.sessionId,
      participantKey,
      languagePackId: snapshot.languagePackId,
      objectiveId: snapshot.objectiveId,
      title: snapshot.title,
      status: "active",
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await this.append(snapshot.sessionId, snapshot.turns);
  }

  async get(sessionId: string): Promise<PracticeSnapshot | null> {
    const db = await loadDb();
    const [session] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, sessionId)).limit(1);
    if (!session || !session.objectiveId) return null;
    const rows = await db.select().from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.sequence));
    const [pack] = await db.select({ localeTag: languagePacks.localeTag }).from(languagePacks).where(eq(languagePacks.id, session.languagePackId)).limit(1);
    if (!pack) return null;
    return {
      sessionId: session.id,
      languagePackId: session.languagePackId,
      localeTag: pack.localeTag,
      objectiveId: session.objectiveId,
      title: session.title,
      status: session.status === "completed" ? "completed" : "active",
      startedAt: session.startedAt?.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      turns: rows.filter((row) => row.role !== "system" && row.text).map((row) => ({
        id: row.id,
        role: row.role as "coach" | "learner",
        text: row.text!,
        sequence: row.sequence,
        occurredAt: row.occurredAt.toISOString(),
      })),
    };
  }

  async append(sessionId: string, turns: ConversationTurn[]): Promise<void> {
    if (!turns.length) return;
    const db = await loadDb();
    const now = new Date();
    const [session] = await db.select({ languagePackId: practiceSessions.languagePackId }).from(practiceSessions).where(eq(practiceSessions.id, sessionId)).limit(1);
    if (!session) throw new Error("Practice session not found.");
    const [pack] = await db.select({ localeTag: languagePacks.localeTag }).from(languagePacks).where(eq(languagePacks.id, session.languagePackId)).limit(1);
    if (!pack) throw new Error("Language pack not found.");
    await db.insert(messages).values(turns.map((turn) => ({
      id: turn.id,
      sessionId,
      sequence: turn.sequence,
      role: turn.role,
      contentType: "text" as const,
      text: turn.text,
      contentLanguageTag: pack.localeTag,
      occurredAt: new Date(turn.occurredAt),
      transcriptConfidence: null,
      createdAt: now,
      updatedAt: now,
    })));
  }

  async complete(sessionId: string): Promise<void> {
    const now = new Date();
    const db = await loadDb();
    await db.update(practiceSessions).set({ status: "completed", endedAt: now, updatedAt: now }).where(eq(practiceSessions.id, sessionId));
  }

  async listCompleted(participantKey: string): Promise<PracticeSnapshot[]> {
    const db = await loadDb();
    const rows = await db.select({ id: practiceSessions.id }).from(practiceSessions)
      .where(and(eq(practiceSessions.participantKey, participantKey), eq(practiceSessions.status, "completed")))
      .orderBy(asc(practiceSessions.createdAt));
    const sessions = await Promise.all(rows.map((row) => this.get(row.id)));
    return sessions.filter((session): session is PracticeSnapshot => Boolean(session));
  }
}

class MemoryPracticeStore implements PracticeStore {
  private sessions = new Map<string, PracticeSnapshot>();
  private participants = new Map<string, string>();

  async start(snapshot: PracticeSnapshot, _pack: LanguagePackDefinition, participantKey: string): Promise<void> {
    this.sessions.set(snapshot.sessionId, structuredClone({ ...snapshot, startedAt: snapshot.startedAt ?? new Date().toISOString() }));
    this.participants.set(snapshot.sessionId, participantKey);
  }
  async get(sessionId: string): Promise<PracticeSnapshot | null> { return structuredClone(this.sessions.get(sessionId) ?? null); }
  async append(sessionId: string, turns: ConversationTurn[]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Practice session not found.");
    session.turns.push(...structuredClone(turns));
  }
  async complete(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) { session.status = "completed"; session.endedAt = new Date().toISOString(); }
  }
  async listCompleted(participantKey: string): Promise<PracticeSnapshot[]> {
    return [...this.sessions.values()]
      .filter((session) => session.status === "completed" && this.participants.get(session.sessionId) === participantKey)
      .sort((left, right) => String(left.startedAt).localeCompare(String(right.startedAt)))
      .map((session) => structuredClone(session));
  }
}

const globalStore = globalThis as typeof globalThis & { __opiMemoryStore?: MemoryPracticeStore };
const memoryStore = globalStore.__opiMemoryStore ??= new MemoryPracticeStore();
const d1Store = new D1PracticeStore();

export function getPracticeStore(mode: PracticeStorageMode): PracticeStore {
  return mode === "d1" ? d1Store : memoryStore;
}

export async function startWithAvailableStore(snapshot: PracticeSnapshot, pack: LanguagePackDefinition, participantKey: string): Promise<PracticeStorageMode> {
  try {
    await d1Store.start(snapshot, pack, participantKey);
    return "d1";
  } catch {
    await memoryStore.start(snapshot, pack, participantKey);
    return "memory";
  }
}
