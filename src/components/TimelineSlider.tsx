"use client";

import { Play, Pause, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  HOURLY_WIDTH_FRACTION,
  TOTAL_TICKS,
  computeMonthDividers,
  dateToTick,
  formatTickLabel,
  isHourlyTick,
  percentToTick,
  tickToPercent,
  timestampToPercent,
} from "@/lib/timeline";
import {
  EVENT_CATEGORY_META,
  type EventInstance,
  eventIntensity,
} from "@/lib/events";

type Props = {
  value: number;
  onChange: (next: number) => void;
  anchorMs: number;
  events: EventInstance[];
  // Called when the user clicks an event pin — parent uses this to pan/zoom
  // the map to the event venue so the heatmap bloom is in view.
  onEventFocus?: (event: EventInstance) => void;
};

export function TimelineSlider({ value, onChange, anchorMs, events, onEventFocus }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hoveredEvent, setHoveredEvent] = useState<EventInstance | null>(null);
  const [hoveredPinPos, setHoveredPinPos] = useState<{ x: number; y: number } | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  // Tick advancement: 1 hour every ~180ms in hourly mode; 1 day every ~140ms in day mode
  // (faster in day mode so the play button gets meaningful coverage of the year).
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = (t: number) => {
      if (!lastRef.current) lastRef.current = t;
      const interval = isHourlyTick(value) ? 180 : 140;
      if (t - lastRef.current > interval) {
        onChange((value + 1) % TOTAL_TICKS);
        lastRef.current = t;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, value, onChange]);

  // Compute event pin positions on the non-linear track.
  const eventPins = useMemo(() => {
    return events
      .map((e) => {
        const t = Date.parse(e.start_dt);
        if (!Number.isFinite(t) || t < anchorMs) return null;
        const pct = timestampToPercent(t, anchorMs);
        if (pct < 0 || pct > 1) return null;
        return { event: e, pct };
      })
      .filter((x): x is { event: EventInstance; pct: number } => x !== null);
  }, [events, anchorMs]);

  // Month dividers — recomputed only when anchor changes.
  const monthDividers = useMemo(() => computeMonthDividers(anchorMs), [anchorMs]);

  const thumbPct = tickToPercent(value);
  const { primary, secondary } = formatTickLabel(value, anchorMs);

  // Pointer handlers (custom slider drag).
  const updateFromClientX = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = (clientX - rect.left) / rect.width;
    onChange(percentToTick(pct));
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePinClick = (e: EventInstance) => {
    const t = Date.parse(e.start_dt);
    if (!Number.isFinite(t)) return;
    // Use the calendar-day-aware conversion so a Sep 13 event always snaps to
    // the Sep 13 tick, regardless of what hour-of-day the anchor sits at.
    onChange(dateToTick(new Date(t), anchorMs));
    onEventFocus?.(e);
  };

  return (
    <div className="pointer-events-auto w-full rounded-2xl border border-[var(--border-subtle)] bg-[rgba(19,28,44,0.92)] px-6 py-3 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
      {/* Top bar: controls + current time label */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="grid h-8 w-8 place-items-center rounded-full bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-panel-elevated)]"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={() => { setPlaying(false); onChange(0); }}
            className="grid h-8 w-8 place-items-center rounded-full bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Reset"
          >
            <RotateCcw size={13} />
          </button>
          <div className="ml-2 text-[12px] text-[var(--text-secondary)]">
            12-month forecast horizon · {isHourlyTick(value) ? "hourly resolution" : "daily resolution"}
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-[18px] font-semibold tracking-tight">{primary}</span>
          <span className="text-[12px] text-[var(--text-secondary)]">{secondary}</span>
        </div>
      </div>

      {/* Layout (top → bottom):
              [ phase labels ]
              [ month labels — full-width row, ALWAYS visible, never hidden by pins ]
              [ event pins row ]
              [ slider track + thumb ]
          Month divider lines span the pins row + track only, so labels stay clean above. */}
      <div className="relative pb-1">
        {/* Phase labels */}
        <div className="relative h-3.5">
          <span className="absolute left-0 top-0 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Next 7 days · hourly
          </span>
          <span
            className="absolute top-0 text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
            style={{ left: `${HOURLY_WIDTH_FRACTION * 100 + 0.3}%` }}
          >
            Full year · daily
          </span>
        </div>

        {/* Month labels — own row so they don't fight with event pins */}
        <div className="relative h-4">
          {monthDividers.map((m) => (
            <span
              key={`label-${m.label}`}
              className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]"
              style={{ left: `${m.pct * 100}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* Month divider lines + hourly/daily divider — span pins row down through the slider */}
        <div className="relative" style={{ height: "26px" }}>
          {monthDividers.map((m) => (
            <div
              key={`line-${m.label}`}
              className="pointer-events-none absolute inset-y-0 w-px"
              style={{ left: `${m.pct * 100}%`, background: "rgba(255,255,255,0.08)" }}
            />
          ))}
          <div
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{
              left: `${HOURLY_WIDTH_FRACTION * 100}%`,
              background: "rgba(255,255,255,0.22)",
            }}
          />

          {/* Event pins row — each pin is a group with a CSS-only floating label
              so the event name is visible the instant the cursor lands on it
              (no dependency on React state propagation). */}
          {eventPins.map(({ event, pct }, i) => {
            const meta = EVENT_CATEGORY_META[event.category];
            const colour = meta?.color ?? "#9ca3af";
            const size = 5 + eventIntensity(event.size_estimate) * 8; // 5..13px
            return (
              <div
                key={`${event.id}-${i}`}
                className="event-pin-group absolute -translate-x-1/2"
                style={{
                  left: `${pct * 100}%`,
                  top: `${10 - size / 2}px`,
                  zIndex: 10,
                }}
              >
                <button
                  type="button"
                  aria-label={event.title}
                  title={event.title}
                  onMouseEnter={(ev) => {
                    setHoveredEvent(event);
                    const rect = (ev.target as HTMLElement).getBoundingClientRect();
                    setHoveredPinPos({ x: rect.left + rect.width / 2, y: rect.top });
                  }}
                  onMouseLeave={() => {
                    setHoveredEvent(null);
                    setHoveredPinPos(null);
                  }}
                  onClick={() => handlePinClick(event)}
                  className="event-pin block cursor-pointer rounded-full"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: colour,
                    boxShadow: `0 0 ${size * 0.8}px ${colour}88`,
                  }}
                />
                {/* Floating event name — CSS-only, no React state. */}
                <span
                  className="event-pin-label pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-[10.5px] font-medium text-white opacity-0 transition-opacity duration-100"
                  style={{
                    bottom: `${size + 8}px`,
                    backgroundColor: "#0e1726",
                    borderColor: colour,
                    boxShadow: `0 4px 12px rgba(0,0,0,0.5)`,
                  }}
                >
                  {event.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Custom track + thumb */}
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative h-2 cursor-pointer rounded-full bg-[var(--toggle-off)]"
        >
          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-[var(--accent-blue)]"
            style={{ width: `${thumbPct * 100}%` }}
          />
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--accent-blue)] bg-white"
            style={{
              left: `${thumbPct * 100}%`,
              boxShadow: "0 0 0 4px rgba(74, 140, 214, 0.18)",
            }}
          />
        </div>
      </div>

      {/* Floating tooltip on hover — card with an arrow pointing down at the pin. */}
      {hoveredEvent && hoveredPinPos && (
        <div
          className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full"
          style={{ left: hoveredPinPos.x, top: hoveredPinPos.y - 14 }}
        >
          <div
            className="rounded-lg border bg-[#0e1726] px-3.5 py-2.5 text-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
            style={{
              maxWidth: 320,
              borderColor: EVENT_CATEGORY_META[hoveredEvent.category]?.color ?? "#374151",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: EVENT_CATEGORY_META[hoveredEvent.category]?.color }}
              />
              <span className="text-[13px] font-semibold text-white">
                {hoveredEvent.title}
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
              {new Date(hoveredEvent.start_dt).toUTCString().slice(0, 16)} · {hoveredEvent.venue_name}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              ~{hoveredEvent.size_estimate.toLocaleString()} expected · {EVENT_CATEGORY_META[hoveredEvent.category]?.label}
            </div>
          </div>
          {/* Down arrow */}
          <div
            className="mx-auto h-0 w-0"
            style={{
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: `7px solid ${EVENT_CATEGORY_META[hoveredEvent.category]?.color ?? "#374151"}`,
              marginTop: -1,
            }}
          />
        </div>
      )}

      <style jsx>{`
        .event-pin-group:hover {
          z-index: 30 !important;
        }
        .event-pin-group:hover .event-pin {
          transform: scale(1.6);
          box-shadow: 0 0 18px currentColor, 0 0 0 2px #fff !important;
        }
        .event-pin-group:hover .event-pin-label {
          opacity: 1;
        }
        .event-pin {
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
      `}</style>
    </div>
  );
}
