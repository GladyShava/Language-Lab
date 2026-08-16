import Link from "next/link";

const journey = [
  { number: "01", icon: "🌐", title: "Choose a language", copy: "Select the language you want to practice.", href: "/practice" },
  { number: "02", icon: "●", title: "Talk with Maya", copy: "Listen and respond in a natural conversation.", href: "/practice" },
  { number: "03", icon: "↻", title: "Replay and review", copy: "Hear your voice and read the transcript.", href: "/transcript" },
];

export default function Home() {
  return (
    <main className="brief-home">
      <section className="brief-hero">
        <div className="brief-hero-copy">
          <span className="eyebrow eyebrow-light">AI OPI CONVERSATION STUDIO</span>
          <h1>Choose.<br />Speak.<br /><span>Replay.</span></h1>
          <p>A focused practice space for clearer, more confident conversations.</p>
          <div className="brief-actions"><Link className="button button-gold" href="/practice">Start practicing <span aria-hidden="true">→</span></Link><span>Multiple languages · Practice only</span></div>
        </div>
        <div className="journey-visual" aria-label="Three-step practice journey">
          <div className="journey-kicker"><span>HOW IT WORKS</span><span>3 STEPS</span></div>
          {journey.map((step) => <Link href={step.href} className="journey-row" key={step.number}><span className="journey-number">{step.number}</span><span className="journey-icon" aria-hidden="true">{step.icon}</span><span><strong>{step.title}</strong><small>{step.copy}</small></span><span aria-hidden="true">→</span></Link>)}
        </div>
      </section>
    </main>
  );
}
