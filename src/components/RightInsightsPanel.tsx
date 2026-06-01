"use client";

import { MoreHorizontal, Sparkles, Loader2 } from "lucide-react";

export type DistrictInsight = {
  name: string;
  score: number;
  projectedGrowthPct: number;
  bullets: string[];
  // AI overlay state — when present, score reflects formula + AI adjustment.
  aiActive?: boolean;
  aiLoading?: boolean;
  aiAdjustment?: number;
};

const FALLBACK: DistrictInsight = {
  name: "Chiado",
  score: 94,
  projectedGrowthPct: 15,
  bullets: [
    "High tourist footfall",
    "Premium consumer base",
    "Underserved specialty coffee niche",
    "Recommended locations: Rua Garrett, Praça Luís de Camões",
  ],
};

type Props = {
  insight?: DistrictInsight | null;
};

export function RightInsightsPanel({ insight }: Props) {
  const data = insight ?? FALLBACK;

  return (
    <div className="pointer-events-auto w-[300px] rounded-2xl border border-[var(--border-subtle)] bg-[rgba(19,28,44,0.92)] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold tracking-tight">AI Insights</h2>
          {data.aiLoading && (
            <Loader2 size={12} className="animate-spin text-[var(--accent-blue)]" />
          )}
          {data.aiActive && !data.aiLoading && (
            <span
              className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
              style={{ background: "rgba(74,140,214,0.18)", color: "var(--accent-blue)" }}
              title={
                data.aiAdjustment && data.aiAdjustment !== 0
                  ? `Gemini adjusted the formula score by ${data.aiAdjustment > 0 ? "+" : ""}${data.aiAdjustment}`
                  : "Analysis verified by Gemini"
              }
            >
              <Sparkles size={9} />
              Gemini
              {data.aiAdjustment != null && data.aiAdjustment !== 0 && (
                <span className="ml-0.5">
                  {data.aiAdjustment > 0 ? "+" : ""}{data.aiAdjustment}
                </span>
              )}
            </span>
          )}
        </div>
        <button
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          aria-label="More options"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      <h3 className="text-[18px] font-semibold leading-tight">
        {data.name} District Analysis
      </h3>

      <p className="mt-3 text-[12px] text-[var(--text-secondary)]">
        Coffee Shop Opportunity Score:
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className="glow-green text-[56px] font-semibold leading-none text-[var(--accent-green)]"
          style={{ letterSpacing: "-0.02em" }}
        >
          {data.score}
        </span>
        <span className="text-[18px] font-medium text-[var(--text-secondary)]">
          /100
        </span>
      </div>

      <SparklineChart />

      <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
        Projected Growth:{" "}
        <span className="font-medium text-[var(--accent-green)]">
          +{data.projectedGrowthPct}% YoY
        </span>
      </p>

      <ul className="mt-4 space-y-2 text-[12.5px] leading-snug text-[var(--text-primary)]">
        {data.bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-[var(--text-secondary)]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <button className="mt-5 w-full rounded-full border border-[var(--border-strong)] bg-transparent py-2.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-panel-elevated)]">
        Generate Full Report
      </button>
    </div>
  );
}

function SparklineChart() {
  // Procedural sparkline approximating the reference's gentle upward curve.
  const w = 260;
  const h = 56;
  const pts = [0.55, 0.5, 0.6, 0.4, 0.35, 0.45, 0.5, 0.42, 0.3, 0.22, 0.12];
  const path = pts
    .map((y, i) => {
      const x = (i / (pts.length - 1)) * w;
      const ny = h * y + 4;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ny.toFixed(1)}`;
    })
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" role="img" aria-label="Projected growth chart">
      <defs>
        <linearGradient id="sparkArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a8cd6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4a8cd6" stopOpacity="0" />
        </linearGradient>
        <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      <path d={area} fill="url(#sparkArea)" />
      <path d={path} stroke="#4a8cd6" strokeWidth="2" fill="none" filter="url(#lineGlow)" opacity="0.6" />
      <path d={path} stroke="#4a8cd6" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
