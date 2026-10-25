import { useEffect, useState } from "react";

// Talks to the FastAPI backend. In demo mode the chosen role travels as a header.
// The base URL comes only from NEXT_PUBLIC_API_URL (set it in Vercel and in frontend/.env.local).
export const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

export type Session = { role: string; name: string };
const GUEST: Session = { role: "submitter", name: "Guest" };

export function getSession(): Session {
  if (typeof window === "undefined") return GUEST;
  try {
    const s = JSON.parse(localStorage.getItem("governai_session") || "null");
    if (s && typeof s.role === "string" && s.role in ROLE_LABEL) return { role: s.role, name: String(s.name ?? "") };
  } catch {}
  return GUEST;
}

export function setSession(s: Session) {
  try { localStorage.setItem("governai_session", JSON.stringify(s)); } catch {}
  window.dispatchEvent(new Event("governai-session"));
}

// Re-renders the caller whenever the role or name changes (sidebar, another tab) and after a refresh.
export function useSession(): Session {
  const [s, setS] = useState<Session>(GUEST);
  useEffect(() => {
    const h = () => setS(getSession());
    h();
    window.addEventListener("governai-session", h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener("governai-session", h); window.removeEventListener("storage", h); };
  }, []);
  return s;
}

export class ApiError extends Error {
  status: number;
  blockers?: string[];
  constructor(status: number, message: string, blockers?: string[]) {
    super(message);
    this.status = status;
    this.blockers = blockers;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  if (!API) throw new ApiError(0, "NEXT_PUBLIC_API_URL is not set, so the app does not know where the API is.");
  const s = getSession();
  const res = await fetch(API + path, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "x-demo-role": s.role,
      "x-demo-name": s.name,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail: any = null;
    try { detail = (await res.json()).detail; } catch {}
    if (detail && typeof detail === "object" && detail.blockers) {
      throw new ApiError(res.status, "Blocked", detail.blockers);
    }
    const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join(", ") : res.statusText;
    throw new ApiError(res.status, msg || "Request failed");
  }
  return res.json();
}

export const ROLE_LABEL: Record<string, string> = {
  submitter: "Submitter",
  model_owner: "Model owner",
  privacy_reviewer: "Privacy reviewer",
  legal_reviewer: "Legal reviewer",
  risk_reviewer: "Risk reviewer",
  review_board: "Review board",
  governance_admin: "Governance admin",
};

export const TIER = {
  low:        { label: "MINIMAL",      color: "#0f9d78", soft: "#e3f6ef" },
  medium:     { label: "LIMITED",      color: "#d99a06", soft: "#fdf3d6" },
  high:       { label: "HIGH",         color: "#e0612b", soft: "#fde8de" },
  prohibited: { label: "UNACCEPTABLE", color: "#c2234a", soft: "#fbe1e8" },
} as const;
export type TierKey = keyof typeof TIER;
// Unknown tiers from the API fall back to MINIMAL instead of crashing the page.
export const tierOf = (t: string) => TIER[t as TierKey] || TIER.low;
