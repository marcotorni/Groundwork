"use client";

import { Bell, Search, AudioWaveform } from "lucide-react";

const TABS = ["Explore Map", "Insights", "Predictions", "Saved"] as const;

export function TopNav({ activeTab = "Explore Map" }: { activeTab?: string }) {
  return (
    <header className="relative z-30 flex items-center justify-between gap-6 border-b border-[var(--border-subtle)] bg-[rgba(12,20,33,0.85)] px-6 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-amber)] to-[var(--accent-orange-deep)]">
          <AudioWaveform size={18} strokeWidth={2.25} className="text-white" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">Lisbon Retail Intel</span>
      </div>

      <nav className="flex items-center gap-6">
        {TABS.map((tab) => {
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              className={`relative pb-1 text-[14px] transition-colors ${
                active
                  ? "font-semibold text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab}
              {active && (
                <span className="absolute -bottom-[14px] left-0 right-0 h-[2px] rounded-full bg-[var(--text-primary)]" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            type="text"
            placeholder="Search"
            className="h-9 w-64 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel)] pl-9 pr-4 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:outline-none"
          />
        </div>
        <button className="relative grid h-9 w-9 place-items-center rounded-full bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <Bell size={16} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent-red)]" />
        </button>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-amber)] text-[12px] font-semibold tracking-wider text-[#1a1208]">
          M.T.
        </div>
      </div>
    </header>
  );
}
