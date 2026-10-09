"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { rubricDimensionDefinitions, type AdaptiveRubricProfile } from "@/lib/conversation/adaptive-rubric";
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

    Promise.all([
      fetch(`/api/practice?sessionId=${encodeURIComponent(sessionId)}&mode=${encodeURIComponent(mode)}`).then(async (response) => {
        if (!response.ok) throw new Error("Session unavailable");
        return await response.json() as {
          snapshot: { title: string; languagePackId: string; turns: Array<{ id: string; role: "coach" | "learner"; text: string; occurredAt: string }> };
          rubricProfile: AdaptiveRubricProfile;
        };
      }),
      fetch(`/api/practice/recording?sessionId=${encodeURIComponent(sessionId)}&mode=${encodeURIComponent(mode)}`).then(async (response) => {
        if (!response.ok) return { recordings: [] };
        return await response.json() as { recordings: Array<{ messageId: string; playbackUrl: string }> };
      }),
    ]).then(([sessionData, recordingData]) => {
      const started = new Date(sessionData.snapshot.turns[0]?.occurredAt ?? Date.now()).getTime();
      const recordingUrls = new Map(recordingData.recordings.map((recording) => [recording.messageId, recording.playbackUrl]));
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
      setReportHref(`/api/practice/report?sessionId=${encodeURIComponent(sessionId)}&mode=${encodeURIComponent(mode)}`);
      setSessionTitle(sessionData.snapshot.title);
      setLanguagePackId(sessionData.snapshot.languagePackId);
      setRubricProfile(sessionData.rubricProfile);
      setTranscript(lines); setLoadedSession(true); setActive(0);
    }).catch(() => {
      setTranscript([]);
      setLoadNote("That saved session is unavailable. Start a new interview to create a replay.");
    })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => () => { window.speechSynthesis.cancel(); audioRef.current?.pause(); }, []);

  const visible = useMemo(() => transcript.filter((line) => {
    const matchesFilter = filter === "all" || line.role === filter;
    return matchesFilter && line.text.toLowerCase().includes(query.toLowerCase());
  }), [filter, query, transcript]);
  const learnerCount = transcript.filter((line) => line.role === "learner").length;
  const recordedCount = transcript.filter((line) => line.role === "learner" && line.recordingUrl).length;

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
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.lang = languagePack.pack.localeTag;
      utterance.onend = () => { if (playbackRun.current === run) setPlayingId(null); resolve(); };
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
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
      const response = await fetch(reportHref);
      if (!response.ok) throw new Error("Report unavailable");
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
        <div><span className="eyebrow">TRANSCRIPT / REPLAY - {languagePack.pack.displayName}</span><h1>{loadedSession ? sessionTitle : "Your practice conversation"}</h1></div>
        <div className="button-row">{reportHref && <button type="button" onClick={() => void downloadReport()} disabled={downloadingReport} className="button button-quiet">{downloadingReport ? "Preparing PDF..." : "Download PDF report"}</button>}<Link href={communityHref} className="button button-quiet">Share anonymously (optional)</Link><Link href="/shadow" className="button button-gold">Hear a fluent example</Link></div>
      </div>

      {loadNote && <p className="transcript-notice" role="status">{loadNote}</p>}
      {reportNote && <p className="transcript-notice" role="status">{reportNote}</p>}
      {rubricProfile && (
        <section className="practice-reflection-report" aria-labelledby="practice-reflection-heading">
          <div className="report-heading">
            <div><span className="eyebrow">PRACTICE REFLECTION</span><h2 id="practice-reflection-heading">Your conversation report</h2><p>Clear, descriptive guidance based on what you demonstrated in this conversation.</p></div>
            <button type="button" className="button button-gold" onClick={() => void downloadReport()} disabled={!reportHref || downloadingReport}>{downloadingReport ? "Preparing PDF..." : "Download PDF report"}</button>
          </div>

          <div className="report-profile-summary">
            <div className="report-profile-highlight"><span>Current coaching stage</span><strong>{rubricProfile.currentStage}</strong><small>Based on {rubricProfile.turnsAnalyzed} {rubricProfile.turnsAnalyzed === 1 ? "response" : "responses"}</small></div>
            <div className="report-profile-highlight"><span>Overall practice profile</span><strong>{rubricProfile.overallScore.toFixed(1)} <small>/ 5</small></strong><small>A weighted coaching profile, not a test score</small></div>
            <div className="report-dimensions">
              {rubricDimensionDefinitions.map((definition) => {
                const dimension = rubricProfile.dimensions[definition.key];
                return <div className="report-dimension" key={definition.key}><div><strong>{definition.label}</strong><span>{dimension.score.toFixed(1)} / 5</span></div><div className="report-dimension-track"><i style={{ width: `${dimension.score * 20}%` }} /></div></div>;
              })}
            </div>
          </div>

          <div className="report-insight-grid">
            <article><span className="report-card-label">WHAT WORKED WELL</span><h3>Your strengths</h3>{rubricProfile.strengths.map((item) => <p key={item}>{item}</p>)}</article>
            <article><span className="report-card-label">WHAT TO DEVELOP</span><h3>Your growth areas</h3>{rubricProfile.growthAreas.map((item) => <p key={item}>{item}</p>)}</article>
            <article className="report-next-step"><span className="report-card-label">NEXT CONVERSATION</span><h3>One focused recommendation</h3><p>{rubricProfile.recommendation}</p></article>
            <article className="report-phrase"><span className="report-card-label">TRY THIS PHRASE</span><h3>A stronger way to express the idea</h3><p>“{rubricProfile.strongerPhrase}”</p></article>
          </div>

          {!rubricProfile.languageUse.targetLocaleTag.toLowerCase().startsWith("en") && <div className={`report-language-use ${rubricProfile.languageUse.status === "mixed_language" ? "attention" : ""}`}><strong>Target-language consistency</strong><p>{rubricProfile.languageUse.summary}</p>{rubricProfile.languageUse.englishWords.length > 0 && <p>English detected: {rubricProfile.languageUse.englishWords.join(", ")}</p>}<small>Transcript-based coaching check; speech recognition can occasionally mishear a word.</small></div>}

          <div className="report-reflection-row"><div><span className="report-card-label">REFLECT WHILE YOU REPLAY</span><h3>Listen once, then consider:</h3></div><ol><li>What did you communicate clearly?</li><li>Where could one detail or example strengthen your answer?</li><li>What would you try differently in your next conversation?</li></ol></div>
          <p className="report-disclaimer">{rubricProfile.disclaimer}</p>
        </section>
      )}
      <div className="replay-layout">
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

        <aside className="replay-aside">
          <div className="audio-card">
            <span className="eyebrow eyebrow-light">SESSION REPLAY</span><h2>{playingAll ? "Conversation playing" : playingId ? "Turn playing" : "Ready to replay"}</h2>
            <p>AI responses are read aloud. Recorded learner responses play in the learner&apos;s original voice.</p>
            <div className="large-wave" aria-hidden="true">| || | ||| || | ||| | || | ||| || |</div>
            <div className="progress-track"><span style={{ width: transcript.length ? `${Math.max(5, ((active + 1) / transcript.length) * 100)}%` : "0%" }} /></div>
            <button className="button button-gold replay-main" disabled={!transcript.length} onClick={playingAll || playingId ? stopPlayback : () => void playConversation()}>{playingAll || playingId ? "Stop replay" : "Play from beginning"}</button>
          </div>
          <div className="replay-summary"><span className="eyebrow">SESSION SUMMARY</span><div><strong>{transcript.length}</strong><span>Total turns</span></div><div><strong>{learnerCount}</strong><span>Your responses</span></div><div><strong>{recordedCount}</strong><span>Voice recordings</span></div></div>
          <div className="privacy-card"><strong>Coaching profile only</strong><p>{rubricProfile?.disclaimer ?? "This studio does not provide an official OPI rating, certification, pass/fail result, or readiness decision."}</p></div>
        </aside>
      </div>
    </main>
  );
}
