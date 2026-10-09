import { getLanguagePackDefinition } from "@/lib/language-packs/registry";
import type { PracticeSnapshot, PracticeStorageMode } from "./store";

// Browser recovery is limited to anonymous practice, never persisted D1 records.
export function validateRecoverySnapshot(value: unknown, sessionId?: string): PracticeSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as PracticeSnapshot;
  const pack = getLanguagePackDefinition(snapshot.languagePackId);
  if (!pack || snapshot.localeTag !== pack.pack.localeTag || !pack.objectives.some(item => item.id === snapshot.objectiveId)) return null;
  if (typeof snapshot.sessionId !== "string" || !/^[\w-]{1,80}$/.test(snapshot.sessionId) || (sessionId && snapshot.sessionId !== sessionId)) return null;
  if (typeof snapshot.title !== "string" || snapshot.title.length > 300 || !["active", "completed"].includes(snapshot.status)) return null;
  if (!Array.isArray(snapshot.turns) || snapshot.turns.length > 400) return null;
  const ids = new Set<string>();
  for (const [index, turn] of snapshot.turns.entries()) {
    if (!turn || typeof turn.id !== "string" || !/^[\w-]{1,80}$/.test(turn.id) || ids.has(turn.id)) return null;
    if (!["coach", "learner"].includes(turn.role) || typeof turn.text !== "string" || turn.text.length > 4000 || turn.sequence !== index + 1 || typeof turn.occurredAt !== "string" || !Number.isFinite(Date.parse(turn.occurredAt))) return null;
    ids.add(turn.id);
  }
  return structuredClone(snapshot);
}

export interface PracticeBackup {
  snapshot: PracticeSnapshot;
  mode: PracticeStorageMode;
  firstName?: string;
  participantKey?: string;
  practiceMinutes?: number;
  remainingSeconds?: number;
  pendingResponse?: string;
  pendingResponseId?: string;
}

export function savePracticeBackup(backup: PracticeBackup): boolean {
  try {
    localStorage.setItem(`opi_session_${backup.snapshot.sessionId}`, JSON.stringify(backup));
    localStorage.setItem("opi_last_session", JSON.stringify({ sessionId: backup.snapshot.sessionId, mode: backup.mode }));
    return true;
  } catch { return false; }
}

export function readPracticeBackup(sessionId?: string): PracticeBackup | null {
  try {
    const id = sessionId ?? JSON.parse(localStorage.getItem("opi_last_session") ?? "{}").sessionId;
    const backup = JSON.parse(localStorage.getItem(`opi_session_${id}`) ?? "null") as PracticeBackup | null;
    return backup && validateRecoverySnapshot(backup.snapshot, id) ? backup : null;
  } catch { return null; }
}
