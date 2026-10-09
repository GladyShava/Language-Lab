"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { ConversationTurn } from "@/lib/conversation/types";
import { defaultLanguagePackId, listLanguagePackDefinitions } from "@/lib/language-packs/registry";
import type { PracticeStorageMode } from "@/lib/practice/store";

const languagePacks = listLanguagePackDefinitions();

const readinessCards = [
  {
    title: "Start and listen",
    description: "Select Start. Maya will ask the first question. Listen until she finishes speaking.",
  },
  {
    title: "Take 10 seconds to prepare",
    description: "After Maya finishes, a 10-second timer will begin. Use this time to think about your answer.",
  },
  {
    title: "Speak after the beep",
    description: "When the timer reaches zero, you will hear a beep. Start speaking—recording begins automatically.",
  },
  {
    title: "Send your response",
    description: "When you finish speaking, select Send Response. Maya will listen and continue the conversation.",
  },
] as const;

const mayaFemaleVoicePattern = /\b(Samantha|Zira|Aria|Jenny|Susan|Hazel|Victoria|Karen|Moira|Fiona|Tessa|Serena|Ava|Allison|Joana|Luciana|Helena|Sabina|Hortense|Hedda|Elsa|Maria|Irina|Heera|Kalpana|Lekha|Ayumi|Haruka|Kyoko|Huihui|Ting-Ting|Mei-Jia|Yuna|Sora|Laura|Monica|Paulina|Amelie|Amélie|Audrey|Julie|Female)\b/i;

async function loadBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  const initialVoices = window.speechSynthesis.getVoices();
  if (initialVoices.length) return initialVoices;
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 300);
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
  return window.speechSynthesis.getVoices();
}

function selectMayaVoice(voices: SpeechSynthesisVoice[], localeTag: string): SpeechSynthesisVoice | null {
  const normalizedLocale = localeTag.toLowerCase().replaceAll("_", "-");
  const language = normalizedLocale.split("-")[0];
  return [...voices].sort((left, right) => {
    const score = (voice: SpeechSynthesisVoice) => {
      const voiceLocale = voice.lang.toLowerCase().replaceAll("_", "-");
      return (mayaFemaleVoicePattern.test(voice.name) ? 100 : 0)
        + (voiceLocale === normalizedLocale ? 40 : voiceLocale.startsWith(`${language}-`) || voiceLocale === language ? 25 : 0)
        + (voice.localService ? 4 : 0)
        + (voice.default ? 1 : 0);
    };
    return score(right) - score(left);
  })[0] ?? null;
}

interface PracticeSnapshot {
  sessionId: string;
  languagePackId: string;
  localeTag: string;
  objectiveId: string;
  title: string;
  status: "active" | "completed";
  turns: ConversationTurn[];
}

interface SessionPracticeIdentity {
  firstName: string;
  participantKey: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type MayaVoiceMode = "api" | "browser" | "text";

type ProcessingStage = "sending-response" | "saving-recording" | "maya-responding" | null;

interface PendingRecordingUpload {
  id: string;
  blob: Blob;
  sessionId: string;
  messageId: string;
  durationMs: number;
  localPlaybackUrl: string;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export default function PracticePage() {
  const [selectedPackId, setSelectedPackId] = useState<string>(defaultLanguagePackId);
  const [firstName, setFirstName] = useState("");
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [readinessStep, setReadinessStep] = useState(0);
  const [sessionIdentity, setSessionIdentity] = useState<SessionPracticeIdentity | null>(null);
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
  const [voiceNotice, setVoiceNotice] = useState("Recording starts automatically after the preparation countdown.");
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState<number | null>(null);
  const [practiceMinutes, setPracticeMinutes] = useState(5);
  const [remainingSeconds, setRemainingSeconds] = useState(5 * 60);
  const [timeExpired, setTimeExpired] = useState(false);
  const [recordingFinalizing, setRecordingFinalizing] = useState(false);
  const [isMayaSpeaking, setIsMayaSpeaking] = useState(false);
  const [canRecord, setCanRecord] = useState(false);
  const [preparationSeconds, setPreparationSeconds] = useState<number | null>(null);
  const [mayaVoiceMode, setMayaVoiceMode] = useState<MayaVoiceMode>("text");
  const [isQuestionPreview, setIsQuestionPreview] = useState(false);
  const [revealedCoachTurns, setRevealedCoachTurns] = useState<string[]>([]);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>(null);
  const [pendingRecordingUploads, setPendingRecordingUploads] = useState<PendingRecordingUpload[]>([]);
  const [recordingSaveError, setRecordingSaveError] = useState("");
  const [recordingUploadRetrying, setRecordingUploadRetrying] = useState(false);
  const [microphoneStarting, setMicrophoneStarting] = useState(false);
  const [microphoneRetryAvailable, setMicrophoneRetryAvailable] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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
  const completionCelebrated = useRef(false);
  const completionAudioContext = useRef<AudioContext | null>(null);
  const preparationTriggered = useRef(false);
  const preparationCancelled = useRef(false);
  const autoSendPending = useRef(false);
  const submissionLock = useRef(false);
  const pendingRecordingUploadsRef = useRef<PendingRecordingUpload[]>([]);
  const recordingActive = useRef(false);
  const recognitionShouldRun = useRef(false);
  const pausedRef = useRef(false);
  const recordingPausedAt = useRef(0);
  const recordingPausedDuration = useRef(0);
  const mayaAudio = useRef<HTMLAudioElement | null>(null);
  const mayaAudioCache = useRef(new Map<string, string>());
  const mayaSpeechRun = useRef(0);

  const selectedPack = languagePacks.find((definition) => definition.pack.id === selectedPackId) ?? languagePacks[0];
  const turnState = isPaused
    ? { label: "Paused", title: "Conversation paused", detail: "Select Resume Conversation when you are ready to continue." }
    : processingStage === "sending-response"
    ? { label: "Sending", title: "Sending your response", detail: "Your answer is being submitted once. Please wait." }
    : processingStage === "saving-recording"
    ? { label: "Saving", title: "Saving your recording", detail: "Your answer is saved. We are attaching your voice for replay." }
    : processingStage === "maya-responding"
    ? { label: "Maya is responding", title: "Maya is preparing the next question", detail: "Listen when Maya begins speaking." }
    : microphoneStarting
    ? { label: "Connecting", title: "Connecting your microphone", detail: "If your browser asks, allow microphone access to begin recording." }
    : microphoneRetryAvailable
    ? { label: "Action needed", title: "Microphone access is needed", detail: "Allow microphone access, then select Try Microphone Again." }
    : preparationSeconds !== null
    ? { label: "Prepare", title: `Recording starts in ${preparationSeconds} seconds`, detail: "Think about your answer. Begin speaking after the beep." }
    : !canRecord && !recordedBlob
    ? { label: "Listen", title: isMayaSpeaking ? "Maya is speaking" : "Wait for the beep", detail: "Recording will unlock when Maya finishes her question." }
    : isRecording
    ? { label: "Listening", title: "Speak naturally", detail: "Select Send Response when you finish your answer." }
    : recordedBlob && voiceDetected
      ? { label: "Response ready", title: "Ready to send", detail: voiceNotice }
      : recordedBlob
        ? { label: "Try again", title: "No speech detected", detail: voiceNotice }
    : { label: "Your turn", title: "Answer Maya out loud", detail: "Take your time. You can replay your answer before sending it." };

  function closeRecorderAudioContext() {
    const context = audioContext.current;
    audioContext.current = null;
    if (!context || context.state === "closed") return;
    void context.close().catch(() => undefined);
  }

  useEffect(() => { conversationEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [snapshot?.turns.length, busy]);
  useEffect(() => {
    if (!isRecording || isPaused) return;
    const timer = window.setInterval(() => setRecordingSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedAt.current - recordingPausedDuration.current) / 1000))), 500);
    return () => window.clearInterval(timer);
  }, [isRecording, isPaused]);
  useEffect(() => {
    if (!autoSendPending.current || !recordedBlob || recordingFinalizing || isRecording || busy) return;
    const timer = window.setTimeout(() => {
      if (!autoSendPending.current) return;
      autoSendPending.current = false;
      void submitResponse();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [recordedBlob, recordingFinalizing, isRecording, busy, response]);
  useEffect(() => {
    if (preparationSeconds === null || isPaused) return;
    if (preparationSeconds > 0) {
      const timer = window.setTimeout(() => setPreparationSeconds((current) => current === null ? null : current - 1), 1000);
      return () => window.clearTimeout(timer);
    }
    if (preparationTriggered.current) return;
    preparationTriggered.current = true;
    void playRecordingStartBeep().then(() => {
      setPreparationSeconds(null);
      if (!preparationCancelled.current) void startRecording();
    });
  }, [preparationSeconds, isPaused]);
  useEffect(() => {
    if (!snapshot || completed || countdown !== null || timeExpired || isPaused) return;
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
  }, [snapshot, completed, countdown, timeExpired, isPaused]);
  useEffect(() => () => {
    recordingActive.current = false;
    recognitionShouldRun.current = false;
    speechRecognition.current?.stop();
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    if (voiceCheckTimer.current !== null) window.clearInterval(voiceCheckTimer.current);
    closeRecorderAudioContext();
    mayaSpeechRun.current += 1;
    mayaAudio.current?.pause();
    mayaAudio.current = null;
    mayaAudioCache.current.forEach((url) => URL.revokeObjectURL(url));
    mayaAudioCache.current.clear();
    window.speechSynthesis?.cancel();
    const celebrationContext = completionAudioContext.current;
    completionAudioContext.current = null;
    if (celebrationContext && celebrationContext.state !== "closed") void celebrationContext.close().catch(() => undefined);
    pendingRecordingUploadsRef.current.forEach((upload) => URL.revokeObjectURL(upload.localPlaybackUrl));
  }, []);
  useEffect(() => {
    if (countdown === null || !snapshot || isPaused) return;
    const timer = window.setTimeout(() => {
      if (countdown > 0) { setCountdown((value) => value === null ? null : value - 1); return; }
      setCountdown(null);
      const opening = snapshot.turns[0];
      if (opening) void speakMayaText(opening.text, snapshot.localeTag, cueStudentTurn);
    }, countdown > 0 ? 1000 : 500);
    return () => window.clearTimeout(timer);
  }, [countdown, snapshot, mayaVoiceMode, isPaused]);
  useEffect(() => { pendingRecordingUploadsRef.current = pendingRecordingUploads; }, [pendingRecordingUploads]);

  function clearRecording() {
    autoSendPending.current = false;
    recordingActive.current = false;
    recognitionShouldRun.current = false;
    recordingPausedAt.current = 0;
    recordingPausedDuration.current = 0;
    if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
    setRecordingFinalizing(false);
    setRecordedBlob(null);
    setRecordedPreviewUrl("");
    setRecordingSeconds(0);
    setVoiceDetected(false);
    setVoiceNotice("Recording starts automatically after the preparation countdown.");
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

  function cueStudentTurn() {
    clearRecording();
    updateResponse("");
    setError("");
    setCanRecord(true);
    preparationTriggered.current = false;
    preparationCancelled.current = false;
    setPreparationSeconds(10);
  }

  async function playRecordingStartBeep() {
    try {
      const context = completionAudioContext.current && completionAudioContext.current.state !== "closed"
        ? completionAudioContext.current
        : new AudioContext();
      completionAudioContext.current = context;
      if (context.state === "suspended") await context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1040, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.26);
      await new Promise((resolve) => window.setTimeout(resolve, 320));
    } catch {
      // Recording still begins if the device blocks the cue sound.
    }
  }

  function stopMayaPlayback() {
    mayaSpeechRun.current += 1;
    mayaAudio.current?.pause();
    mayaAudio.current = null;
    window.speechSynthesis?.cancel();
    setIsMayaSpeaking(false);
  }

  async function loadEnhancedMayaAudio(text: string, localeTag: string): Promise<string> {
    const cacheKey = `${localeTag}\u0000${text}`;
    const cached = mayaAudioCache.current.get(cacheKey);
    if (cached) return cached;
    const response = await fetch("/api/speech", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, localeTag }),
    });
    if (!response.ok) throw new Error("Enhanced voice unavailable");
    const blob = await response.blob();
    if (!blob.type.startsWith("audio/") || !blob.size) throw new Error("Invalid enhanced voice audio");
    const url = URL.createObjectURL(blob);
    mayaAudioCache.current.set(cacheKey, url);
    return url;
  }

  function speakWithBrowserVoice(text: string, localeTag: string, run: number, onFinished?: () => void) {
    if (typeof window.speechSynthesis === "undefined" || typeof window.SpeechSynthesisUtterance === "undefined") {
      if (mayaSpeechRun.current === run) {
        setMayaVoiceMode("text");
        setIsMayaSpeaking(false);
        setError("Maya's voice could not play. Her question is shown so you can continue practicing.");
        onFinished?.();
      }
      return;
    }
    void loadBrowserVoices().then((voices) => {
      if (mayaSpeechRun.current !== run) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const mayaVoice = selectMayaVoice(voices, localeTag);
      utterance.voice = mayaVoice;
      utterance.lang = mayaVoice?.lang ?? localeTag;
      utterance.rate = 0.94;
      utterance.pitch = 1.06;
      utterance.onstart = () => { if (mayaSpeechRun.current === run) setIsMayaSpeaking(true); };
      utterance.onend = () => {
        if (mayaSpeechRun.current !== run) return;
        setIsMayaSpeaking(false);
        onFinished?.();
      };
      utterance.onerror = () => {
        if (mayaSpeechRun.current !== run) return;
        setMayaVoiceMode("text");
        setIsMayaSpeaking(false);
        setError("Maya's voice could not play. Her question is shown so you can continue practicing.");
        onFinished?.();
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  async function speakMayaText(text: string, localeTag: string, onFinished?: () => void): Promise<void> {
    if (mayaVoiceMode === "text") { onFinished?.(); return; }
    stopMayaPlayback();
    const run = mayaSpeechRun.current;
    try {
      const audioUrl = await loadEnhancedMayaAudio(text, localeTag);
      if (mayaSpeechRun.current !== run) return;
      const audio = new Audio(audioUrl);
      mayaAudio.current = audio;
      audio.onplay = () => { if (mayaSpeechRun.current === run) setIsMayaSpeaking(true); };
      audio.onended = () => {
        if (mayaSpeechRun.current !== run) return;
        mayaAudio.current = null;
        setIsMayaSpeaking(false);
        onFinished?.();
      };
      audio.onerror = () => {
        if (mayaSpeechRun.current !== run) return;
        mayaAudio.current = null;
        speakWithBrowserVoice(text, localeTag, run, onFinished);
      };
      if (pausedRef.current) {
        setIsMayaSpeaking(true);
        return;
      }
      await audio.play();
    } catch {
      if (mayaSpeechRun.current === run) speakWithBrowserVoice(text, localeTag, run, onFinished);
    }
  }

  function updateResponse(value: string) {
    transcriptText.current = value;
    setResponse(value);
  }

  function startSpeechTranscription() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice("Live transcription is unavailable in this browser. Your voice is still being recorded.");
      return;
    }

    const recognition = new Recognition();
    const existingText = transcriptText.current.trim();
    recognition.lang = selectedPack.pack.localeTag;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let currentSegment = "";
      for (let index = 0; index < event.results.length; index += 1) currentSegment += `${event.results[index][0].transcript} `;
      const liveText = `${existingText} ${currentSegment}`.trim();
      updateResponse(liveText);
      if (liveText) setVoiceDetected(true);
      setVoiceNotice("Listening… your words are appearing below as you speak.");
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") recognitionShouldRun.current = false;
      setVoiceNotice("Your voice is still being recorded. Live transcription was interrupted, but the recording is safe.");
    };
    recognition.onend = () => {
      if (speechRecognition.current === recognition) speechRecognition.current = null;
      if (!recordingActive.current || !recognitionShouldRun.current || pausedRef.current) return;
      window.setTimeout(() => {
        if (recordingActive.current && recognitionShouldRun.current && !pausedRef.current && !speechRecognition.current) startSpeechTranscription();
      }, 200);
    };
    speechRecognition.current = recognition;
    try {
      recognition.start();
    } catch {
      speechRecognition.current = null;
      setVoiceNotice("Your voice is still being recorded. Live transcription could not restart on this device.");
    }
  }

  async function startRecording() {
    if (!canRecord || isMayaSpeaking) return;
    setError(""); setMicrophoneStarting(true); setMicrophoneRetryAvailable(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voicedSamples.current = 0;
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const levels = new Uint8Array(analyser.fftSize);
      audioContext.current = context;
      voiceCheckTimer.current = window.setInterval(() => {
        if (pausedRef.current) return;
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
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48_000 });
      } catch {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      }
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
      recorder.start(1000);
      recordingActive.current = true;
      recognitionShouldRun.current = true;
      pausedRef.current = false;
      recordingPausedAt.current = 0;
      recordingPausedDuration.current = 0;
      setIsRecording(true);
      startSpeechTranscription();
    } catch {
      setMicrophoneRetryAvailable(true);
      setError("Microphone access is unavailable. Allow microphone access, then try connecting it again.");
    } finally {
      setMicrophoneStarting(false);
    }
  }

  function stopRecording() {
    recordingActive.current = false;
    recognitionShouldRun.current = false;
    speechRecognition.current?.stop();
    if (mediaRecorder.current?.state === "recording") {
      autoSendPending.current = true;
      setRecordingFinalizing(true);
      mediaRecorder.current.stop();
    }
    if (voiceCheckTimer.current !== null) {
      window.clearInterval(voiceCheckTimer.current);
      voiceCheckTimer.current = null;
    }
    closeRecorderAudioContext();
    setRecordingSeconds(Math.max(1, Math.floor((Date.now() - recordingStartedAt.current - recordingPausedDuration.current) / 1000)));
    setIsRecording(false);
    const detected = Boolean(transcriptText.current.trim()) || voicedSamples.current >= 3;
    setVoiceDetected(detected);
    setVoiceNotice(detected
      ? "Recording complete. Your response is being sent automatically."
      : "Recording complete. Maya may ask you to repeat if no speech can be understood.");
  }

  function toggleConversationPause() {
    if (!snapshot || completed || busy || recordingFinalizing || microphoneStarting) return;
    if (!isPaused) {
      pausedRef.current = true;
      setIsPaused(true);
      if (isMayaSpeaking) {
        mayaAudio.current?.pause();
        window.speechSynthesis?.pause();
      }
      if (isRecording) {
        recordingPausedAt.current = Date.now();
        if (mediaRecorder.current?.state === "recording") mediaRecorder.current.pause();
        speechRecognition.current?.stop();
      }
      return;
    }

    pausedRef.current = false;
    setIsPaused(false);
    if (isMayaSpeaking) {
      if (mayaAudio.current?.paused) void mayaAudio.current.play().catch(() => undefined);
      else window.speechSynthesis?.resume();
    }
    if (isRecording) {
      if (recordingPausedAt.current) recordingPausedDuration.current += Date.now() - recordingPausedAt.current;
      recordingPausedAt.current = 0;
      if (mediaRecorder.current?.state === "paused") mediaRecorder.current.resume();
      recognitionShouldRun.current = true;
      startSpeechTranscription();
    }
  }

  function replayTurn(turn: ConversationTurn) {
    if (isRecording || busy || recordingFinalizing || isMayaSpeaking) return;
    stopMayaPlayback();
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

  async function uploadRecording(
    blob: Blob,
    sessionId: string,
    messageId: string,
    durationMs: number,
    attempt: number,
  ): Promise<string> {
    const diagnostic = { attempt, durationMs, sizeBytes: blob.size, mimeType: blob.type || "unknown" };
    console.info("[Beyond Hello] Recording upload started", diagnostic);
    const extension = blob.type.includes("mp4") ? "mp4" : "webm";
    const form = new FormData();
    form.set("audio", blob, `response-${messageId}.${extension}`);
    form.set("sessionId", sessionId);
    form.set("messageId", messageId);
    form.set("durationMs", String(durationMs));
    form.set("consentGranted", "true");
    form.set("mode", storageMode);
    form.set("clientUploadId", crypto.randomUUID());

    let upload: Response;
    try {
      upload = await fetch("/api/practice/recording", { method: "POST", body: form });
    } catch (caught) {
      console.error("[Beyond Hello] Recording upload failed before an HTTP response", { ...diagnostic, failureLocation: "browser-or-network", error: caught instanceof Error ? caught.message : "Unknown network error" });
      throw new Error("The conversation was saved, but the recording could not reach the server.");
    }

    const responseText = await upload.text();
    let audioData: { error?: string; recording?: { playbackUrl: string }; diagnosticId?: string } = {};
    try { audioData = responseText ? JSON.parse(responseText) as typeof audioData : {}; } catch { /* A hosting layer may return a non-JSON error page. */ }
    if (!upload.ok || !audioData.recording) {
      console.error("[Beyond Hello] Recording upload was rejected", { ...diagnostic, failureLocation: "application-or-deployment", httpStatus: upload.status, diagnosticId: audioData.diagnosticId ?? upload.headers.get("x-recording-diagnostic-id") });
      throw new Error(audioData.error ?? (upload.status === 413
        ? "The conversation was saved, but this recording was too large for the server."
        : "The conversation was saved, but its recording could not be stored for replay."));
    }
    console.info("[Beyond Hello] Recording upload completed", { ...diagnostic, httpStatus: upload.status, diagnosticId: audioData.diagnosticId ?? upload.headers.get("x-recording-diagnostic-id") });
    return audioData.recording.playbackUrl;
  }

  async function uploadRecordingWithRetry(blob: Blob, sessionId: string, messageId: string, durationMs: number): Promise<string> {
    try {
      return await uploadRecording(blob, sessionId, messageId, durationMs, 1);
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      return uploadRecording(blob, sessionId, messageId, durationMs, 2);
    }
  }

  async function retryPendingRecordings() {
    if (recordingUploadRetrying || !pendingRecordingUploads.length) return;
    setRecordingUploadRetrying(true);
    setRecordingSaveError("");
    const stillPending: PendingRecordingUpload[] = [];
    for (const pending of pendingRecordingUploads) {
      try {
        const playbackUrl = await uploadRecordingWithRetry(pending.blob, pending.sessionId, pending.messageId, pending.durationMs);
        setPlaybackUrls((current) => ({ ...current, [pending.messageId]: playbackUrl }));
        URL.revokeObjectURL(pending.localPlaybackUrl);
      } catch (caught) {
        stillPending.push(pending);
        setRecordingSaveError(caught instanceof Error ? caught.message : "The recording still could not be saved. Your conversation and local recording remain available on this page.");
      }
    }
    setPendingRecordingUploads(stillPending);
    setRecordingUploadRetrying(false);
  }

  async function startPractice(mode: "full" | "preview" = "full") {
    if (!sessionIdentity) { setError("Set up this practice session before starting the interview."); return; }
    const preview = mode === "preview";
    setIsQuestionPreview(preview);
    setCompleted(false);
    setProcessingStage(null);
    setMicrophoneStarting(false);
    setMicrophoneRetryAvailable(false);
    setIsPaused(false);
    pausedRef.current = false;
    setCountdown(null);
    completionCelebrated.current = false;
    Object.values(playbackUrls).filter((url) => url.startsWith("blob:")).forEach((url) => URL.revokeObjectURL(url));
    setPlaybackUrls({});
    clearRecording();
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
        body: JSON.stringify({ action: "start", languagePackId: selectedPackId, participantName: sessionIdentity.firstName, participantKey: sessionIdentity.participantKey, practiceMinutes }),
      });
      const data = await request.json() as { error?: string; snapshot: PracticeSnapshot; storageMode: PracticeStorageMode };
      if (!request.ok) throw new Error(data.error ?? "Could not start practice.");
      const canUseEnhancedVoice = typeof window.Audio !== "undefined";
      const canUseBrowserVoice = typeof window.speechSynthesis !== "undefined"
        && typeof window.SpeechSynthesisUtterance !== "undefined";
      const nextVoiceMode: MayaVoiceMode = canUseEnhancedVoice ? "api" : canUseBrowserVoice ? "browser" : "text";
      setMayaVoiceMode(nextVoiceMode);
      const voiceError = canUseEnhancedVoice || canUseBrowserVoice ? "" : "This browser cannot play Maya's voice. Her question is shown so you can continue practicing.";
      const opening = data.snapshot.turns.find((turn) => turn.role === "coach");
      setRevealedCoachTurns(nextVoiceMode === "text" && opening ? [opening.id] : []);
      setCanRecord(false);
      setPreparationSeconds(null);
      setRemainingSeconds(practiceMinutes * 60); setTimeExpired(false); setRecordingFinalizing(false);
      setSnapshot(data.snapshot); setStorageMode(data.storageMode); setCompleted(false); setCountdown(3); setError(voiceError);
      if (!preview) window.localStorage.setItem("opi_last_session", JSON.stringify({ sessionId: data.snapshot.sessionId, mode: data.storageMode }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start practice.");
    }
    finally { setBusy(false); }
  }

  function completeSessionSetup(selectedMinutes = practiceMinutes) {
    if (busy) return;
    const sanitizedFirstName = firstName.trim().replace(/[^\p{L}\p{M}' -]/gu, "").split(/\s+/)[0].slice(0, 40);
    if (!sanitizedFirstName) { setError("Enter the name you would like Maya to use."); return; }
    setError("");
    setFirstName(sanitizedFirstName);
    setPracticeMinutes(selectedMinutes);
    setRemainingSeconds(selectedMinutes * 60);
    setReadinessStep(0);
    setSessionIdentity({ firstName: sanitizedFirstName, participantKey: crypto.randomUUID() });
  }

  function submitSessionSetup(event: FormEvent) {
    event.preventDefault();
    completeSessionSetup();
  }

  function advanceSessionSetup(event: FormEvent) {
    event.preventDefault();
    if (setupStep === 1) {
      const sanitizedFirstName = firstName.trim().replace(/[^\p{L}\p{M}' -]/gu, "").split(/\s+/)[0].slice(0, 40);
      if (!sanitizedFirstName) { setError("Enter the name you would like Maya to use."); return; }
      setFirstName(sanitizedFirstName);
    }
    setError("");
    setSetupStep((current) => current === 1 ? 2 : 3);
  }

  async function submitResponse() {
    if (!snapshot || !recordedBlob || busy || isRecording || recordingFinalizing || submissionLock.current) return;
    submissionLock.current = true;
    autoSendPending.current = false;
    const responseBlob = recordedBlob;
    const responseDurationMs = recordingSeconds * 1000;
    const responseText = transcriptText.current.trim() || response.trim();
    const learnerText = responseText || "[Spoken response recorded. Automatic transcript unavailable.]";
    updateResponse(""); setBusy(true); setCanRecord(false); setError(""); setProcessingStage("sending-response");
    try {
      const request = await fetch("/api/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "respond", sessionId: snapshot.sessionId, storageMode, text: responseText, hasRecording: true, completeAfterResponse: timeExpired || isQuestionPreview, practiceMinutes, remainingSeconds }),
      });
      const data = await request.json() as { error?: string; turns: ConversationTurn[]; completed?: boolean };
      if (!request.ok) throw new Error(data.error ?? "Could not save your response.");
      setSnapshot((current) => current ? { ...current, status: data.completed ? "completed" : current.status, turns: [...current.turns, ...data.turns] } : current);
      const coachTurn = data.turns.find((turn) => turn.role === "coach");

      const learnerTurn = data.turns.find((turn) => turn.role === "learner");
      if (learnerTurn && recordingConsent) {
        setProcessingStage("saving-recording");
        try {
          const playbackUrl = await uploadRecordingWithRetry(responseBlob, snapshot.sessionId, learnerTurn.id, responseDurationMs);
          setPlaybackUrls((current) => ({ ...current, [learnerTurn.id]: playbackUrl }));
        } catch (caught) {
          const localPlaybackUrl = URL.createObjectURL(responseBlob);
          setPlaybackUrls((current) => ({ ...current, [learnerTurn.id]: localPlaybackUrl }));
          setPendingRecordingUploads((current) => [...current, { id: crypto.randomUUID(), blob: responseBlob, sessionId: snapshot.sessionId, messageId: learnerTurn.id, durationMs: responseDurationMs, localPlaybackUrl }]);
          setRecordingSaveError(caught instanceof Error ? caught.message : "Your conversation was saved, but its recording could not be stored for replay.");
        }
      } else if (learnerTurn) {
        setPlaybackUrls((current) => ({ ...current, [learnerTurn.id]: URL.createObjectURL(responseBlob) }));
      }
      clearRecording();
      if (data.completed) {
        setProcessingStage(null);
        setCompleted(true);
        speakCoachTurn(coachTurn, isQuestionPreview ? undefined : playCompletionClap);
      } else {
        setProcessingStage("maya-responding");
        speakCoachTurn(coachTurn, () => { setProcessingStage(null); cueStudentTurn(); });
      }
    } catch (caught) {
      setProcessingStage(null);
      updateResponse(learnerText);
      setCanRecord(true);
      setError(caught instanceof Error ? `${caught.message} Your recording is still available—select Send Response to try again.` : "Your response could not be sent. Your recording is still available—select Send Response to try again.");
    }
    finally { setBusy(false); submissionLock.current = false; }
  }

  async function sendResponse(event: FormEvent) {
    event.preventDefault();
    autoSendPending.current = false;
    await submitResponse();
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
      setIsPaused(false); pausedRef.current = false;
      if (mayaAudio.current?.paused) void mayaAudio.current.play().catch(() => undefined);
      else window.speechSynthesis?.resume();
      setCompleted(true); setSnapshot((current) => current ? { ...current, status: "completed", turns: [...current.turns, ...closingTurns] } : current);
      speakCoachTurn(closingTurns.find((turn) => turn.role === "coach"), playCompletionClap);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not finish this practice."); }
    finally { setBusy(false); }
  }

  function confirmEndConversation() {
    if (busy || recordingFinalizing || isRecording) return;
    if (!window.confirm("End this conversation now? Maya will close the session and save the responses you already sent.")) return;
    void finishPractice();
  }

  if (!sessionIdentity) {
    return (
      <main className="workspace-page practice-setup-page session-setup-page">
        <section className="session-setup-card" aria-labelledby="session-setup-title">
          <header className="session-setup-header">
            <span className="session-brand-marker"><i aria-hidden="true" />BEYOND HELLO</span>
            <h1 id="session-setup-title">Set Up Your Practice</h1>
          </header>
          <div className="session-step-progress" aria-label={`Question ${setupStep} of 3`}>
            <span>Question {setupStep} of 3</span>
            <div aria-hidden="true">{[1, 2, 3].map((step) => <i key={step} className={step <= setupStep ? "active" : ""} />)}</div>
          </div>
          <form className="session-setup-form" onSubmit={setupStep === 3 ? submitSessionSetup : advanceSessionSetup}>
            {setupStep === 1 && <label className="session-question-card session-step-panel" htmlFor="practice-first-name">
              <span className="session-question-heading"><b aria-hidden="true">01</b>What would you like Maya to call you?</span>
              <input id="practice-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={40} autoComplete="given-name" placeholder="Name Maya should use" autoFocus />
            </label>}
            {setupStep === 2 && <label className="session-question-card session-step-panel" htmlFor="practice-language">
              <span className="session-question-heading"><b aria-hidden="true">02</b>What language would you like to practice?</span>
              <select id="practice-language" value={selectedPackId} onChange={(event) => setSelectedPackId(event.target.value)} autoFocus>
                {languagePacks.map((definition) => <option key={definition.pack.id} value={definition.pack.id}>{definition.pack.displayName} · {definition.pack.nativeName}</option>)}
              </select>
            </label>}
            {setupStep === 3 && <label className="session-question-card session-duration-field session-step-panel" htmlFor="session-practice-duration">
              <span className="session-question-heading"><b aria-hidden="true">03</b>How long would you like to practice?</span>
              <output htmlFor="session-practice-duration">{practiceMinutes} {practiceMinutes === 1 ? "minute" : "minutes"}</output>
              <input id="session-practice-duration" type="range" min="1" max="20" step="1" value={practiceMinutes} onChange={(event) => setPracticeMinutes(Number(event.target.value))} autoFocus />
              <small>Choose between 1 and 20 minutes.</small>
            </label>}
            <button className="button button-gold session-step-action" disabled={busy || (setupStep === 1 && !firstName.trim())}>Continue</button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
          <small className="session-privacy-note">The name you choose is used only for this practice session. No account is created.</small>
        </section>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="workspace-page practice-setup-page ready-start-page">
        <section className="preconversation-card" aria-labelledby="preconversation-title">
          <div className="preconversation-maya" aria-label="Maya, your AI conversation partner">
            <span className="preconversation-avatar" aria-hidden="true">M</span>
            <div>
              <span>YOUR CONVERSATION PARTNER</span>
              <strong>Maya</strong>
            </div>
          </div>
          <div className="preconversation-content">
            <span className="eyebrow">HOW IT WORKS</span>
            <h1 id="preconversation-title">{sessionIdentity.firstName}, here&apos;s how your conversation will work.</h1>
            <p className="preconversation-summary">{selectedPack.pack.displayName} · {practiceMinutes} {practiceMinutes === 1 ? "minute" : "minutes"}</p>
            <div className="readiness-progress" aria-label={`Instruction ${readinessStep + 1} of ${readinessCards.length}`}>
              <span>{readinessStep + 1} of {readinessCards.length}</span>
              <div aria-hidden="true">
                {readinessCards.map((card, index) => <i key={card.title} className={index <= readinessStep ? "active" : ""} />)}
              </div>
            </div>
            <article className="readiness-flashcard" aria-live="polite">
              <span className="readiness-card-number" aria-hidden="true">{String(readinessStep + 1).padStart(2, "0")}</span>
              <div>
                <h2>{readinessCards[readinessStep].title}</h2>
                <p>{readinessCards[readinessStep].description}</p>
              </div>
            </article>
            <div className="readiness-navigation">
              {readinessStep > 0 && <button className="button button-quiet" type="button" onClick={() => setReadinessStep((current) => Math.max(0, current - 1))}>Previous</button>}
              {readinessStep < readinessCards.length - 1 ? (
                <button className="button button-gold readiness-next" type="button" onClick={() => setReadinessStep((current) => Math.min(readinessCards.length - 1, current + 1))}>Next</button>
              ) : (
                <div className="preconversation-actions">
                  <button className="button button-gold preconversation-start" type="button" onClick={() => void startPractice("full")} disabled={busy}>{busy ? "Preparing..." : "Start"}</button>
                  <button className="button button-quiet preconversation-preview" type="button" onClick={() => void startPractice("preview")} disabled={busy}>Try one question first</button>
                </div>
              )}
            </div>
          </div>
        </section>
        {error && <p className="form-error setup-error" role="alert">{error}</p>}
      </main>
    );
  }

  return (
    <main className="workspace-page conversation-page">
      <div className="workspace-heading conversation-heading">
        <div>
          <span className="eyebrow">{isQuestionPreview ? "ONE-QUESTION PREVIEW" : `${selectedPack.pack.displayName.toUpperCase()} PRACTICE`}</span>
          <h1>Conversation with Maya</h1>
          <p>Listen to Maya&apos;s question, then answer naturally in your own words.</p>
        </div>
        {!completed && <div className="conversation-heading-actions">
          <button className={isPaused ? "button button-gold pause-conversation" : "button button-quiet pause-conversation"} type="button" onClick={toggleConversationPause} disabled={busy || recordingFinalizing || microphoneStarting}>{isPaused ? "Resume Conversation" : "Pause Conversation"}</button>
          {!isQuestionPreview && <button className="text-link" onClick={confirmEndConversation} disabled={busy || recordingFinalizing || isRecording} title={isRecording ? "Send your current response before ending the conversation." : undefined}>End Conversation</button>}
        </div>}
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
          <div className={isPaused ? "interviewer-bar paused" : isMayaSpeaking ? "interviewer-bar speaking" : "interviewer-bar"}>
            <span className="interviewer-avatar">M</span>
            <span><strong>Maya</strong></span>
            <time className={timeExpired ? "conversation-timer expired" : "conversation-timer"} dateTime={`PT${remainingSeconds}S`} aria-live="polite">
              {timeExpired ? "Time complete" : `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`}
            </time>
            <span className="speaking-status" role="status" aria-live="polite">
              <span className="speaking-bars" aria-hidden="true"><i /><i /><i /></span>
              {isPaused ? "Conversation paused" : isMayaSpeaking ? "Maya is speaking" : canRecord ? "Your turn" : "Wait for the beep"}
            </span>
          </div>
          {isPaused && <div className="conversation-paused-notice" role="status"><strong>Conversation paused</strong><span>Maya, the timer, and your recording will continue when you select Resume Conversation.</span></div>}
          <div className="message-stream" aria-live="polite">
            {snapshot.turns.map((turn) => {
              const coachTextHidden = turn.role === "coach" && !revealedCoachTurns.includes(turn.id);
              return <div className={`message-row ${turn.role}`} key={turn.id}>
                <span className="message-speaker">{turn.role === "coach" ? "Maya" : "You"}</span>
                <div className={coachTextHidden ? "message-bubble audio-question" : "message-bubble"}><p>{coachTextHidden ? "Listen to Maya’s question" : turn.text}</p>{turn.role === "learner" && playbackUrls[turn.id] && <audio className="inline-audio" controls src={playbackUrls[turn.id]} preload="metadata" />}<div className="message-meta"><button type="button" disabled={isRecording || busy || recordingFinalizing || isMayaSpeaking || isPaused} onClick={() => replayTurn(turn)}>{turn.role === "learner" && playbackUrls[turn.id] ? "Replay my voice" : "Listen Again"}</button>{coachTextHidden && <button type="button" onClick={() => setRevealedCoachTurns((current) => [...current, turn.id])}>Show Words</button>}</div></div>
              </div>;
            })}
            {busy && !completed && <div className="message-row coach"><span className="message-speaker">Maya</span><div className="message-bubble thinking"><span /><span /><span /><p>{processingStage === "saving-recording" ? "Saving your recording…" : processingStage === "maya-responding" ? "Preparing the next question…" : "Receiving your response…"}</p></div></div>}
            <div ref={conversationEnd} />
          </div>
          {completed && isQuestionPreview ? (
            <div className="conversation-complete question-preview-complete" role="status" aria-live="polite">
              <div className="preview-complete-mark" aria-hidden="true">✓</div>
              <div className="completion-copy"><span className="completion-label">Practice question complete</span><strong>You tried one question with Maya.</strong><p>This was a short preview. It does not create a feedback report or count toward your full conversation.</p></div>
              <div className="completion-actions"><button type="button" className="button button-gold" onClick={() => void startPractice("full")} disabled={busy}>Start Full Conversation</button><button type="button" className="button button-quiet" onClick={() => void startPractice("preview")} disabled={busy}>Try Another Question</button></div>
            </div>
          ) : completed ? (
            <div className="conversation-complete" role="status" aria-live="polite">
              <div className="completion-celebration" aria-hidden="true"><span>👏</span><span>👏</span></div>
              <div className="completion-copy"><span className="completion-label">Conversation complete</span><strong>Great work completing your conversation practice.</strong><p>Regular speaking practice is part of developing confidence and proficiency. Your descriptive practice feedback, transcript, and saved voice recordings are ready.</p></div>
              <div className="completion-actions"><a className="button button-gold" href={`/api/practice/report?sessionId=${snapshot.sessionId}&mode=${storageMode}`} download>Download my feedback report</a><Link className="button button-quiet" href={`/transcript?sessionId=${snapshot.sessionId}&mode=${storageMode}`}>Review conversation</Link></div>
            </div>
          ) : (
            <form className="response-composer" onSubmit={sendResponse}>
              {timeExpired && <div className="time-limit-notice" role="status"><strong>Practice time complete</strong><span>Finish your current answer. Maya will close the interview after it is sent.</span></div>}
              <div className="turn-panel-heading" aria-live="polite">
                <span className={recordedBlob && !voiceDetected || microphoneRetryAvailable ? "turn-state attention" : "turn-state"}>{turnState.label}</span>
                <div><strong>{turnState.title}</strong><p>{turnState.detail}</p></div>
              </div>
              <div className={isRecording ? "voice-capture voice-first-capture recording" : preparationSeconds !== null ? "voice-capture voice-first-capture preparing" : "voice-capture voice-first-capture"}>
                <button type="button" className={isRecording ? "record-button active" : "record-button"} onClick={isRecording ? stopRecording : microphoneRetryAvailable ? () => void startRecording() : undefined} disabled={isPaused || busy || microphoneStarting || (!isRecording && !microphoneRetryAvailable)}>
                  <span className="microphone-mark" aria-hidden="true">{isRecording ? "■" : "●"}</span>
                  <span>{isRecording ? "Send Response" : microphoneStarting ? "Connecting microphone…" : microphoneRetryAvailable ? "Try Microphone Again" : preparationSeconds !== null ? `Starting in ${preparationSeconds}` : recordedBlob ? "Sending response" : "Waiting for Maya"}</span>
                </button>
                {preparationSeconds !== null && <div className="recording-preparation" role="timer" aria-live="assertive"><strong>{preparationSeconds}</strong><span>Prepare your answer<small>Recording begins after the beep.</small></span></div>}
                {recordedPreviewUrl && !isRecording && <div className="voice-preview"><audio controls src={recordedPreviewUrl} /></div>}
                <label className="save-voice-toggle"><input type="checkbox" checked={recordingConsent} onChange={(event) => setRecordingConsent(event.target.checked)} disabled={busy} /><span>Keep my voice recording for replay</span></label>
              </div>
              {isRecording && <div id="practice-response" className="transcript-preview live-transcript" role="status" aria-live="polite"><span>Live transcript</span><p>{response.trim() || "Listening for your response…"}</p></div>}
              {!isRecording && response.trim() && <div id="practice-response" className="transcript-preview" role="status" aria-live="polite"><span>What Maya heard</span><p>{response}</p></div>}
              {recordedBlob && voiceDetected && !response.trim() && <div id="practice-response" className="transcript-preview quiet" role="status"><span>Transcript unavailable</span><p>Your voice is recorded. Maya may ask you to repeat if the words cannot be understood.</p></div>}
              <div className="composer-footer">{recordedBlob && <button type="submit" className="button button-gold" disabled={busy || isRecording || preparationSeconds !== null || recordingFinalizing || submissionLock.current}>{busy ? "Sending…" : "Send Response"}</button>}</div>
            </form>
          )}
          {error && <p className="form-error conversation-error" role="alert">{error}</p>}
          {recordingSaveError && <div className="recording-save-error" role="alert"><div><strong>Your answer was saved.</strong><p>{recordingSaveError} The local recording remains available on this page.</p></div><button type="button" className="button button-quiet" onClick={() => void retryPendingRecordings()} disabled={recordingUploadRetrying}>{recordingUploadRetrying ? "Saving…" : "Save recording again"}</button></div>}
        </section>
        )}
      </div>
    </main>
  );
}
