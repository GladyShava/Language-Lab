import Link from "next/link";

const journey = [
  { number: "01", icon: "🌐", title: "Choose Language", copy: "Select your practice language.", href: "/practice" },
  { number: "02", icon: "●", title: "AI Conversation", copy: "Speak in a natural conversation.", href: "/practice" },
  { number: "03", icon: "↻", title: "Replay", copy: "Listen to your actual voice.", href: "/transcript" },
  { number: "04", icon: "▤", title: "Transcript", copy: "Review every conversational turn.", href: "/transcript" },
  { number: "05", icon: "◐", title: "Fluent Example", copy: "Hear one clear model response.", href: "/shadow" },
];

export default function Home() {
  return (
    <main className="brief-home">
      <section className="brief-hero">
        <div className="brief-hero-copy">
          <span className="eyebrow eyebrow-light">AI OPI CONVERSATION STUDIO</span>
          <h1>Choose.<br />Speak.<br /><span>Replay.</span></h1>
          <p>A focused practice space for clearer, more confident conversations.</p>
          <div className="brief-actions"><Link className="button button-gold" href="/practice">Start practicing <span aria-hidden="true">→</span></Link><span>English demo · Practice only</span></div>
        </div>
        <div className="journey-visual" aria-label="Three-step practice journey">
          <div className="journey-kicker"><span>YOUR JOURNEY</span><span>01—05</span></div>
          {journey.map((step) => <Link href={step.href} className="journey-row" key={step.number}><span className="journey-number">{step.number}</span><span className="journey-icon" aria-hidden="true">{step.icon}</span><span><strong>{step.title}</strong><small>{step.copy}</small></span><span aria-hidden="true">→</span></Link>)}
        </div>
      </section>

      <section className="promise-row"><span className="promise-mark" aria-hidden="true">✓</span><div><strong>Practice with clear boundaries.</strong><p>Unofficial AI practice estimate. No pass/fail or official evaluation.</p></div><Link className="text-link" href="/practice">Begin with “Tell me about yourself” →</Link></section>
    </main>
  );
}
