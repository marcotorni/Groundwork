// Event data — types, fetcher, and helpers used by the timeline + heatmap.

import { isHourlyTick, tickToDate } from "@/lib/timeline";

export type EventCategory =
  | "concert"
  | "cultural"
  | "sports"
  | "conference"
  | "film"
  | "family"
  | "theatre"
  | "market"
  | "cruise"
  | "other";

export type EventInstance = {
  id: string;
  title: string;
  start_dt: string; // ISO
  end_dt: string | null;
  venue_name: string;
  venue_address?: string;
  lng: number;
  lat: number;
  category: EventCategory;
  size_estimate: number;
  url?: string;
  source: string;
};

export const EVENT_CATEGORIES: EventCategory[] = [
  "concert", "cultural", "sports", "conference", "film", "family", "theatre", "market", "cruise",
];

// Display metadata for the filter sub-panel.
export const EVENT_CATEGORY_META: Record<EventCategory, { label: string; color: string }> = {
  concert:    { label: "Concerts",         color: "#ec6532" },
  cultural:   { label: "Cultural / Public", color: "#f59e3b" },
  sports:     { label: "Sports",           color: "#5eb89a" },
  conference: { label: "Conferences",      color: "#4a8cd6" },
  film:       { label: "Film / Festivals", color: "#a78bfa" },
  family:     { label: "Family",           color: "#fbb6a8" },
  theatre:    { label: "Theatre",          color: "#d4a06a" },
  market:     { label: "Markets",          color: "#9ca3af" },
  cruise:     { label: "Cruise arrivals",   color: "#60a5fa" },
  other:      { label: "Other",            color: "#6b7280" },
};

// Logarithmic intensity so a 70k Web Summit doesn't dwarf a 1k Jazz em Agosto
// to invisibility. Output in [0, 1].
export function eventIntensity(sizeEstimate: number): number {
  const safe = Math.max(sizeEstimate, 1);
  // log10(size). 100 → 0.33, 1k → 0.5, 10k → 0.67, 100k → 0.83, 1M → 1.0
  return Math.min(1, Math.log10(safe) / 6);
}

// Returns events that overlap with the given tick — for hourly ticks, the
// event must include the slider's hour; for day ticks, any overlap with the
// 24-hour window of that day counts.
export function activeEventsAtTick(
  events: EventInstance[],
  tickIdx: number,
  anchorMs: number,
  enabledCategories: Set<EventCategory>,
): EventInstance[] {
  const tickDate = tickToDate(tickIdx, anchorMs);
  const windowStart = tickDate.getTime();
  const hourly = isHourlyTick(tickIdx);
  const windowMs = hourly ? 3600 * 1000 : 24 * 3600 * 1000;
  // For day mode, snap window to midnight UTC.
  const startMs = hourly
    ? windowStart
    : Date.UTC(tickDate.getUTCFullYear(), tickDate.getUTCMonth(), tickDate.getUTCDate());
  const endMs = startMs + windowMs;

  return events.filter((e) => {
    if (!enabledCategories.has(e.category)) return false;
    const s = Date.parse(e.start_dt);
    const eEnd = e.end_dt ? Date.parse(e.end_dt) : s + 3 * 3600 * 1000; // assume 3h default
    return s < endMs && eEnd > startMs;
  });
}

export async function fetchEvents(): Promise<EventInstance[]> {
  const res = await fetch("/data/lisbon-events.json");
  if (!res.ok) return [];
  const data: { events?: EventInstance[] } = await res.json();
  return data.events ?? [];
}
