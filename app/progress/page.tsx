"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { rubricDimensionDefinitions, type AdaptiveStage, type RubricDimensionKey } from "@/lib/conversation/adaptive-rubric";
import type { TargetLanguageUseObservation } from "@/lib/conversation/target-language";

interface ProgressSession {
  sessionId: string;
  storageMode: "d1" | "memory";
  completedAt: string;
  languagePackId: string;
  languageName: string;
  durationMinutes: number;
  responseCount: number;
  stage: AdaptiveStage;
  overallScore: number;
  dimensions: Record<RubricDimensionKey, number>;
  recommendation: string;
  languageUse: TargetLanguageUseObservation;
}

export default function ProgressPage() {
  const [sessions, setSessions] = useState<ProgressSession[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<RubricDimensionKey>("communicationEffectiveness");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [disclaimer, setDisclaimer] = useState("");

  useEffect(() => {
    void fetch("/api/progress")
      .then(async (response) => {
        const data = await response.json() as { sessions?: ProgressSession[]; disclaimer?: string; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Progress is unavailable.");
        setSessions(data.sessions ?? []);
        setDisclaimer(data.disclaimer ?? "");
      })
      .catch((caught) => setMessage(caught instanceof Error ? caught.message : "Progress is unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const languages = useMemo(() => [...new Map(sessions.map((session) => [session.languagePackId, session.languageName])).entries()], [sessions]);
  const visibleSessions = useMemo(() => sessions.filter((session) => selectedLanguage === "all" || session.languagePackId === selectedLanguage), [selectedLanguage, sessions]);
  const latest = visibleSessions.at(-1);
  const previous = visibleSessions.at(-2);
  const selectedDefinition = rubricDimensionDefinitions.find((definition) => definition.key === selectedDimension) ?? rubricDimensionDefinitions[0];

  function changeFor(key: RubricDimensionKey) {
    if (!latest || !previous) return null;
    return Math.round((latest.dimensions[key] - previous.dimensions[key]) * 10) / 10;
  }

  return (
    <main className="workspace-page progress-page">
      <div className="workspace-heading">
        <div><span className="eyebrow">PRACTICE PROGRESS</span><h1>Your conversations over time</h1><p className="progress-intro">See how your communication habits change from one completed practice conversation to the next.</p></div>
        <Link className="button button-gold" href="/practice">Start another conversation</Link>
      </div>

      {loading && <div className="progress-empty"><strong>Building your progress view...</strong></div>}
      {!loading && message && <div className="progress-empty"><strong>{message}</strong><p>Sign in and complete an interview to begin tracking your practice.</p><Link className="button button-primary" href="/practice">Go to practice</Link></div>}
      {!loading && !message && !sessions.length && <div className="progress-empty"><strong>Your first progress point starts after one completed interview.</strong><p>Complete a conversation with Maya, then return here to see your coaching profile over time.</p><Link className="button button-primary" href="/practice">Start my first conversation</Link></div>}

      {!loading && !message && sessions.length > 0 && <>
        <section className="progress-summary" aria-label="Latest practice summary">
          <div><span>Completed conversations</span><strong>{visibleSessions.length}</strong></div>
          <div><span>Current coaching stage</span><strong>{latest?.stage ?? "-"}</strong></div>
          <div><span>Latest coaching profile</span><strong>{latest?.overallScore.toFixed(1) ?? "-"} / 5</strong></div>
          <div><span>Responses in latest session</span><strong>{latest?.responseCount ?? 0}</strong></div>
        </section>

        <section className="progress-chart-card" aria-labelledby="progress-chart-heading">
          <div className="progress-chart-heading">
            <div><span className="eyebrow">TREND VIEW</span><h2 id="progress-chart-heading">{selectedDefinition.label}</h2></div>
            {languages.length > 1 && <label className="progress-language-filter"><span>Language</span><select value={selectedLanguage} onChange={(event) => setSelectedLanguage(event.target.value)}><option value="all">All languages</option>{languages.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
          </div>
          <div className="dimension-tabs" aria-label="Choose a coaching dimension">
            {rubricDimensionDefinitions.map((definition) => <button key={definition.key} className={selectedDimension === definition.key ? "active" : ""} onClick={() => setSelectedDimension(definition.key)}>{definition.label}</button>)}
          </div>
          <div className="progress-chart" role="img" aria-label={`${selectedDefinition.label} across ${visibleSessions.length} completed practice conversations`}>
            <div className="chart-scale" aria-hidden="true"><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span></div>
            <div className="chart-grid" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="chart-series">
              {visibleSessions.map((session, index) => <div className="chart-point" key={session.sessionId}><div className="chart-bar-wrap"><strong>{session.dimensions[selectedDimension].toFixed(1)}</strong><i style={{ height: `${session.dimensions[selectedDimension] * 20}%` }} /></div><span>{new Date(session.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><small>#{index + 1}</small></div>)}
            </div>
          </div>
          <p className="chart-caption">Each column is one completed conversation. Look for direction over several sessions rather than treating one result as a verdict.</p>
        </section>

        <section className="dimension-overview" aria-label="Latest coaching dimensions">
          {rubricDimensionDefinitions.map((definition) => {
            const score = latest?.dimensions[definition.key] ?? 0;
            const change = changeFor(definition.key);
            return <article key={definition.key}><div><strong>{definition.label}</strong><span>{score.toFixed(1)} / 5</span></div><div className="rubric-track"><i style={{ width: `${score * 20}%` }} /></div><p>{change === null ? "Complete another conversation to establish a trend." : change > 0 ? `Up ${change.toFixed(1)} from your previous conversation.` : change < 0 ? `Down ${Math.abs(change).toFixed(1)} from your previous conversation - use this as your next practice focus.` : "Steady compared with your previous conversation."}</p></article>;
          })}
        </section>

        {latest && !latest.languageUse.targetLocaleTag.toLowerCase().startsWith("en") && <section className={`language-use-card ${latest.languageUse.status === "mixed_language" ? "attention" : ""}`} aria-label="Target-language consistency">
          <div><span className="eyebrow">TARGET-LANGUAGE CONSISTENCY</span><h2>{latest.languageUse.status === "mixed_language" ? "English appeared in this practice" : "You stayed in the practice language"}</h2></div>
          <p>{latest.languageUse.summary}</p>
          {latest.languageUse.englishWords.length > 0 && <p><strong>Words to replace next time:</strong> {latest.languageUse.englishWords.join(", ")}</p>}
          <small>This is a transcript-based coaching check. Speech transcription can occasionally mishear a word.</small>
        </section>}

        {latest && <section className="next-practice-card"><div><span className="eyebrow">NEXT CONVERSATION</span><h2>One focused recommendation</h2><p>{latest.recommendation}</p></div><Link className="button button-gold" href="/practice">Practice this now</Link></section>}

        <section className="session-history" aria-labelledby="session-history-heading">
          <div className="panel-title"><div><span className="eyebrow">HISTORY</span><h2 id="session-history-heading">Completed conversations</h2></div></div>
          <div className="session-history-list">
            {[...visibleSessions].reverse().map((session) => <article key={session.sessionId}><time dateTime={session.completedAt}>{new Date(session.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time><div><strong>{session.languageName} · {session.stage}</strong><p>{session.responseCount} responses · about {session.durationMinutes} min</p>{!session.languageUse.targetLocaleTag.toLowerCase().startsWith("en") && <p className={session.languageUse.status === "mixed_language" ? "language-flag" : "language-ok"}>{session.languageUse.status === "mixed_language" ? `English detected in ${session.languageUse.affectedTurns} ${session.languageUse.affectedTurns === 1 ? "response" : "responses"}` : "Target language maintained"}</p>}</div><span>{session.overallScore.toFixed(1)} / 5</span><div className="session-history-actions"><Link href={`/transcript?sessionId=${encodeURIComponent(session.sessionId)}&mode=${session.storageMode}`}>Review</Link><a href={`/api/practice/report?sessionId=${encodeURIComponent(session.sessionId)}&mode=${session.storageMode}`}>Report</a></div></article>)}
          </div>
        </section>
        <p className="progress-disclaimer">{disclaimer}</p>
      </>}
    </main>
  );
}
