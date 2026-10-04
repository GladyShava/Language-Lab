import Link from "next/link";

const pages = Array.from({ length: 5 }, (_, index) => index + 1);

export default function ThunderbirdLanguageInformationPage() {
  return (
    <main className="workspace-page document-viewer-page">
      <header className="document-viewer-header">
        <div>
          <span className="eyebrow">THUNDERBIRD LANGUAGE INFORMATION</span>
          <h1>Second Language Proficiency Requirements</h1>
        </div>
        <div className="document-viewer-actions">
          <Link className="button button-secondary" href="/resources">Back to resources</Link>
          <a className="button button-primary" href="/resources/thunderbird-language-requirements-fall-2024.pdf" download>Download PDF</a>
        </div>
      </header>

      <section className="document-pages" aria-label="Thunderbird language requirements document">
        {pages.map((page) => (
          <figure className="document-page" key={page}>
            <img
              src={`/resources/thunderbird-language-information/page-${page}.png`}
              alt={`Thunderbird Second Language Proficiency Requirements, page ${page} of 5`}
              loading={page === 1 ? "eager" : "lazy"}
            />
            <figcaption>Page {page} of 5</figcaption>
          </figure>
        ))}
      </section>
    </main>
  );
}
