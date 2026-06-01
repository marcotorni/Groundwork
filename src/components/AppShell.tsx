"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { LeftLayerPanel } from "@/components/LeftLayerPanel";
import { RightInsightsPanel, type DistrictInsight } from "@/components/RightInsightsPanel";
import { TimelineSlider } from "@/components/TimelineSlider";
import { MapCanvas, type ParishFeatureProps } from "@/components/MapCanvas";
import { LAYERS, type LayerId } from "@/lib/layers";
import { MAPBOX_TOKEN } from "@/lib/mapbox";
import { computeFootfall } from "@/lib/footfall-model";
import { computeEspressoScore, explainScore, getParishStats } from "@/lib/espresso-score";
import { RENT_EUR_PER_M2 } from "@/lib/rent-prices";
import {
  EVENT_CATEGORIES,
  type EventCategory,
  type EventInstance,
  activeEventsAtTick,
  fetchEvents,
} from "@/lib/events";
import { type DemandPoiCategory } from "@/lib/pois";
import {
  DEFAULT_PROFILE,
  SCORING_PROFILES,
  normaliseWeights,
  type ScoringProfile,
  type ScoringWeights,
} from "@/lib/scoring-profiles";
import { ScoringProfilePanel } from "@/components/ScoringProfilePanel";
import {
  dayOfWeekFromDate,
  hourOfDayFromDate,
  HOURLY_HOURS,
  tickToDate,
} from "@/lib/timeline";

const DEFAULT_LAYERS = new Set<LayerId>(
  LAYERS.filter((l) => l.defaultOn && l.available).map((l) => l.id),
);

export function AppShell() {
  // Anchor the timeline to page load — frozen so ticks are stable across renders.
  const anchorMsRef = useRef<number>(0);
  if (anchorMsRef.current === 0) {
    const now = new Date();
    now.setMinutes(0, 0, 0); // start of current hour
    anchorMsRef.current = now.getTime();
  }
  const anchorMs = anchorMsRef.current;

  const [activeLayers, setActiveLayers] = useState<Set<LayerId>>(DEFAULT_LAYERS);
  // Start at +11 hours from anchor (current morning ≈ commercial peak).
  const [timeIdx, setTimeIdx] = useState<number>(11);
  const [parishKeys, setParishKeys] = useState<string[]>([]);

  // Events: data + filter state.
  const [events, setEvents] = useState<EventInstance[]>([]);
  const [eventsEnabled, setEventsEnabled] = useState(true);
  const [enabledEventCategories, setEnabledEventCategories] = useState<Set<EventCategory>>(
    () => new Set(EVENT_CATEGORIES),
  );
  // POI demand-generator filter state. Off by default so the map opens clean.
  const [enabledDemandCategories, setEnabledDemandCategories] = useState<Set<DemandPoiCategory>>(
    () => new Set<DemandPoiCategory>(),
  );

  // Scoring profile state. Drives the Espresso Score's component weights.
  const [activeProfileId, setActiveProfileId] = useState<string | null>(DEFAULT_PROFILE.id);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_PROFILE.weights);
  // Selected parish identifier (composite_key) — separated from the rendered
  // DistrictInsight so the latter can be re-derived when weights or footfall
  // change without requiring another click.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedProps, setSelectedProps] = useState<ParishFeatureProps | null>(null);

  // AI insight overlay — non-null once Gemini responds for the current selection.
  type AiInsight = {
    score_adjustment: number;
    projected_growth_pct: number;
    bullets: string[];
    confidence: "low" | "medium" | "high";
    cached: boolean;
  };
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetchEvents().then(setEvents);
  }, []);

  // Translate the current tick into (day-of-week, hour-of-day) so the footfall
  // model can reuse its existing 7×24 archetype curves.
  const tickDate = useMemo(() => tickToDate(timeIdx, anchorMs), [timeIdx, anchorMs]);
  const day = dayOfWeekFromDate(tickDate);
  const hour = hourOfDayFromDate(tickDate);

  const footfallByParish = useMemo(
    () => (parishKeys.length ? computeFootfall(parishKeys, day, hour) : {}),
    [parishKeys, day, hour],
  );

  // Events currently active at this tick (respecting the category filter).
  const activeEvents = useMemo(() => {
    if (!eventsEnabled) return [];
    return activeEventsAtTick(events, timeIdx, anchorMs, enabledEventCategories);
  }, [events, eventsEnabled, enabledEventCategories, timeIdx, anchorMs]);

  // For pin rendering in the timeline — these always show even when the layer's
  // "boost on map" effect is paused (they're navigational, not visual heat).
  const eventsForPins = useMemo(
    () => events.filter((e) => enabledEventCategories.has(e.category)),
    [events, enabledEventCategories],
  );

  function toggleLayer(id: LayerId, next: boolean) {
    setActiveLayers((prev) => {
      const n = new Set(prev);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  // Pan + zoom the Mapbox instance to a venue. The map is created inside
  // MapCanvas and exposed on window.__map for dev — we reach in here so we
  // don't have to plumb the entire mapboxgl.Map instance through props.
  const focusEvent = useCallback((e: EventInstance) => {
    const w = window as unknown as { __map?: { flyTo: (opts: object) => void } };
    if (w.__map?.flyTo) {
      w.__map.flyTo({
        center: [e.lng, e.lat],
        zoom: 13,
        duration: 800,
        essential: true,
      });
    }
  }, []);

  function toggleEventCategory(cat: EventCategory, next: boolean) {
    setEnabledEventCategories((prev) => {
      const n = new Set(prev);
      if (next) n.add(cat);
      else n.delete(cat);
      return n;
    });
  }

  function toggleDemandCategory(cat: DemandPoiCategory, next: boolean) {
    setEnabledDemandCategories((prev) => {
      const n = new Set(prev);
      if (next) n.add(cat);
      else n.delete(cat);
      return n;
    });
  }

  function selectProfile(profile: ScoringProfile) {
    setActiveProfileId(profile.id);
    setWeights(profile.weights);
  }

  function changeWeight(key: keyof ScoringWeights, value: number) {
    setWeights((prev) => ({ ...prev, [key]: value }));
    // Any manual tweak detaches from the active preset.
    setActiveProfileId(null);
  }

  function handleSelect(_name: string, props: ParishFeatureProps) {
    const compositeKey =
      props.composite_key ??
      (props.municipality && props.slug ? `${props.municipality}/${props.slug}` : undefined);
    setSelectedKey(compositeKey ?? null);
    setSelectedProps(props);
  }

  // Deterministic baseline insight — recomputes instantly on any state change.
  const formulaInsight = useMemo(() => {
    if (!selectedKey || !selectedProps) return null;
    const foot = footfallByParish[selectedKey] ?? 0;
    const normWeights = normaliseWeights(weights);
    const breakdown = computeEspressoScore(selectedKey, foot, normWeights);
    let score = 50;
    let bullets: string[];
    if (breakdown) {
      score = breakdown.total;
      bullets = explainScore(selectedKey, breakdown);
    } else {
      bullets = ["No POI stats for this parish yet — run `npm run data:pois` to refresh"];
    }
    const eventBullet = describeNearbyEvent(activeEvents, selectedProps);
    if (eventBullet) bullets = [eventBullet, ...bullets];
    const projectedGrowthPct = Math.max(-5, Math.min(28, Math.round((score - 45) / 2)));
    return { score, bullets, projectedGrowthPct, breakdown };
  }, [selectedKey, selectedProps, weights, footfallByParish, activeEvents]);

  // Fire Gemini call when selection / weights / time changes. Server caches
  // 24h per (parish, profile, day-bucket) so subsequent fires are fast.
  useEffect(() => {
    if (!selectedKey || !selectedProps || !formulaInsight) {
      setAiInsight(null);
      return;
    }
    let cancelled = false;
    setAiLoading(true);
    setAiInsight(null);

    const stats = getParishStats(selectedKey);
    const normWeights = normaliseWeights(weights);
    const profileLabel =
      activeProfileId
        ? (SCORING_PROFILES.find((p) => p.id === activeProfileId)?.label ?? "Custom")
        : "Custom";
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const payload = {
      composite_key: selectedKey,
      name: selectedProps.name,
      municipality: selectedProps.municipality ?? "",
      density_per_km2: selectedProps.density_per_km2,
      rent_eur_per_m2: RENT_EUR_PER_M2[selectedKey] ?? null,
      poi_counts: stats?.poi_counts ?? {},
      base_score: formulaInsight.score,
      breakdown: formulaInsight.breakdown,
      profile_id: activeProfileId,
      profile_label: profileLabel,
      weights: normWeights,
      active_events: activeEvents.map((e) => ({
        title: e.title,
        category: e.category,
        venue_name: e.venue_name,
        size: e.size_estimate,
      })),
      current_day_of_week: dayNames[day],
      current_hour: hour,
    };

    fetch("/api/parish-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const j = await r.json();
        if (cancelled) return;
        if (j.error) {
          console.warn("[AI insight] error:", j.error);
          setAiInsight(null);
        } else {
          setAiInsight(j as AiInsight);
        }
      })
      .catch((err) => {
        if (!cancelled) console.warn("[AI insight] fetch failed:", err);
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });

    return () => { cancelled = true; };
    // Re-fire only when these specific inputs change (not on every render).
  }, [selectedKey, selectedProps, weights, day, hour, activeProfileId, activeEvents]);

  // Final blended insight shown to the user. AI adjustment is applied on top
  // of the formula score (clamped 0..99); AI bullets replace formula bullets
  // when present. Falls back to formula-only if AI hasn't returned yet.
  const selected: DistrictInsight | null = useMemo(() => {
    if (!selectedKey || !selectedProps || !formulaInsight) return null;
    const blendedScore = aiInsight
      ? Math.max(0, Math.min(99, formulaInsight.score + aiInsight.score_adjustment))
      : formulaInsight.score;
    const blendedGrowth = aiInsight ? aiInsight.projected_growth_pct : formulaInsight.projectedGrowthPct;
    const blendedBullets = aiInsight ? aiInsight.bullets : formulaInsight.bullets;
    return {
      name: prettyDistrictLabel(selectedProps),
      score: blendedScore,
      projectedGrowthPct: blendedGrowth,
      bullets: blendedBullets,
      aiActive: !!aiInsight,
      aiLoading,
      aiAdjustment: aiInsight?.score_adjustment ?? 0,
    };
  }, [selectedKey, selectedProps, formulaInsight, aiInsight, aiLoading]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="grid h-full place-items-center bg-[var(--bg-base)] text-center text-[var(--text-secondary)]">
        <div className="max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6">
          <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
            Mapbox token missing
          </h2>
          <p className="text-sm">
            Add <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            to <code>.env.local</code> and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-[var(--bg-base)]">
      <TopNav />
      <div className="relative flex-1">
        <div className="absolute inset-0">
          <MapCanvas
            activeLayers={activeLayers}
            onSelect={handleSelect}
            footfallByParish={footfallByParish}
            onParishesLoaded={setParishKeys}
            activeEvents={activeEvents}
            enabledDemandCategories={enabledDemandCategories}
          />
        </div>

        <div className="pointer-events-none absolute left-6 top-6 z-10">
          <LeftLayerPanel
            active={activeLayers}
            onToggle={toggleLayer}
            eventsEnabled={eventsEnabled}
            onEventsToggle={setEventsEnabled}
            enabledEventCategories={enabledEventCategories}
            onEventCategoryToggle={toggleEventCategory}
            eventCount={activeEvents.length}
            enabledDemandCategories={enabledDemandCategories}
            onDemandCategoryToggle={toggleDemandCategory}
          />
        </div>

        <div className="pointer-events-none absolute right-6 top-6 z-10 flex flex-col gap-4">
          <RightInsightsPanel insight={selected} />
          <ScoringProfilePanel
            weights={weights}
            activeProfileId={activeProfileId}
            onProfileSelect={selectProfile}
            onWeightChange={changeWeight}
          />
        </div>

        <div className="pointer-events-none absolute bottom-6 left-6 right-6 z-10">
          <TimelineSlider
            value={timeIdx}
            onChange={setTimeIdx}
            anchorMs={anchorMs}
            events={eventsForPins}
            onEventFocus={focusEvent}
          />
        </div>
      </div>
    </div>
  );
}

function prettyDistrictLabel(props: ParishFeatureProps): string {
  if (props.municipality && props.municipality !== "lisboa") {
    const muni = props.municipality.charAt(0).toUpperCase() + props.municipality.slice(1);
    return `${props.name}, ${muni}`;
  }
  return props.name;
}

// Build a one-line bullet if any active event's venue is within ~1.5 km of
// the clicked parish (rough centroid match).
function describeNearbyEvent(
  events: EventInstance[],
  props: ParishFeatureProps,
): string | null {
  if (events.length === 0) return null;
  // We don't have the parish centroid here, so fall back to name match.
  const venueMatch = events.find((e) =>
    (e.venue_address ?? "").toLowerCase().includes(props.name.toLowerCase()) ||
    (e.venue_name ?? "").toLowerCase().includes(props.name.toLowerCase()),
  );
  if (!venueMatch) return null;
  return `🎉 ${venueMatch.title} at ${venueMatch.venue_name} — ~${venueMatch.size_estimate.toLocaleString()} expected`;
}
