"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ROLE_LABEL, useSession, tierOf } from "@/lib/api";
import TierPill from "@/components/TierPill";
import Ring from "@/components/Ring";

export default function Queue() {
  const [q, setQ] = useState<any>(null);
  const [err, setErr] = useState("");
  const { role } = useSession();
  // Reload when the acting role changes so the queue always matches the role in the sidebar.
  useEffect(() => {
    setErr("");
    api("/queue").then(setQ).catch((e) => setErr(e.message));
  }, [role]);
  if (err) return <div className="err">{err}</div>;
  if (!q) return <p className="muted">Loading...</p>;

  const list = (rows: any[], empty: string) => rows.length === 0 ? <div className="empty">{empty}</div> : (
    <table className="t"><thead><tr><th>System</th><th>Tier</th><th>Stage</th><th /></tr></thead><tbody>
      {rows.map((s) => (
        <tr key={s.id}>
          <td><b>{s.name}</b><div className="muted" style={{ fontSize: 12 }}>{s.code}</div></td>
          <td><TierPill tier={s.tier} /></td>
          <td><Ring percent={s.ring} size={40} stroke={5} label={`${s.stage}/10`} color={tierOf(s.tier).color} /></td>
          <td style={{ textAlign: "right" }}><Link href={`/systems/${s.id}`}><button className="btn sm">Open</button></Link></td>
        </tr>
      ))}
    </tbody></table>
  );

  return (
    <>
      <h1>My queue</h1>
      <p className="sub">Systems waiting for a decision from you as {ROLE_LABEL[role] || role}. Change the role in the sidebar to see another queue.</p>
      <div className="card"><h2>Waiting for you</h2>{list(q.waiting || [], "Nothing is waiting on your role.")}</div>
      {role === "governance_admin" && <div className="card" style={{ marginTop: 16 }}><h2>Returned for remediation</h2>{list(q.returned || [], "No returned systems.")}</div>}
    </>
  );
}
