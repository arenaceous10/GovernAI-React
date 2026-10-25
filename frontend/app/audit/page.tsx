"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function Audit() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { api("/audit").then(setRows).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="err">{err}</div>;
  if (!rows) return <p className="muted">Loading...</p>;
  const shown = rows.filter((r) => `${r.actor} ${r.action} ${r.detail}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1>Audit trail</h1>
      <p className="sub">Every action is recorded: who did what, and when. Showing the latest {rows.length}.</p>
      <input className="f" style={{ maxWidth: 340, marginBottom: 14 }} placeholder="Filter by person, action or detail" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="t"><thead><tr><th style={{ paddingLeft: 20 }}>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>
          {shown.length === 0 && <tr><td colSpan={4} className="empty">No matching entries.</td></tr>}
          {shown.map((r) => (
            <tr key={r.id}><td style={{ paddingLeft: 20, whiteSpace: "nowrap" }}>{r.at ? new Date(r.at).toLocaleString() : "-"}</td><td>{r.actor}</td><td style={{ textTransform: "capitalize" }}>{String(r.action).replace(/_/g, " ")}</td><td className="muted">{r.detail}</td></tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}
