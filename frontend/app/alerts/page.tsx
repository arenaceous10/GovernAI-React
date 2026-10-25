"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function Alerts() {
  const [a, setA] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/alerts").then(setA).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="err">{err}</div>;
  if (!a) return <p className="muted">Loading...</p>;
  return (
    <>
      <h1>Alerts</h1>
      <p className="sub">{a.total === 0 ? "All clear." : `${a.total} item${a.total === 1 ? "" : "s"} need attention.`}</p>
      <div className="grid g3">
        <div className="card"><h2>Reviews overdue</h2>{a.reviews.length === 0 ? <div className="empty">None</div> : a.reviews.map((r: any) => (
          <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}><Link href={`/systems/${r.id}`}><b>{r.name}</b></Link><div className="muted" style={{ fontSize: 13 }}>Review was due {r.next_review}</div></div>))}</div>
        <div className="card"><h2>Open high-severity incidents</h2>{a.incidents.length === 0 ? <div className="empty">None</div> : a.incidents.map((i: any) => (
          <div key={i.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}><b>{i.title}</b><div className="muted" style={{ fontSize: 13 }}>{i.severity} - <Link href={`/systems/${i.uc}`}>{i.system?.name}</Link></div></div>))}</div>
        <div className="card"><h2>Overdue actions</h2>{a.actions.length === 0 ? <div className="empty">None</div> : a.actions.map((x: any) => (
          <div key={x.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}><b>{x.action}</b><div className="muted" style={{ fontSize: 13 }}>{x.owner} - due {x.due} - <Link href={`/systems/${x.uc}`}>{x.system?.name}</Link></div></div>))}</div>
      </div>
    </>
  );
}
