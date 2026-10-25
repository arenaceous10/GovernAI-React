"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, getSession, setSession, ROLE_LABEL } from "@/lib/api";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/systems", label: "AI systems" },
  { href: "/register", label: "Register a system" },
  { href: "/queue", label: "My queue" },
  { href: "/alerts", label: "Alerts" },
  { href: "/audit", label: "Audit trail" },
];

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [sess, setSess] = useState({ role: "submitter", name: "Guest" });
  const [roles, setRoles] = useState<string[]>(Object.keys(ROLE_LABEL));
  const [alerts, setAlerts] = useState(0);
  const [demo, setDemo] = useState(true);

  useEffect(() => {
    setSess(getSession());
    const h = () => setSess(getSession());
    window.addEventListener("governai-session", h);
    api("/config").then((c) => { setRoles(c.roles); setDemo(!!c.demo_mode); }).catch(() => {});
    return () => window.removeEventListener("governai-session", h);
  }, []);

  useEffect(() => {
    api("/alerts").then((a) => setAlerts(a.total)).catch(() => setAlerts(0));
  }, [path, sess.role]);

  return (
    <div className="shell">
      <aside className="side">
        <div className="logo"><i /> GovernAI</div>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={(n.href === "/" ? path === "/" : path.startsWith(n.href)) ? "on" : ""}>
              {n.label}
              {n.href === "/alerts" && alerts > 0 && <span className="badge">{alerts}</span>}
            </Link>
          ))}
        </nav>
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
