import type { ConversationTurn } from "./types";
import type { InterviewStage } from "./time-plan";

interface Topic {
  match: RegExp;
  subject: string;
  questions: readonly string[];
}

const topics: readonly Topic[] = [
  { match: /busc(?:o|ando) (?:un )?(?:trabajo|empleo)|sin (?:trabajo|empleo)/i, subject: "buscar trabajo", questions: ["¿Qué tipo de trabajo te gustaría encontrar?", "¿Qué es lo más importante para ti a la hora de elegir un trabajo?", "¿Cómo te estás preparando para conseguir ese trabajo?"] },
  { match: /cocin\w*|comida|recetas?|platos?|gastronomía|preparar la cena/i, subject: "la cocina", questions: ["¿Qué te gusta cocinar y cómo lo preparas?", "¿Cómo aprendiste a preparar ese plato?", "¿Qué es lo que más disfrutas cuando cocinas?", "¿Qué plato te gustaría aprender a preparar?"] },
  { match: /fotograf\w*|hacer fotos|tomar fotos|sacar fotos/i, subject: "la fotografía", questions: ["¿Qué te gusta fotografiar y por qué?", "¿Cómo empezaste a interesarte por la fotografía?", "¿Qué hace que una foto sea especial para ti?"] },
  { match: /música|piano|guitarra|instrumento|cantar|canto\b/i, subject: "la música", questions: ["¿Qué tipo de música te gusta más y por qué?", "¿Cómo empezó tu interés por la música?", "¿Qué lugar ocupa la música en tu vida cotidiana?"] },
  { match: /fútbol|baloncesto|béisbol|tenis|deport\w*|natación|nadar|correr|senderismo|caminar/i, subject: "la actividad física", questions: ["¿Qué es lo que más disfrutas de esa actividad?", "¿Cómo empezaste a practicarla?", "¿Cómo organizas tu tiempo para seguir practicando?", "¿Qué le dirías a alguien que quisiera empezar?"] },
  { match: /idiomas?|español|inglés|francés|lenguas?/i, subject: "aprender idiomas", questions: ["¿Qué te motiva a aprender idiomas?", "¿Cómo practicas los idiomas que estás aprendiendo?", "¿Qué es lo que más te cuesta al aprender un idioma?", "¿En qué situaciones te gustaría usar lo que has aprendido?"] },
  { match: /\bleo\b|leer|lectura|libros?|novelas?/i, subject: "la lectura", questions: ["¿Qué tipo de libros te gustan y por qué?", "¿Qué te llamó la atención del último libro que leíste?", "¿Cómo eliges lo que vas a leer?"] },
  { match: /viaj\w*|vacaciones|turismo|visité|visitar|recorr\w*/i, subject: "viajar", questions: ["¿Qué es lo que más disfrutas cuando viajas?", "¿Qué lugar de los que has visitado recuerdas con más cariño?", "¿Cómo sueles organizar tus viajes?"] },
  { match: /estudian\w*|estudio\b|estudiar|estudiando|universidad|carrera|clases?|escuela/i, subject: "tus estudios", questions: ["¿Qué es lo que más te interesa de tus estudios?", "¿Cómo es un día normal para ti cuando tienes clases?", "¿Qué te gustaría hacer cuando termines tus estudios?", "¿Qué te ha resultado más interesante de lo que has aprendido?"] },
  { match: /trabaj\w*|empleo|oficina|profesión|negocio|empresa/i, subject: "tu trabajo", questions: ["¿Cómo es un día normal en tu trabajo?", "¿Qué es lo que más te gusta de tu trabajo?", "¿Qué te gustaría cambiar de tu rutina de trabajo?", "¿Cómo llegaste a trabajar en ese campo?"] },
  { match: /familia|madre|padre|herman[oa]s?|hij[oa]s?|abuel[oa]s?/i, subject: "tu familia", questions: ["¿Qué les gusta hacer juntos en tu familia?", "¿Qué tradición familiar es importante para ti?", "¿Cómo sueles pasar el tiempo con tu familia?"] },
  { match: /mascota|perros?|gatos?|animales/i, subject: "los animales", questions: ["¿Qué es lo que más te gusta de los animales?", "¿Qué has aprendido de tu relación con los animales?", "¿Qué debería tener en cuenta alguien que quisiera tener una mascota?"] },
  { match: /(?:soy|vengo) de\b|vivo en\b|crecí en\b|mi (?:ciudad|pueblo|país|barrio)|ciudad natal/i, subject: "el lugar donde vives o creciste", questions: ["¿Cómo es el lugar que has mencionado?", "¿Qué es lo que más te gusta de ese lugar?", "¿Qué le recomendarías a alguien que fuera a visitarlo?", "¿Qué te gustaría cambiar de ese lugar?"] },
];

const normalize = (text: string) => text.toLocaleLowerCase("es").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function topicIn(text: string): Topic | undefined {
  // Prefer the most recently expressed interest rather than an introductory label.
  const segments = text.split(/[.!?;]|\by (?:me gusta|disfruto|prefiero)\b/i).filter(Boolean).reverse();
  for (const segment of segments) {
    const positive = segment.replace(/\b(?:no|nunca|tampoco)\s+(?:trabajo|estudio|cocino|leo|viajo)\b/gi, "");
    const topic = topics.find(item => item.match.test(positive));
    if (topic) return topic;
  }
  return undefined;
}

export function createSpanishFollowUp(turns: readonly ConversationTurn[], stage: InterviewStage): string {
  const learnerTurns = turns.filter(turn => turn.role === "learner");
  const latest = learnerTurns.at(-1)?.text.trim() ?? "";
  const asked = new Set(turns.filter(turn => turn.role === "coach").map(turn => normalize(turn.text)));
  const pick = (candidates: readonly string[]) => candidates.find(question => !asked.has(normalize(question)));
  if (stage === "wrap") return pick(["Para terminar, ¿qué te gustaría hacer esta semana?", "Antes de despedirnos, ¿qué te gustaría practicar la próxima vez?"]) ?? "¿Qué te gustaría contarme antes de terminar?";

  const previousQuestion = turns.filter(turn => turn.role === "coach").at(-1)?.text ?? "";
  const previousTopic = topicIn(previousQuestion)
    ?? learnerTurns.slice(0, -1).reverse().map(turn => topicIn(turn.text)).find(Boolean);
  let topic = topicIn(latest);
  const answeringFollowUp = /^(?:sí|no|porque|pues|desde|cuando|con|en|a veces|empecé|aprendí|mi abuela|mi abuelo|mi madre|mi padre|mi profesor|mi profesora)(?=\s|[,.:;!?]|$)/i.test(latest);
  const familyDetail = /^(?:mi abuela|mi abuelo|mi madre|mi padre|mi profesor|mi profesora)(?=\s|[,.:;!?]|$)/i.test(latest);
  if (previousTopic && answeringFollowUp && (!topic || familyDetail)) topic = previousTopic;
  // Resolve short replies such as 'porque me relaja' using the actual conversation.
  if (!topic && /^(?:sí|no|porque|pues|eso|esa|ese|me|lo|la|es|son|desde|cuando|con|en|a veces)(?=\s|[,.:;!?]|$)/i.test(latest)) {
    topic = previousTopic;
  }
  if (!topic) return pick(["¿Qué es lo que más te interesa de lo que acabas de contar?", "¿Puedes contarme un poco más sobre eso?", "¿Cómo empezó ese interés?", "¿Qué te gustaría hacer después?"]) ?? "¿Qué más te gustaría contarme sobre eso?";

  const connected: string[] = [];
  if (topic.subject === "la cocina") {
    if (/mi abuela/i.test(latest)) connected.push("¿Qué consejo de tu abuela recuerdas cuando cocinas?");
    if (/mi (?:madre|mamá)/i.test(latest)) connected.push("¿Qué receta de tu madre te gusta preparar más?");
    if (/relaja|relajar|tranquil/i.test(latest)) connected.push("¿Qué parte de cocinar te ayuda a relajarte?");
    if (/\barroz\b/i.test(latest)) connected.push("¿Cómo preparas el arroz para que quede a tu gusto?");
    if (/\bpaella\b/i.test(latest)) connected.push("¿Qué ingredientes te gusta usar en la paella?");
  }
  if (topic.subject === "tus estudios" && /difícil|cuesta|complicad/i.test(latest)) connected.push("¿Qué es lo que más te cuesta de tus estudios y cómo lo estás afrontando?");
  if (/^¿Cómo (?:aprendiste|empezaste)/.test(previousQuestion) && /niñ[oa]|pequeñ[oa]|años/i.test(latest)) connected.push("¿Cómo ha cambiado tu manera de practicar desde que empezaste?");

  const probes = stage === "story"
    ? [`Cuéntame una experiencia que recuerdes especialmente y que tenga que ver con ${topic.subject}. ¿Qué pasó?`]
    : stage === "opinion"
      ? [`¿Qué es lo que más valoras de ${topic.subject}? Explícame por qué.`]
      : stage === "role_play"
        ? [`Imagina que alguien no comparte tu interés por ${topic.subject}. ¿Cómo le explicarías tu punto de vista?`]
        : [];
  // Brief answers are valid; deepen the topic rather than rejecting their word count.
  const comfortable = latest.split(/\s+/).length < 6;
  return pick([...connected, ...(comfortable ? [] : probes), ...topic.questions,
    `¿Qué te gustaría aprender o mejorar en relación con ${topic.subject}?`,
    `¿Qué consejo darías a alguien que quisiera saber más sobre ${topic.subject}?`,
    `¿Cómo te gustaría que cambiara tu relación con ${topic.subject} en el futuro?`,
  ]) ?? `¿Qué más te gustaría contarme sobre ${topic.subject}?`;
}
