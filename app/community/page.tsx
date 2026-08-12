"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getDefaultLanguagePackDefinition } from "@/lib/language-packs/registry";
import type { CommunityLibraryItem } from "@/lib/community/demo-library";
import type { PracticeStorageMode, PracticeSnapshot } from "@/lib/practice/store";

const pack = getDefaultLanguagePackDefinition();

export default function CommunityLibraryPage() {
  const [objectiveId, setObjectiveId] = useState(pack.objectives[0].id);
  const [examples, setExamples] = useState<CommunityLibraryItem[]>([]);
  const [session, setSession] = useState<PracticeSnapshot | null>(null);
  const [mode, setMode] = useState<PracticeStorageMode>("d1");
  const [messageId, setMessageId] = useState("");
  const [preview, setPreview] = useState<{ text: string; redactions: string[]; styleLabel: string; vocabulary: string[] } | null>(null);
  const [reviewedText, setReviewedText] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [withdrawalCode, setWithdrawalCode] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadExamples = useCallback(async (id: string, storageMode: PracticeStorageMode) => {
    const response = await fetch(`/api/community?objectiveId=${encodeURIComponent(id)}&mode=${storageMode}`);
    const data = await response.json() as { examples?: CommunityLibraryItem[] };
    setExamples(data.examples ?? []);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("sessionId");
    const storageMode = params.get("mode") === "memory" ? "memory" : "d1";
    fetch(`/api/community?objectiveId=${encodeURIComponent(pack.objectives[0].id)}&mode=${storageMode}`).then(async (response) => {
      const data = await response.json() as { examples?: CommunityLibraryItem[] };
      setExamples(data.examples ?? []);
    });
    if (!sessionId) return;
    fetch(`/api/practice?sessionId=${encodeURIComponent(sessionId)}&mode=${storageMode}`).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json() as { snapshot: PracticeSnapshot };
      setMode(storageMode); setSession(data.snapshot); setObjectiveId(data.snapshot.objectiveId);
      const learner = data.snapshot.turns.find((turn) => turn.role === "learner");
      if (learner) setMessageId(learner.id);
      await loadExamples(data.snapshot.objectiveId, storageMode);
    }).catch(() => setNotice("The practice session is unavailable. You can still explore the library."));
  }, [loadExamples]);

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  function chooseObjective(id: string) {
    setObjectiveId(id); setPreview(null); setWithdrawalCode(""); setNotice("");
    void loadExamples(id, mode);
  }

  function listen(text: string, rate = 1) {
    window.speechSynthesis.cancel();
    const voice = new SpeechSynthesisUtterance(text); voice.lang = pack.pack.localeTag; voice.rate = rate;
    window.speechSynthesis.speak(voice);
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/community", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, storageMode: mode }) });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(data.error ?? "The request could not be completed."));
    return data;
  }

  async function createPreview() {
    if (!session || !messageId) return;
    setBusy(true); setNotice(""); setWithdrawalCode("");
    try {
      const data = await post({ action: "preview", sessionId: session.sessionId, messageId });
      const next = data.preview as typeof preview;
      setPreview(next); setReviewedText(next?.text ?? ""); setReviewConfirmed(false); setConsentConfirmed(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create the preview."); }
    finally { setBusy(false); }
  }

  async function share() {
    if (!session || !preview) return;
    setBusy(true); setNotice("");
    try {
      const data = await post({ action: "share", sessionId: session.sessionId, messageId, reviewedText, reviewConfirmed, consentConfirmed });
      setWithdrawalCode(String(data.withdrawalCode)); setNotice("Your anonymous text example is now in the library. Save the withdrawal code below.");
      await loadExamples(session.objectiveId, mode);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not share the example."); }
    finally { setBusy(false); }
  }

  async function withdraw() {
    setBusy(true); setNotice("");
    try {
      await post({ action: "withdraw", withdrawalCode: withdrawInput });
      setNotice("Consent withdrawn. The shared example has been removed from the library."); setWithdrawInput("");
      await loadExamples(objectiveId, mode);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not withdraw consent."); }
    finally { setBusy(false); }
  }

  const learnerTurns = session?.turns.filter((turn) => turn.role === "learner") ?? [];
  return (
    <main className="workspace-page community-page">
      <div className="workspace-heading"><div><span className="eyebrow">OPTIONAL COMMUNITY LEARNING</span><h1>Explore different ways to answer.</h1><p>Anonymous practice examples show varied speaking styles and vocabulary—not grades or ideal answers.</p></div><span className="practice-pill">PRACTICE ONLY</span></div>
      <div className="community-layout">
        <aside className="shadow-prompt-list community-sidebar"><span className="eyebrow">CHOOSE A PROMPT</span>{pack.objectives.map((item, index) => <button key={item.id} className={item.id === objectiveId ? "selected" : ""} onClick={() => chooseObjective(item.id)}><span>{String(index + 1).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{item.prompt}</small></span></button>)}<div className="privacy-card"><strong>Privacy by design</strong><p>Community playback uses a synthetic voice. Original recordings and identity details are never shared.</p></div></aside>
        <section className="community-main">
          <div className="library-heading"><div><span className="eyebrow">SHARED LEARNING LIBRARY</span><h2>{pack.objectives.find((item) => item.id === objectiveId)?.prompt}</h2></div><span>{examples.length} approaches</span></div>
          <div className="community-grid">{examples.map((example) => <article className="community-card" key={example.id}><div className="community-card-head"><span className="style-badge">{example.styleLabel}</span><span>{example.source === "curated" ? "Curated example" : "Anonymous community example"}</span></div><p>{example.content}</p><div className="vocabulary-chips">{example.vocabulary.map((word) => <span key={word}>{word}</span>)}</div><div className="library-listen"><button onClick={() => listen(example.content)}>Listen</button><button onClick={() => listen(example.content, 0.72)}>Listen slowly</button><span>Synthetic voice</span></div></article>)}</div>

          <section className="community-share">
            <div><span className="eyebrow">OPTIONAL CONTRIBUTION</span><h2>Share an anonymized response</h2><p>Nothing is shared unless you preview it, confirm it contains no personal information, and opt in.</p></div>
            {!session ? <div className="share-empty"><p>Open this page from a completed transcript to choose one of your responses.</p><Link className="button button-primary" href="/practice">Start a practice session</Link></div> : <>
              <label className="field-label" htmlFor="response-choice">Choose your response</label><select id="response-choice" value={messageId} onChange={(event) => { setMessageId(event.target.value); setPreview(null); }}><option value="">Select a response</option>{learnerTurns.map((turn, index) => <option key={turn.id} value={turn.id}>Response {index + 1}: {turn.text.slice(0, 72)}</option>)}</select>
              <button className="button button-primary" disabled={!messageId || busy} onClick={() => void createPreview()}>{busy ? "Working..." : "Create anonymous preview"}</button>
              {preview && <div className="share-preview"><div className="privacy-boundary"><strong>Only this text will be shared</strong><p>Your original voice recording, name, account information, and session details stay private.</p></div><label className="field-label" htmlFor="anonymous-text">Review and edit the anonymous text</label><textarea id="anonymous-text" value={reviewedText} onChange={(event) => setReviewedText(event.target.value)} />{preview.redactions.length > 0 && <p className="redaction-note">Removed automatically: {preview.redactions.join(", ")}.</p>}<div className="consent-checks"><label><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} /><span><strong>I reviewed this text</strong><small>It does not include my name, contact details, employer, school, address, or other identifying information.</small></span></label><label><input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} /><span><strong>I opt in to anonymous community sharing</strong><small>I understand this is optional and I can withdraw later using my private code.</small></span></label></div><button className="button button-gold" disabled={!reviewConfirmed || !consentConfirmed || busy} onClick={() => void share()}>Share anonymous text</button></div>}
            </>}
            {withdrawalCode && <div className="withdrawal-code"><strong>Save your withdrawal code</strong><code>{withdrawalCode}</code><button onClick={() => void navigator.clipboard.writeText(withdrawalCode)}>Copy code</button><p>It is shown only now. We do not store the readable code or connect it to your identity.</p></div>}
          </section>

          <section className="withdraw-panel"><div><span className="eyebrow">WITHDRAW CONSENT</span><h2>Remove a shared example</h2><p>Enter the private code provided when you shared.</p></div><div><input aria-label="Withdrawal code" value={withdrawInput} onChange={(event) => setWithdrawInput(event.target.value)} placeholder="Withdrawal code" /><button className="button button-quiet" disabled={!withdrawInput || busy} onClick={() => void withdraw()}>Withdraw and remove</button></div></section>
          {notice && <p className="community-notice" role="status">{notice}</p>}
        </section>
      </div>
    </main>
  );
}
