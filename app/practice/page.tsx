"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { createInterviewPlan, selectInterviewStage, type InterviewStage } from "@/lib/conversation/time-plan";
import type { ConversationTurn } from "@/lib/conversation/types";
import { defaultLanguagePackId, listLanguagePackDefinitions } from "@/lib/language-packs/registry";
import type { PracticeStorageMode } from "@/lib/practice/store";

const languagePacks = listLanguagePackDefinitions();
const normalizeLanguagePackId = (value: string): string => languagePacks.find(
  (definition) => definition.pack.id === value || definition.pack.localeTag === value,
)?.pack.id ?? defaultLanguagePackId;
const introScenes = [
  { title: "Choose a language", detail: "Select the language you want to practice." },
  { title: "Talk with Maya", detail: "Listen and respond in a natural conversation." },
  { title: "Replay and review", detail: "Hear your voice and read the conversation transcript." },
] as const;
const stageLabels: Record<InterviewStage, string> = {
  warmup: "Warm-up",
  description: "Description",
  story: "Story",
  opinion: "Opinion",
  role_play: "Role-play",
  wrap: "Wrap-up",
};

interface PracticeSnapshot {
  sessionId: string;
  languagePackId: string;
  localeTag: string;
  objectiveId: string;
  title: string;
  status: "active" | "completed";
  turns: ConversationTurn[];
}

interface StudentProfile {
  id: string;
  asuEmail: string;
  preferredFirstName: string;
  surname: string;
  classCohort: string;
  nativeLanguage: string;
  targetLanguagePackId: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type MayaVoiceMode = "browser" | "text";

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export default function PracticePage() {
  const pathname = usePathname();
  const [selectedPackId, setSelectedPackId] = useState<string>(defaultLanguagePackId);
  const [profile, setProfile] = useState<StudentProfile | null | undefined>(undefined);
  const [authMode, setAuthMode] = useState<"create" | "sign-in">("sign-in");
  const [introScene, setIntroScene] = useState(0);
  const [introSpeaking, setIntroSpeaking] = useState(false);
  const [introPaused, setIntroPaused] = useState(false);
  const [introHeard, setIntroHeard] = useState(false);
  const [asuEmail, setAsuEmail] = useState("");
  const [password, setPassword] = useState("");
  const [preferredFirstName, setPreferredFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [classCohort, setClassCohort] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("");
  const [targetLanguagePackId, setTargetLanguagePackId] = useState<string>(defaultLanguagePackId);
  const [snapshot, setSnapshot] = useState<PracticeSnapshot | null>(null);
  const [storageMode, setStorageMode] = useState<PracticeStorageMode>("memory");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [recordingConsent, setRecordingConsent] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState("");
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("Press the microphone and answer aloud. Your words will appear below.");
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const [practiceMinutes, setPracticeMinutes] = useState(5);
  const [remainingSeconds, setRemainingSeconds] = useState(5 * 60);
  const [timeExpired, setTimeExpired] = useState(false);
  const [recordingFinalizing, setRecordingFinalizing] = useState(false);
  const [isMayaSpeaking, setIsMayaSpeaking] = useState(false);
  const [mayaVoiceMode, setMayaVoiceMode] = useState<MayaVoiceMode>("text");
  const [revealedCoachTurns, setRevealedCoachTurns] = useState<string[]>([]);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingStartedAt = useRef(0);
  const speechRecognition = useRef<SpeechRecognitionLike | null>(null);
  const transcriptText = useRef("");
  const audioContext = useRef<AudioContext | null>(null);
  const voiceCheckTimer = useRef<number | null>(null);
  const voicedSamples = useRef(0);
  const introAudio = useRef<HTMLAudioElement | null>(null);
  const completionCelebrated = useRef(false);
  const completionAudioContext = useRef<AudioContext | null>(null);

  const selectedPack = languagePacks.find((definition) => definition.pack.id === selectedPackId) ?? languagePacks[0];
  const answerCount = snapshot?.turns.filter((turn) => turn.role === "learner").length ?? 0;
  const conversationStageKeys = createInterviewPlan(practiceMinutes);
  const currentStageKey = completed ? "wrap" : selectInterviewStage({ plannedDurationMinutes: practiceMinutes, remainingSeconds }, answerCount);
  const conversationStageIndex = Math.max(0, conversationStageKeys.indexOf(currentStageKey));
  const conversationStages = conversationStageKeys.map((stage) => stageLabels[stage]);
  const turnState = isRecording
    ? { label: "Listening", title: "Speak naturally", detail: "Tap Stop recording when you finish your answer." }
    : recordedBlob && voiceDetected
      ? { label: "Answer ready", title: "Ready to send", detail: voiceNotice }
      : recordedBlob
        ? { label: "Try again", title: "No speech detected", detail: voiceNotice }
    : { label: "Your turn", title: "Answer Maya out loud", detail: "Take your time. You can replay your answer before sending it." };

  function closeRecorderAudioContext() {
    const context = audioContext.current;
    audioContext.current = null;
    if (!context || context.state === "closed") return;
    void context.close().catch(() => undefined);
  }

  function prepareIntroAudio() {
    const audio = introAudio.current ?? new Audio("/audio/platform-introduction.mp3");
    introAudio.current = audio;
    audio.onplay = () => { setError(""); setIntroPaused(false); setIntroSpeaking(true); };
    audio.onended = () => {
      setIntroSpeaking(false);
      setIntroPaused(false);
      setIntroHeard(true);
      window.localStorage.setItem("opi-platform-introduction-heard", "true");
    };
    audio.onerror = () => { setIntroSpeaking(false); setError("The introduction recording could not play."); };
    return audio;
  }

  useEffect(() => {
    if (pathname === "/") {
      setProfile(null);
      return;
    }
    void fetch("/api/profile")
      .then((request) => request.json() as Promise<{ profile: StudentProfile | null }>)
      .then((data) => {
        setProfile(data.profile);
        if (data.profile) setSelectedPackId(normalizeLanguagePackId(data.profile.targetLanguagePackId));
      })
      .catch(() => setProfile(null));
  }, [pathname]);
  useEffect(() => {
    if (profile) return;
    const timer = window.setTimeout(() => setIntroScene((introScene + 1) % introScenes.length), 4500);
    return () => window.clearTimeout(timer);
  }, [introScene, profile]);
  useEffect(() => {
    setIntroHeard(window.localStorage.getItem("opi-platform-introduction-heard") === "true");
  }, []);
  useEffect(() => { conversationEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [snapshot?.turns.length, busy]);
  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recordingStartedAt.current) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [isRecording]);
  useEffect(() => {
    if (!snapshot || completed || countdown !== null || timeExpired) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          setTimeExpired(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [snapshot, completed, countdown, timeExpired]);
  useEffect(() => {
    if (timeExpired && isRecording) stopRecording();
  }, [timeExpired, isRecording]);
  useEffect(() => {
    if (!timeExpired || !snapshot || completed || busy || isRecording || recordingFinalizing || recordedBlob) return;
    void finishPractice();
  }, [timeExpired, snapshot, completed, busy, isRecording, recordingFinalizing, recordedBlob]);
  useEffect(() => () => {
    speechRecognition.current?.stop();
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    if (voiceCheckTimer.current !== null) window.clearInterval(voiceCheckTimer.current);
    closeRecorderAudioContext();
    window.speechSynthesis?.cancel();
    introAudio.current?.pause();
    introAudio.current = null;
    const celebrationContext = completionAudioContext.current;
    completionAudioContext.current = null;
    if (celebrationContext && celebrationContext.state !== "closed") void celebrationContext.close().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (countdown === null || !snapshot) return;
    const timer = window.setTimeout(() => {
      if (countdown > 0) { setCountdown((value) => value === null ? null : value - 1); return; }
      setCountdown(null);
      const opening = snapshot.turns[0];
      if (opening) void speakMayaText(opening.text, snapshot.localeTag);
    }, countdown > 0 ? 1000 : 500);
    return () => window.clearTimeout(timer);
  }, [countdown, snapshot, mayaVoiceMode]);

  function clearRecording() {
    if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
    setRecordingFinalizing(false);
    setRecordedBlob(null);
    setRecordedPreviewUrl("");
    setRecordingSeconds(0);
    setVoiceDetected(false);
    setVoiceNotice("Press the microphone and answer aloud. Your words will appear below.");
  }

  function playCompletionClap() {
    if (completionCelebrated.current) return;
    completionCelebrated.current = true;
    try {
      const context = completionAudioContext.current && completionAudioContext.current.state !== "closed"
        ? completionAudioContext.current
        : new AudioContext();
      completionAudioContext.current = context;
      if (context.state === "suspended") void context.resume().catch(() => undefined);
      const clapTimes = [0, 0.16, 0.34, 0.56, 0.82];
      clapTimes.forEach((offset, clapIndex) => {
        const duration = 0.09;
        const sampleCount = Math.ceil(context.sampleRate * duration);
        const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let index = 0; index < sampleCount; index += 1) {
          const envelope = Math.exp(-index / (context.sampleRate * 0.018));
          samples[index] = (Math.random() * 2 - 1) * envelope;
        }
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        source.buffer = buffer;
        filter.type = "bandpass";
        filter.frequency.value = 1100 + clapIndex * 120;
        filter.Q.value = 0.8;
        gain.gain.value = 0.22;
        source.connect(filter).connect(gain).connect(context.destination);
        source.start(context.currentTime + offset);
      });
    } catch {
      // The visual completion message remains available if audio is blocked.
    }
  }

  async function speakMayaText(text: string, localeTag: string, onFinished?: () => void): Promise<void> {
    if (mayaVoiceMode === "text") { onFinished?.(); return; }
    if (typeof window.speechSynthesis === "undefined" || typeof window.SpeechSynthesisUtterance === "undefined") {
      setRevealedCoachTurns((current) => [...current]);
      setIsMayaSpeaking(false);
      setError("This browser cannot play Maya's local voice. Her question is shown so you can continue practicing.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = localeTag;
    utterance.rate = 0.94;
    utterance.onstart = () => setIsMayaSpeaking(true);
    utterance.onend = () => { setIsMayaSpeaking(false); onFinished?.(); };
    utterance.onerror = () => {
      setIsMayaSpeaking(false);
      setError("Maya's local voice could not play. Her question is shown so you can continue practicing.");
      onFinished?.();
    };
    window.speechSynthesis.speak(utterance);
  }

  function playPlatformIntro() {
    if (introSpeaking) {
      introAudio.current?.pause();
      setIntroSpeaking(false);
      setIntroPaused(true);
      return;
    }
    const audio = prepareIntroAudio();
    if (audio.ended) audio.currentTime = 0;
    void audio.play().catch(() => {
      setIntroSpeaking(false);
      setError("The introduction recording could not play. Check your device volume and try again.");
    });
  }

  function updateResponse(value: string) {
    transcriptText.current = value;
    setResponse(value);
  }

  async function startRecording() {
    setError("");
    try {
      clearRecording();
      updateResponse("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voicedSamples.current = 0;
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const levels = new Uint8Array(analyser.fftSize);
      audioContext.current = context;
      voiceCheckTimer.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(levels);
        let energy = 0;
        for (const level of levels) {
          const normalizedLevel = (level - 128) / 128;
          energy += normalizedLevel * normalizedLevel;
        }
        if (Math.sqrt(energy / levels.length) > 0.018) voicedSamples.current += 1;
      }, 100);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunks.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType });
        setRecordedBlob(blob);
        setRecordedPreviewUrl(URL.createObjectURL(blob));
        setRecordingFinalizing(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaStream.current = stream;
      mediaRecorder.current = recorder;
      recordingStartedAt.current = Date.now();
      const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (Recognition) {
        const recognition = new Recognition();
        recognition.lang = selectedPack.pack.localeTag;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let spokenText = "";
          for (let index = 0; index < event.results.length; index += 1) spokenText += `${event.results[index][0].transcript} `;
          updateResponse(spokenText.trim());
          if (spokenText.trim()) setVoiceDetected(true);
          setVoiceNotice("Listening… speak naturally. The transcript is created automatically.");
        };
        recognition.onerror = () => setVoiceNotice("Your voice is still being recorded. You can send it even if an automatic transcript is unavailable.");
        recognition.onend = () => { speechRecognition.current = null; };
        speechRecognition.current = recognition;
        recognition.start();
      } else {
        setVoiceNotice("Automatic transcription is unavailable here. Your recording can still be sent and saved.");
      }
      recorder.start();
      setIsRecording(true);
    } catch { setError("Microphone access is unavailable. Allow microphone access to continue this voice practice."); }
  }

  function stopRecording() {
    speechRecognition.current?.stop();
    if (mediaRecorder.current?.state === "recording") {
      setRecordingFinalizing(true);
      mediaRecorder.current.stop();
    }
    if (voiceCheckTimer.current !== null) {
      window.clearInterval(voiceCheckTimer.current);
      voiceCheckTimer.current = null;
    }
    closeRecorderAudioContext();
    setRecordingSeconds(Math.max(1, Math.floor((Date.now() - recordingStartedAt.current) / 1000)));
    setIsRecording(false);
    const detected = Boolean(transcriptText.current.trim()) || voicedSamples.current >= 3;
    setVoiceDetected(detected);
    setVoiceNotice(detected
      ? transcriptText.current.trim()
        ? "Recording ready. Replay it if you wish, then send your spoken answer."
        : "Speech detected, but an automatic transcript is unavailable. You may record again for clearer recognition."
      : "No speech was detected. Record again and answer Maya’s question aloud.");
  }

  function replayTurn(turn: ConversationTurn) {
    window.speechSynthesis?.cancel();
    setIsMayaSpeaking(false);
    const audioUrl = playbackUrls[turn.id];
    if (turn.role === "learner" && audioUrl) { void new Audio(audioUrl).play(); return; }
    if (turn.role === "coach") {
      if (mayaVoiceMode === "text") {
        setRevealedCoachTurns((current) => current.includes(turn.id) ? current : [...current, turn.id]);
        setError("Maya's local voice is unavailable in this browser. Her question is shown so you can continue practicing.");
        return;
      }
      void speakMayaText(turn.text, snapshot?.localeTag ?? selectedPack.pack.localeTag);
      return;
    }
    setError("This learner response has no saved recording to replay.");
  }

  function speakCoachTurn(turn: ConversationTurn | undefined, onFinished?: () => void) {
    if (!turn) { onFinished?.(); return; }
    if (mayaVoiceMode === "text") {
      setRevealedCoachTurns((current) => current.includes(turn.id) ? current : [...current, turn.id]);
      onFinished?.();
      return;
    }
    void speakMayaText(turn.text, snapshot?.localeTag ?? selectedPack.pack.localeTag, onFinished);
  }

  async function startPractice() {
    if (!profile) { setError("Create your profile before starting the interview."); return; }
    try {
      const celebrationContext = completionAudioContext.current && completionAudioContext.current.state !== "closed"
        ? completionAudioContext.current
        : new AudioContext();
      completionAudioContext.current = celebrationContext;
      if (celebrationContext.state === "suspended") void celebrationContext.resume().catch(() => undefined);
    } catch {
      completionAudioContext.current = null;
    }
    window.localStorage.setItem("opi_active_language_pack", selectedPackId);
    setBusy(true); setError("");
    try {
      const request = await fetch("/api/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", languagePackId: selectedPackId, participantName: profile.preferredFirstName, participantKey: profile.id, practiceMinutes }),
      });
      const data = await request.json() as { error?: string; snapshot: PracticeSnapshot; storageMode: PracticeStorageMode };
      if (!request.ok) throw new Error(data.error ?? "Could not start practice.");
      const canUseBrowserVoice = typeof window.speechSynthesis !== "undefined"
        && typeof window.SpeechSynthesisUtterance !== "undefined";
      const nextVoiceMode: MayaVoiceMode = canUseBrowserVoice ? "browser" : "text";
      setMayaVoiceMode(nextVoiceMode);
      const voiceError = canUseBrowserVoice ? "" : "This browser cannot play Maya's local voice. Her question is shown so you can continue practicing.";
      const opening = data.snapshot.turns.find((turn) => turn.role === "coach");
      setRevealedCoachTurns(nextVoiceMode === "text" && opening ? [opening.id] : []);
      setRemainingSeconds(practiceMinutes * 60); setTimeExpired(false); setRecordingFinalizing(false);
      setSnapshot(data.snapshot); setStorageMode(data.storageMode); setCompleted(false); setCountdown(3); setError(voiceError);
      window.localStorage.setItem("opi_last_session", JSON.stringify({ sessionId: data.snapshot.sessionId, mode: data.storageMode }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start practice.");
    }
    finally { setBusy(false); }
  }

  async function submitAccount(event: FormEvent) {
    event.preventDefault();
    const signingIn = authMode === "sign-in";
    if (!asuEmail.trim() || !password || busy) return;
    if (!signingIn && (!preferredFirstName.trim() || !surname.trim() || !classCohort.trim() || !nativeLanguage.trim() || !targetLanguagePackId)) return;
    setBusy(true); setError("");
    try {
      const request = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: signingIn ? "sign_in" : "create",
          asuEmail,
          password,
          preferredFirstName,
          surname,
          classCohort,
          nativeLanguage,
          targetLanguagePackId,
        }),
      });
      const data = await request.json() as { error?: string; profile?: StudentProfile };
      if (!request.ok || !data.profile) throw new Error(data.error ?? (signingIn ? "Could not sign in." : "Could not create your profile."));
      introAudio.current?.pause();
      introAudio.current = null;
      setIntroSpeaking(false);
      setProfile(data.profile); setSelectedPackId(normalizeLanguagePackId(data.profile.targetLanguagePackId)); setPassword("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : signingIn ? "Could not sign in." : "Could not create your profile."); }
    finally { setBusy(false); }
  }

  async function sendResponse(event: FormEvent) {
    event.preventDefault();
    if (!snapshot || !recordedBlob || !voiceDetected || busy || isRecording) return;
    const learnerText = response.trim() || "[Spoken response recorded. Automatic transcript unavailable.]";
    updateResponse(""); setBusy(true); setError("");
    try {
      const request = await fetch("/api/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "respond", sessionId: snapshot.sessionId, storageMode, text: response.trim(), hasRecording: true, completeAfterResponse: timeExpired, practiceMinutes, remainingSeconds }),
      });
      const data = await request.json() as { error?: string; turns: ConversationTurn[]; completed?: boolean };
      if (!request.ok) throw new Error(data.error ?? "Could not save your response.");
      setSnapshot((current) => current ? { ...current, status: data.completed ? "completed" : current.status, turns: [...current.turns, ...data.turns] } : current);
      const coachTurn = data.turns.find((turn) => turn.role === "coach");
      if (!data.completed) speakCoachTurn(coachTurn);

      const learnerTurn = data.turns.find((turn) => turn.role === "learner");
      if (recordedBlob && learnerTurn && recordingConsent) {
        const form = new FormData();
        form.set("audio", recordedBlob, `response-${learnerTurn.id}.webm`);
        form.set("sessionId", snapshot.sessionId);
        form.set("messageId", learnerTurn.id);
        form.set("durationMs", String(recordingSeconds * 1000));
        form.set("consentGranted", "true");
        form.set("mode", storageMode);
        try {
          const upload = await fetch("/api/practice/recording", { method: "POST", body: form });
          const audioData = await upload.json() as { error?: string; recording?: { playbackUrl: string } };
          if (!upload.ok || !audioData.recording) throw new Error(audioData.error ?? "Audio could not be stored.");
          setPlaybackUrls((current) => ({ ...current, [learnerTurn.id]: audioData.recording!.playbackUrl }));
        } catch { setError("Your response was saved, but its audio could not be stored for replay."); }
      } else if (recordedBlob && learnerTurn && recordedPreviewUrl) {
        setPlaybackUrls((current) => ({ ...current, [learnerTurn.id]: URL.createObjectURL(recordedBlob) }));
      }
      clearRecording();
      if (data.completed) {
        setCompleted(true);
        speakCoachTurn(coachTurn, playCompletionClap);
      }
    } catch (caught) { updateResponse(learnerText); setError(caught instanceof Error ? caught.message : "Could not save your response."); }
    finally { setBusy(false); }
  }

  async function finishPractice() {
    if (!snapshot || busy || isRecording) return;
    setBusy(true); setError("");
    try {
      const request = await fetch("/api/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", sessionId: snapshot.sessionId, storageMode, practiceMinutes, remainingSeconds }),
      });
      const data = await request.json() as { error?: string; completed?: boolean; turns?: ConversationTurn[] };
      if (!request.ok) throw new Error(data.error ?? "Could not finish this practice.");
      const closingTurns = data.turns ?? [];
      setCompleted(true); setSnapshot((current) => current ? { ...current, status: "completed", turns: [...current.turns, ...closingTurns] } : current);
      speakCoachTurn(closingTurns.find((turn) => turn.role === "coach"), playCompletionClap);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not finish this practice."); }
    finally { setBusy(false); }
  }

  function resetPractice() {
    window.speechSynthesis?.cancel();
    setIsMayaSpeaking(false);
    setMayaVoiceMode("text");
    speechRecognition.current?.stop();
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    if (voiceCheckTimer.current !== null) {
      window.clearInterval(voiceCheckTimer.current);
      voiceCheckTimer.current = null;
    }
    closeRecorderAudioContext();
    const celebrationContext = completionAudioContext.current;
    completionAudioContext.current = null;
    if (celebrationContext && celebrationContext.state !== "closed") void celebrationContext.close().catch(() => undefined);
    Object.values(playbackUrls).filter((url) => url.startsWith("blob:")).forEach((url) => URL.revokeObjectURL(url));
    completionCelebrated.current = false;
    clearRecording(); setSnapshot(null); setCompleted(false); setPlaybackUrls({}); setCountdown(null); setTimeExpired(false); setRemainingSeconds(practiceMinutes * 60); setRecordingFinalizing(false); setRevealedCoachTurns([]); setError("");
  }

  if (profile === undefined) {
    return <main className="workspace-page practice-setup-page"><p className="profile-loading">Opening your practice studio...</p></main>;
  }

  if (!profile) {
    return (
      <main className="workspace-page practice-setup-page profile-gate">
        <div className="profile-gate-layout">
          <section className={`platform-film platform-film-scene-${introScene + 1}`} aria-label="AI OPI Conversation Studio introduction">
            <div className="platform-film-shade" />
            <div className="platform-film-brand"><span>THUNDERBIRD</span><strong>AI OPI CONVERSATION STUDIO</strong></div>
            <div className="platform-film-copy" aria-live="polite">
              <span className="eyebrow eyebrow-light">AI-GUIDED PRACTICE</span>
              <h2>{introScenes[introScene].title}</h2>
              <p>{introScenes[introScene].detail}</p>
            </div>
            <div key={`journey-step-${introScene}`} className="journey-meter" role="status" aria-label={`Journey step ${introScene + 1} of ${introScenes.length}`}>
              <strong aria-hidden="true">0{introScene + 1}</strong>
              <div>
                <span>Step {introScene + 1} of {introScenes.length}</span>
                <div className="journey-meter-track" aria-hidden="true">
                  {introScenes.map((scene, index) => <i key={scene.title} className={index <= introScene ? "active" : ""} />)}
                </div>
              </div>
            </div>
            <div className="platform-film-controls">
              <button type="button" className="platform-film-play" onClick={playPlatformIntro} aria-pressed={introSpeaking}>
                <span aria-hidden="true">{introSpeaking ? "❚❚" : "▶"}</span>
                {introSpeaking ? "Pause introduction" : introPaused ? "Resume introduction" : introHeard ? "Replay introduction" : "Hear how it works"}
              </button>
            </div>
          </section>
          <section className={`profile-card account-profile-card auth-${authMode}`}>
          <span className="eyebrow">WELCOME</span>
          <h1>{authMode === "create" ? "Create your account." : "Sign in to practice."}</h1>
          <p>{authMode === "create" ? "Add your student and language information once, then return with your email and password." : "Enter your ASU email and password to continue."}</p>
          <form className="profile-form" onSubmit={submitAccount}>
            <div className="profile-field-grid">
              <label htmlFor="asu-email"><span>ASU email</span><input id="asu-email" type="email" value={asuEmail} onChange={(event) => setAsuEmail(event.target.value)} maxLength={160} placeholder="yourname@asu.edu" autoComplete="username" inputMode="email" autoFocus /></label>
              <label htmlFor="account-password"><span>Password</span><input id="account-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} placeholder={authMode === "create" ? "At least 8 characters" : "Enter your password"} autoComplete={authMode === "create" ? "new-password" : "current-password"} /></label>
              {authMode === "create" && <label htmlFor="preferred-first-name"><span>First name</span><input id="preferred-first-name" value={preferredFirstName} onChange={(event) => setPreferredFirstName(event.target.value)} maxLength={40} placeholder="First name" autoComplete="given-name" /></label>}
              {authMode === "create" && <label htmlFor="surname"><span>Surname</span><input id="surname" value={surname} onChange={(event) => setSurname(event.target.value)} maxLength={60} placeholder="Surname" autoComplete="family-name" /></label>}
              {authMode === "create" && <label htmlFor="class-cohort"><span>Class / cohort</span><input id="class-cohort" value={classCohort} onChange={(event) => setClassCohort(event.target.value)} maxLength={40} placeholder="For example, Spring 26" /></label>}
              {authMode === "create" && <label htmlFor="native-language"><span>Native language</span><input id="native-language" value={nativeLanguage} onChange={(event) => setNativeLanguage(event.target.value)} maxLength={60} placeholder="For example, Shona" autoComplete="language" /></label>}
              {authMode === "create" && <label className="profile-field-wide" htmlFor="opi-language"><span>Language you are taking the OPI in</span><select id="opi-language" value={targetLanguagePackId} onChange={(event) => setTargetLanguagePackId(event.target.value)}>{languagePacks.map((definition) => <option key={definition.pack.id} value={definition.pack.id}>{definition.pack.displayName} · {definition.pack.nativeName}</option>)}</select><small>Maya’s prompts, speech recognition, and fluent example will use this language.</small></label>}
            </div>
            <button className="button button-gold" disabled={busy || !asuEmail.trim() || password.length < 8 || (authMode === "create" && (!preferredFirstName.trim() || !surname.trim() || !classCohort.trim() || !nativeLanguage.trim() || !targetLanguagePackId))}>{busy ? authMode === "create" ? "Creating account..." : "Signing in..." : authMode === "create" ? "Create account ->" : "Sign in ->"}</button>
          </form>
          {authMode === "sign-in" && (
            <aside className="demo-access" aria-label="Demo account">
              <div>
                <strong>Demo access</strong>
                <span>demo.student@asu.edu · Practice2026!</span>
              </div>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setAsuEmail("demo.student@asu.edu");
                  setPassword("Practice2026!");
                  setError("");
                }}
              >
                Use demo account
              </button>
            </aside>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="account-alternative">
            <span>{authMode === "create" ? "Already have an account?" : "Don’t have an account?"}</span>
            <button
              type="button"
              className="button account-alternative-button"
              onClick={() => {
                setAuthMode(authMode === "create" ? "sign-in" : "create");
                setPassword("");
                setError("");
              }}
            >
              {authMode === "create" ? "Sign in" : "Create account"}
            </button>
          </div>
          <small className="profile-note">Passwords are stored as salted hashes · Production can later connect ASU single sign-on.</small>
          </section>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="workspace-page practice-setup-page ready-start-page">
        <section className="ready-start-hero">
          <div className="ready-start-copy">
            <span className="eyebrow">OPI INTERVIEW PRACTICE</span>
            <h1>Hi, {profile.preferredFirstName}.</h1>
            <p>{profile.classCohort} · Native language: {profile.nativeLanguage} · OPI language: {selectedPack.pack.displayName}</p>
            {profile.id === "demo-student-profile" && (
              <label className="demo-language-select" htmlFor="demo-practice-language">
                <span>Choose a practice language</span>
                <select
                  id="demo-practice-language"
                  value={selectedPackId}
                  onChange={(event) => {
                    const nextLanguagePackId = event.target.value;
                    setSelectedPackId(nextLanguagePackId);
                    window.localStorage.setItem("opi_active_language_pack", nextLanguagePackId);
                    setError("");
                  }}
                >
                  {languagePacks.map((definition) => (
                    <option key={definition.pack.id} value={definition.pack.id}>
                      {definition.pack.displayName} · {definition.pack.nativeName}
                    </option>
                  ))}
                </select>
                {selectedPackId === "lang_sn_zw_v1" && (
                  <small className="shona-pilot-note">Pilot pack · Audio uses your device voice until native Shona recordings are added.</small>
                )}
              </label>
            )}
            <label className="practice-duration" htmlFor="practice-duration">
              <span>
                <strong>Practice length</strong>
                <output htmlFor="practice-duration">{practiceMinutes} {practiceMinutes === 1 ? "minute" : "minutes"}</output>
              </span>
              <input
                id="practice-duration"
                type="range"
                min="1"
                max="20"
                step="1"
                value={practiceMinutes}
                onChange={(event) => setPracticeMinutes(Number(event.target.value))}
              />
              <small>Choose between 1 and 20 minutes.</small>
            </label>
            <div className="ready-start-actions">
              <button className="button button-gold" onClick={startPractice} disabled={busy}>{busy ? "Preparing..." : "Start interview ->"}</button>
            </div>
          </div>
          <figure className="interview-hero-visual" role="img" aria-label="Two graduate students practicing an oral interview in Thunderbird's global campus space">
            <figcaption><span>Listen</span><span>Speak</span><span>Respond naturally</span></figcaption>
          </figure>
        </section>
        {error && <p className="form-error setup-error" role="alert">{error}</p>}
      </main>
    );
  }

  return (
    <main className="workspace-page conversation-page">
      <div className="workspace-heading conversation-heading">
        <div>
          <span className="eyebrow">OPI INTERVIEW PRACTICE · {selectedPack.pack.displayName}</span>
          <h1>Conversation with Maya</h1>
          <p>Listen to each question, then answer aloud in your own words.</p>
        </div>
        <button className="text-link" onClick={resetPractice}>Leave interview</button>
      </div>
      <div className="conversation-layout">
        {countdown !== null ? (
          <section className="interview-countdown" aria-live="assertive">
            <span className="eyebrow eyebrow-light">INTERVIEW STARTING</span>
            <strong>{countdown > 0 ? countdown : "Listen"}</strong>
            <p>{countdown > 0 ? "Get ready to hear Maya’s first question." : "Maya is about to begin."}</p>
          </section>
        ) : (
        <section className="conversation-card" aria-label="Practice conversation">
          <div className={isMayaSpeaking ? "interviewer-bar speaking" : "interviewer-bar"}>
            <span className="interviewer-avatar">M</span>
            <span><strong>Maya</strong><small>{snapshot.title} · Turn {answerCount + 1} · {mayaVoiceMode === "browser" ? "Device voice" : "Text only"}</small></span>
            <time className={timeExpired ? "conversation-timer expired" : "conversation-timer"} dateTime={`PT${remainingSeconds}S`} aria-live="polite">
              {timeExpired ? "Time complete" : `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`}
            </time>
            <span className="speaking-status" role="status" aria-live="polite">
              <span className="speaking-bars" aria-hidden="true"><i /><i /><i /></span>
              {isMayaSpeaking ? "Maya is speaking" : "Your turn"}
            </span>
          </div>
          <div
            className="conversation-progress"
            role="progressbar"
            aria-label={`Conversation progress: ${conversationStages[conversationStageIndex]}, stage ${conversationStageIndex + 1} of ${conversationStages.length}`}
            aria-valuemin={1}
            aria-valuemax={conversationStages.length}
            aria-valuenow={conversationStageIndex + 1}
          >
            <div className="conversation-progress-heading">
              <strong>Conversation progress</strong>
              <span>{conversationStages[conversationStageIndex]} · Stage {conversationStageIndex + 1} of {conversationStages.length}</span>
            </div>
            <div className="conversation-progress-track" aria-hidden="true">
              {conversationStages.map((stage, index) => (
                <span className={index < conversationStageIndex ? "complete" : index === conversationStageIndex ? "active" : ""} key={stage}>
                  <i />
                  <small>{stage}</small>
                </span>
              ))}
            </div>
          </div>
          <div className="message-stream" aria-live="polite">
            {snapshot.turns.map((turn) => {
              const coachTextHidden = turn.role === "coach" && !revealedCoachTurns.includes(turn.id);
              return <div className={`message-row ${turn.role}`} key={turn.id}>
                <span className="message-speaker">{turn.role === "coach" ? "Maya" : "You"}</span>
                <div className={coachTextHidden ? "message-bubble audio-question" : "message-bubble"}><p>{coachTextHidden ? "Listen to Maya’s question" : turn.text}</p>{turn.role === "learner" && playbackUrls[turn.id] && <audio className="inline-audio" controls src={playbackUrls[turn.id]} preload="metadata" />}<div className="message-meta"><button type="button" onClick={() => replayTurn(turn)}>{turn.role === "learner" && playbackUrls[turn.id] ? "Replay my voice" : "Listen again"}</button>{coachTextHidden && <button type="button" onClick={() => setRevealedCoachTurns((current) => [...current, turn.id])}>Show words</button>}</div></div>
              </div>;
            })}
            {busy && !completed && <div className="message-row coach"><span className="message-speaker">Maya</span><div className="message-bubble thinking"><span /><span /><span /><p>Listening…</p></div></div>}
            <div ref={conversationEnd} />
          </div>
          {completed ? (
            <div className="conversation-complete" role="status" aria-live="polite">
              <div className="completion-celebration" aria-hidden="true"><span>👏</span><span>👏</span></div>
              <div className="completion-copy"><span className="completion-label">Interview complete</span><strong>You completed your practice interview.</strong><p>Your personalized coaching feedback, transcript, and saved voice recordings are ready.</p></div>
              <div className="completion-actions"><a className="button button-gold" href={`/api/practice/report?sessionId=${snapshot.sessionId}&mode=${storageMode}`} download>Download my feedback report</a><Link className="button button-quiet" href={`/transcript?sessionId=${snapshot.sessionId}&mode=${storageMode}`}>Review conversation -&gt;</Link></div>
            </div>
          ) : (
            <form className="response-composer" onSubmit={sendResponse}>
              {timeExpired && <div className="time-limit-notice" role="status"><strong>Practice time complete</strong><span>Finish and save your current answer, or open your transcript.</span></div>}
              <div className="turn-panel-heading" aria-live="polite">
                <span className={recordedBlob && !voiceDetected ? "turn-state attention" : "turn-state"}>{turnState.label}</span>
                <div><strong>{turnState.title}</strong><p>{turnState.detail}</p></div>
              </div>
              <div className={isRecording ? "voice-capture voice-first-capture recording" : "voice-capture voice-first-capture"}>
                <button type="button" className={isRecording ? "record-button active" : "record-button"} onClick={isRecording ? stopRecording : startRecording} disabled={busy || (timeExpired && !isRecording)}>
                  <span className="microphone-mark" aria-hidden="true">{isRecording ? "■" : "●"}</span>
                  <span>{isRecording ? "Stop recording" : recordedBlob ? "Record again" : "Start recording"}</span>
                </button>
                {isRecording && <div className="recording-time"><span className="recording-wave" aria-hidden="true"><i /><i /><i /><i /></span><strong>{String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}</strong></div>}
                {recordedPreviewUrl && !isRecording && <><div className="voice-preview"><audio controls src={recordedPreviewUrl} /><button type="button" onClick={clearRecording}>Remove</button></div><label className="save-voice-toggle"><input type="checkbox" checked={recordingConsent} onChange={(event) => setRecordingConsent(event.target.checked)} /><span>Keep my voice recording for replay</span></label></>}
              </div>
              {response.trim() && <div id="practice-response" className="transcript-preview" role="status" aria-live="polite"><span>What Maya heard</span><p>{response}</p></div>}
              {recordedBlob && voiceDetected && !response.trim() && <div id="practice-response" className="transcript-preview quiet" role="status"><span>Transcript unavailable</span><p>Your voice is recorded. Maya may ask you to repeat if the words cannot be understood.</p></div>}
              <div className="composer-footer"><button type="button" className="finish-link" onClick={finishPractice} disabled={busy || isRecording || recordingFinalizing}>Finish interview</button><button type="submit" className="button button-gold" disabled={busy || isRecording || recordingFinalizing || !recordedBlob || !voiceDetected}>{busy ? "Sending..." : timeExpired ? "Save final answer →" : "Send answer →"}</button></div>
            </form>
          )}
          {error && <p className="form-error conversation-error" role="alert">{error}</p>}
        </section>
        )}
      </div>
    </main>
  );
}
