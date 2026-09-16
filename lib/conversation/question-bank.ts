import type { AdaptiveStage } from "./adaptive-rubric";
import type { InterviewStage } from "./time-plan";

export type QuestionFunction = "describe" | "preferences" | "experience" | "narrate" | "inquire" | "compare" | "explain" | "recommend" | "hypothesize" | "persuade";
export type QuestionTier = "novice" | "intermediate" | "advanced" | "superior";

export interface ConversationQuestion {
  id: number;
  tier: QuestionTier;
  topic: string;
  function: QuestionFunction;
  prompt: string;
}

const functions: readonly QuestionFunction[] = [
  "describe", "preferences", "experience", "narrate", "inquire", "compare", "explain", "recommend", "hypothesize", "persuade",
];

const topics: Record<QuestionTier, readonly string[]> = {
  novice: ["personal identity", "family and friends", "daily routine", "home and neighborhood", "food and drink", "school and study", "work basics", "hobbies", "weather and seasons", "shopping", "transportation", "health and wellbeing", "clothing", "time and schedules", "places in town", "technology basics", "holidays", "sports", "travel basics", "likes and dislikes"],
  intermediate: ["past experiences", "future plans", "travel problems", "workplace situations", "education", "relationships", "health choices", "consumer decisions", "technology use", "community life", "cultural traditions", "housing", "transportation choices", "food culture", "entertainment", "personal goals", "money habits", "environment", "social media", "customer service"],
  advanced: ["leadership", "teamwork", "cross-cultural communication", "negotiation", "conflict resolution", "career development", "education policy", "technology and society", "sustainability", "energy", "manufacturing", "mining and resources", "entrepreneurship", "global business", "ethics", "public health", "urban development", "media", "economic change", "organizational change"],
  superior: ["globalization", "artificial intelligence", "climate policy", "economic inequality", "migration", "cultural identity", "international trade", "corporate responsibility", "innovation policy", "future of work", "resource governance", "energy transition", "education reform", "privacy", "information integrity", "leadership ethics", "development", "language and power", "social change", "risk and resilience"],
};

const templates: Record<QuestionTier, readonly ((topic: string) => string)[]> = {
  novice: [
    (t) => `Tell me about ${t}.`,
    (t) => `What do you like about ${t}?`,
    (t) => `What do you dislike about ${t}?`,
    (t) => `Describe your experience with ${t}.`,
    (t) => `Who do you usually talk to about ${t}?`,
    (t) => `Where do you usually experience ${t}?`,
    (t) => `When is ${t} important in your day?`,
    (t) => `What do you usually do related to ${t}?`,
    (t) => `What is one thing you need for ${t}?`,
    (t) => `What is easy about ${t}?`,
    (t) => `What is difficult about ${t}?`,
    (t) => `Give three words you associate with ${t}.`,
    (t) => `Describe a typical day involving ${t}.`,
    (t) => `What did you do recently related to ${t}?`,
    (t) => `What will you do next related to ${t}?`,
    (t) => `Ask Maya one question about ${t}.`,
    (t) => `Compare two simple choices related to ${t}.`,
    (t) => `What is your favorite example of ${t}, and why?`,
    (t) => `Describe a person connected with ${t}.`,
    (t) => `Describe a place connected with ${t}.`,
    (t) => `What would you buy or choose related to ${t}?`,
    (t) => `What would you say if you needed help with ${t}?`,
    (t) => `Explain one simple rule or habit related to ${t}.`,
    (t) => `What would you recommend to a friend about ${t}?`,
    (t) => `What else would you like to know about ${t}?`,
  ],
  intermediate: [
    (t) => `Describe a memorable experience involving ${t}.`,
    (t) => `Tell the story of a problem you had with ${t} and how it ended.`,
    (t) => `How has your experience with ${t} changed over time?`,
    (t) => `What are your plans related to ${t} in the next year?`,
    (t) => `Compare two approaches to ${t}.`,
    (t) => `What are the main advantages and disadvantages of ${t}?`,
    (t) => `What advice would you give someone dealing with ${t}?`,
    (t) => `Explain how you normally make decisions about ${t}.`,
    (t) => `Describe a situation in which ${t} did not go as expected.`,
    (t) => `What would you do if a plan involving ${t} suddenly changed?`,
    (t) => `Ask three useful questions before making a decision about ${t}.`,
    (t) => `Explain a process connected with ${t} from beginning to end.`,
    (t) => `What causes common problems with ${t}?`,
    (t) => `What are the consequences of making a poor decision about ${t}?`,
    (t) => `How is ${t} different in two places or cultures you know?`,
    (t) => `Describe how another person might view ${t} differently from you.`,
    (t) => `What is one misconception about ${t}?`,
    (t) => `Persuade a friend to try a different approach to ${t}.`,
    (t) => `Politely disagree with someone about ${t} and explain why.`,
    (t) => `Describe a past situation involving ${t}, then explain what you would do differently now.`,
    (t) => `What information would you need before making an important decision about ${t}?`,
    (t) => `How could technology improve ${t}?`,
    (t) => `How might ${t} change in the next five years?`,
    (t) => `What personal skill is most useful when dealing with ${t}? Explain.`,
    (t) => `Create a realistic scenario involving ${t} and explain how you would respond.`,
  ],
  advanced: [
    (t) => `Explain a complex challenge related to ${t} and propose a practical response.`,
    (t) => `Analyze the causes and consequences of a recent change in ${t}.`,
    (t) => `Compare two competing strategies for addressing ${t}.`,
    (t) => `Defend a position on a controversial issue related to ${t}.`,
    (t) => `What trade-offs do leaders face when making decisions about ${t}?`,
    (t) => `Describe a conflict involving ${t} and negotiate a compromise.`,
    (t) => `How can cultural differences affect decisions about ${t}?`,
    (t) => `What evidence would you seek before changing a policy or strategy involving ${t}?`,
    (t) => `Explain how short-term and long-term priorities can conflict in ${t}.`,
    (t) => `How would you persuade a skeptical executive to reconsider an approach to ${t}?`,
    (t) => `What stakeholders are affected by decisions about ${t}, and how?`,
    (t) => `Describe an unintended consequence that could result from a decision about ${t}.`,
    (t) => `How would you communicate a difficult decision about ${t} to people who disagree?`,
    (t) => `Evaluate two possible solutions to a problem involving ${t}, without assuming either is perfect.`,
    (t) => `What ethical tensions can arise in ${t}?`,
    (t) => `How would you respond if new information undermined your original position on ${t}?`,
    (t) => `Explain how local conditions can change the success of a strategy involving ${t}.`,
    (t) => `What role should data play in decisions about ${t}, and where is human judgment still necessary?`,
    (t) => `Construct a scenario in which two organizations disagree about ${t}; explain how you would facilitate the discussion.`,
    (t) => `How can a leader build trust during a difficult change involving ${t}?`,
    (t) => `What assumptions are commonly made about ${t}, and which should be questioned?`,
    (t) => `Explain a failure involving ${t} and identify lessons that could transfer to another context.`,
    (t) => `How might different generations or professional groups view ${t} differently?`,
    (t) => `Present a recommendation about ${t}, then respond to two strong objections.`,
    (t) => `What would success look like for a major initiative involving ${t}, and how would you know?`,
  ],
  superior: [
    (t) => `Analyze ${t} from economic, social, and ethical perspectives.`,
    (t) => `What competing values shape debates about ${t}, and why are they difficult to reconcile?`,
    (t) => `Develop a policy framework for ${t} that accounts for uncertainty and unintended consequences.`,
    (t) => `Challenge a widely held assumption about ${t} and build a reasoned alternative argument.`,
    (t) => `How does ${t} illustrate tensions between individual interests and collective outcomes?`,
    (t) => `Compare how ${t} might be understood in two different cultural or institutional contexts.`,
    (t) => `What historical forces help explain current debates about ${t}?`,
    (t) => `How should decision-makers act when credible evidence about ${t} is incomplete or contradictory?`,
    (t) => `Construct the strongest argument for two opposing positions on ${t}.`,
    (t) => `What second-order effects could follow a major change involving ${t}?`,
    (t) => `How might language and framing influence public understanding of ${t}?`,
    (t) => `Explain how power relationships shape decisions about ${t}.`,
    (t) => `What indicators would you use to evaluate a long-term strategy concerning ${t}, and what might those indicators miss?`,
    (t) => `How could a technically successful solution to ${t} still fail socially or politically?`,
    (t) => `Analyze a scenario in which efficiency, fairness, and sustainability point toward different choices about ${t}.`,
    (t) => `How should leaders communicate uncertainty when discussing ${t}?`,
    (t) => `What responsibilities do institutions have when their decisions about ${t} affect people across borders?`,
    (t) => `How might technological change alter the fundamental assumptions underlying ${t}?`,
    (t) => `Develop a negotiation strategy for stakeholders with incompatible priorities concerning ${t}.`,
    (t) => `How would you distinguish correlation, causation, and coincidence when evaluating claims about ${t}?`,
    (t) => `What would cause you to revise a strongly held position about ${t}?`,
    (t) => `Identify a paradox or contradiction within debates about ${t} and explain its significance.`,
    (t) => `How can decision-makers balance expert knowledge with lived experience when addressing ${t}?`,
    (t) => `Imagine conditions in 2040: how might ${t} have changed, and what present-day decisions could shape that outcome?`,
    (t) => `Synthesize the major tensions surrounding ${t} and propose questions leaders should ask before acting.`,
  ],
};

const tierOrder: readonly QuestionTier[] = ["novice", "intermediate", "advanced", "superior"];

export const conversationQuestionBank: readonly ConversationQuestion[] = tierOrder.flatMap((tier, tierIndex) =>
  topics[tier].flatMap((topic, topicIndex) => templates[tier].map((template, templateIndex) => ({
    id: tierIndex * 500 + topicIndex * 25 + templateIndex + 1,
    tier,
    topic,
    function: functions[templateIndex % functions.length],
    prompt: template(topic),
  }))),
);

if (conversationQuestionBank.length !== 2000 || new Set(conversationQuestionBank.map((question) => normalized(question.prompt))).size !== 2000) {
  throw new Error("The Maya question bank must contain exactly 2,000 unique prompts.");
}

const functionsByStage: Record<InterviewStage, readonly QuestionFunction[]> = {
  warmup: ["describe", "preferences", "experience"],
  description: ["describe", "compare", "explain"],
  story: ["narrate", "experience"],
  opinion: ["explain", "recommend", "persuade"],
  role_play: ["inquire", "hypothesize", "persuade"],
  wrap: ["preferences", "experience"],
};

function tierForStage(stage: AdaptiveStage): QuestionTier {
  if (stage === "Emerging") return "novice";
  if (stage === "Developing") return "intermediate";
  if (stage === "Expanding" || stage === "Confident") return "advanced";
  return "superior";
}

function normalized(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function selectQuestionBankPrompt(input: {
  adaptiveStage: AdaptiveStage;
  interviewStage: InterviewStage;
  askedPrompts: readonly string[];
  turnNumber: number;
}): string | null {
  const tier = tierForStage(input.adaptiveStage);
  const preferredFunctions = functionsByStage[input.interviewStage];
  const asked = new Set(input.askedPrompts.map(normalized));
  const candidates = conversationQuestionBank.filter((question) => question.tier === tier && preferredFunctions.includes(question.function) && !asked.has(normalized(question.prompt)));
  if (!candidates.length) return null;
  const seed = Math.max(0, input.turnNumber - 1);
  return candidates[(seed * 37) % candidates.length]?.prompt ?? null;
}
