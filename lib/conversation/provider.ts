import { MockConversationProvider } from "./mock-engine";
import type { ConversationProvider } from "./types";

export const createConversationProvider = (): ConversationProvider => new MockConversationProvider();

export const conversationProvider = createConversationProvider();
