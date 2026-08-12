import type { ConversationTurn } from "./types";

export type ResponseOutcome = "answered" | "partially_answered" | "did_not_answer";

type PromptKind =
  | "introduction"
  | "work_studies"
  | "background"
  | "family"
  | "hobby"
  | "free_time"
  | "hometown"
  | "event"
  | "technology"
  | "daily_routine"
  | "community"
  | "study_abroad"
  | "role_play"
  | "weekend"
  | "next_topic"
  | "unknown";

export interface ResponseAssessment {
  outcome: ResponseOutcome;
  promptKind: PromptKind;
  topic: string | null;
  noUsableSpeech: boolean;
}

const wordCount = (text: string) => text.match(/[\p{L}\p{M}'-]+/gu)?.length ?? 0;
const matches = (text: string, expression: RegExp) => expression.test(text);
const spokenOnly = (text: string) => text.startsWith("[Spoken response recorded");
const firstPerson = /\b(i|i'm|i’ve|i've|i’d|i'd|my|me|we|our)\b/i;

export function inferPromptKind(prompt: string): PromptKind {
  const text = prompt.toLowerCase();
  if (/tell me about yourself|learn about you|details about you/.test(text)) return "introduction";
  if (/work or studies|work.*meaningful|studies.*meaningful/.test(text)) return "work_studies";
  if (/background|place influenced|person you are today/.test(text)) return "background";
  if (/family|values or choices/.test(text)) return "family";
  if (/recent moment|really enjoyed it/.test(text)) return "hobby";
  if (/free time/.test(text)) return "free_time";
  if (/hometown|place that is important/.test(text)) return "hometown";
  if (/memorable trip|memorable event|what happened first/.test(text)) return "event";
  if (/technology.*education|education.*technology/.test(text)) return "technology";
  if (/typical day|morning to evening|daily routine/.test(text)) return "daily_routine";
  if (/unlimited money|improve.*community|community.*change/.test(text)) return "community";
  if (/studying abroad|study abroad/.test(text)) return "study_abroad";
  if (/luggage|airline|airport/.test(text)) return "role_play";
  if (/plans for this weekend|weekend plans/.test(text)) return "weekend";
  if (/topic.*next conversation|next conversation.*topic/.test(text)) return "next_topic";
  return "unknown";
}

function detectTopic(text: string): string | null {
  const topics: Array<[RegExp, string]> = [
    [/\b(dog|dogs|puppy|puppies)\b/i, "dogs"],
    [/\b(cat|cats|kitten|kittens)\b/i, "cats"],
    [/\b(pet|pets|animal|animals)\b/i, "animals"],
    [/\b(football|soccer|basketball|sport|sports)\b/i, "sports"],
    [/\b(food|cooking|restaurant|meal)\b/i, "food"],
    [/\b(weather|rain|sunny|storm)\b/i, "the weather"],
    [/\b(technology|computer|phone|internet|ai)\b/i, "technology"],
  ];
  return topics.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function assessResponse(prompt: string, response: string): ResponseAssessment {
  const text = response.trim();
  const count = wordCount(text);
  const promptKind = inferPromptKind(prompt);
  const topic = detectTopic(text);

  if (!text || spokenOnly(text)) return { outcome: "did_not_answer", promptKind, topic, noUsableSpeech: true };

  const hasFirstPerson = matches(text, firstPerson);
  let relevant = false;
  let developed = count >= 10;

  switch (promptKind) {
    case "introduction":
      relevant = hasFirstPerson && matches(text, /\b(am|from|live|work|study|student|family|enjoy|like|hobby|career|name)\b/i);
      developed = developed && relevant;
      break;
    case "work_studies":
      relevant = hasFirstPerson && matches(text, /\b(work|job|career|study|studies|student|class|school|university|learn|course)\b/i);
      developed = developed && matches(text, /\b(because|meaningful|enjoy|like|helps|important|allows)\b/i);
      break;
    case "background":
      relevant = hasFirstPerson && matches(text, /\b(from|grew up|live|lived|moved|city|town|country|home|community|background)\b/i);
      developed = developed && matches(text, /\b(influenced|taught|shaped|because|made me|helped me)\b/i);
      break;
    case "family":
      relevant = hasFirstPerson && matches(text, /\b(family|parent|parents|mother|father|sister|brother|relative|relatives)\b/i);
      developed = developed && matches(text, /\b(value|values|influenced|taught|choice|choices|because|learned)\b/i);
      break;
    case "hobby":
    case "free_time":
      relevant = hasFirstPerson && matches(text, /\b(enjoy|like|love|hobby|free time|read|reading|music|sport|sports|cook|cooking|travel|game|games)\b/i);
      developed = developed && matches(text, /\b(because|when|recent|last|makes me|helps me)\b/i);
      break;
    case "hometown":
      relevant = hasFirstPerson && matches(text, /\b(hometown|city|town|village|country|place|home|neighborhood|community|located|near)\b/i);
      developed = developed && matches(text, /\b(because|memorable|known for|there is|there are|has|with)\b/i);
      break;
    case "event":
      relevant = matches(text, /\b(yesterday|last|ago|was|were|went|visited|traveled|travelled|happened|did|had)\b/i);
      developed = count >= 14 && relevant && matches(text, /\b(first|then|next|after|before|finally|eventually|when)\b/i);
      break;
    case "technology":
      relevant = matches(text, /\b(technology|digital|online|computer|internet|ai)\b/i) && matches(text, /\b(education|student|students|teacher|teachers|learning|school)\b/i);
      developed = developed && matches(text, /\b(because|however|for example|advantage|disadvantage|impact|changed|allows)\b/i);
      break;
    case "daily_routine":
      relevant = hasFirstPerson && matches(text, /\b(morning|afternoon|evening|daily|routine|usually|every day|wake|work|study|class)\b/i);
      developed = developed && matches(text, /\b(first|then|after|before|finally|because|most important)\b/i);
      break;
    case "community":
      relevant = matches(text, /\b(community|city|town|neighborhood|people|public|school|library|transport|health)\b/i)
        && matches(text, /\b(would|could|improve|change|build|create|invest|help)\b/i);
      developed = developed && matches(text, /\b(because|if|impact|so that|would help|reason)\b/i);
      break;
    case "study_abroad":
      relevant = matches(text, /\b(study|studying|student|students|education)\b/i) && matches(text, /\b(abroad|another country|foreign|international)\b/i);
      developed = developed && matches(text, /\b(advantage|disadvantage|benefit|however|although|but|opinion|because)\b/i);
      break;
    case "role_play":
      relevant = matches(text, /\b(luggage|bag|bags|suitcase|flight|airport|airline|lost|missing)\b/i);
      developed = developed && matches(text, /\b(help|please|need|could|would|claim|find|deliver|contact)\b/i);
      break;
    case "weekend":
      relevant = hasFirstPerson && matches(text, /\b(weekend|saturday|sunday|plan|plans|will|going to|hope to)\b/i);
      developed = count >= 7 && relevant;
      break;
    case "next_topic":
      relevant = hasFirstPerson && matches(text, /\b(topic|discuss|talk about|interested|enjoy|like|want)\b/i);
      developed = count >= 7 && relevant;
      break;
    default:
      relevant = count >= 5;
      developed = count >= 10;
  }

  return {
    outcome: developed ? "answered" : relevant ? "partially_answered" : "did_not_answer",
    promptKind,
    topic,
    noUsableSpeech: false,
  };
}

const retryPrompts: Record<PromptKind, string> = {
  introduction: "Could you tell me about yourself—where you’re from, what you do, and something you enjoy?",
  work_studies: "What do you enjoy most about your work or studies, and why is it meaningful to you?",
  background: "How has the place you come from influenced the person you are today?",
  family: "How has your family influenced your values or choices?",
  hobby: "Can you describe a recent moment when you enjoyed that activity?",
  free_time: "What do you enjoy doing in your free time, and why?",
  hometown: "Please describe your hometown or another important place and explain what makes it memorable.",
  event: "Please tell the story of a memorable trip or event from beginning to end.",
  technology: "How has technology changed education? Explain your opinion and give an example.",
  daily_routine: "Please describe your typical day from morning to evening.",
  community: "If you had unlimited money, what would you change in your community, and why?",
  study_abroad: "What are the advantages and disadvantages of studying abroad?",
  role_play: "Your luggage is missing. Please explain the problem to me as the airline employee and ask for help.",
  weekend: "What are your plans for this weekend?",
  next_topic: "What topic would you like to discuss in your next conversation?",
  unknown: "Could you answer the question I just asked?",
};

const promptFocus: Record<PromptKind, string> = {
  introduction: "you",
  work_studies: "your work or studies",
  background: "your background",
  family: "your family’s influence",
  hobby: "a recent experience with your hobby",
  free_time: "your free-time activities",
  hometown: "your hometown or an important place",
  event: "a memorable trip or event",
  technology: "technology and education",
  daily_routine: "your daily routine",
  community: "a change you would make in your community",
  study_abroad: "the advantages and disadvantages of studying abroad",
  role_play: "the missing-luggage situation",
  weekend: "your weekend plans",
  next_topic: "a topic for your next conversation",
  unknown: "the question",
};

export function createRepairResponse(assessment: ResponseAssessment): string {
  const retry = retryPrompts[assessment.promptKind];
  if (assessment.noUsableSpeech) return `I’m sorry, I didn’t catch an answer. ${retry}`;
  if (assessment.outcome === "partially_answered") {
    return `You began to address the question, but I need a little more detail. ${retry}`;
  }
  const heard = assessment.topic ? `I heard you talking about ${assessment.topic}, but ` : "";
  return `${heard}my question was about ${promptFocus[assessment.promptKind]}. ${retry}`.replace(/^m/, "M");
}

export function countAnsweredResponses(turns: readonly ConversationTurn[]): number {
  let activePrompt = "";
  let answered = 0;
  for (const turn of turns) {
    if (turn.role === "coach") {
      activePrompt = turn.text;
      continue;
    }
    if (assessResponse(activePrompt, turn.text).outcome === "answered") answered += 1;
  }
  return answered;
}
