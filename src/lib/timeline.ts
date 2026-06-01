// Mixed-resolution timeline math.
//   Ticks 0..167  → hourly window (next 7 days, 168 hours)
//   Ticks 168..N  → daily window (day 8 onwards, one tick per day)
// Total horizon = 365 days = 168 hourly ticks + 358 daily ticks = 526 ticks.
//
// VISUAL MAPPING is non-linear:
//   The hourly week takes HOURLY_WIDTH_FRACTION of the slider's pixel width
//   (15%). The 358-day section takes the remaining 85%. This keeps the
//   hourly section legible while making the year-long view dominant — matches
//   how planners think about timeline horizons.

export const HOURLY_HOURS = 168;
export const DAILY_DAYS = 358;
export const TOTAL_TICKS = HOURLY_HOURS + DAILY_DAYS;
export const HOURLY_WIDTH_FRACTION = 0.15;

export function isHourlyTick(idx: number): boolean {
  return idx < HOURLY_HOURS;
}

// UTC midnight of the anchor's calendar date. The daily section is keyed off
// this so day-mode math is independent of what time-of-day the page loaded at.
function anchorDayBaseMs(anchorMs: number): number {
  const d = new Date(anchorMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcDateOnly(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function tickToDate(idx: number, anchorMs: number): Date {
  if (idx < HOURLY_HOURS) {
    return new Date(anchorMs + idx * 3600 * 1000);
  }
  // Daily section: tick 168 → UTC noon of (anchor calendar day + 7).
  const dayBase = anchorDayBaseMs(anchorMs);
  const dayOffset = 7 + (idx - HOURLY_HOURS);
  return new Date(dayBase + dayOffset * 86400_000 + 12 * 3600_000);
}

export function dateToTick(date: Date, anchorMs: number): number {
  const diffMs = date.getTime() - anchorMs;
  const diffHours = diffMs / 3600000;
  if (diffHours < HOURLY_HOURS) {
    return Math.max(0, Math.min(HOURLY_HOURS - 1, Math.floor(diffHours)));
  }
  const dayBase = anchorDayBaseMs(anchorMs);
  const eventDay = utcDateOnly(date.getTime());
  const dayOffset = Math.round((eventDay - dayBase) / 86400_000);
  return Math.max(HOURLY_HOURS, Math.min(TOTAL_TICKS - 1, HOURLY_HOURS + dayOffset - 7));
}

// Tick → 0..1 position on the slider's pixel track (non-linear).
export function tickToPercent(idx: number): number {
  if (idx < HOURLY_HOURS) {
    return (idx / HOURLY_HOURS) * HOURLY_WIDTH_FRACTION;
  }
  const dailyIdx = idx - HOURLY_HOURS;
  return (
    HOURLY_WIDTH_FRACTION +
    (dailyIdx / Math.max(1, DAILY_DAYS - 1)) * (1 - HOURLY_WIDTH_FRACTION)
  );
}

// Track pixel position (0..1) → tick index (inverse of tickToPercent).
export function percentToTick(pct: number): number {
  const clamped = Math.max(0, Math.min(1, pct));
  if (clamped < HOURLY_WIDTH_FRACTION) {
    return Math.round((clamped / HOURLY_WIDTH_FRACTION) * (HOURLY_HOURS - 1));
  }
  const dailyFraction = (clamped - HOURLY_WIDTH_FRACTION) / (1 - HOURLY_WIDTH_FRACTION);
  return HOURLY_HOURS + Math.round(dailyFraction * (DAILY_DAYS - 1));
}

// Project an arbitrary timestamp onto its 0..1 position on the slider track.
// Daily section uses calendar-day math so a pin's render position is consistent
// with the tick that clicking it would produce.
export function timestampToPercent(ts: number, anchorMs: number): number {
  const diffMs = ts - anchorMs;
  const diffHours = diffMs / 3600000;
  if (diffHours < HOURLY_HOURS) {
    return (diffHours / HOURLY_HOURS) * HOURLY_WIDTH_FRACTION;
  }
  const dayBase = anchorDayBaseMs(anchorMs);
  const eventDay = utcDateOnly(ts);
  const dayOffset = (eventDay - dayBase) / 86400_000 - 7;
  return (
    HOURLY_WIDTH_FRACTION +
    (dayOffset / Math.max(1, DAILY_DAYS - 1)) * (1 - HOURLY_WIDTH_FRACTION)
  );
}

export function dayOfWeekFromDate(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

export function hourOfDayFromDate(d: Date): number {
  return d.getUTCHours();
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTickLabel(idx: number, anchorMs: number): { primary: string; secondary: string } {
  const d = tickToDate(idx, anchorMs);
  if (isHourlyTick(idx)) {
    return {
      primary: `${DAY_LABELS[dayOfWeekFromDate(d)]} ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]}`,
      secondary: `${String(d.getUTCHours()).padStart(2, "0")}:00`,
    };
  }
  return {
    primary: `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
    secondary: "daily view",
  };
}

// Month boundaries for divider lines — returns position + label for each
// month-start that falls inside the timeline horizon.
export function computeMonthDividers(
  anchorMs: number,
): { pct: number; label: string }[] {
  const out: { pct: number; label: string }[] = [];
  const start = new Date(anchorMs);
  const end = tickToDate(TOTAL_TICKS - 1, anchorMs);
  // Walk forward month-by-month from the first of next month.
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  while (cursor.getTime() <= end.getTime()) {
    const ts = cursor.getTime();
    const pct = timestampToPercent(ts, anchorMs);
    if (pct >= 0 && pct <= 1) {
      const label = `${MONTH_LABELS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear().toString().slice(-2)}`;
      out.push({ pct, label });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}
