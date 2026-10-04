import Link from "next/link";

const asuLanguageResources = [
  {
    href: "https://silc.asu.edu/learning-support-services/tutoring",
    title: "Language Learning Help",
    description: "Find study guidance and language-learning support from ASU SILC.",
  },
  {
    href: "https://international.clas.asu.edu/content/silc-cafe",
    title: "SILC Cafe",
    description: "Practice languages and connect with the ASU community.",
  },
  {
    href: "https://silc.asu.edu/content/intensive-language-courses",
    title: "Intensive Language Courses",
    description: "Explore proficiency-oriented language course options at ASU.",
  },
];

export default function ResourcesPage() {
  return (
    <main className="workspace-page info-page">
      <section className="info-hero">
        <span className="eyebrow">RESOURCES</span>
        <h1>Continue your speaking practice.</h1>
        <p>Use the resources available in Beyond Hello today.</p>
      </section>

      <div className="info-grid">
        <Link className="info-card info-link" href="/shadow">
          <h2>Fluent examples</h2>
          <p>Hear a clear model response and practice it in smaller sections.</p>
          <span>Open fluent examples →</span>
        </Link>

        <section className="info-card">
          <h2>Thunderbird language information</h2>
          <p>View the Thunderbird Second Language Proficiency Requirements information sheet.</p>
          <div className="resource-actions">
            <Link className="button button-primary" href="/resources/thunderbird-language-information">View document</Link>
            <a className="button button-secondary" href="/resources/thunderbird-language-requirements-fall-2024.pdf" download>Download PDF</a>
          </div>
        </section>

        <section className="info-card">
          <h2>ASU language resources</h2>
          <div className="official-resource-list">
            {asuLanguageResources.map((resource) => (
              <a key={resource.href} href={resource.href} target="_blank" rel="noreferrer">
                <strong>{resource.title}</strong>
                <span>{resource.description}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
