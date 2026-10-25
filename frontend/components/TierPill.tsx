import { TIER, TierKey } from "@/lib/api";

export default function TierPill({ tier }: { tier: TierKey }) {
  const t = TIER[tier] || TIER.low;
  return <span className="pill" style={{ background: t.soft, color: t.color }}>{t.label}</span>;
}
