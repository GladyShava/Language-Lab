import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const studentProfiles = sqliteTable("student_profiles", {
  id: text("id").primaryKey(),
  asuEmail: text("asu_email").notNull().default(""),
  passwordHash: text("password_hash").notNull().default(""),
  passwordSalt: text("password_salt").notNull().default(""),
  preferredFirstName: text("preferred_first_name").notNull(),
  surname: text("surname").notNull().default(""),
  classCohort: text("class_cohort").notNull().default(""),
  nativeLanguage: text("native_language").notNull().default(""),
  targetLanguagePackId: text("target_language_pack_id").notNull().default(""),
  ...timestamps,
}, (table) => [
  uniqueIndex("student_profiles_asu_email_idx").on(table.asuEmail).where(sql`${table.asuEmail} <> ''`),
]);

export const languagePacks = sqliteTable("language_packs", {
  id: text("id").primaryKey(),
  localeTag: text("locale_tag").notNull(),
  displayName: text("display_name").notNull(),
  nativeName: text("native_name").notNull(),
  direction: text("direction", { enum: ["ltr", "rtl"] }).notNull(),
  version: text("version").notNull(),
  status: text("status", { enum: ["draft", "active", "retired"] }).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("language_packs_locale_idx").on(table.localeTag)]);

export const conversationObjectives = sqliteTable("conversation_objectives", {
  id: text("id").primaryKey(),
  languagePackId: text("language_pack_id").notNull().references(() => languagePacks.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  prompt: text("prompt").notNull(),
  category: text("category").notNull(),
  sequence: integer("sequence").notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("objectives_pack_slug_idx").on(table.languagePackId, table.slug),
  index("objectives_pack_sequence_idx").on(table.languagePackId, table.sequence),
]);

export const practiceSessions = sqliteTable("practice_sessions", {
  id: text("id").primaryKey(),
  participantKey: text("participant_key").notNull(),
  languagePackId: text("language_pack_id").notNull().references(() => languagePacks.id, { onDelete: "restrict" }),
  objectiveId: text("objective_id").references(() => conversationObjectives.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  status: text("status", { enum: ["draft", "active", "completed", "archived"] }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [
  index("sessions_participant_idx").on(table.participantKey, table.createdAt),
  index("sessions_pack_idx").on(table.languagePackId),
]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => practiceSessions.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  role: text("role", { enum: ["coach", "learner", "system"] }).notNull(),
  contentType: text("content_type", { enum: ["text", "audio", "text_and_audio"] }).notNull(),
  text: text("text"),
  contentLanguageTag: text("content_language_tag").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  transcriptConfidence: integer("transcript_confidence"),
  ...timestamps,
}, (table) => [
  uniqueIndex("messages_session_sequence_idx").on(table.sessionId, table.sequence),
  index("messages_session_time_idx").on(table.sessionId, table.occurredAt),
]);

export const consents = sqliteTable("consents", {
  id: text("id").primaryKey(),
  participantKey: text("participant_key").notNull(),
  sessionId: text("session_id").references(() => practiceSessions.id, { onDelete: "set null" }),
  scope: text("scope", { enum: ["recording_storage", "transcription", "community_sharing", "research"] }).notNull(),
  status: text("status", { enum: ["granted", "declined", "revoked"] }).notNull(),
  policyVersion: text("policy_version").notNull(),
  grantedAt: integer("granted_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  source: text("source", { enum: ["session_setup", "share_flow", "settings"] }).notNull(),
  ...timestamps,
}, (table) => [index("consents_participant_scope_idx").on(table.participantKey, table.scope, table.createdAt)]);

export const recordings = sqliteTable("recordings", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => practiceSessions.id, { onDelete: "cascade" }),
  messageId: text("message_id").references(() => messages.id, { onDelete: "set null" }),
  consentId: text("consent_id").notNull().references(() => consents.id, { onDelete: "restrict" }),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  durationMs: integer("duration_ms").notNull(),
  byteSize: integer("byte_size").notNull(),
  transcriptStatus: text("transcript_status", { enum: ["not_requested", "pending", "ready", "failed"] }).notNull(),
  recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("recordings_storage_key_idx").on(table.storageKey),
  index("recordings_session_idx").on(table.sessionId),
]);

export const fluentExamples = sqliteTable("fluent_examples", {
  id: text("id").primaryKey(),
  languagePackId: text("language_pack_id").notNull().references(() => languagePacks.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id").notNull().references(() => conversationObjectives.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  coachingNote: text("coaching_note"),
  audioStorageKey: text("audio_storage_key"),
  sequence: integer("sequence").notNull(),
  ...timestamps,
}, (table) => [index("fluent_examples_objective_idx").on(table.objectiveId, table.sequence)]);

export const communityExamples = sqliteTable("community_examples", {
  id: text("id").primaryKey(),
  languagePackId: text("language_pack_id").notNull().references(() => languagePacks.id, { onDelete: "cascade" }),
  objectiveId: text("objective_id").notNull().references(() => conversationObjectives.id, { onDelete: "cascade" }),
  contributorKey: text("contributor_key").notNull(),
  contributorDisplayName: text("contributor_display_name"),
  consentId: text("consent_id").notNull().references(() => consents.id, { onDelete: "restrict" }),
  content: text("content").notNull(),
  audioStorageKey: text("audio_storage_key"),
  styleLabel: text("style_label").notNull().default("Conversational"),
  vocabularyNotes: text("vocabulary_notes").notNull().default("[]"),
  moderationStatus: text("moderation_status", { enum: ["pending", "approved", "rejected", "withdrawn"] }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [index("community_examples_objective_status_idx").on(table.objectiveId, table.moderationStatus)]);

export const shadowAttempts = sqliteTable("shadow_attempts", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => practiceSessions.id, { onDelete: "cascade" }),
  fluentExampleId: text("fluent_example_id").notNull().references(() => fluentExamples.id, { onDelete: "cascade" }),
  recordingId: text("recording_id").notNull().references(() => recordings.id, { onDelete: "cascade" }),
  sentenceIndex: integer("sentence_index").notNull(),
  sentenceText: text("sentence_text").notNull(),
  attemptNumber: integer("attempt_number").notNull().default(2),
  ...timestamps,
}, (table) => [
  index("shadow_attempts_session_idx").on(table.sessionId, table.createdAt),
  index("shadow_attempts_example_sentence_idx").on(table.fluentExampleId, table.sentenceIndex),
]);

export type LanguagePackRecord = typeof languagePacks.$inferSelect;
export type StudentProfileRecord = typeof studentProfiles.$inferSelect;
export type ConversationObjectiveRecord = typeof conversationObjectives.$inferSelect;
export type PracticeSessionRecord = typeof practiceSessions.$inferSelect;
export type MessageRecord = typeof messages.$inferSelect;
export type RecordingRecord = typeof recordings.$inferSelect;
export type FluentExampleRecord = typeof fluentExamples.$inferSelect;
export type CommunityExampleRecord = typeof communityExamples.$inferSelect;
export type ConsentRecord = typeof consents.$inferSelect;
export type ShadowAttemptRecord = typeof shadowAttempts.$inferSelect;
