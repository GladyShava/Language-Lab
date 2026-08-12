import type { LanguagePackDefinition } from "./types";

interface StarterPackInput {
  id: string;
  localeTag: string;
  displayName: string;
  nativeName: string;
  objectiveId: string;
  title: string;
  description: string;
  prompt: string;
  exampleId: string;
  exampleTitle: string;
  example: string;
  coachingNote: string;
}

function createStarterPack(input: StarterPackInput): LanguagePackDefinition {
  return {
    pack: {
      id: input.id,
      localeTag: input.localeTag,
      displayName: input.displayName,
      nativeName: input.nativeName,
      direction: "ltr",
      version: "1.0.0",
      status: "active",
    },
    objectives: [{
      id: input.objectiveId,
      languagePackId: input.id,
      slug: "tell-me-about-yourself",
      title: input.title,
      description: input.description,
      prompt: input.prompt,
      category: "warm_up",
      sequence: 1,
      estimatedMinutes: 8,
      isActive: true,
    }],
    fluentExamples: [{
      id: input.exampleId,
      languagePackId: input.id,
      objectiveId: input.objectiveId,
      title: input.exampleTitle,
      content: input.example,
      coachingNote: input.coachingNote,
      audioStorageKey: null,
      sequence: 1,
    }],
  };
}

export const spanishStarterPack = createStarterPack({
  id: "lang_es_es_v1",
  localeTag: "es-ES",
  displayName: "Spanish",
  nativeName: "Español",
  objectiveId: "obj_es_warmup",
  title: "Cuéntame sobre ti",
  description: "Empieza con una conversación cómoda sobre tu vida, tus estudios y tus intereses.",
  prompt: "Cuéntame sobre ti.",
  exampleId: "fluent_es_intro_01",
  exampleTitle: "Una presentación personal clara",
  example: "Estudio gestión global porque me interesa trabajar con personas de diferentes culturas. Me gusta aprender cómo se comunican los equipos internacionales. En mi tiempo libre, disfruto caminar, cocinar y conocer lugares nuevos.",
  coachingNote: "Observa cómo la respuesta conecta los estudios, la motivación y los intereses personales.",
});

export const frenchStarterPack = createStarterPack({
  id: "lang_fr_fr_v1",
  localeTag: "fr-FR",
  displayName: "French",
  nativeName: "Français",
  objectiveId: "obj_fr_warmup",
  title: "Parlez-moi de vous",
  description: "Commencez par une conversation simple sur votre vie, vos études et vos centres d’intérêt.",
  prompt: "Parlez-moi de vous.",
  exampleId: "fluent_fr_intro_01",
  exampleTitle: "Une présentation personnelle claire",
  example: "J’étudie la gestion globale parce que j’aime travailler avec des personnes de cultures différentes. Je m’intéresse à la communication dans les équipes internationales. Pendant mon temps libre, j’aime marcher, cuisiner et découvrir de nouveaux endroits.",
  coachingNote: "Remarquez comment la réponse relie les études, la motivation et les intérêts personnels.",
});

export const japaneseStarterPack = createStarterPack({
  id: "lang_ja_jp_v1",
  localeTag: "ja-JP",
  displayName: "Japanese",
  nativeName: "日本語",
  objectiveId: "obj_ja_warmup",
  title: "あなた自身について教えてください",
  description: "生活、勉強、興味について自然な会話から始めます。",
  prompt: "あなた自身について教えてください。",
  exampleId: "fluent_ja_intro_01",
  exampleTitle: "分かりやすい自己紹介",
  example: "私はグローバル経営を勉強しています。異なる文化を持つ人たちと働くことに興味があるからです。自由な時間には、料理をしたり、新しい場所を訪れたりするのが好きです。",
  coachingNote: "勉強、理由、個人的な興味が順番に説明されている点に注目してください。",
});

export const mandarinStarterPack = createStarterPack({
  id: "lang_zh_cn_v1",
  localeTag: "zh-CN",
  displayName: "Mandarin Chinese",
  nativeName: "普通话",
  objectiveId: "obj_zh_warmup",
  title: "请介绍一下你自己",
  description: "从你的生活、学习和兴趣开始自然对话。",
  prompt: "请介绍一下你自己。",
  exampleId: "fluent_zh_intro_01",
  exampleTitle: "清楚的自我介绍",
  example: "我学习全球管理，因为我喜欢和来自不同文化背景的人一起工作。我对国际团队的沟通方式很感兴趣。空闲的时候，我喜欢做饭、散步，也喜欢去新的地方。",
  coachingNote: "注意回答如何依次介绍学习、原因和个人兴趣。",
});

export const shonaStarterPack = createStarterPack({
  id: "lang_sn_zw_v1",
  localeTag: "sn-ZW",
  displayName: "Shona (pilot)",
  nativeName: "ChiShona",
  objectiveId: "obj_sn_warmup",
  title: "Ndapota ndiudze nezvako",
  description: "Tanga nehurukuro yakasununguka pamusoro pako, zvidzidzo zvako nezvaunofarira.",
  prompt: "Ndapota ndiudze nezvako.",
  exampleId: "fluent_sn_intro_01",
  exampleTitle: "Kuzvisuma zvakajeka",
  example: "Ndinodzidza manejimendi epasi rose nokuti ndinofarira kushanda nevanhu vanobva mutsika dzakasiyana. Ndinofarira kudzidza nzira dzinotaurirana nadzo zvikwata zvemarudzi akasiyana. Kana ndakasununguka, ndinofarira kubika, kufamba-famba uye kushanyira nzvimbo itsva.",
  coachingNote: "Cherechedza kuti mhinduro iyi inotaura nezvezvidzidzo, chikonzero chokuzvisarudza uye zvinofarirwa nemunhu.",
});

export const additionalStarterPacks = [
  spanishStarterPack,
  frenchStarterPack,
  japaneseStarterPack,
  mandarinStarterPack,
  shonaStarterPack,
];
