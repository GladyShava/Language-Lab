import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

test("selects a Spanish voice ahead of English voices and preserves the requested region", async () => {
  const { selectMayaVoice } = await loadModule("../lib/speech/browser-voice.ts");
  const english = { name: "Microsoft Zira", lang: "en-US", default: true, localService: true };
  const spanish = { name: "Microsoft Pablo", lang: "es-ES" };
  const mexican = { name: "Microsoft Paulina", lang: "es-MX" };
  assert.equal(selectMayaVoice([english, spanish], "es-ES"), spanish);
  assert.equal(selectMayaVoice([english, mexican, spanish], "es-ES"), spanish);
  assert.equal(selectMayaVoice([english, mexican], "es-ES"), mexican);
  assert.equal(selectMayaVoice([english], "es-ES"), null);
  assert.equal(selectMayaVoice([], "es-ES"), null);
});

test("asks natural Spanish questions about the learner's actual interests, including brief answers", async () => {
  const { createSpanishFollowUp } = await loadModule("../lib/conversation/spanish-prompts.ts");
  const turn = (role, text) => ({ role, text });
  for (const [answer, expected] of [
    ["Soy estudiante y me gusta aprender idiomas con mis amigos.", /idiomas/],
    ["Me gusta cocinar.", /cocinar|plato|cocinas/],
    ["Juego al fútbol.", /actividad|practicar/],
    ["Vivo en Madrid.", /lugar/],
    ["Estudio medicina.", /estudios|clases/],
    ["No trabajo; estoy buscando empleo.", /trabajo/],
    ["Soy estudiante y no trabajo.", /estudios/],
    ["Toco el piano.", /música/],
  ]) {
    const question = createSpanishFollowUp([turn("learner", answer)], "warmup");
    assert.match(question, expected, answer);
    assert.match(question, /¿.+\?/);
    assert.doesNotMatch(question, /[«»“”]|necesito.*detalle|Qué disfrutas de/i);
    assert.ok(!question.includes(answer));
  }
  const history = [turn("learner", "Me gusta cocinar."), turn("coach", "¿Qué te gusta cocinar y cómo lo preparas?"), turn("learner", "Porque me relaja.")];
  assert.match(createSpanishFollowUp(history, "description"), /plato|cocinas|cocina/);
  const familyDetail = [turn("learner", "Me gusta cocinar."), turn("coach", "¿Cómo aprendiste a preparar ese plato?"), turn("learner", "Mi abuela me enseñó cuando tenía siete años.")];
  assert.match(createSpanishFollowUp(familyDetail, "description"), /abuela.*cocinas/);
  assert.doesNotMatch(createSpanishFollowUp(familyDetail, "description"), /tradición familiar|juntos en tu familia/);
  familyDetail.push(turn("coach", "¿Qué consejo de tu abuela recuerdas cuando cocinas?"), turn("learner", "Sí."));
  assert.match(createSpanishFollowUp(familyDetail, "description"), /cocinar|plato|cocinas/);
  assert.doesNotMatch(createSpanishFollowUp(familyDetail, "description"), /cómo aprendiste/i);
  const changedTopic = [turn("learner", "Trabajo en una oficina."), turn("coach", "¿Cómo es un día normal en tu trabajo?"), turn("learner", "No trabajo ahora, soy estudiante.")];
  assert.match(createSpanishFollowUp(changedTopic, "description"), /estudios|clases/);
  for (let index = 0; index < 6; index++) {
    const question = createSpanishFollowUp(history, "description");
    assert.ok(!history.some(item => item.role === "coach" && item.text === question));
    history.push(turn("coach", question), turn("learner", "Me gusta cocinar con mi familia."));
  }
  assert.doesNotMatch(createSpanishFollowUp([turn("learner", "Estudio medicina.")], "opinion"), /importancia tiene tus estudios/);
  assert.match(createSpanishFollowUp(history, "wrap"), /terminar|despedir/);
});

test("does not mistake Spanish music vocabulary or accented words for English", async () => {
  const { analyzeResponseLanguageUse } = await loadModule("../lib/conversation/target-language.ts");
  assert.equal(analyzeResponseLanguageUse("Toco el piano y estoy practicando la escala de do mayor.", "es-ES").status, "on_target");
  assert.equal(analyzeResponseLanguageUse("También me interesa la educación y conocer otras culturas.", "es-ES").status, "on_target");
  assert.equal(analyzeResponseLanguageUse("Soy estudiante and I really enjoy learning languages.", "es-ES").status, "mixed_language");
});

test("report tasks use transcript evidence instead of requiring the learner to question the interviewer", async () => {
  const { createSimpleFeedback } = await loadModule("../lib/report/simple-feedback.ts");
  const profile = {
    turnsAnalyzed: 1,
    languageUse: { status: "on_target", targetLanguage: "Spanish" },
    responseHistory: [{ signals: { wordCount: 25, repetitionRatio: 0, connectorCount: 2, elaborationCount: 2, directness: "answered", repairStrategyCount: 0 } }],
    dimensions: { curiosityInquiry: { score: 1 } },
  };
  const feedback = createSimpleFeedback(profile);
  assert.ok(feedback.strengths.some(strength => /Reasons or examples/.test(strength)));
  assert.doesNotMatch(feedback.nextStep, /follow-up question|question after/i);
  assert.notEqual(feedback.nextStep, feedback.improvement);
});
