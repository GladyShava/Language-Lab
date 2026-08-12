"use client";

import { useEffect, useState } from "react";
import { getDefaultLanguagePackDefinition, getLanguagePackDefinition, listLanguagePackDefinitions } from "@/lib/language-packs/registry";

const defaultLanguagePack = getDefaultLanguagePackDefinition();
const resolveLanguagePack = (value: string | null | undefined) => value
  ? getLanguagePackDefinition(value)
    ?? listLanguagePackDefinitions().find((definition) => definition.pack.localeTag === value)
    ?? null
  : null;

export default function FluentExamplePage() {
  const [languagePackId, setLanguagePackId] = useState(defaultLanguagePack.pack.id);
  const languagePack = getLanguagePackDefinition(languagePackId) ?? defaultLanguagePack;
  const [objectiveId, setObjectiveId] = useState(defaultLanguagePack.objectives[0].id);
  const objective = languagePack.objectives.find((item) => item.id === objectiveId) ?? languagePack.objectives[0];
  const example = languagePack.fluentExamples.find((item) => item.objectiveId === objective.id) ?? languagePack.fluentExamples[0];

  useEffect(() => {
    async function loadActiveLanguage() {
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

      if (sessionId) {
        try {
          const response = await fetch(`/api/practice?sessionId=${encodeURIComponent(sessionId)}&mode=${encodeURIComponent(mode)}`);
          if (response.ok) {
            const data = await response.json() as { snapshot?: { languagePackId?: string; objectiveId?: string } };
            const sessionPack = resolveLanguagePack(data.snapshot?.languagePackId);
            if (sessionPack) {
              setLanguagePackId(sessionPack.pack.id);
              setObjectiveId(sessionPack.objectives.some((item) => item.id === data.snapshot?.objectiveId)
                ? data.snapshot!.objectiveId!
                : sessionPack.objectives[0].id);
              return;
            }
          }
        } catch {
          // Fall through to the account language when a previous session expired.
        }
      }

      const activePackId = window.localStorage.getItem("opi_active_language_pack");
      const activePack = resolveLanguagePack(activePackId);
      if (activePack) {
        setLanguagePackId(activePack.pack.id);
        setObjectiveId(activePack.objectives[0].id);
        return;
      }

      try {
        const response = await fetch("/api/profile");
        const data = await response.json() as { profile?: { targetLanguagePackId?: string } | null };
        const selectedId = data.profile?.targetLanguagePackId;
        const selectedPack = resolveLanguagePack(selectedId);
        if (selectedPack) {
          setLanguagePackId(selectedPack.pack.id);
          setObjectiveId(selectedPack.objectives[0].id);
        }
      } catch {
        // English remains the final safe fallback.
      }
    }

    void loadActiveLanguage();
  }, []);
  useEffect(() => () => window.speechSynthesis.cancel(), []);

  function listen(rate: number) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(example.content);
    utterance.lang = languagePack.pack.localeTag;
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main className="workspace-page shadow-page">
      <div className="workspace-heading"><div><span className="eyebrow">FLUENT EXAMPLE · {languagePack.pack.displayName}</span><h1>Hear one clear response.</h1><p>Listen for structure, rhythm, and useful vocabulary.</p></div></div>
      <div className="shadow-layout fluent-only-layout">
        <aside className="shadow-prompt-list">
          <span className="eyebrow">CHOOSE A PROMPT</span>
          {languagePack.objectives.map((item, index) => <button key={item.id} className={item.id === objective.id ? "selected" : ""} onClick={() => { window.speechSynthesis.cancel(); setObjectiveId(item.id); }}><span>{String(index + 1).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{item.prompt}</small></span></button>)}
        </aside>
        <section className="fluent-only-workspace">
          <div className="fluent-example-card">
            <span className="eyebrow eyebrow-light">MODEL RESPONSE</span>
            <h2>{example.title}</h2>
            <blockquote>{example.content}</blockquote>
            <div className="fluent-actions"><button className="button button-gold" onClick={() => listen(1)}>Listen</button><button className="button shadow-stop" onClick={() => listen(0.72)}>Listen slowly</button><button className="text-link fluent-stop-link" onClick={() => window.speechSynthesis.cancel()}>Stop</button></div>
          </div>
          <div className="fluent-note"><span aria-hidden="true">◐</span><div><strong>Listen for the pattern</strong><p>{example.coachingNote}</p></div></div>
        </section>
      </div>
    </main>
  );
}
