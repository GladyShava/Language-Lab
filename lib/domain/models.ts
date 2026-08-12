export type LanguageDirection = "ltr" | "rtl";
export type LanguagePackStatus = "draft" | "active" | "retired";
export type PracticeSessionStatus = "draft" | "active" | "completed" | "archived";
export type MessageRole = "coach" | "learner" | "system";
export type MessageContentType = "text" | "audio" | "text_and_audio";
export type TranscriptStatus = "not_requested" | "pending" | "ready" | "failed";
export type ConsentScope = "recording_storage" | "transcription" | "community_sharing" | "research";
export type ConsentStatus = "granted" | "declined" | "revoked";
export type ConsentSource = "session_setup" | "share_flow" | "settings";
export type ModerationStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface LanguagePack {
  id: string;
  localeTag: string;
  displayName: string;
  nativeName: string;
  direction: LanguageDirection;
  version: string;
  status: LanguagePackStatus;
}

export interface ConversationObjective {
  id: string;
  languagePackId: string;
  slug: string;
  title: string;
  description: string;
  prompt: string;
  category: string;
  sequence: number;
  estimatedMinutes: number;
  isActive: boolean;
}

export interface PracticeSession {
  id: string;
  participantKey: string;
  languagePackId: string;
  objectiveId: string | null;
  title: string;
  status: PracticeSessionStatus;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface Message {
  id: string;
  sessionId: string;
  sequence: number;
  role: MessageRole;
  contentType: MessageContentType;
  text: string | null;
  contentLanguageTag: string;
  occurredAt: Date;
  transcriptConfidence: number | null;
}

export interface Recording {
  id: string;
  sessionId: string;
  messageId: string | null;
  consentId: string;
  storageKey: string;
  mimeType: string;
  durationMs: number;
  byteSize: number;
  transcriptStatus: TranscriptStatus;
  recordedAt: Date;
}

export interface FluentExample {
  id: string;
  languagePackId: string;
  objectiveId: string;
  title: string;
  content: string;
  coachingNote: string | null;
  audioStorageKey: string | null;
  sequence: number;
}

export interface CommunityExample {
  id: string;
  languagePackId: string;
  objectiveId: string;
  contributorKey: string;
  contributorDisplayName: string | null;
  consentId: string;
  content: string;
  audioStorageKey: string | null;
  styleLabel: string;
  vocabularyNotes: string[];
  moderationStatus: ModerationStatus;
  publishedAt: Date | null;
}

export interface Consent {
  id: string;
  participantKey: string;
  sessionId: string | null;
  scope: ConsentScope;
  status: ConsentStatus;
  policyVersion: string;
  grantedAt: Date | null;
  revokedAt: Date | null;
  source: ConsentSource;
}

export interface ShadowAttempt {
  id: string;
  sessionId: string;
  fluentExampleId: string;
  recordingId: string;
  sentenceIndex: number;
  sentenceText: string;
  attemptNumber: 2;
}
