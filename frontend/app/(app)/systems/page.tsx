"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, TIER, TierKey, tierOf } from "@/lib/api";
import TierPill from "@/components/TierPill";
import Ring from "@/components/Ring";

export default function Systems() {
  const router = useRouter();
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("all");
  const [err, setErr] = useState("");

  useEffect(() => { api("/systems").then(setRows).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="err">{err}</div>;
  if (!rows) return <p className="muted">Loading...</p>;

  const shown = rows.filter((r) =>
    (tier === "all" || r.tier === tier) &&
    `${r.name} ${r.code} ${r.bu || ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="row between wrap">
        <div><h1>AI systems</h1><p className="sub">{rows.length} registered. The ring shows how far each system is through its 10-stage lifecycle.</p></div>
        <Link href="/register"><button className="btn">Register a system</button></Link>
      </div>

      <div className="row wrap" style={{ marginBottom: 14 }}>
        <input className="f" style={{ maxWidth: 320 }} placeholder="Search by name, code or business unit" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {["all", "prohibited", "high", "medium", "low"].map((t) => (
            <button key={t} className={tier === t ? "on" : ""} onClick={() => setTier(t)}>
              {t === "all" ? "All" : TIER[t as TierKey].label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="t">
          <thead><tr><th style={{ paddingLeft: 20 }}>System</th><th>Business unit</th><th>Tier</th><th>Score</th><th>Lifecycle</th><th>Status</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="empty">{rows.length === 0 ? "No AI systems registered yet." : "Nothing matches."}</td></tr>}
            {shown.map((s) => (
              <tr key={s.id} className="click" onClick={() => router.push(`/systems/${s.id}`)}>
                <td style={{ paddingLeft: 20 }}><Link href={`/systems/${s.id}`} onClick={(e) => e.stopPropagation()}><b>{s.name}</b></Link><div className="muted" style={{ fontSize: 12 }}>{s.code}</div></td>
                <td>{s.bu || "-"}</td>
                <td><TierPill tier={s.tier} /></td>
                <td>{s.score}/100</td>
                <td>
                  <div className="row">
                    <Ring percent={s.ring} size={46} stroke={5} label={s.status === "retired" ? "Done" : `${s.stage}/10`} color={tierOf(s.tier).color} />
                    <span style={{ fontSize: 13, color: "var(--ink2)" }}>{s.stage_name}</span>
                  </div>
                </td>
                <td style={{ textTransform: "capitalize" }}>{String(s.status).replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
