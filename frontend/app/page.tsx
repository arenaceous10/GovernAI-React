"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { api, TIER, TierKey } from "@/lib/api";
import TierPill from "@/components/TierPill";
import Ring from "@/components/Ring";

export default function Dashboard() {
  const [d, setD] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([api("/dashboard"), api("/config")]).then(([a, b]) => { setD(a); setCfg(b); })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="err">Could not load the dashboard: {err}</div>;
  if (!d || !cfg) return <p className="muted">Loading...</p>;

  const tierData = (cfg.tier_order as TierKey[]).map((t) => ({ key: t, name: TIER[t].label, value: d.by_tier[t], color: TIER[t].color }));
  const stageData = cfg.stages.map((s: string, i: number) => ({ stage: `${i + 1}`, name: s, count: d.by_stage[i + 1] || 0 }));
  const cov = Object.entries(d.coverage as Record<string, number>).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <h1>Dashboard</h1>
      <p className="sub">Every AI system in one place, scored the same way, gated the same way.</p>

      <div className="grid g4">
        <div className="card stat"><div className="n">{d.total}</div><div className="l">AI systems registered</div></div>
        <div className="card stat"><div className="n" style={{ color: TIER.high.color }}>{d.high_and_above}</div><div className="l">High or unacceptable risk</div></div>
        <div className="card stat"><div className="n">{d.in_production}</div><div className="l">In production</div></div>
        <div className="card stat"><div className="n" style={{ color: d.open_alerts ? "#c2234a" : "inherit" }}>{d.open_alerts}</div><div className="l">Open alerts</div></div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Systems by lifecycle stage</h2>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={stageData} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e6f3" vertical={false} />
                <XAxis dataKey="stage" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: any) => [v, "Systems"]} labelFormatter={(l: any) => stageData[Number(l) - 1]?.name} />
                <Bar dataKey="count" fill="#6d5df6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2>Risk tiers</h2>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={tierData.filter((t) => t.value > 0)} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {tierData.filter((t) => t.value > 0).map((t) => <Cell key={t.key} fill={t.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="row wrap" style={{ justifyContent: "center", gap: 14 }}>
            {tierData.map((t) => (
              <span key={t.key} style={{ fontSize: 13 }}>
                <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: t.color, marginRight: 6 }} />
                {t.name} <b>{t.value}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Highest-risk systems</h2>
          <table className="t">
            <thead><tr><th>System</th><th>Tier</th><th>Score</th><th>Stage</th></tr></thead>
            <tbody>
              {d.top_risk.map((s: any) => (
                <tr key={s.id} className="click" onClick={() => (window.location.href = `/systems/${s.id}`)}>
                  <td><Link href={`/systems/${s.id}`}><b>{s.name}</b></Link><div className="muted" style={{ fontSize: 12 }}>{s.code}</div></td>
                  <td><TierPill tier={s.tier} /></td>
                  <td>{s.score}/100</td>
                  <td><Ring percent={s.status === "retired" ? 100 : s.stage * 10} size={40} stroke={5} label={`${s.stage}/10`} color={TIER[s.tier as TierKey].color} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Regulation coverage</h2>
          {cov.length === 0 ? <div className="empty">No frameworks tagged yet.</div> : cov.map(([law, n]) => (
            <div key={law} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span>{law}</span><b>{n} {n === 1 ? "system" : "systems"}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
