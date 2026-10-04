import Link from "next/link";

const helpSteps = [
  ["Set up practice", "Select Set Up Practice, enter your first name, choose a language and duration, then continue to Maya."],
  ["Respond", "Listen to Maya. After the preparation countdown and beep, speak naturally. Select Send Response when you finish."],
  ["Listen again", "Use Listen again beneath Maya’s question whenever you need to hear it another time."],
  ["Show the words", "Use Show words if you need to read Maya’s question."],
  ["Replay", "After completing a conversation, use Review conversation to replay the full exchange or individual responses."],
  ["Understand feedback", "Feedback describes strengths and areas to continue practicing. It is not an official rating or pass/fail result."],
] as const;

export default function HelpPage() {
  return <main className="workspace-page info-page"><section className="info-hero"><span className="eyebrow">HELP</span><h1>How to use Beyond Hello.</h1><p>Follow these steps whenever you want a quick practice or a complete conversation.</p><Link className="button button-gold" href="/practice">Set Up Practice</Link></section><div className="help-list">{helpSteps.map(([title, detail], index) => <article className="info-card" key={title}><span>0{index + 1}</span><div><h2>{title}</h2><p>{detail}</p></div></article>)}</div></main>;
}
