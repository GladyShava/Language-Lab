const STOP_WORDS = new Set(["about", "after", "again", "also", "because", "been", "before", "being", "could", "from", "have", "into", "more", "most", "other", "their", "there", "these", "they", "this", "through", "very", "what", "when", "where", "which", "while", "with", "would", "your"]);

export interface AnonymizedResponse {
  text: string;
  redactions: string[];
  styleLabel: string;
  vocabulary: string[];
}

export function anonymizeResponse(input: string): AnonymizedResponse {
  let text = input.trim();
  const redactions = new Set<string>();
  const replace = (pattern: RegExp, replacement: string, label: string) => {
    if (pattern.test(text)) { text = text.replace(pattern, replacement); redactions.add(label); }
  };

  replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]", "email address");
  replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone removed]", "phone number");
  replace(/https?:\/\/\S+|www\.\S+/gi, "[link removed]", "web link");
  replace(/@[A-Za-z0-9_]{2,}/g, "[handle removed]", "social handle");
  replace(/\bmy name is\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?/gi, "I am an anonymous learner", "name");
  replace(/\bI work (?:at|for)\s+[^,.!?]+/gi, "I work at an organization", "organization");
  replace(/\bI (?:study|studied) at\s+[^,.!?]+/gi, "I study at a school", "school");
  replace(/\bI(?:'m| am) from\s+[^,.!?]+/gi, "I am from my community", "location");
  replace(/\bI live in\s+[^,.!?]+/gi, "I live in my community", "location");
  replace(/\b\d{1,5}\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr)\b/gi, "[address removed]", "street address");
  replace(/\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, "[date removed]", "specific date");
  text = text.replace(/\s+/g, " ").trim();

  const words = text.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? [];
  const vocabulary = [...new Set(words.map((word) => word.toLowerCase()).filter((word) => !STOP_WORDS.has(word) && !word.includes("removed")))].slice(0, 5);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const styleLabel = wordCount < 35 ? "Concise and direct" : wordCount > 80 ? "Detailed and reflective" : "Conversational and developed";
  return { text, redactions: [...redactions], styleLabel, vocabulary };
}

export function containsObviousPersonalInfo(text: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\d\s().-]{7,}\d)|https?:\/\/\S+|www\.\S+|@[A-Za-z0-9_]{2,}/i.test(text);
}
