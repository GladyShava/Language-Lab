import type { CommunityExample, Consent, Message, PracticeSession, Recording } from "@/lib/domain/models";
import { englishDemoPack } from "@/lib/language-packs/en-US";

const demoTime = new Date("2026-07-22T15:00:00.000Z");

export const demoConsent: Consent = {
  id: "consent_demo_recording",
  participantKey: "participant_demo",
  sessionId: "session_demo_change",
  scope: "recording_storage",
  status: "granted",
  policyVersion: "prototype-1",
  grantedAt: demoTime,
  revokedAt: null,
  source: "session_setup",
};

export const demoCommunityConsent: Consent = {
  id: "consent_demo_community",
  participantKey: "contributor_demo",
  sessionId: null,
  scope: "community_sharing",
  status: "granted",
  policyVersion: "prototype-1",
  grantedAt: demoTime,
  revokedAt: null,
  source: "share_flow",
};

export const demoSession: PracticeSession = {
  id: "session_demo_change",
  participantKey: "participant_demo",
  languagePackId: englishDemoPack.pack.id,
  objectiveId: "obj_en_narration",
  title: "Unexpected change",
  status: "completed",
  startedAt: demoTime,
  endedAt: new Date(demoTime.getTime() + 102_000),
};

export const demoMessages: Message[] = [
  {
    id: "message_demo_prompt",
    sessionId: demoSession.id,
    sequence: 1,
    role: "coach",
    contentType: "text",
    text: englishDemoPack.objectives[1].prompt,
    contentLanguageTag: englishDemoPack.pack.localeTag,
    occurredAt: demoTime,
    transcriptConfidence: null,
  },
  {
    id: "message_demo_response",
    sessionId: demoSession.id,
    sequence: 2,
    role: "learner",
    contentType: "text_and_audio",
    text: "A situation that comes to mind happened during a regional project last year. Our timeline changed suddenly when a key partner had to step away.",
    contentLanguageTag: englishDemoPack.pack.localeTag,
    occurredAt: new Date(demoTime.getTime() + 8_000),
    transcriptConfidence: 96,
  },
];

export const demoRecording: Recording = {
  id: "recording_demo_response",
  sessionId: demoSession.id,
  messageId: "message_demo_response",
  consentId: demoConsent.id,
  storageKey: "demo/en-US/session_demo_change/response.webm",
  mimeType: "audio/webm",
  durationMs: 102_000,
  byteSize: 0,
  transcriptStatus: "ready",
  recordedAt: new Date(demoTime.getTime() + 8_000),
};

export const demoCommunityExample: CommunityExample = {
  id: "community_en_change_01",
  languagePackId: englishDemoPack.pack.id,
  objectiveId: "obj_en_narration",
  contributorKey: "contributor_demo",
  contributorDisplayName: "Community contributor",
  consentId: demoCommunityConsent.id,
  content: "I first clarified what had changed, then helped the group agree on the next three decisions. That kept the conversation practical and forward-looking.",
  audioStorageKey: null,
  styleLabel: "Structured and practical",
  vocabularyNotes: ["clarified", "forward-looking"],
  moderationStatus: "approved",
  publishedAt: demoTime,
};
