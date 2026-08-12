import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("uses only the local adaptive conversation provider", async () => {
  const [providerSource, mockSource] = await Promise.all([
    readFile(new URL("../lib/conversation/provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/conversation/mock-engine.ts", import.meta.url), "utf8"),
  ]);

  assert.match(providerSource, /new MockConversationProvider\(\)/);
  assert.doesNotMatch(providerSource, /OpenAI|Realtime/i);
  assert.match(mockSource, /adaptive-opi-practice-v2/);
});
