import type {
  CommunityExample,
  Consent,
  ConversationObjective,
  FluentExample,
  LanguagePack,
  Message,
  PracticeSession,
  Recording,
} from "./models";

export interface ConversationStudioRepository {
  listLanguagePacks(): Promise<LanguagePack[]>;
  getLanguagePack(id: string): Promise<LanguagePack | null>;
  listObjectives(languagePackId: string): Promise<ConversationObjective[]>;
  getSession(id: string): Promise<PracticeSession | null>;
  listMessages(sessionId: string): Promise<Message[]>;
  listRecordings(sessionId: string): Promise<Recording[]>;
  listFluentExamples(objectiveId: string): Promise<FluentExample[]>;
  listCommunityExamples(objectiveId: string): Promise<CommunityExample[]>;
  getConsent(id: string): Promise<Consent | null>;
  saveSession(session: PracticeSession): Promise<void>;
  saveMessage(message: Message): Promise<void>;
  saveRecording(recording: Recording): Promise<void>;
  saveConsent(consent: Consent): Promise<void>;
}
