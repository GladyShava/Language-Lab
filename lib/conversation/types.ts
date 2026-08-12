export interface ConversationTurn {
  id: string;
  role: "coach" | "learner";
  text: string;
  sequence: number;
  occurredAt: string;
}

export interface ConversationContext {
  languagePackId: string;
  localeTag: string;
  objectiveId: string;
  turns: readonly ConversationTurn[];
  timing?: ConversationTiming;
}

export interface ConversationTiming {
  plannedDurationMinutes: number;
  remainingSeconds: number;
}

export interface ConversationProvider {
  readonly name: string;
  createOpeningTurn(context: Omit<ConversationContext, "turns"> & { participantName?: string }): Promise<string>;
  createFollowUp(context: ConversationContext): Promise<string>;
  createClosingTurn(context: ConversationContext): Promise<string>;
}
