"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { evaluateAdaptiveConversation, type AdaptiveRubricProfile } from "@/lib/conversation/adaptive-rubric";
import { createSimpleFeedback } from "@/lib/report/simple-feedback";
import { readPracticeBackup, savePracticeBackup } from "@/lib/practice/recovery";
import type { PracticeSnapshot } from "@/lib/practice/store";
import { readLocalRecording } from "@/lib/practice/local-recordings";
import { loadBrowserVoices, selectMayaVoice } from "@/lib/speech/browser-voice";
import { getDefaultLanguagePackDefinition, getLanguagePackDefinition } from "@/lib/language-packs/registry";

const defaultLanguagePack = getDefaultLanguagePackDefinition();
type TranscriptFilter = "all" | "learner" | "coach";

interface TranscriptLine {
  id: string;
  time: string;
  role: "coach" | "learner";
  text: string;
  recordingUrl?: string;
}

export default function TranscriptPage() {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [loadedSession, setLoadedSession] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("Your practice conversation");
  const [sessionDate, setSessionDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TranscriptFilter>("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [active, setActive] = useState(0);
  const [loadNote, setLoadNote] = useState("");
  const [communityHref, setCommunityHref] = useState("/community");
  const [reportHref, setReportHref] = useState("");
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [rubricProfile, setRubricProfile] = useState<AdaptiveRubricProfile | null>(null);
  const [languagePackId, setLanguagePackId] = useState(defaultLanguagePack.pack.id);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackRun = useRef(0);
  const reportSnapshot = useRef<PracticeSnapshot | null>(null);
  const localPlaybackUrls = useRef<string[]>([]);
  const languagePack = getLanguagePackDefinition(languagePackId) ?? defaultLanguagePack;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let sessionId = params.get("sessionId");
    let mode = params.get("mode") ?? "d1";
    if (!sessionId) {
      try {
        const recent = JSON.parse(window.localStorage.getItem("opi_last_session") ?? "{}") as { sessionId?: string; mode?: string };
        sessionId = recent.sessionId ?? null;
        mode = recent.mode ?? mode;
      } catch {
        sessionId = null;
      }
    }
    if (!sessionId) {
      setLoadNote("No saved practice conversation is available yet. Complete an interview to create your replay.");
      return;
    }
    setLoading(true);
    const backup = readPracticeBackup(sessionId);

    Promise.all([
      fetch(`/api/practice?sessionId=${encodeURIComponent(sessionId)}&mode=${encodeURIComponent(mode)}`).then(async (response) => {
        if (!response.ok) throw new Error("Session unavailable");
        return await response.json() as {
          snapshot: PracticeSnapshot;
          rubricProfile: AdaptiveRubricProfile;
        };
      }).then(data => backup && (backup.snapshot.turns.length > data.snapshot.turns.length || backup.snapshot.status === "completed" && data.snapshot.status !== "completed")
        ? { snapshot: backup.snapshot, rubricProfile: evaluateAdaptiveConversation(backup.snapshot.turns, backup.snapshot.localeTag) } : data)
        .catch(error => {
          if (!backup) throw error;
          setLoadNote("Your conversation was recovered from this device. Your transcript and report are available.");
          return { snapshot: backup.snapshot, rubricProfile: evaluateAdaptiveConversation(backup.snapshot.turns, backup.snapshot.localeTag) };
        }),
      fetch(`/api/practice/recording?sessionId=${encodeURIComponent(sessionId)}&mode=${encodeURIComponent(mode)}`).then(async (response) => {
        if (!response.ok) return { recordings: [] };
        return await response.json() as { recordings: Array<{ messageId: string; playbackUrl: string }> };
      }).catch(() => ({ recordings: [] })),
    ]).then(async ([sessionData, recordingData]) => {
      const started = new Date(sessionData.snapshot.turns[0]?.occurredAt ?? Date.now()).getTime();
      const recordingUrls = new Map(recordingData.recordings.map((recording) => [recording.messageId, recording.playbackUrl]));
      await Promise.all(sessionData.snapshot.turns.filter(turn => turn.role === "learner").map(async turn => {
        const blob = await readLocalRecording(sessionData.snapshot.sessionId, turn.id).catch(() => null);
        if (!blob) return;
        const url = URL.createObjectURL(blob); localPlaybackUrls.current.push(url);
        recordingUrls.set(turn.id, url);
      }));
      const lines = sessionData.snapshot.turns.map((turn) => {
        const elapsed = Math.max(0, Math.round((new Date(turn.occurredAt).getTime() - started) / 1000));
        return {
          id: turn.id,
          time: `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`,
          role: turn.role,
          text: turn.text,
          recordingUrl: recordingUrls.get(turn.id),
        } satisfies TranscriptLine;
      });
      setCommunityHref(`/community?sessionId=${encodeURIComponent(sessionId)}&mode=${encodeURIComponent(mode)}`);
      reportSnapshot.current = sessionData.snapshot;
      savePracticeBackup({ ...backup, snapshot: sessionData.snapshot, mode: mode === "d1" ? "d1" : "memory" });
      setReportHref(`/api/practice/report?sessionId=${encodeURIComponent(sessionId)}&mode=${encodeURIComponent(mode)}`);
      setSessionTitle(sessionData.snapshot.title);
      setSessionDate(new Date(sessionData.snapshot.turns[0]?.occurredAt ?? Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
      setLanguagePackId(sessionData.snapshot.languagePackId);
      setRubricProfile(sessionData.rubricProfile);
      setTranscript(lines); setLoadedSession(true); setActive(0);
    }).catch(() => {
      setTranscript([]);
      setLoadNote("That saved session is unavailable. Start a new interview to create a replay.");
    })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => { window.speechSynthesis?.cancel(); audioRef.current?.pause(); localPlaybackUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  const visible = useMemo(() => transcript.filter((line) => {
    const matchesFilter = filter === "all" || line.role === filter;
    return matchesFilter && line.text.toLowerCase().includes(query.toLowerCase());
  }), [filter, query, transcript]);
  const learnerCount = transcript.filter((line) => line.role === "learner").length;
  const simpleFeedback = rubricProfile ? createSimpleFeedback(rubricProfile) : null;

  function stopPlayback() {
    playbackRun.current += 1;
    window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setPlayingId(null); setPlayingAll(false);
  }

  function playLineAsync(line: TranscriptLine, run: number): Promise<void> {
    setPlayingId(line.id);
    setActive(transcript.indexOf(line));
    if (line.role === "learner" && line.recordingUrl) {
      return new Promise((resolve) => {
        const audio = new Audio(line.recordingUrl);
        audioRef.current = audio;
        audio.onended = () => { if (playbackRun.current === run) setPlayingId(null); resolve(); };
        audio.onerror = () => { setLoadNote("One recording could not be played. Its transcript is still available."); resolve(); };
        void audio.play().catch(() => resolve());
      });
    }
    if (line.role === "learner") {
      setLoadNote("This learner response has no saved voice recording, so it will not be read in Maya’s voice.");
      setPlayingId(null);
      return Promise.resolve();
    }
    return loadBrowserVoices().then(voices => new Promise<void>((resolve) => {
      if (playbackRun.current !== run) { resolve(); return; }
      const voice = selectMayaVoice(voices, languagePack.pack.localeTag);
      if (!voice) { setLoadNote("A voice for this language is unavailable on this device. The transcript is still available."); setPlayingId(null); resolve(); return; }
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.onend = () => { if (playbackRun.current === run) setPlayingId(null); resolve(); };
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    }));
  }

  async function playLine(line: TranscriptLine) {
    stopPlayback();
    const run = playbackRun.current;
    await playLineAsync(line, run);
  }

  async function playConversation() {
    stopPlayback();
    const run = playbackRun.current;
    setPlayingAll(true);
    for (const line of transcript) {
      if (playbackRun.current !== run) return;
      await playLineAsync(line, run);
    }
    if (playbackRun.current === run) { setPlayingAll(false); setPlayingId(null); }
  }

  async function downloadReport() {
    if (!reportHref || downloadingReport) return;
    setDownloadingReport(true);
    setReportNote("");
    try {
      let response: Response;
      try { response = await fetch(reportHref); } catch { response = new Response(null, { status: 503 }); }
      if (!response.ok && reportSnapshot.current?.status === "completed") {
        response = await fetch("/api/practice/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshot: reportSnapshot.current }) });
      }
      if (!response.ok) throw new Error("Report unavailable");
      if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Invalid report format");
      const blobUrl = URL.createObjectURL(await response.blob());
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? "beyond-hello-practice-report.pdf";
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
      setReportNote("Your PDF report has been downloaded.");
    } catch {
      setReportNote("The report could not be downloaded. Please try again.");
    } finally {
      setDownloadingReport(false);
    }
  }

  return (
    <main className="workspace-page transcript-page">
      <div className="workspace-heading">
        <div><h1 id="practice-report-title">{loadedSession ? "Language Practice Report" : "Practice Review"}</h1>{loadedSession && <p className="report-session-objective">{sessionTitle}</p>}</div>
        <div className="button-row">{reportHref && <button type="button" onClick={() => void downloadReport()} disabled={downloadingReport} className="button button-primary">{downloadingReport ? "Preparing PDF..." : "Download PDF report"}</button>}</div>
      </div>

      {loadNote && <p className="transcript-notice" role="status">{loadNote}</p>}
      {reportNote && <p className="transcript-notice" role="status">{reportNote}</p>}
      {simpleFeedback && (
        <section className="practice-reflection-report" aria-labelledby="practice-report-title">
          <dl className="formal-report-metadata" aria-label="Session details"><div><dt>Language</dt><dd>{languagePack.pack.displayName}</dd></div><div><dt>Date</dt><dd>{sessionDate}</dd></div><div><dt>Responses</dt><dd>{learnerCount}</dd></div></dl>
          <div className="formal-report-body">
            <section className="formal-report-section"><h2>Observed strengths</h2><ul>{simpleFeedback.strengths.map(item => <li key={item}>{item}</li>)}</ul></section>
            <section className="formal-report-section formal-report-action"><h2>Next practice task</h2><p>{simpleFeedback.nextStep}</p></section>
          </div>
        </section>
      )}
      {loadedSession && <nav className="report-follow-up" aria-label="Continue practising"><Link href="/shadow">Hear a fluent example <span aria-hidden="true">→</span></Link><Link href={communityHref}>Share anonymously (optional) <span aria-hidden="true">→</span></Link></nav>}
      <details className="report-transcript-details">
        <summary>Conversation transcript and recordings</summary>
        <div className="report-transcript-content">
        <section className="transcript-card">
          <div className="replay-toolbar">
            <button className="button button-primary" onClick={playingAll ? stopPlayback : () => void playConversation()} disabled={loading || !transcript.length}>{playingAll ? "Stop replay" : "Play full conversation"}</button>
            <div className="transcript-filters" aria-label="Filter transcript">
              {(["all", "learner", "coach"] as TranscriptFilter[]).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All turns" : value === "learner" ? "My responses" : "AI responses"}</button>)}
            </div>
          </div>
          <div className="transcript-tools"><label className="search-field"><span aria-hidden="true">Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search transcript" placeholder="Search transcript" /></label><span>{visible.length} of {transcript.length} turns</span></div>
          <div className="transcript-list">
            {visible.map((line) => {
              const originalIndex = transcript.indexOf(line);
              const isPlaying = playingId === line.id;
              const hasLearnerRecording = line.role === "learner" && Boolean(line.recordingUrl);
              const displayText = line.text.startsWith("[Spoken response recorded") ? "Automatic transcript unavailable for this recorded response." : line.text;
              return (
                <article className={active === originalIndex ? "transcript-line active" : "transcript-line"} key={line.id}>
                  <span className="line-time">{line.time}</span><span className={`speaker speaker-${line.role}`}>{line.role === "coach" ? "Maya" : "You"}</span>
                  <div className="transcript-copy"><p>{displayText}</p><span>{line.role === "learner" ? hasLearnerRecording ? "Original voice recording" : "Voice recording was not saved" : "AI interviewer"}</span></div>
                  <button className="turn-replay" disabled={line.role === "learner" && !hasLearnerRecording} onClick={isPlaying ? stopPlayback : () => void playLine(line)}>{isPlaying ? "Stop" : hasLearnerRecording ? "Replay my voice" : line.role === "learner" ? "No recording" : "Hear Maya"}</button>
                </article>
              );
            })}
            {!visible.length && <div className="empty-transcript"><strong>{transcript.length ? "No matching turns" : "No saved conversation yet"}</strong><p>{transcript.length ? "Try another filter or search term." : "Complete a practice interview, then return here to replay your conversation."}</p></div>}
          </div>
        </section>

        </div>
      </details>
    </main>
  );
}
