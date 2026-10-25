"use client";
import { useEffect, useState } from "react";

// A progress ring. `percent` comes from the API (stage / 10), so the ring always matches the stage label.
export default function Ring({ percent, color = "#4338ca", size = 56, stroke = 6, label }:
  { percent: number; color?: string; size?: number; stroke?: number; label?: string }) {
  const [p, setP] = useState(0);
  useEffect(() => { const t = setTimeout(() => setP(percent), 60); return () => clearTimeout(t); }, [percent]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="ring-wrap" style={{ width: size, height: size }} title={`${percent}%`}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4e6f3" strokeWidth={stroke} />
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
      </svg>
      <span style={{ fontSize: size < 50 ? 11 : 13 }}>{label ?? `${percent}%`}</span>
    </span>
  );
}
