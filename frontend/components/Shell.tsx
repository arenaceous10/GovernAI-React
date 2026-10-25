"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, useSession, setSession, ROLE_LABEL } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/systems", label: "AI systems" },
  { href: "/register", label: "Register a system" },
  { href: "/queue", label: "My queue" },
  { href: "/alerts", label: "Alerts" },
  { href: "/audit", label: "Audit trail" },
];

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const sess = useSession();
  const [roles, setRoles] = useState<string[]>(Object.keys(ROLE_LABEL));
  const [alerts, setAlerts] = useState(0);
  const [demo, setDemo] = useState(true);

  useEffect(() => {
    api("/config").then((c) => { setRoles(c.roles); setDemo(!!c.demo_mode); }).catch(() => {});
  }, []);

  useEffect(() => {
    api("/alerts").then((a) => setAlerts(a.total)).catch(() => setAlerts(0));
  }, [path, sess.role]);

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="logo"><i /> GovernAI</Link>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={path?.startsWith(n.href) ? "on" : ""}>
              {n.label}
              {n.href === "/alerts" && alerts > 0 && <span className="badge">{alerts}</span>}
            </Link>
          ))}
        </nav>
        <Link href="/" className="side-home">Back to home</Link>
        <div className="who">
          <label>Acting as</label>
          <select value={sess.role} onChange={(e) => setSession({ ...sess, role: e.target.value })}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
          </select>
          <input value={sess.name} placeholder="Your name"
            onChange={(e) => setSession({ ...sess, name: e.target.value })} />
          <div className="demo-note">{demo ? "Demo mode: anyone can pick any role." : "Sign-in is required by the server."}</div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
