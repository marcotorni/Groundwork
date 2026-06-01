"use client";

import { useState } from "react";
import { Users, Building2, Euro, Coffee, CalendarDays, ChevronDown, ChevronRight, Building } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { LAYERS, type LayerId } from "@/lib/layers";
import { EVENT_CATEGORY_META, type EventCategory } from "@/lib/events";
import { DEMAND_POI_CATEGORIES, DEMAND_POI_META, type DemandPoiCategory } from "@/lib/pois";

const ICONS = { Users, Building2, Euro, Coffee };

type Props = {
  active: Set<LayerId>;
  onToggle: (id: LayerId, next: boolean) => void;
  eventsEnabled: boolean;
  onEventsToggle: (next: boolean) => void;
  enabledEventCategories: Set<EventCategory>;
  onEventCategoryToggle: (cat: EventCategory, next: boolean) => void;
  eventCount: number; // total active events at current tick — small badge
  enabledDemandCategories: Set<DemandPoiCategory>;
  onDemandCategoryToggle: (cat: DemandPoiCategory, next: boolean) => void;
};

const EVENT_FILTER_CATEGORIES: EventCategory[] = [
  "concert", "cultural", "sports", "conference", "film", "market", "cruise",
];

export function LeftLayerPanel({
  active,
  onToggle,
  eventsEnabled,
  onEventsToggle,
  enabledEventCategories,
  onEventCategoryToggle,
  eventCount,
  enabledDemandCategories,
  onDemandCategoryToggle,
}: Props) {
  const [eventsExpanded, setEventsExpanded] = useState(true);
  const [demandExpanded, setDemandExpanded] = useState(false);
  const demandActive = enabledDemandCategories.size > 0;

  return (
    <div className="pointer-events-auto w-[280px] rounded-2xl border border-[var(--border-subtle)] bg-[rgba(19,28,44,0.92)] p-4 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Location Layers</h2>
      <div className="space-y-2.5">
        {LAYERS.map((layer) => {
          const Icon = ICONS[layer.iconName];
          const isOn = active.has(layer.id);
          return (
            <div
              key={layer.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                isOn
                  ? "border-[var(--border-strong)] bg-[var(--bg-panel-elevated)]"
                  : "border-transparent bg-transparent"
              } ${!layer.available ? "opacity-60" : ""}`}
            >
              <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[var(--bg-panel)] text-[var(--text-secondary)]">
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium leading-tight">{layer.label}</div>
                <div className="text-[10.5px] leading-tight text-[var(--text-muted)]">{layer.intensity}</div>
                {layer.id === "rent" && isOn && <RentBars />}
              </div>
              <Toggle
                checked={isOn}
                disabled={!layer.available}
                onChange={(next) => onToggle(layer.id, next)}
                ariaLabel={`Toggle ${layer.label}`}
              />
            </div>
          );
        })}

        {/* Events — its own section with sub-filters */}
        <div
          className={`rounded-xl border transition-colors ${
            eventsEnabled
              ? "border-[var(--border-strong)] bg-[var(--bg-panel-elevated)]"
              : "border-transparent bg-transparent"
          }`}
        >
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[var(--bg-panel)] text-[var(--text-secondary)]">
              <CalendarDays size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium leading-tight">Events</div>
              <div className="text-[10.5px] leading-tight text-[var(--text-muted)]">
                {eventCount > 0 ? `${eventCount} active right now` : "next 6 months"}
              </div>
            </div>
            <Toggle
              checked={eventsEnabled}
              onChange={onEventsToggle}
              ariaLabel="Toggle Events layer"
            />
          </div>

          {/* Category sub-filters */}
          {eventsEnabled && (
            <>
              <button
                onClick={() => setEventsExpanded((p) => !p)}
                className="flex w-full items-center gap-1 px-3 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                {eventsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Filter by type
              </button>
              {eventsExpanded && (
                <div className="space-y-1 px-3 pb-3">
                  {EVENT_FILTER_CATEGORIES.map((cat) => {
                    const meta = EVENT_CATEGORY_META[cat];
                    const on = enabledEventCategories.has(cat);
                    return (
                      <label
                        key={cat}
                        className="flex cursor-pointer items-center gap-2 text-[11.5px] text-[var(--text-primary)] hover:text-white"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => onEventCategoryToggle(cat, e.target.checked)}
                          className="h-3 w-3 accent-[var(--accent-blue)]"
                        />
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className={on ? "" : "text-[var(--text-muted)]"}>{meta.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>


        {/* Demand generators — POI markers driving the demand score */}
        <div
          className={`rounded-xl border transition-colors ${
            demandActive
              ? "border-[var(--border-strong)] bg-[var(--bg-panel-elevated)]"
              : "border-transparent bg-transparent"
          }`}
        >
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[var(--bg-panel)] text-[var(--text-secondary)]">
              <Building size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium leading-tight">Demand generators</div>
              <div className="text-[10.5px] leading-tight text-[var(--text-muted)]">
                {demandActive
                  ? `${enabledDemandCategories.size} of ${DEMAND_POI_CATEGORIES.length} types on`
                  : "POI pins on the map"}
              </div>
            </div>
            <Toggle
              checked={demandActive}
              onChange={(next) => {
                // Master toggle — flip all categories on/off at once.
                for (const cat of DEMAND_POI_CATEGORIES) {
                  onDemandCategoryToggle(cat, next);
                }
              }}
              ariaLabel="Toggle Demand generators layer"
            />
          </div>

          {demandActive && (
            <>
              <button
                onClick={() => setDemandExpanded((p) => !p)}
                className="flex w-full items-center gap-1 px-3 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                {demandExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Filter by type
              </button>
              {demandExpanded && (
                <div className="space-y-1 px-3 pb-3">
                  {DEMAND_POI_CATEGORIES.map((cat) => {
                    const meta = DEMAND_POI_META[cat];
                    const on = enabledDemandCategories.has(cat);
                    return (
                      <label
                        key={cat}
                        className="flex cursor-pointer items-center gap-2 text-[11.5px] text-[var(--text-primary)] hover:text-white"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => onDemandCategoryToggle(cat, e.target.checked)}
                          className="h-3 w-3 accent-[var(--accent-blue)]"
                        />
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className={on ? "" : "text-[var(--text-muted)]"}>{meta.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RentBars() {
  const heights = [4, 7, 5, 9, 12, 8, 11, 6, 10, 7, 4, 8, 11, 9, 6, 10, 5];
  return (
    <div className="mt-2 flex items-end gap-[2px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-[var(--accent-blue)]"
          style={{ height: `${h}px`, opacity: 0.45 + h / 24 }}
        />
      ))}
    </div>
  );
}
