import type { InterviewStage } from "./time-plan";

// Quote the learner's own words rather than inventing a topic or changing subjects.
export function createLocalizedGroundedPrompt(locale: string, response: string, stage: InterviewStage, turn: number): string {
  const detail = response.split(/[.!?。！？]/)[0].trim().slice(0, 100);
  const prompts: Record<string, string[]> = {
    es: [`¿Qué disfrutas de «${detail}» y por qué?`, `Describe una experiencia concreta relacionada con «${detail}». ¿Qué ocurrió?`, `¿Qué cambiarías respecto a «${detail}» y por qué?`, `Para terminar, ¿qué te gustaría hacer esta semana?`],
    fr: [`Qu’appréciez-vous dans «${detail}» et pourquoi ?`, `Racontez une expérience précise liée à «${detail}». Que s’est-il passé ?`, `Que changeriez-vous concernant «${detail}» et pourquoi ?`, `Pour terminer, qu’aimeriez-vous faire cette semaine ?`],
    ja: [`「${detail}」について、どのようなところが好きですか。なぜですか。`, `「${detail}」に関する具体的な経験を話してください。何が起こりましたか。`, `「${detail}」について、何を変えたいですか。理由を説明してください。`, `最後に、今週は何を楽しみにしていますか。`],
    zh: [`关于“${detail}”，你喜欢哪些方面？为什么？`, `请讲述与“${detail}”有关的一次具体经历。发生了什么？`, `关于“${detail}”，你希望改变什么？为什么？`, `最后，你这周有什么期待的事情？`],
    sn: [`Chii chaunofarira pa“${detail}”, uye nei?`, `Tsanangura chiitiko chakabatana ne“${detail}”. Chii chakaitika?`, `Chii chaungachinja pa“${detail}”, uye nei?`, `Pakupedzisira, chii chauri kutarisira svondo rino?`],
  };
  const choices = prompts[locale.split("-")[0]] ?? prompts.es;
  const index = stage === "wrap" ? 3 : ["opinion", "role_play"].includes(stage) ? 2 : stage === "story" || turn > 1 ? 1 : 0;
  return choices[index];
}
