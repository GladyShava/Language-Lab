"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TEMPORARY_PRODUCT_NAME } from "../lib/brand";

export default function LandingPage() {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!tutorialOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTutorialOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tutorialOpen]);

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-background-visual" aria-hidden="true" />
        <div className="landing-copy">
          <p className="landing-kicker">{TEMPORARY_PRODUCT_NAME}</p>
          <h1 id="landing-title">An AI-Guided<br />Conversation Studio.</h1>
          <p className="landing-intro">
            Build confidence for a live language interview through realistic speaking practice,
            thoughtful review, and repeatable preparation.
          </p>

          <div className="landing-actions" aria-label="Get started">
            <Link className="landing-primary-action" href="/practice">Set Up Practice</Link>
            <button className="landing-secondary-action" type="button" onClick={() => setTutorialOpen(true)}>
              <span aria-hidden="true">▶</span> Listen to How This Works
            </button>
          </div>
        </div>
      </section>

      {tutorialOpen && (
        <div className="tutorial-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setTutorialOpen(false);
        }}>
          <section className="tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
            <button ref={closeButtonRef} className="tutorial-close" type="button" aria-label="Close explanation" onClick={() => setTutorialOpen(false)}>×</button>
            <p className="tutorial-kicker">How it works</p>
            <h2 id="tutorial-title">How the studio works</h2>
            <p>Listen to the short introduction, then begin when you are ready.</p>
            <div className="tutorial-media-slot">
              <audio controls preload="metadata" src="/audio/platform-introduction.mp3">
                Your browser does not support audio playback.
              </audio>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
