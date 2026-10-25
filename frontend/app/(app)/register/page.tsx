"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, TIER, TierKey } from "@/lib/api";
import TierPill from "@/components/TierPill";
import Ring from "@/components/Ring";

const GEOS = ["UK", "EU", "India", "US", "Australia", "Other"];
const DATA = ["Personal", "Financial", "Health", "Biometric", "Children", "Claims", "None of these"];
const FRAMEWORKS = ["EU AI Act", "UK GDPR", "ISO 42001", "NIST AI RMF", "DPDP Act (India)", "FCA Consumer Duty"];

// Same rules as the server, used only to preview the result live. The server decides the real tier.
function preview(cfg: any, scores: Record<string, number>, geos: string[], prohibited: string[], triggers: string[], data: string[]) {
  const W = cfg.weights as Record<string, number>;
  const lo = Object.values(W).reduce((a, b) => a + b, 0);
  const hi = lo * 3;
  const raw = Object.keys(W).reduce((a, k) => a + W[k] * (scores[k] || 1), 0);
  const geo = Math.min(3, Math.max(0, geos.length - 1));
  const total = Math.min(100, Math.round((100 * (raw - lo)) / (hi - lo)) + 2 * geo);
  if (prohibited.length) return { tier: "prohibited" as TierKey, total };
  let tier: TierKey = total < 30 ? "low" : total < 55 ? "medium" : "high";
  const crit = ["Impact", "People", "Reversibility", "Automation"].filter((d) => scores[d] === 3).length;
  const trig = [...triggers];
  if (data.includes("Biometric")) trig.push("b");
  if (data.includes("Children")) trig.push("c");
  if ((crit >= 3 || trig.length) && (tier === "low" || tier === "medium")) tier = "high";
  return { tier, total };
}

export default function Register() {
  const router = useRouter();
  const [cfg, setCfg] = useState<any>(null);
  const [f, setF] = useState({ name: "", bu: "", purpose: "", model: "", model_owner: "", misuse: "", automation: "advisory" });
  const [geos, setGeos] = useState<string[]>(["UK"]);
  const [data, setData] = useState<string[]>([]);
  const [fw, setFw] = useState<string[]>(["EU AI Act"]);
  const [proh, setProh] = useState<string[]>([]);
  const [trig, setTrig] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("/config").then(setCfg).catch((e) => setErr(e.message)); }, []);
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const allRated = cfg && cfg.dims.every((d: string) => scores[d]);
  const live = useMemo(() => (cfg && allRated ? preview(cfg, scores, geos, proh, trig, data) : null), [cfg, allRated, scores, geos, proh, trig, data]);

  async function submit() {
    setBusy(true); setErr("");
    try {
      const r = await api("/systems", { method: "POST", body: { ...f, geos, data, frameworks: fw, prohibited: proh, triggers: trig, scores } });
      router.push(`/systems/${r.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  if (!cfg) return <>{err ? <div className="err">{err}</div> : <p className="muted">Loading...</p>}</>;

  const chips = (opts: string[], sel: string[], set: (v: string[]) => void) => (
    <div className="seg">{opts.map((o) => <button key={o} type="button" className={sel.includes(o) ? "on" : ""} onClick={() => toggle(sel, set, o)}>{o}</button>)}</div>
  );

  return (
    <>
      <h1>Register an AI system</h1>
      <p className="sub">Answer honestly. The risk tier is worked out from your answers by fixed rules, not by AI.</p>
      <div className="grid g2">
        <div className="card">
          <h2>1. About the system</h2>
          <label className="fl">Name</label><input className="f" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <label className="fl">Business unit</label><input className="f" value={f.bu} onChange={(e) => setF({ ...f, bu: e.target.value })} />
          <label className="fl">What is it for?</label><textarea className="f" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
          <label className="fl">Model or vendor</label><input className="f" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
          <label className="fl">Accountable owner</label><input className="f" value={f.model_owner} onChange={(e) => setF({ ...f, model_owner: e.target.value })} />
          <label className="fl">How automated is it?</label>
          <select className="f" value={f.automation} onChange={(e) => setF({ ...f, automation: e.target.value })}>
            <option value="advisory">Advisory: a human decides</option><option value="assisted">Human reviews its output</option><option value="autonomous">Acts on its own</option>
          </select>
          <label className="fl">How could it be misused?</label><textarea className="f" value={f.misuse} onChange={(e) => setF({ ...f, misuse: e.target.value })} />

          <h2 style={{ marginTop: 26 }}>2. Where and what data</h2>
          <label className="fl">Where does it operate?</label>{chips(GEOS, geos, setGeos)}
          <label className="fl">Data it uses</label>{chips(DATA, data, setData)}
          <label className="fl">Regulations to check against</label>{chips(FRAMEWORKS, fw, setFw)}

          <h2 style={{ marginTop: 26 }}>3. Red lines</h2>
          <label className="fl">Prohibited practices (any one makes it UNACCEPTABLE)</label>
          {chips(cfg.prohibited, proh, setProh)}
          <label className="fl">Regulatory triggers (any one floors it to HIGH)</label>
          {chips(cfg.triggers, trig, setTrig)}
        </div>

        <div>
          <div className="card">
            <h2>4. Rate each dimension, 1 low to 3 high</h2>
            {cfg.dims.map((d: string) => (
              <div className="dim" key={d}>
                <span><b>{d}</b> <span className="muted" style={{ fontSize: 12 }}>weight {cfg.weights[d]}</span></span>
                <div className="seg">{[1, 2, 3].map((n) => <button key={n} type="button" className={scores[d] === n ? "on" : ""} onClick={() => setScores({ ...scores, [d]: n })}>{n}</button>)}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: 16, position: "sticky", top: 16 }}>
            <h2>Live result</h2>
            {live ? (
              <div className="row">
                <Ring percent={live.total} size={84} stroke={9} color={TIER[live.tier].color} label={`${live.total}`} />
                <div><TierPill tier={live.tier} /><p className="muted" style={{ margin: "6px 0 0" }}>Preview only. The server confirms the final tier on submit.</p></div>
              </div>
            ) : <p className="muted">Rate all {cfg.dims.length} dimensions to see the result.</p>}
            {err && <div className="err">{err}</div>}
            <button className="btn" style={{ marginTop: 14, width: "100%" }} disabled={busy || !f.name.trim() || !allRated} onClick={submit}>Register system</button>
          </div>
        </div>
      </div>
    </>
  );
}
