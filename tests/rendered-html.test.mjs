import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

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

for (const pathname of ["/", "/practice", "/shadow", "/community", "/transcript", "/progress", "/about", "/resources", "/resources/thunderbird-language-information", "/help"]) {
  test(`server-renders ${pathname}`, async () => {
    const response = await render(pathname);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();
    assert.match(html, /Beyond Hello|AI-Guided Conversation Studio/i);
    assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
  });
}

test("landing page presents only the approved entry actions", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /An AI-Guided[\s\S]*Conversation Studio\./i);
  assert.doesNotMatch(html, /Practice now\. Avoid surprises later\./i);
  assert.match(html, /An AI-Guided Conversation Studio\./i);
  assert.match(html, /Beyond Hello/i);
  assert.match(html, /\/icons\/beyond-hello-mark\.png/i);
  assert.match(html, /Set Up Practice/i);
  assert.match(html, /Listen to How This Works/i);
  assert.doesNotMatch(html, /Practice disclaimer/i);
  assert.doesNotMatch(html, /institution-mark/i);
  assert.match(html, /\/icons\/beyond-hello-16\.png/i);
  assert.match(html, /\/icons\/beyond-hello-180\.png/i);
  assert.doesNotMatch(html, /AI OPI|OPI Studio|Sign in to practice|ASU email|Start practice<\/a>/i);
});

test("practice setup is session-only and does not require an account", async () => {
  const response = await render("/practice");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Set Up Your Practice/i);
  assert.match(html, /What would you like Maya to call you\?/i);
  assert.match(html, /Question 1 of 3/i);
  assert.match(html, /Continue/i);
  assert.doesNotMatch(html, /What language would you like to practice\?|How long would you like to practice\?|Start Conversation/i);
  assert.doesNotMatch(html, /ASU email|Password|Surname|Native language|Class \/ cohort|Create account|Sign in to practice/i);
  const source = await readFile(new URL("../app/practice/page.tsx", import.meta.url), "utf8");
  assert.match(source, /setupStep === 1[\s\S]*What would you like Maya to call you\?/i);
  assert.match(source, /setupStep === 2[\s\S]*What language would you like to practice\?/i);
  assert.match(source, /setupStep === 3[\s\S]*How long would you like to practice\?/i);
  assert.doesNotMatch(source, /onPointerUp=.*completeSessionSetup|Release the slider to continue automatically/i);
  assert.match(source, /session-step-action[\s\S]*Continue/i);
  assert.doesNotMatch(source, />Start Conversation</i);
});

test("starts an anonymous practice session with the current first name", async () => {
  const worker = await loadWorker("anonymous-session-setup");
  const response = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: "Nia", practiceMinutes: 7 }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const started = await response.json();
  assert.equal(started.snapshot.languagePackId, "lang_en_us_v1");
  assert.match(started.snapshot.turns[0].text, /Nia/i);
  assert.equal("participantKey" in started, false);
});

test("walks the student through the pre-conversation recording flow", async () => {
  const source = await readFile(new URL("../app/practice/page.tsx", import.meta.url), "utf8");
  assert.match(source, /here&apos;s how your conversation will work/i);
  assert.match(source, /After Maya finishes, a 10-second timer will begin/i);
  assert.match(source, /hear a beep\. Start speaking—recording begins automatically/i);
  assert.match(source, /When you finish speaking, select Send Response/i);
  assert.match(source, /Instruction \$\{readinessStep \+ 1\} of \$\{readinessCards\.length\}/i);
  assert.match(source, /readinessStep < readinessCards\.length - 1[\s\S]*Next/i);
  assert.match(source, /readinessStep > 0[\s\S]*Previous/i);
  assert.match(source, /busy \? "Preparing\.\.\." : "Start"/i);
  assert.match(source, /Try one question first/i);
  assert.match(source, /completeAfterResponse: timeExpired \|\| isQuestionPreview/i);
  assert.match(source, /Start Full Conversation/i);
  assert.match(source, /Try Another Question/i);
  assert.match(source, /does not create a feedback report/i);
  assert.doesNotMatch(source, /Start interview|id="practice-duration"|Listen<\/span><span>Speak|conversation-progress|Stop recording|Retry sending/i);
});

test("keeps the Phase 4 live conversation focused, stateful, and recoverable", async () => {
  const source = await readFile(new URL("../app/practice/page.tsx", import.meta.url), "utf8");
  assert.match(source, /Listen to Maya&apos;s question, then answer naturally in your own words/i);
  assert.match(source, /Listen Again/i);
  assert.match(source, /Show Words/i);
  assert.match(source, /mayaFemaleVoicePattern/i);
  assert.match(source, /utterance\.voice = mayaVoice/i);
  assert.match(source, /utterance\.pitch = 1\.06/i);
  assert.match(source, /Send Response/i);
  assert.match(source, /End Conversation/i);
  assert.match(source, /audioBitsPerSecond:\s*48_000/i);
  assert.match(source, /submissionLock\.current/i);
  assert.match(source, /Save recording again/i);
  assert.match(source, /Connecting microphone/i);
  assert.match(source, /Try Microphone Again/i);
  assert.match(source, /Live transcript/i);
  assert.match(source, /transcriptText\.current\.trim\(\) \|\| response\.trim\(\)/i);
  assert.match(source, /Resume Conversation/i);
  assert.match(source, /Pause Conversation/i);
  assert.match(source, /mediaRecorder\.current\?\.state === "recording"[\s\S]*\.pause\(\)/i);
  assert.match(source, /mediaRecorder\.current\?\.state === "paused"[\s\S]*\.resume\(\)/i);
  assert.match(source, /completeAfterResponse: timeExpired \|\| isQuestionPreview/i);
  assert.doesNotMatch(source, />Stop Recording</i);
});

test("shared navigation uses only the approved information architecture", async () => {
  const source = await readFile(new URL("../app/components/AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /href: "\/about"/i);
  assert.match(source, /href: "\/resources"/i);
  assert.doesNotMatch(source, /href: "\/help"|label: "Help"/i);
  assert.doesNotMatch(source, /label: "Practice"|label: "Replay"|label: "Fluent Example"|label: "My Progress"|Start practice/i);
});

test("keeps core navigation and conversation controls usable on phones", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /@media \(max-width: 680px\)[\s\S]*grid-template-columns: repeat\(2, 1fr\)/i);
  assert.match(styles, /\.interviewer-bar \{[^}]*grid-template-columns: auto minmax\(0, 1fr\) auto/i);
  assert.match(styles, /\.response-composer \{[^}]*max-height: min\(52dvh, 470px\)[^}]*overflow-y: auto/i);
  assert.match(styles, /\.live-transcript p \{[^}]*max-height: 5\.5rem/i);
  assert.match(styles, /@media \(max-width: 380px\)/i);
});

test("uses protected CreateAI speech with cached browser-voice fallback", async () => {
  const [practiceSource, routeSource] = await Promise.all([
    readFile(new URL("../app/practice/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/speech/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(practiceSource, /fetch\("\/api\/speech"/i);
  assert.match(practiceSource, /mayaAudioCache/i);
  assert.match(practiceSource, /speakWithBrowserVoice/i);
  assert.match(routeSource, /CREATEAI_SERVICE_TOKEN|CreateAIConfig/i);
  assert.match(routeSource, /endpoint:\s*"speech"/i);
  assert.match(routeSource, /request_source:\s*"override_params"/i);
  assert.match(routeSource, /agentic:\s*false/i);
  assert.match(routeSource, /allowedVoices/i);
  assert.doesNotMatch(practiceSource, /CREATEAI_SERVICE_TOKEN/i);
});

test("proxies Maya audio through CreateAI without returning the service token", async () => {
  const worker = await loadWorker("createai-speech-proxy");
  const originalFetch = globalThis.fetch;
  let upstreamAuthorization = "";
  let upstreamPayload = null;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api-main.aiml.asu.edu/query") {
      upstreamAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      upstreamPayload = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ audio_response: "AQIDBA==" }), { headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await worker.fetch(new Request("http://localhost/api/speech", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ text: "你好，欢迎练习。", localeTag: "zh-CN" }),
    }), { ...runtimeEnv, CREATEAI_SERVICE_TOKEN: "test-service-token", CREATEAI_BASE_URL: "https://api-main.aiml.asu.edu" }, runtimeContext);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.equal(response.headers.get("x-maya-voice"), "nova");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
    assert.equal(upstreamAuthorization, "Bearer test-service-token");
    assert.equal(upstreamPayload.endpoint, "speech");
    assert.equal(upstreamPayload.query, "你好，欢迎练习。");
    assert.equal(upstreamPayload.agentic, false);
    assert.doesNotMatch(JSON.stringify(await response.headers), /test-service-token/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("presents reflection as a full-width report with a checked PDF download", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/transcript/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /className="practice-reflection-report"/i);
  assert.match(source, /Your conversation report/i);
  assert.match(source, /fetch\(reportHref\)/i);
  assert.match(source, /URL\.createObjectURL/i);
  assert.match(source, /link\.download = filename/i);
  assert.match(styles, /\.report-profile-summary[^}]*grid-template-columns/i);
  assert.match(styles, /\.report-insight-grid[^}]*grid-template-columns/i);
});

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

test("accepts a controlled long recording and exposes upload diagnostics", async () => {
  const worker = await loadWorker("long-recording-diagnostics");
  const started = await startAdaptiveSession(worker, "Nia");
  const continued = await sendAdaptiveResponse(worker, started, "I enjoy working with international teams because every project gives me a different perspective.");
  const learnerTurn = continued.turns.find((turn) => turn.role === "learner");

  const longForm = new FormData();
  longForm.set("audio", new File([new Uint8Array(512 * 1024)], "long-answer.webm", { type: "audio/webm" }));
  longForm.set("sessionId", started.snapshot.sessionId);
  longForm.set("messageId", learnerTurn.id);
  longForm.set("durationMs", String(10 * 60 * 1000));
  longForm.set("consentGranted", "true");
  longForm.set("mode", started.storageMode);
  longForm.set("clientUploadId", "long-recording-test");
  const accepted = await worker.fetch(new Request("http://localhost/api/practice/recording", { method: "POST", body: longForm }), runtimeEnv, runtimeContext);
  assert.equal(accepted.status, 200);
  assert.ok(accepted.headers.get("x-recording-diagnostic-id"));

  const routeSource = await readFile(new URL("../app/api/practice/recording/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /15 \* 1024 \* 1024/i);
  assert.match(routeSource, /status:\s*413|,\s*413\)/i);
  assert.match(routeSource, /failureLocation/i);
  assert.match(routeSource, /x-recording-diagnostic-id/i);
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
  assert.doesNotMatch(continued.turns[1].text, /didn.t catch an answer/i);
  assert.match(continued.turns[1].text, /typical day|influenced you|comfortable|work or study/i);
  assert.doesNotMatch(continued.turns[1].text, /get to know|helpful picture|sounds important/i);

  const retryResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "I usually wake up early, attend classes during the day, and study with friends in the evening because the routine helps me stay focused.",
    }),
  }), runtimeEnv, runtimeContext);
  const retried = await retryResponse.json();
  assert.doesNotMatch(retried.turns[1].text, /didn.t catch an answer|describe your typical day/i);
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

test("grounds place follow-ups in geographic evidence from the learner", async () => {
  const worker = await loadWorker("grounded-place-follow-up");
  const start = async (name) => {
    const response = await worker.fetch(new Request("http://localhost/api/practice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", languagePackId: "lang_en_us_v1", participantName: name }),
    }), runtimeEnv, runtimeContext);
    return response.json();
  };
  const respond = async (session, text) => {
    const response = await worker.fetch(new Request("http://localhost/api/practice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "respond", sessionId: session.snapshot.sessionId, storageMode: session.storageMode, text }),
    }), runtimeEnv, runtimeContext);
    return response.json();
  };

  const educationSession = await start("Jordan");
  const educationReply = await respond(
    educationSession,
    "I graduated from ASU last year, and I enjoy taking photographs and meeting new people on weekends.",
  );
  assert.match(educationReply.turns[1].text, /activity|enjoyed|valuable/i);
  assert.doesNotMatch(educationReply.turns[1].text, /that place|place you come from|place has influenced|hometown/i);

  const placeSession = await start("Tariro");
  const placeReply = await respond(
    placeSession,
    "I am from Zimbabwe, and I grew up in Harare. The city and its community shaped many of my values.",
  );
  assert.match(placeReply.turns[1].text, /place|influenced|preserve/i);
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
  assert.match(followUps[5], /education policy|challenge|decision|strategy|ethical/i);
  assert.ok(followUps.slice(1, 5).every((prompt) => /You (connected|described|mentioned|brought|raised)|I want to stay/i.test(prompt)));
  assert.equal(new Set(followUps).size, followUps.length);
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
  assert.match(reportResponse.headers.get("content-disposition"), /beyond-hello-practice-report/i);
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
  const stillConversing = await secondResponse.json();
  assert.doesNotMatch(stillConversing.turns[1].text, /score|pass|fail|proficiency/i);

  const finalAnswerResponse = await worker.fetch(new Request("http://localhost/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "respond",
      sessionId: started.snapshot.sessionId,
      storageMode: started.storageMode,
      text: "My final answer is that international teamwork helps me compare perspectives and explain decisions more clearly.",
      practiceMinutes: 2,
      remainingSeconds: 0,
      completeAfterResponse: true,
    }),
  }), runtimeEnv, runtimeContext);
  assert.equal(finalAnswerResponse.status, 200);
  const completed = await finalAnswerResponse.json();
  assert.equal(completed.completed, true);
  assert.equal(completed.turns[0].role, "learner");
  assert.equal(completed.turns[1].role, "coach");
  assert.match(completed.turns[1].text, /thank you|saved|review/i);
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
