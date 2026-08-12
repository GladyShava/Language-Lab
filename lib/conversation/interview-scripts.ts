export interface LocalizedInterviewScript {
  opening(name: string): string;
  noSpeech: string;
  elaborate: string;
  closing: string;
  followUps: readonly string[];
}

const scripts: Record<string, LocalizedInterviewScript> = {
  "lang_es_es_v1": {
    opening: (name) => `Hola ${name}, me llamo Maya. Seré tu entrevistadora hoy. Para empezar, cuéntame sobre ti.`,
    noSpeech: "Lo siento, no pude oír una respuesta. Por favor, inténtalo de nuevo.",
    elaborate: "Has comenzado a responder, pero necesito un poco más de detalle. ¿Puedes ampliar tu respuesta?",
    closing: "Gracias por practicar conmigo hoy. Tu conversación se ha guardado y ahora puedes revisar tu grabación y la transcripción.",
    followUps: [
      "Mencionaste algunos aspectos de tu vida. ¿Qué te gusta hacer en tu tiempo libre y por qué?",
      "Ahora, describe tu ciudad natal u otro lugar importante para ti. ¿Cómo es y qué lo hace especial?",
      "Cuéntame sobre un viaje o acontecimiento memorable. ¿Qué ocurrió primero, qué pasó después y cómo terminó?",
      "¿Cómo ha cambiado la tecnología la educación? Explica tu opinión y da un ejemplo.",
      "Imagina que tuvieras dinero ilimitado para mejorar una parte de tu comunidad. ¿Qué cambiarías y por qué?",
      "Imagina que tu equipaje se perdió en el aeropuerto. Yo trabajo para la aerolínea; explícame el problema y pídeme ayuda.",
      "Para terminar con algo más relajado, ¿qué planes tienes para este fin de semana?",
      "¿Qué tema te gustaría conversar en tu próxima práctica?",
    ],
  },
  "lang_fr_fr_v1": {
    opening: (name) => `Bonjour ${name}, je m’appelle Maya. Je serai votre interlocutrice aujourd’hui. Pour commencer, parlez-moi de vous.`,
    noSpeech: "Je suis désolée, je n’ai pas entendu de réponse. Veuillez réessayer.",
    elaborate: "Vous avez commencé à répondre, mais j’ai besoin d’un peu plus de détails. Pouvez-vous développer votre réponse ?",
    closing: "Merci d’avoir pratiqué avec moi aujourd’hui. Votre conversation a été enregistrée et vous pouvez maintenant écouter votre voix et consulter la transcription.",
    followUps: [
      "Vous avez mentionné quelques aspects de votre vie. Qu’aimez-vous faire pendant votre temps libre, et pourquoi ?",
      "Maintenant, décrivez votre ville natale ou un autre lieu important pour vous. Comment est ce lieu et pourquoi est-il mémorable ?",
      "Racontez-moi un voyage ou un événement mémorable. Que s’est-il passé au début, ensuite, et à la fin ?",
      "Comment la technologie a-t-elle changé l’éducation ? Expliquez votre opinion et donnez un exemple.",
      "Imaginez que vous ayez une somme d’argent illimitée pour améliorer votre communauté. Que changeriez-vous, et pourquoi ?",
      "Imaginez que vos bagages aient été perdus à l’aéroport. Je travaille pour la compagnie aérienne ; expliquez-moi le problème et demandez de l’aide.",
      "Pour terminer plus tranquillement, quels sont vos projets pour ce week-end ?",
      "Quel sujet aimeriez-vous aborder lors de votre prochaine conversation ?",
    ],
  },
  "lang_ja_jp_v1": {
    opening: (name) => `${name}さん、こんにちは。私はマヤです。今日はインタビュアーを務めます。まず、あなた自身について教えてください。`,
    noSpeech: "すみません、回答が聞き取れませんでした。もう一度答えてください。",
    elaborate: "質問に答え始めていますが、もう少し詳しく話してください。",
    closing: "今日は一緒に練習してくれてありがとうございました。会話は保存されました。録音と文字起こしを確認できます。",
    followUps: [
      "あなたの生活についていくつか話してくれました。自由な時間には何をするのが好きですか。なぜですか。",
      "次に、あなたの故郷、またはあなたにとって大切な場所について説明してください。どのような場所で、なぜ心に残っていますか。",
      "思い出に残っている旅行や出来事について話してください。最初に何が起こり、その後どうなり、最後はどうなりましたか。",
      "テクノロジーは教育をどのように変えましたか。あなたの意見と具体例を説明してください。",
      "地域をよくするために無制限のお金があると想像してください。何を変えたいですか。なぜですか。",
      "空港で荷物がなくなったと想像してください。私は航空会社の職員です。問題を説明して、助けを求めてください。",
      "最後に、今週末は何をする予定ですか。",
      "次の会話では、どのような話題について話したいですか。",
    ],
  },
  "lang_zh_cn_v1": {
    opening: (name) => `${name}，你好。我叫玛雅，今天由我来和你进行面试。首先，请介绍一下你自己。`,
    noSpeech: "对不起，我没有听到你的回答。请再试一次。",
    elaborate: "你已经开始回答这个问题了，不过我还需要更多细节。请再详细说明一下。",
    closing: "感谢你今天和我一起练习。对话已经保存，你现在可以回听录音并查看文字记录。",
    followUps: [
      "你刚才介绍了生活中的一些方面。你空闲时喜欢做什么？为什么？",
      "现在，请描述你的家乡，或者一个对你很重要的地方。那里是什么样的？为什么让你难忘？",
      "请讲一次难忘的旅行或经历。最先发生了什么？后来怎么样？最后结果如何？",
      "科技怎样改变了教育？请说明你的看法，并举一个例子。",
      "假设你有无限的资金来改善社区的一个方面。你会改变什么？为什么？",
      "假设你的行李在机场丢失了。我是航空公司的工作人员，请说明问题并向我求助。",
      "最后轻松一点，你这个周末有什么计划？",
      "下次练习时，你想谈论什么话题？",
    ],
  },
  "lang_sn_zw_v1": {
    opening: (name) => `Mhoro ${name}. Zita rangu ndiMaya. Ndini ndichakubvunzurudza nhasi. Kutanga, ndapota ndiudze nezvako.`,
    noSpeech: "Pamusoroi, handina kunzwa zvawataura. Ndapota pindura zvakare.",
    elaborate: "Watanga kupindura, asi ndapota ndiudze zvimwe.",
    closing: "Ndatenda nekudzidzira neni nhasi. Hurukuro yako yachengetwa, uye zvino unogona kuteerera zvakarekodhwa uye kuverenga zvakanyorwa.",
    followUps: [
      "Chii chaunofarira kuita kana wakasununguka? Sei uchichifarira?",
      "Nditsanangurire kwaunobva, kana imwe nzvimbo yakakosha kwauri. Nzvimbo yacho yakaita sei? Nei yakakosha kwauri?",
      "Rondedzera rwendo kana chiitiko chausingakanganwi. Chii chakatanga kuitika? Chii chakazoitika? Zvakaguma sei?",
      "Tekinoroji yashandura sei dzidzo? Tsanangura pfungwa dzako uye upe muenzaniso.",
      "Dai waiva nemari yakawanda kwazvo yokuvandudza nharaunda yako, waizoshandura chii? Sei?",
      "Fungidzira kuti mukwende wako warasika panhandare yendege. Ini ndinoshanda kukambani yendege. Nditsanangurire dambudziko racho uye kumbira rubatsiro.",
      "Une zvirongwa zvipi zvekupera kwevhiki?",
      "Inyaya ipi yaungada kutaura nezvayo paunodzidzira zvakare?",
    ],
  },
};

export function getLocalizedInterviewScript(languagePackId: string): LocalizedInterviewScript | null {
  return scripts[languagePackId] ?? null;
}
