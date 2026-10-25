import Link from "next/link";

const STATS = [
  { n: "20", l: "Frameworks" },
  { n: "47", l: "Legal provisions" },
  { n: "10", l: "Lifecycle stages" },
  { n: "4", l: "Risk tiers" },
];

const FEATURES = [
  { n: "01", h: "Register", t: "Describe a use case and get questions tailored to it." },
  { n: "02", h: "Classify", t: "Deterministic 0 to 100 score and the EU AI Act's four tiers, from Minimal to Unacceptable, with reasons." },
  { n: "03", h: "Screen", t: "Pick the laws in scope; the app retrieves their clauses and AI explains, never decides." },
  { n: "04", h: "Govern", t: "10 lifecycle stages, approvals, incidents, reviews and an audit log." },
];

export default function Landing() {
  return (
    <main className="land">
      <header className="land-top">
        <div className="logo land-logo"><i /> GovernAI</div>
        <Link href="/dashboard" className="btn ghost sm">Enter GovernAI</Link>
      </header>

      <section className="hero">
        <div className="eyebrow">Responsible AI governance</div>
        <h1>GovernAI</h1>
        <p>
          One place to register every AI system, classify its risk with transparent rules, screen it against the laws
          and frameworks you choose, such as the EU AI Act, GDPR, DPDP Act, NIST AI RMF and ISO 42001, and take it
          through approval gates with a full audit trail.
        </p>
        <Link href="/dashboard" className="btn hero-cta">Enter GovernAI</Link>
        <div className="stats">
          {STATS.map((s) => (
            <div key={s.l}><b>{s.n}</b><span>{s.l}</span></div>
          ))}
        </div>
      </section>

      <section className="feats">
        {FEATURES.map((f) => (
          <div key={f.n} className="feat">
            <div className="n">{f.n}</div>
            <h3>{f.h}</h3>
            <p>{f.t}</p>
          </div>
        ))}
      </section>

      <div className="land-cta">
        <Link href="/dashboard" className="btn">Enter GovernAI</Link>
        <p className="muted">You pick a demo role from the sidebar once you are inside.</p>
      </div>
      <footer className="land-foot">AI-assisted risk screening, not legal advice.</footer>
    </main>
  );
}
