"use client";

import { Sliders } from "lucide-react";
import {
  SCORING_PROFILES,
  normaliseWeights,
  type ScoringProfile,
  type ScoringWeights,
} from "@/lib/scoring-profiles";

type Props = {
  weights: ScoringWeights;
  activeProfileId: string | null; // null = custom
  onProfileSelect: (profile: ScoringProfile) => void;
  onWeightChange: (key: keyof ScoringWeights, value: number) => void;
};

const SLIDER_KEYS: Array<{ key: keyof ScoringWeights; label: string; hint: string }> = [
  { key: "footfall",      label: "Footfall",         hint: "people present right now" },
  { key: "demand",        label: "Demand generators", hint: "offices · hotels · transit" },
  { key: "gap",           label: "Opportunity gap",   hint: "low café saturation" },
  { key: "density",       label: "Resident density",  hint: "loyal neighbourhood base" },
  { key: "affordability", label: "Affordability",     hint: "low rent → wider margin" },
];

export function ScoringProfilePanel({
  weights,
  activeProfileId,
  onProfileSelect,
  onWeightChange,
}: Props) {
  const norm = normaliseWeights(weights);

  return (
    <div className="pointer-events-auto w-[300px] rounded-2xl border border-[var(--border-subtle)] bg-[rgba(19,28,44,0.92)] p-4 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2">
        <Sliders size={14} className="text-[var(--text-secondary)]" />
        <h3 className="text-[13px] font-semibold tracking-tight">Scoring Profile</h3>
      </div>

      {/* Preset chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SCORING_PROFILES.map((p) => {
          const on = activeProfileId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onProfileSelect(p)}
              className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors ${
                on
                  ? "bg-[var(--accent-blue)] text-white"
                  : "border border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)] hover:text-white"
              }`}
              title={p.description}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Individual sliders */}
      <div className="space-y-3">
        {SLIDER_KEYS.map(({ key, label, hint }) => {
          const pct = Math.round(norm[key] * 100);
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[11.5px] text-[var(--text-primary)]">
                  {label}
                  <span className="ml-1 text-[10px] text-[var(--text-muted)]">{hint}</span>
                </div>
                <span className="text-[11px] font-semibold text-[var(--accent-blue)]">
                  {pct}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(weights[key] * 100)}
                onChange={(e) =>
                  onWeightChange(key, Number(e.target.value) / 100)
                }
                className="profile-slider h-1 w-full appearance-none rounded-full"
                style={{
                  background: `linear-gradient(to right, var(--accent-blue) 0%, var(--accent-blue) ${pct}%, var(--toggle-off) ${pct}%, var(--toggle-off) 100%)`,
                }}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] leading-snug text-[var(--text-muted)]">
        Weights re-normalise to 100%. Score in the panel above updates live.
      </p>

      <style jsx>{`
        .profile-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid var(--accent-blue);
          box-shadow: 0 0 0 3px rgba(74, 140, 214, 0.18);
          cursor: pointer;
        }
        .profile-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid var(--accent-blue);
          box-shadow: 0 0 0 3px rgba(74, 140, 214, 0.18);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
