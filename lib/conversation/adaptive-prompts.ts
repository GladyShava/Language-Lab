import type { AdaptiveRubricProfile, AdaptiveStage } from "./adaptive-rubric";
import type { InterviewStage } from "./time-plan";

export interface AdaptiveStageBehavior {
  sentenceComplexity: "short" | "moderate" | "connected" | "complex" | "layered";
  vocabularyRichness: "familiar" | "varied" | "contextual" | "precise" | "nuanced";
  followUpPressure: 1 | 2 | 3 | 4 | 5;
  ambiguity: 1 | 2 | 3 | 4 | 5;
  discourseMove: "describe" | "explain" | "justify" | "compare" | "negotiate";
}

export const adaptiveStageBehaviors: Record<AdaptiveStage, AdaptiveStageBehavior> = {
  Emerging: { sentenceComplexity: "short", vocabularyRichness: "familiar", followUpPressure: 1, ambiguity: 1, discourseMove: "describe" },
  Developing: { sentenceComplexity: "moderate", vocabularyRichness: "varied", followUpPressure: 2, ambiguity: 1, discourseMove: "explain" },
  Expanding: { sentenceComplexity: "connected", vocabularyRichness: "contextual", followUpPressure: 3, ambiguity: 2, discourseMove: "justify" },
  Confident: { sentenceComplexity: "complex", vocabularyRichness: "precise", followUpPressure: 4, ambiguity: 3, discourseMove: "compare" },
  Advanced: { sentenceComplexity: "layered", vocabularyRichness: "nuanced", followUpPressure: 5, ambiguity: 5, discourseMove: "negotiate" },
};

function vocabularyBridge(response: string): string {
  const substitutions: Array<[RegExp, string]> = [
    [/\bhelp(?:ing|s|ed)?\b/i, "supporting others"],
    [/\bvery important\b/i, "significant"],
    [/\bgood opportunity\b/i, "valuable opportunity"],
    [/\bmany different\b/i, "a diverse range of"],
    [/\bbig change\b/i, "major shift"],
    [/\bproblem\b/i, "challenge"],
  ];
  const found = substitutions.find(([pattern]) => pattern.test(response));
  return found ? `You mentioned ${found[1]}. ` : "";
}

const promptTemplates: Record<AdaptiveStage, Record<InterviewStage, string>> = {
  Emerging: {
    warmup: "What do you like doing in your free time? Tell me one reason.",
    description: "Describe your hometown or an important place. What can people see there?",
    story: "Tell me about something memorable that happened. What happened first?",
    opinion: "Do you think technology helps students? Why?",
    role_play: "Imagine your luggage is missing at the airport. Tell me what happened and ask me for help.",
    wrap: "What are your plans for this weekend?",
  },
  Developing: {
    warmup: "What do you enjoy doing in your free time, and why do you enjoy it?",
    description: "Describe your hometown or another important place. What is it like, and why does it matter to you?",
    story: "Tell me about a memorable trip or event. What happened first, next and at the end?",
    opinion: "How has technology changed education? Explain one benefit or challenge.",
    role_play: "Imagine your luggage was lost at the airport. Explain the problem and ask the airline employee for help.",
    wrap: "To finish with something relaxed, what are your plans for this weekend?",
  },
  Expanding: {
    warmup: "Describe a recent time you enjoyed that activity. What made the experience meaningful?",
    description: "Describe your hometown or an important place, then explain how it has influenced you.",
    story: "Tell me about a memorable trip or event. Organize the story clearly and explain why it still matters to you.",
    opinion: "How has technology changed education? Explain your position and support it with a specific example.",
    role_play: "Your luggage is missing at the airport. Explain the situation, request a solution and respond to one possible delay.",
    wrap: "What is one plan you are looking forward to this weekend, and why?",
  },
  Confident: {
    warmup: "Compare this interest with another way you could spend your time. Why do you prioritize it?",
    description: "Compare your hometown with another place you know. Which differences have shaped your perspective most?",
    story: "Narrate a memorable event, then explain how your understanding of it changed afterward.",
    opinion: "Technology creates both access and new challenges in education. Which trade-off matters most, and how would you justify your position?",
    role_play: "Your luggage is missing and the airline cannot locate it. Negotiate a practical solution while explaining your immediate priorities.",
    wrap: "Looking ahead to the weekend, how will you balance what you need to do with what you would like to do?",
  },
  Advanced: {
    warmup: "People often say personal interests should also produce measurable value. How would you challenge or qualify that assumption?",
    description: "A place can preserve identity while still needing change. What should your hometown protect, and what should it reconsider?",
    story: "Reframe a memorable event from another person's perspective. How might their interpretation differ from yours, and why?",
    opinion: "If greater access to educational technology also deepens inequality, what principles should guide leaders when the evidence is incomplete?",
    role_play: "The airline offers a solution that is convenient for them but inadequate for you. Negotiate an alternative while acknowledging their constraints.",
    wrap: "What question from today's conversation would you want to explore more deeply next time?",
  },
};

export function createAdaptivePrompt(stage: InterviewStage, profile: AdaptiveRubricProfile, latestResponse: string): string {
  const bridge = profile.currentStage === "Emerging" || profile.currentStage === "Developing" ? "" : vocabularyBridge(latestResponse);
  return `${bridge}${promptTemplates[profile.currentStage][stage]}`;
}

interface ConversationAnchor {
  topic: string;
  reference: string;
  rolePlay: string;
}

function extractActivity(response: string): string | null {
  const match = response.match(/\b(?:enjoy|like|love|passionate about)\s+([^,.!?]{2,52})/i);
  return match?.[1]?.trim().replace(/\s+(?:because|since)\s+.*$/i, "") ?? null;
}

function findConversationAnchor(response: string): ConversationAnchor {
  const activity = extractActivity(response);
  if (/\b(technology|digital|online|computer|internet|\bai\b)\b/i.test(response)) {
    return {
      topic: "technology",
      reference: "You raised the role of technology.",
      rolePlay: "Imagine your school or workplace wants to introduce a new AI tool, but some people object. Present your recommendation and respond to my concern.",
    };
  }
  if (/\b(team|teamwork|collaborat|classmate|colleague|different perspectives|international)\b/i.test(response)) {
    return {
      topic: "working with different people",
      reference: "You described working with people who bring different perspectives.",
      rolePlay: "Imagine a teammate strongly disagrees with your plan. Explain your position and work toward a compromise with me.",
    };
  }
  if (/\b(work|job|career|company|profession)\b/i.test(response)) {
    return {
      topic: "your work",
      reference: "You connected your answer to your work.",
      rolePlay: "Imagine a colleague asks you to change an important deadline. Explain your priorities and negotiate a workable plan with me.",
    };
  }
  if (/\b(study|studies|student|class|school|university|course|education)\b/i.test(response)) {
    return {
      topic: "your studies",
      reference: "You connected your answer to your studies.",
      rolePlay: "Imagine a classmate disagrees with how your group project should be organized. Explain your approach and negotiate the next step with me.",
    };
  }
  if (/\b(hometown|city|town|village|neighbou?rhood|community|country|grew up|from)\b/i.test(response)) {
    return {
      topic: "the place you described",
      reference: "You brought the place you come from into the conversation.",
      rolePlay: "Imagine you are speaking with a local leader about one change your community needs. Explain the problem and persuade me to support your idea.",
    };
  }
  if (/\b(travel|trip|journey|visited|vacation|flight|airport)\b/i.test(response)) {
    return {
      topic: "that travel experience",
      reference: "You mentioned a travel experience.",
      rolePlay: "Imagine an important part of that trip has gone wrong. Explain the situation to me and negotiate a practical solution.",
    };
  }
  if (/\b(family|parent|mother|father|sister|brother|relative)\b/i.test(response)) {
    return {
      topic: "your family experience",
      reference: "You connected your answer to your family.",
      rolePlay: "Imagine a family responsibility conflicts with an important commitment. Explain the situation and negotiate a solution with me.",
    };
  }
  if (activity) {
    return {
      topic: activity,
      reference: `You mentioned ${activity}.`,
      rolePlay: `Imagine a friend wants you to stop ${activity} because of a scheduling conflict. Explain why it matters and negotiate a solution with me.`,
    };
  }
  if (/\b(challenge|problem|difficult|conflict|disagree|decision|choice)\b/i.test(response)) {
    return {
      topic: "that challenge",
      reference: "You described a challenge or decision.",
      rolePlay: "Imagine the same problem affects another person who disagrees with your solution. Explain your reasoning and negotiate with me.",
    };
  }
  return {
    topic: "that experience",
    reference: "I want to stay with the experience you just described.",
    rolePlay: "Imagine another person sees that situation differently. Explain your view and work toward a solution with me.",
  };
}

function answerStudentQuestion(response: string): string {
  if (!response.includes("?")) return "";
  if (/\b(team|teamwork|collaborat|different perspectives)\b/i.test(response)) {
    return "To answer your question, clear roles and honest communication usually make collaboration stronger. ";
  }
  if (/\b(technology|digital|online|\bai\b)\b/i.test(response)) {
    return "To answer your question, technology is most useful when access and human support grow together. ";
  }
  if (/\b(city|community|neighbou?rhood|protect|growing)\b/i.test(response)) {
    return "To answer your question, I would protect belonging and access while a community grows. ";
  }
  return "To answer your question, I would first consider the people affected and the trade-offs involved. ";
}

export function createConnectedAdaptivePrompt(
  stage: InterviewStage,
  profile: AdaptiveRubricProfile,
  latestResponse: string,
): string {
  if (stage === "wrap") return createAdaptivePrompt(stage, profile, latestResponse);
  const anchor = findConversationAnchor(latestResponse);
  const answerLead = answerStudentQuestion(latestResponse);
  const behavior = adaptiveStageBehaviors[profile.currentStage];
  const bridge = profile.currentStage === "Emerging" || profile.currentStage === "Developing" ? "" : vocabularyBridge(latestResponse);
  let prompt: string;

  if (stage === "role_play") {
    prompt = anchor.rolePlay;
  } else if (stage === "story") {
    prompt = behavior.followUpPressure <= 2
      ? `Tell me about one memorable event involving ${anchor.topic}. What happened?`
      : `Tell me about a specific event involving ${anchor.topic}. What happened, how did you respond, and what did you learn?`;
  } else if (stage === "opinion") {
    prompt = behavior.followUpPressure <= 2
      ? `Why is ${anchor.topic} important to you?`
      : behavior.followUpPressure === 3
        ? `What broader lesson can people learn from ${anchor.topic}? Give me a reason and an example.`
        : `What tension or trade-off do you see in ${anchor.topic}, and how would you justify your position to someone who disagrees?`;
  } else if (stage === "description") {
    prompt = behavior.followUpPressure <= 2
      ? `Describe one person, place, or situation connected to ${anchor.topic}.`
      : `Describe a specific situation connected to ${anchor.topic}, then explain why that detail matters.`;
  } else {
    prompt = behavior.followUpPressure <= 2
      ? `What would you like me to understand about ${anchor.topic}?`
      : `What part of ${anchor.topic} has influenced you most, and why?`;
  }

  return `${answerLead}${anchor.reference} ${bridge}${prompt}`.replace(/\s+/g, " ").trim();
}

export function adjustInterviewStage(stage: InterviewStage, coachingStage: AdaptiveStage): InterviewStage {
  if (stage === "wrap") return stage;
  if (coachingStage === "Emerging" && ["story", "opinion", "role_play"].includes(stage)) return "description";
  if (coachingStage === "Developing" && stage === "role_play") return "story";
  return stage;
}

export function createPersonalizedAdaptiveFollowUp(profile: AdaptiveRubricProfile, latestResponse: string): string | null {
  const normalized = latestResponse.toLocaleLowerCase();
  const behavior = adaptiveStageBehaviors[profile.currentStage];
  const bridge = vocabularyBridge(latestResponse);
  const answerLead = answerStudentQuestion(latestResponse);
  if (/\b(work|job|career|company|student|study|school|university)\b/i.test(normalized)) {
    if (behavior.followUpPressure <= 2) return `${answerLead}What do you enjoy most about your work or studies, and why?`;
    if (behavior.followUpPressure === 3) return `${answerLead}${bridge}Tell me about a specific experience that made your work or studies meaningful.`;
    return `${answerLead}${bridge}How do your current work or studies compare with what you expected, and which trade-off has been most important?`;
  }
  if (/\b(from|grew up|live in|moved|city|country|home)\b/i.test(normalized)) {
    if (behavior.followUpPressure <= 2) return `${answerLead}How has the place you come from influenced you?`;
    if (behavior.followUpPressure === 3) return `${answerLead}${bridge}Give me an example of how that place has influenced a choice you made.`;
    return `${answerLead}${bridge}Which part of that influence would you preserve, and which part would you reconsider?`;
  }
  if (/\b(family|mother|father|parent|sister|brother)\b/i.test(normalized)) {
    if (behavior.followUpPressure <= 2) return `${answerLead}Can you share one way your family has influenced your values?`;
    return `${answerLead}${bridge}Describe a time when a family value influenced a difficult choice you made.`;
  }
  if (/\b(enjoy|hobby|free time|love|passion|favorite)\b/i.test(normalized)) {
    if (behavior.followUpPressure <= 2) return `${answerLead}Can you describe a recent time when you enjoyed that activity?`;
    return `${answerLead}${bridge}Why does that activity remain valuable when your time is limited?`;
  }
  return null;
}
