import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function loadWorker(label) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${label}`);
  return (await import(workerUrl.href)).default;
}

const runtimeEnv = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const runtimeContext = { waitUntil() {}, passThroughOnException() {} };

async function startAdaptiveSession(worker, label = "Alex") {
  const response = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: label, practiceMinutes: 15 }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 200);
  return response.json();
}

async function sendAdaptiveResponse(worker, session, text, remainingSeconds = 700) {
  const response = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "respond", sessionId: session.snapshot.sessionId, storageMode: session.storageMode, text, practiceMinutes: 15, remainingSeconds }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 200);
  return response.json();
}

const adaptiveAnswers = [
  "I am a graduate student who works with international teams because I value cross-cultural learning. For example, I help classmates explain complex ideas. What do you think makes collaboration effective? I mean, supporting people from different backgrounds is a valuable opportunity.",
  "My studies are meaningful because they connect theory with practical projects. For example, compared with individual work, international teamwork challenges me to explain decisions more precisely. How would you approach that challenge? In other words, I learn by negotiating different perspectives.",
  "My hometown is a diverse desert city with strong communities. Compared with the smaller town where I lived before, it offers more opportunities; however, growth also creates transportation challenges. In other words, it taught me to balance independence with community responsibility. What do you think growing cities should protect?",
];

async function reachAdvancedStage(worker) {
  const session = await startAdaptiveSession(worker);
  const profiles = [];
  for (let index = 0; index < adaptiveAnswers.length; index += 1) {
    const result = await sendAdaptiveResponse(worker, session, adaptiveAnswers[index], 780 - index * 90);
    profiles.push(result.rubricProfile);
  }
  return { session, profiles };
}

test("creates and remembers a student account profile", async () => {
  const worker = await loadWorker("profile-flow");
  const createResponse = await worker.fetch(new Request("http://localhost/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      asuEmail: "alex.morgan@asu.edu",
      password: "GlobalPractice26!",
      preferredFirstName: "Alex",
      surname: "Morgan",
      classCohort: "Spring 26",
      nativeLanguage: "Shona",
      targetLanguagePackId: "lang_en_us_v1",
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  assert.equal(created.profile.preferredFirstName, "Alex");
  assert.equal(created.profile.surname, "Morgan");
  assert.equal(created.profile.classCohort, "Spring 26");
  assert.equal(created.profile.nativeLanguage, "Shona");
  assert.equal(created.profile.targetLanguagePackId, "lang_en_us_v1");
  assert.equal(created.profile.asuEmail, "alex.morgan@asu.edu");
  assert.equal("password" in created.profile, false);
  assert.equal("passwordHash" in created.profile, false);
  assert.equal("passwordSalt" in created.profile, false);

  const cookie = createResponse.headers.get("set-cookie");
  assert.ok(cookie);
  const readResponse = await worker.fetch(new Request("http://localhost/api/profile", { headers: { cookie } }), runtimeEnv, runtimeContext);
  const read = await readResponse.json();
  assert.equal(read.profile.preferredFirstName, "Alex");

  const signInResponse = await worker.fetch(new Request("http://localhost/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "sign_in",
      asuEmail: "ALEX.MORGAN@ASU.EDU",
      password: "GlobalPractice26!",
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(signInResponse.status, 200);
  const signedIn = await signInResponse.json();
  assert.equal(signedIn.profile.id, created.profile.id);
  assert.ok(signInResponse.headers.get("set-cookie"));

  const rejectedSignIn = await worker.fetch(new Request("http://localhost/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "sign_in",
      asuEmail: "alex.morgan@asu.edu",
      password: "WrongPassword!",
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(rejectedSignIn.status, 401);
});

for (const pathname of ["/", "/practice", "/shadow", "/community", "/transcript", "/progress"]) {
  test(`server-renders ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();
    assert.match(html, /AI OPI Conversation Studio/i);
    assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
  });
}

test("builds student-specific progress from completed conversations", async () => {
  const worker = await loadWorker("progress-history");
  const participantKey = "progress-student";
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: "Alex", participantKey, practiceMinutes: 5 }),
  }), runtimeEnv, runtimeContext);
  assert.equal(startResponse.status, 200);
  const started = await startResponse.json();
  const answer = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "respond", sessionId: started.snapshot.sessionId, storageMode: started.storageMode, text: adaptiveAnswers[0], practiceMinutes: 5, remainingSeconds: 200 }),
  }), runtimeEnv, runtimeContext);
  assert.equal(answer.status, 200);
  const completion = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "complete", sessionId: started.snapshot.sessionId, storageMode: started.storageMode }),
  }), runtimeEnv, runtimeContext);
  assert.equal(completion.status, 200);

  const unauthorized = await worker.fetch(new Request("http://localhost/api/progress"), runtimeEnv, runtimeContext);
  assert.equal(unauthorized.status, 401);
  const progressResponse = await worker.fetch(new Request("http://localhost/api/progress", {
    headers: { cookie: `opi_profile=memory:${participantKey}` },
  }), runtimeEnv, runtimeContext);
  assert.equal(progressResponse.status, 200);
  const progress = await progressResponse.json();
  assert.equal(progress.sessions.length, 1);
  assert.equal(progress.sessions[0].sessionId, started.snapshot.sessionId);
  assert.equal(progress.sessions[0].languageName, "English");
  assert.equal(Object.keys(progress.sessions[0].dimensions).length, 5);
  assert.match(progress.disclaimer, /not ACTFL levels|not.*official ratings/i);
});

test("answers learner questions and recognizes strategic repair language", async () => {
  const worker = await loadWorker("connected-question-and-repair");
  const started = await startAdaptiveSession(worker);
  const questionResponse = await sendAdaptiveResponse(worker, started, adaptiveAnswers[0]);
  assert.match(questionResponse.turns[1].text, /To answer your question/i);
  assert.match(questionResponse.turns[1].text, /collaboration|work or studies/i);
  assert.ok(questionResponse.rubricProfile.responseHistory[0].signals.questionCount >= 1);

  const repaired = await sendAdaptiveResponse(worker, started, "I mean, my studies matter because they help me support international classmates. Another way to say it is that I learn by explaining ideas when our perspectives differ.", 620);
  const latestRubric = repaired.rubricProfile.responseHistory.at(-1);
  assert.ok(latestRubric.signals.repairStrategyCount >= 1);
  assert.match(repaired.turns[1].text, /people|perspectives|event|situation|work|studies/i);
});

test("runs an adaptive practice conversation and saves every turn", async () => {
  const worker = await loadWorker("practice-flow");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: "Alex", practiceMinutes: 15 }),
  }), runtimeEnv, runtimeContext);
  assert.equal(startResponse.status, 200);
  const started = await startResponse.json();
  assert.match(started.snapshot.turns[0].text, /tell me about yourself/i);
  assert.match(started.snapshot.turns[0].text, /Hi Alex, my name is Maya/i);
  assert.equal(started.snapshot.turns[0].role, "coach");

  const response = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "I work with an international education team, and I enjoy helping people communicate clearly.",
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 200);
  const continued = await response.json();
  assert.deepEqual(continued.turns.map((turn) => turn.role), ["learner", "coach"]);
  assert.match(continued.turns[1].text, /work or studies|meaningful/i);

  const savedResponse = await worker.fetch(new Request(`http://localhost/api/practice?sessionId=${started.snapshot.sessionId}&mode=${started.storageMode}`), runtimeEnv, runtimeContext);
  assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json();
  assert.equal(saved.snapshot.turns.length, 3);
  assert.deepEqual(saved.snapshot.turns.map((turn) => turn.sequence), [1, 2, 3]);

  const learnerTurn = continued.turns.find((turn) => turn.role === "learner");
  const recordingForm = new FormData();
  recordingForm.set("audio", new File([new Uint8Array([1, 2, 3, 4])], "answer.webm", { type: "audio/webm" }));
  recordingForm.set("sessionId", started.snapshot.sessionId);
  recordingForm.set("messageId", learnerTurn.id);
  recordingForm.set("durationMs", "1200");
  recordingForm.set("consentGranted", "true");
  recordingForm.set("mode", started.storageMode);
  const recordingResponse = await worker.fetch(new Request("http://localhost/api/practice/recording", { method: "POST", body: recordingForm }), runtimeEnv, runtimeContext);
  assert.equal(recordingResponse.status, 200);
  const recording = await recordingResponse.json();
  assert.match(recording.recording.playbackUrl, /api\/practice\/recording/);

  const recordingListResponse = await worker.fetch(new Request(`http://localhost/api/practice/recording?sessionId=${started.snapshot.sessionId}&mode=${started.storageMode}`), runtimeEnv, runtimeContext);
  const recordingList = await recordingListResponse.json();
  assert.equal(recordingList.recordings.length, 1);
  assert.equal(recordingList.recordings[0].messageId, learnerTurn.id);

  const audioResponse = await worker.fetch(new Request(`http://localhost${recording.recording.playbackUrl}`), runtimeEnv, runtimeContext);
  assert.equal(audioResponse.status, 200);
  assert.equal(audioResponse.headers.get("content-type"), "audio/webm");
});

test("runs localized practice turns for Spanish and Japanese packs", async () => {
  const worker = await loadWorker("localized-practice-flow");
  const cases = [
    {
      languagePackId: "lang_es_es_v1",
      name: "Ana",
      answer: "Soy estudiante y me gusta aprender idiomas con mis amigos.",
      opening: /Hola Ana|cuéntame sobre ti/i,
      followUp: /tiempo libre/i,
    },
    {
      languagePackId: "lang_ja_jp_v1",
      name: "Yuki",
      answer: "私は大学で国際経営を勉強しています。",
      opening: /Yukiさん|教えてください/,
      followUp: /自由な時間/,
    },
  ];

  for (const item of cases) {
    const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", languagePackId: item.languagePackId, participantName: item.name }),
    }), runtimeEnv, runtimeContext);
    assert.equal(startResponse.status, 200);
    const started = await startResponse.json();
    assert.match(started.snapshot.turns[0].text, item.opening);

    const response = await worker.fetch(new Request("http://localhost/api/practice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "respond",
        sessionId: started.snapshot.sessionId,
        storageMode: started.storageMode,
        text: item.answer,
      }),
    }), runtimeEnv, runtimeContext);
    assert.equal(response.status, 200);
    const continued = await response.json();
    assert.match(continued.turns[1].text, item.followUp);
  }
});

test("advances through unused localized questions after answered turns", async () => {
  const worker = await loadWorker("localized-question-memory");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_es_es_v1", participantName: "Ana" }),
  }), runtimeEnv, runtimeContext);
  const started = await startResponse.json();
  const answers = [
    "Soy estudiante de negocios internacionales y disfruto aprender idiomas con otras personas.",
    "En mi tiempo libre leo novelas, camino por el parque y cocino con mi familia.",
    "Mi ciudad natal es grande, diversa y tiene mercados muy interesantes cerca del centro.",
  ];
  const questions = [];

  for (const text of answers) {
    const response = await worker.fetch(new Request("http://localhost/api/practice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "respond",
        sessionId: started.snapshot.sessionId,
        storageMode: started.storageMode,
        text,
        practiceMinutes: 10,
        remainingSeconds: 500,
      }),
    }), runtimeEnv, runtimeContext);
    assert.equal(response.status, 200);
    const continued = await response.json();
    questions.push(continued.turns[1].text);
  }

  assert.equal(new Set(questions).size, questions.length);
});

test("redirects mixed-language French responses and records the language-use flag", async () => {
  const worker = await loadWorker("french-language-consistency");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_fr_fr_v1", participantName: "Camille" }),
  }), runtimeEnv, runtimeContext);
  const started = await startResponse.json();

  const mixedResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "Je suis étudiante et I really enjoy learning languages.",
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(mixedResponse.status, 200);
  const redirected = await mixedResponse.json();
  assert.match(redirected.turns[1].text, /anglais|français/i);
  assert.equal(redirected.rubricProfile.languageUse.status, "mixed_language");
  assert.ok(redirected.rubricProfile.languageUse.englishWords.includes("really"));

  const cleanResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "Je suis étudiante et j’aime apprendre les langues avec mes amis.",
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(cleanResponse.status, 200);
  const continued = await cleanResponse.json();
  assert.doesNotMatch(continued.turns[1].text, /j’ai entendu.*anglais/i);
});

test("accepts a recorded response when automatic transcription is unavailable", async () => {
  const worker = await loadWorker("recording-without-transcript");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: "Alex" }),
  }), runtimeEnv, runtimeContext);
  const started = await startResponse.json();

  const response = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "",
      hasRecording: true,
    }),
  }), runtimeEnv, runtimeContext);

  assert.equal(response.status, 200);
  const continued = await response.json();
  assert.match(continued.turns[0].text, /spoken response recorded/i);
  assert.equal(continued.turns[0].role, "learner");
  assert.equal(continued.turns[1].role, "coach");
  assert.match(continued.turns[1].text, /didn.t catch an answer/i);
  assert.doesNotMatch(continued.turns[1].text, /get to know|helpful picture|sounds important/i);

  const retryResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "I am a student and I enjoy working with people from different cultures.",
    }),
  }), runtimeEnv, runtimeContext);
  const retried = await retryResponse.json();
  assert.match(retried.turns[1].text, /work or studies|meaningful/i);
  assert.doesNotMatch(retried.turns[1].text, /hometown|memorable trip/i);
});

test("checks whether the learner answered before advancing", async () => {
  const worker = await loadWorker("response-relevance");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: "Alex" }),
  }), runtimeEnv, runtimeContext);
  const started = await startResponse.json();

  const offTopicResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "Dogs are very loyal animals and they make wonderful companions for many families.",
    }),
  }), runtimeEnv, runtimeContext);
  const offTopic = await offTopicResponse.json();
  assert.match(offTopic.turns[1].text, /talking about dogs/i);
  assert.match(offTopic.turns[1].text, /question was about you|tell me about yourself/i);
  assert.doesNotMatch(offTopic.turns[1].text, /great|wonderful|excellent|hometown|memorable trip/i);

  const partialResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "I am a student.",
    }),
  }), runtimeEnv, runtimeContext);
  const partial = await partialResponse.json();
  assert.match(partial.turns[1].text, /more detail|tell me about yourself/i);
  assert.doesNotMatch(partial.turns[1].text, /hometown|memorable trip/i);

  const answeredResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "I am a graduate student, I work in education, and I enjoy learning about people from different cultures.",
    }),
  }), runtimeEnv, runtimeContext);
  const answered = await answeredResponse.json();
  assert.match(answered.turns[1].text, /work or studies|meaningful/i);
  assert.doesNotMatch(answered.turns[1].text, /great|wonderful|excellent/i);
});

test("moves through connected OPI-style stages using the learner's latest topic", async () => {
  const worker = await loadWorker("opi-stage-flow");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: "Alex" }),
  }), runtimeEnv, runtimeContext);
  const started = await startResponse.json();
  const answers = [
    "I am a student and I enjoy learning about people from different cultures because it helps me understand new ideas.",
    "I enjoy my studies because I can work with classmates from many countries and learn from their experiences.",
    "My hometown is a busy place near the mountains, with friendly neighborhoods, markets, and many outdoor activities.",
    "Last year I traveled with friends. First we planned the route, then we visited three cities, and finally we returned home because it was our first long trip together.",
    "Technology has changed education because students can learn anywhere. However, online learning also requires discipline and good access.",
    "If I had unlimited money, I would improve public libraries in my community because they give people access to education and technology.",
  ];

  const followUps = [];
  for (const text of answers) {
    const response = await worker.fetch(new Request("http://localhost/api/practice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "respond",
        sessionId: started.snapshot.sessionId,
        storageMode: started.storageMode,
        text,
        practiceMinutes: 15,
        remainingSeconds: 800,
      }),
    }), runtimeEnv, runtimeContext);
    assert.equal(response.status, 200);
    const continued = await response.json();
    followUps.push(continued.turns[1].text);
  }

  assert.match(followUps[1], /work|studies|classmates/i);
  assert.match(followUps[2], /place|hometown|event/i);
  assert.match(followUps[3], /travel|trip|trade-off|broader lesson/i);
  assert.match(followUps[4], /technology|AI tool|school|workplace/i);
  assert.match(followUps[5], /weekend/i);
  assert.ok(followUps.slice(1, 5).every((prompt) => /You (connected|described|mentioned|brought|raised)|I want to stay/i.test(prompt)));
  assert.doesNotMatch(followUps.join(" "), /score|pass|fail|proficiency level|fluent enough/i);

  const completeResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "complete",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(completeResponse.status, 200);
  const completed = await completeResponse.json();
  assert.match(completed.turns[0].text, /saved|review/i);

  const reportResponse = await worker.fetch(
    new Request(`http://localhost/api/practice/report?sessionId=${started.snapshot.sessionId}&mode=${started.storageMode}`),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(reportResponse.status, 200);
  assert.match(reportResponse.headers.get("content-type"), /application\/pdf/i);
  assert.match(reportResponse.headers.get("content-disposition"), /attachment/i);
  const reportBytes = new Uint8Array(await reportResponse.arrayBuffer());
  assert.equal(new TextDecoder().decode(reportBytes.slice(0, 4)), "%PDF");

  const estimateResponse = await worker.fetch(
    new Request(`http://localhost/api/practice?sessionId=${started.snapshot.sessionId}&mode=${started.storageMode}`),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(estimateResponse.status, 200);
  const estimated = await estimateResponse.json();
  assert.equal(estimated.practiceEstimate.level, "Intermediate");
  assert.equal(estimated.practiceEstimate.label, "Intermediate-like evidence");
  assert.equal(estimated.practiceEstimate.evidenceStatus, "ready");
  assert.match(estimated.practiceEstimate.disclaimer, /unofficial AI practice estimate/i);
  assert.match(estimated.practiceEstimate.disclaimer, /not an ACTFL OPI rating/i);
  assert.match(estimated.practiceEstimate.basis, /FACT framework/i);
  assert.match(estimated.practiceEstimate.basis, /pronunciation, stress, intonation, fluency/i);
  assert.deepEqual(
    estimated.practiceEstimate.observations.map((observation) => observation.label),
    ["Functions and tasks", "Accuracy", "Context and content", "Text type"],
  );
  assert.equal(estimated.practiceEstimate.observations[1].status, "not_assessed");
  assert.match(estimated.practiceEstimate.sourceUrl, /actfl\.org/);
});

test("uses the selected duration to reach a natural wind-down", async () => {
  const worker = await loadWorker("timed-wind-down");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: "Alex", practiceMinutes: 2 }),
  }), runtimeEnv, runtimeContext);
  const started = await startResponse.json();

  const firstResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "I am a student from Phoenix and I enjoy studying global business because I meet people from many cultures.",
      practiceMinutes: 2,
      remainingSeconds: 95,
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(firstResponse.status, 200);

  const secondResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "I enjoy my studies because I learn from classmates from many cultures and apply new ideas to real projects.",
      practiceMinutes: 2,
      remainingSeconds: 55,
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(secondResponse.status, 200);
  const windingDown = await secondResponse.json();
  assert.match(windingDown.turns[1].text, /weekend|finish/i);
  assert.doesNotMatch(windingDown.turns[1].text, /score|pass|fail|proficiency/i);
});

test("progresses the adaptive coaching stage one step at a time", async () => {
  const worker = await loadWorker("adaptive-stage-progression");
  const { profiles } = await reachAdvancedStage(worker);
  assert.deepEqual(profiles.map((profile) => profile.currentStage), ["Expanding", "Confident", "Advanced"]);
  assert.deepEqual(profiles.at(-1).stageHistory, ["Expanding", "Confident", "Advanced"]);
});

test("regresses only one coaching stage when performance drops", async () => {
  const worker = await loadWorker("adaptive-stage-regression");
  const { session, profiles } = await reachAdvancedStage(worker);
  assert.equal(profiles.at(-1).currentStage, "Advanced");
  const result = await sendAdaptiveResponse(worker, session, "It was good.", 480);
  assert.equal(result.rubricProfile.currentStage, "Confident");
  assert.equal(result.rubricProfile.stageHistory.at(-1), "Confident");
  assert.match(result.turns[1].text, /memorable|event|question/i);
});

test("returns weighted 1-to-5 rubric scoring output", async () => {
  const worker = await loadWorker("adaptive-scoring-output");
  const session = await startAdaptiveSession(worker);
  const result = await sendAdaptiveResponse(worker, session, adaptiveAnswers[0]);
  const expected = {
    communicationEffectiveness: 0.30,
    vocabularyGrowth: 0.20,
    curiosityInquiry: 0.15,
    confidenceFluency: 0.15,
    strategicCommunication: 0.20,
  };
  assert.deepEqual(Object.keys(result.rubricProfile.dimensions).sort(), Object.keys(expected).sort());
  for (const [key, weight] of Object.entries(expected)) {
    const dimension = result.rubricProfile.dimensions[key];
    assert.equal(dimension.weight, weight);
    assert.ok(dimension.score >= 1 && dimension.score <= 5);
    assert.ok(dimension.evidence.length > 20);
  }
  assert.ok(result.rubricProfile.overallScore >= 1 && result.rubricProfile.overallScore <= 5);
});

test("generates an actionable end-of-conversation coaching summary", async () => {
  const worker = await loadWorker("adaptive-summary");
  const { session } = await reachAdvancedStage(worker);
  const completeResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "complete", sessionId: session.snapshot.sessionId, storageMode: session.storageMode, practiceMinutes: 15, remainingSeconds: 0 }),
  }), runtimeEnv, runtimeContext);
  assert.equal(completeResponse.status, 200);
  const completed = await completeResponse.json();
  assert.ok(completed.rubricProfile.strengths.length >= 1);
  assert.ok(completed.rubricProfile.growthAreas.length >= 1);
  assert.ok(completed.rubricProfile.recommendation.length > 20);
  assert.ok(completed.rubricProfile.strongerPhrase.length > 10);
  assert.match(completed.rubricProfile.disclaimer, /not ACTFL levels|not.*official proficiency/i);
});

test("recomputes the same rubric profile consistently from saved turns", async () => {
  const worker = await loadWorker("adaptive-consistency");
  const { session, profiles } = await reachAdvancedStage(worker);
  const readResponse = await worker.fetch(new Request(`http://localhost/api/practice?sessionId=${session.snapshot.sessionId}&mode=${session.storageMode}`), runtimeEnv, runtimeContext);
  assert.equal(readResponse.status, 200);
  const saved = await readResponse.json();
  assert.equal(saved.rubricProfile.currentStage, profiles.at(-1).currentStage);
  assert.equal(saved.rubricProfile.overallScore, profiles.at(-1).overallScore);
  assert.deepEqual(saved.rubricProfile.stageHistory, profiles.at(-1).stageHistory);
  assert.deepEqual(saved.rubricProfile.dimensions, profiles.at(-1).dimensions);
});

test("does not estimate a level from an incomplete or insufficient sample", async () => {
  const worker = await loadWorker("limited-practice-estimate");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: "Alex" }),
  }), runtimeEnv, runtimeContext);
  const started = await startResponse.json();
  const estimateResponse = await worker.fetch(
    new Request(`http://localhost/api/practice?sessionId=${started.snapshot.sessionId}&mode=${started.storageMode}`),
    runtimeEnv,
    runtimeContext,
  );
  const estimated = await estimateResponse.json();
  assert.equal(estimated.practiceEstimate.level, null);
  assert.equal(estimated.practiceEstimate.evidenceStatus, "limited");
  assert.match(estimated.practiceEstimate.summary, /finish the conversation/i);
});

test("saves a consented second shadow attempt without creating a score", async () => {
  const worker = await loadWorker("shadow-flow");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start_shadow", languagePackId: "lang_en_us_v1", objectiveId: "obj_en_warmup" }),
  }), runtimeEnv, runtimeContext);
  assert.equal(startResponse.status, 200);
  const started = await startResponse.json();
  assert.equal(started.snapshot.turns.length, 0);

  const form = new FormData();
  form.set("audio", new File([new Uint8Array([7, 8, 9])], "shadow.webm", { type: "audio/webm" }));
  form.set("sessionId", started.snapshot.sessionId);
  form.set("fluentExampleId", "fluent_en_intro_01");
  form.set("sentenceIndex", "0");
  form.set("sentenceText", "I work in international education, where I help teams communicate across cultures.");
  form.set("durationMs", "1800");
  form.set("consentGranted", "true");
  form.set("mode", started.storageMode);
  const saveResponse = await worker.fetch(new Request("http://localhost/api/practice/recording", { method: "POST", body: form }), runtimeEnv, runtimeContext);
  assert.equal(saveResponse.status, 200);

  const listResponse = await worker.fetch(new Request(`http://localhost/api/practice/recording?sessionId=${started.snapshot.sessionId}&mode=${started.storageMode}&kind=shadow`), runtimeEnv, runtimeContext);
  assert.equal(listResponse.status, 200);
  const saved = await listResponse.json();
  assert.equal(saved.attempts.length, 1);
  assert.equal(saved.attempts[0].attemptNumber, 2);
  assert.equal("score" in saved.attempts[0], false);
});

test("shares only anonymized text with opt-in consent and supports withdrawal", async () => {
  const worker = await loadWorker("community-flow");
  const startResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1" }),
  }), runtimeEnv, runtimeContext);
  const started = await startResponse.json();
  const response = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "respond", sessionId: started.snapshot.sessionId, storageMode: started.storageMode, text: "My name is Jordan Smith. I work at Acme Global, and my email is jordan@example.com. I enjoy collaborative work and solving difficult problems." }),
  }), runtimeEnv, runtimeContext);
  const continued = await response.json();
  const learner = continued.turns.find((turn) => turn.role === "learner");

  const previewResponse = await worker.fetch(new Request("http://localhost/api/community", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "preview", sessionId: started.snapshot.sessionId, messageId: learner.id, storageMode: started.storageMode }),
  }), runtimeEnv, runtimeContext);
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.doesNotMatch(preview.preview.text, /Jordan|Acme|jordan@example/i);
  assert.ok(preview.preview.redactions.length >= 3);

  const refused = await worker.fetch(new Request("http://localhost/api/community", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "share", sessionId: started.snapshot.sessionId, messageId: learner.id, storageMode: started.storageMode, reviewedText: preview.preview.text }),
  }), runtimeEnv, runtimeContext);
  assert.equal(refused.status, 403);

  const shareResponse = await worker.fetch(new Request("http://localhost/api/community", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "share", sessionId: started.snapshot.sessionId, messageId: learner.id, storageMode: started.storageMode, reviewedText: preview.preview.text, reviewConfirmed: true, consentConfirmed: true }),
  }), runtimeEnv, runtimeContext);
  assert.equal(shareResponse.status, 200);
  const shared = await shareResponse.json();
  assert.ok(shared.withdrawalCode);
  assert.equal("contributorKey" in shared.example, false);
  assert.equal("audioStorageKey" in shared.example, false);

  const listUrl = `http://localhost/api/community?objectiveId=obj_en_warmup&mode=${started.storageMode}`;
  const listed = await (await worker.fetch(new Request(listUrl), runtimeEnv, runtimeContext)).json();
  assert.ok(listed.examples.some((example) => example.id === shared.example.id));
  assert.doesNotMatch(JSON.stringify(listed), /Jordan|Acme|jordan@example/i);

  const withdrawResponse = await worker.fetch(new Request("http://localhost/api/community", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "withdraw", storageMode: started.storageMode, withdrawalCode: shared.withdrawalCode }),
  }), runtimeEnv, runtimeContext);
  assert.equal(withdrawResponse.status, 200);
  const after = await (await worker.fetch(new Request(listUrl), runtimeEnv, runtimeContext)).json();
  assert.equal(after.examples.some((example) => example.id === shared.example.id), false);
});
