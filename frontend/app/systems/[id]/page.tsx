"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError, TIER, TierKey, ROLE_LABEL, getSession } from "@/lib/api";
import TierPill from "@/components/TierPill";
import Ring from "@/components/Ring";

const TABS = ["Lifecycle", "Risk", "Incidents and actions", "Changes", "AI screening", "History"];

export default function SystemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [tab, setTab] = useState(0);
  const [msg, setMsg] = useState<{ ok?: string; err?: string; blockers?: string[] }>({});
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");

  const load = useCallback(() => {
    return Promise.all([api(`/systems/${id}`), api("/config")]).then(([a, b]) => { setD(a); setCfg(b); })
      .catch((e) => setMsg({ err: e.message }));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<any>, ok: string) {
    setBusy(true); setMsg({});
    try { await fn(); setMsg({ ok }); await load(); }
    catch (e: any) {
      if (e instanceof ApiError && e.blockers) setMsg({ blockers: e.blockers });
      else setMsg({ err: e.message });
    }
    setBusy(false);
  }

  if (!d || !cfg) return <>{msg.err ? <div className="err">{msg.err}</div> : <p className="muted">Loading...</p>}</>;
  const s = d.system;
  const role = getSession().role;
  const color = TIER[s.tier as TierKey].color;
  const myApproval = d.approvals.find((a: any) => a.stage === s.stage && a.role === role);
  const canDecide = d.approvers.includes(role);

  return (
    <>
      <div className="row between wrap">
        <div className="row">
          <Ring percent={s.ring} size={72} stroke={8} color={color} label={s.status === "retired" ? "Done" : `${s.stage}/10`} />
          <div>
            <h1>{s.name}</h1>
            <div className="row wrap"><TierPill tier={s.tier} /><span className="muted">{s.code} - {s.score}/100 - Stage {s.stage}: {s.stage_name} - <span style={{ textTransform: "capitalize" }}>{String(s.status).replace("_", " ")}</span></span></div>
          </div>
        </div>
        {role === "governance_admin" && (
          <button className="btn danger sm" disabled={busy}
            onClick={() => { if (confirm("Delete this system and everything attached to it?")) act(async () => { await api(`/systems/${id}`, { method: "DELETE" }); router.push("/systems"); }, "Deleted"); }}>
            Delete system
          </button>
        )}
      </div>

      {msg.ok && <div className="okmsg">{msg.ok}</div>}
      {msg.err && <div className="err">{msg.err}</div>}
      {msg.blockers && (
        <div className="blockers"><b>Cannot move forward yet:</b><ul>{msg.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>
      )}

      <div className="tabs">{TABS.map((t, i) => <button key={t} className={tab === i ? "on" : ""} onClick={() => setTab(i)}>{t}</button>)}</div>

      {tab === 0 && (
        <div className="grid g2">
          <div className="card">
            <h2>Stage {s.stage} checklist</h2>
            {d.required_items.map((item: string) => {
              const row = d.checklist.find((c: any) => c.item === item);
              return (
                <label key={item} className="chk">
                  <input type="checkbox" checked={!!row?.done} disabled={busy || s.status === "retired"}
                    onChange={(e) => act(() => api(`/systems/${id}/checklist`, { method: "POST", body: { item, done: e.target.checked } }), "Checklist updated")} />
                  {item}
                </label>
              );
            })}
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" disabled={busy || s.status === "retired" || s.tier === "prohibited"}
                onClick={() => act(() => api(`/systems/${id}/advance`, { method: "POST" }), s.stage === 10 ? "System retired" : "Moved to the next stage")}>
                {s.stage === 10 ? "Retire system" : "Advance to next stage"}
              </button>
              {s.status === "returned" && role === "governance_admin" && (
                <button className="btn ghost" disabled={busy} onClick={() => act(() => api(`/systems/${id}/reopen`, { method: "POST" }), "Reopened for review")}>Reopen</button>
              )}
            </div>
            {s.tier === "prohibited" && <p className="muted">This use is prohibited under the EU AI Act. It cannot move forward.</p>}
            {s.next_review && <p className="muted">Next periodic review: {s.next_review}</p>}
          </div>

          <div className="card">
            <h2>Approvals needed at this stage</h2>
            {d.approvers.length === 0 ? <div className="empty">None. This system is blocked.</div> : d.approvers.map((r: string) => {
              const a = d.approvals.find((x: any) => x.stage === s.stage && x.role === r);
              return (
                <div key={r} className="row between" style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                  <span>{ROLE_LABEL[r] || r}</span>
                  <span className="pill" style={a?.outcome === "rejected" ? { background: "#fbe1e8", color: "#c2234a" } : a ? { background: "#e3f6ef", color: "#0f9d78" } : { background: "#eef0fa", color: "#8a90b3" }}>
                    {a ? String(a.outcome).replace(/_/g, " ") : "waiting"}
                  </span>
                </div>
              );
            })}
            {canDecide && s.status !== "retired" && s.tier !== "prohibited" && (
              <div style={{ marginTop: 14 }}>
                <label className="fl">Your decision as {ROLE_LABEL[role]}{myApproval ? ` (currently: ${String(myApproval.outcome).replace(/_/g, " ")})` : ""}</label>
                <textarea className="f" placeholder="Comment. Required if you approve with conditions." value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="row wrap" style={{ marginTop: 10 }}>
                  {[["approved", "Approve", "ok"], ["approved_with_conditions", "Approve with conditions", "ghost"], ["rejected", "Reject", "danger"]].map(([o, l, c]) => (
                    <button key={o} className={`btn sm ${c}`} disabled={busy}
                      onClick={() => act(async () => { await api(`/systems/${id}/decision`, { method: "POST", body: { outcome: o, comment } }); setComment(""); }, "Decision recorded")}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            {!canDecide && <p className="muted" style={{ marginTop: 12 }}>Your role ({ROLE_LABEL[role]}) does not approve at this stage.</p>}
            {d.blockers.length > 0 && (
              <div className="blockers" style={{ marginTop: 14 }}><b>Still open:</b><ul>{d.blockers.map((b: string) => <li key={b}>{b}</li>)}</ul></div>
            )}
          </div>
        </div>
      )}

      {tab === 1 && (
        <div className="grid g2">
          <div className="card">
            <h2>Why it is {TIER[s.tier as TierKey].label}</h2>
            <ul style={{ paddingLeft: 18, margin: 0 }}>{(s.risk?.reasons || []).map((r: string) => <li key={r} style={{ margin: "6px 0" }}>{r}</li>)}</ul>
            <p className="muted" style={{ marginTop: 14 }}>The tier is set by fixed rules, never by AI. Cutoffs: below 30 Minimal, 30 to 54 Limited, 55 and above High.</p>
          </div>
          <div className="card">
            <h2>Scores by dimension</h2>
            {cfg.dims.map((dim: string) => {
              const v = s.risk?.scores?.[dim] || 1;
              return (
                <div key={dim} style={{ margin: "10px 0" }}>
                  <div className="row between" style={{ fontSize: 13 }}><span>{dim}</span><b>{v} of 3 (weight {cfg.weights[dim]})</b></div>
                  <div style={{ height: 8, background: "#eceefa", borderRadius: 8 }}><div style={{ width: `${(v / 3) * 100}%`, height: 8, borderRadius: 8, background: color }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 2 && <IncidentsTab id={id} d={d} busy={busy} act={act} role={role} />}
      {tab === 3 && <ChangesTab id={id} d={d} busy={busy} act={act} s={s} />}

      {tab === 4 && (
        <div className="card">
          <h2>AI risk screening</h2>
          <p className="muted">An AI-written note on laws in scope and possible gaps. It explains and suggests. It never sets the tier.</p>
          <button className="btn" disabled={busy} onClick={() => act(() => api(`/systems/${id}/screen`, { method: "POST" }), "Screening note saved")}>Run screening</button>
          {d.screenings[0] && <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", background: "#f7f8fd", padding: 16, borderRadius: 12, marginTop: 16 }}>{d.screenings[0].note}</pre>}
          <p className="muted">AI-assisted risk screening, not legal advice.</p>
        </div>
      )}

      {tab === 5 && (
        <div className="card">
          <h2>History</h2>
          {d.audit.length === 0 ? <div className="empty">Nothing yet.</div> : (
            <div className="tl">{d.audit.map((a: any) => (
              <div className="e" key={a.id}><b>{String(a.action).replace(/_/g, " ")}</b> by {a.actor}<div className="muted" style={{ fontSize: 13 }}>{a.detail} {a.at ? `- ${new Date(a.at).toLocaleString()}` : ""}</div></div>
            ))}</div>
          )}
        </div>
      )}
    </>
  );
}

function IncidentsTab({ id, d, busy, act, role }: any) {
  const [inc, setInc] = useState({ title: "", severity: "medium", root_cause: "process", actions: "" });
  const [ac, setAc] = useState({ finding: "", action: "", owner: "", due: "" });
  const canClose = role === "risk_reviewer" || role === "governance_admin";
  return (
    <div className="grid g2">
      <div className="card">
        <h2>Incidents</h2>
        {d.incidents.length === 0 && <div className="empty">No incidents.</div>}
        {d.incidents.map((i: any) => (
          <div key={i.id} className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div><b>{i.title}</b><div className="muted" style={{ fontSize: 13 }}>{i.severity} severity - {i.root_cause} - {i.status}</div></div>
            {i.status === "open" && canClose && <button className="btn ghost sm" disabled={busy} onClick={() => act(() => api(`/incidents/${i.id}/close`, { method: "POST" }), "Incident closed")}>Close</button>}
          </div>
        ))}
        <h3 style={{ marginTop: 18 }}>Report an incident</h3>
        <input className="f" placeholder="What happened?" value={inc.title} onChange={(e) => setInc({ ...inc, title: e.target.value })} />
        <div className="row" style={{ marginTop: 8 }}>
          <select className="f" value={inc.severity} onChange={(e) => setInc({ ...inc, severity: e.target.value })}>{["low", "medium", "high", "critical"].map((x) => <option key={x}>{x}</option>)}</select>
          <select className="f" value={inc.root_cause} onChange={(e) => setInc({ ...inc, root_cause: e.target.value })}>{["process", "data", "model", "people", "vendor"].map((x) => <option key={x}>{x}</option>)}</select>
        </div>
        <button className="btn" style={{ marginTop: 10 }} disabled={busy || !inc.title.trim()}
          onClick={() => act(async () => { await api(`/systems/${id}/incidents`, { method: "POST", body: inc }); setInc({ ...inc, title: "" }); }, "Incident logged")}>Log incident</button>
      </div>
      <div className="card">
        <h2>Corrective actions</h2>
        {d.actions.length === 0 && <div className="empty">No actions.</div>}
        {d.actions.map((a: any) => (
          <div key={a.id} className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div><b>{a.action}</b><div className="muted" style={{ fontSize: 13 }}>{a.owner} - due {a.due} - {a.status}</div></div>
            {a.status === "open" && <button className="btn ghost sm" disabled={busy} onClick={() => act(() => api(`/actions/${a.id}/done`, { method: "POST" }), "Action completed")}>Done</button>}
          </div>
        ))}
        <h3 style={{ marginTop: 18 }}>Add an action</h3>
        <input className="f" placeholder="What needs doing?" value={ac.action} onChange={(e) => setAc({ ...ac, action: e.target.value })} />
        <div className="row" style={{ marginTop: 8 }}>
          <input className="f" placeholder="Owner" value={ac.owner} onChange={(e) => setAc({ ...ac, owner: e.target.value })} />
          <input className="f" type="date" value={ac.due} onChange={(e) => setAc({ ...ac, due: e.target.value })} />
        </div>
        <button className="btn" style={{ marginTop: 10 }} disabled={busy || !ac.action.trim() || !ac.due}
          onClick={() => act(async () => { await api(`/systems/${id}/actions`, { method: "POST", body: ac }); setAc({ finding: "", action: "", owner: "", due: "" }); }, "Action added")}>Add action</button>
      </div>
    </div>
  );
}

function ChangesTab({ id, d, busy, act, s }: any) {
  const [desc, setDesc] = useState("");
  const [material, setMaterial] = useState(false);
  const closed = s.status === "retired" || s.status === "blocked";
  return (
    <div className="grid g2">
      <div className="card">
        <h2>Change history</h2>
        {d.changes.length === 0 && <div className="empty">No changes recorded.</div>}
        {d.changes.map((c: any) => <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>{c.description}<div className="muted" style={{ fontSize: 13 }}>{c.material ? "Material change: sent back to stage 2" : "Minor change"}</div></div>)}
      </div>
      <div className="card">
        <h2>Request a change</h2>
        {closed ? <p className="muted">A {s.status} system cannot take change requests.</p> : (
          <>
            <textarea className="f" placeholder="What is changing (model, data, scope, vendor)?" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <label className="chk" style={{ border: 0 }}><input type="checkbox" checked={material} onChange={(e) => setMaterial(e.target.checked)} />Material change (sends the system back to stage 2 and clears approvals)</label>
            <button className="btn" disabled={busy || !desc.trim()} onClick={() => act(async () => { await api(`/systems/${id}/changes`, { method: "POST", body: { description: desc, material } }); setDesc(""); setMaterial(false); }, "Change recorded")}>Submit change</button>
          </>
        )}
      </div>
    </div>
  );
}
