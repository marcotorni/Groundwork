// Espresso Score — the platform's hero composite metric per the concept doc.
// Range 0..100. A specialty-coffee-tilted weighting; future profiles
// (pastelaria, tourist-facing, etc.) just override the weights map.
//
// Inputs come from POI-derived stats + the runtime footfall model.
// The score is deterministic for a given parish + time, so it doubles as the
// number rendered in the AI Insights panel.

import derivedData from "@/lib/derived-parish-mixes.json";
import { RENT_EUR_PER_M2 } from "@/lib/rent-prices";

type ParishStats = {
  name: string;
  municipality: string;
  area_km2: number;
  population_2021: number | null;
  density_per_km2: number | null;
  poi_counts: Record<string, number>;
  densities: {
    cafe_per_km2: number;
    office_per_km2: number;
    hotel_per_km2: number;
    tourist_per_km2: number;
    bar_pub_per_km2: number;
    transit_major_per_km2: number;
    university_per_km2: number;
  };
};

const STATS: Record<string, ParishStats> = (
  derivedData as unknown as { stats: Record<string, ParishStats> }
).stats;

export type ScoreBreakdown = {
  footfall: number;       // 0..100
  demand: number;         // 0..100
  gap: number;            // 0..100 (high = low saturation = good opportunity)
  density: number;        // 0..100
  affordability: number;  // 0..100 (high = low rent = better margin)
  total: number;          // 0..100, weighted sum
};

const SPECIALTY_COFFEE_WEIGHTS = {
  footfall: 0.30,
  demand: 0.22,
  gap: 0.20,
  density: 0.15,
  affordability: 0.13,
};

export function getParishStats(compositeKey: string): ParishStats | null {
  return STATS[compositeKey] ?? null;
}

export function computeEspressoScore(
  compositeKey: string,
  footfall100: number,
  weights = SPECIALTY_COFFEE_WEIGHTS,
): ScoreBreakdown | null {
  const stats = STATS[compositeKey];
  if (!stats) return null;

  const footfall = clamp(footfall100, 0, 100);

  // Demand generators — count-weighted, √-area normalised (consistent with
  // how parish archetype mixes are derived). Big parishes with concentrated
  // demand corridors (Belém riverfront, Marvila creative cluster) shouldn't
  // be penalised by their total square-km.
  const c = stats.poi_counts;
  const dgCount =
    (c.office ?? 0) * 0.3 +
    (c.university ?? 0) * 8 +
    (c.hotel_proper ?? 0) * 1.0 +
    (c.transit_major ?? 0) * 4 +
    (c.tourist_strong ?? 0) * 0.5;
  const demandPerSqrtArea =
    dgCount / Math.sqrt(Math.max(stats.area_km2, 0.1));
  const demand = clamp(Math.round(demandPerSqrtArea * 1.6), 0, 100);

  // Café saturation → opportunity gap. Soften the curve so high-saturation
  // parishes don't crash to 0 — even Arroios at 49/km² should leave room for
  // a differentiated concept.
  const gap = clamp(
    Math.round(100 * Math.exp(-stats.densities.cafe_per_km2 / 25)),
    0,
    100,
  );

  // Residential customer base. Tops out at 18000 residents/km² (Arroios-class).
  const density = clamp(
    Math.round((stats.density_per_km2 ?? 0) / 180),
    0,
    100,
  );

  // Affordability — inverse of residential rent. €10/m² → ~100 (excellent
  // margin), €15/m² → ~60, €20/m² → ~25, €22/m² → ~10. Caps at €25/m².
  const rent = RENT_EUR_PER_M2[compositeKey] ?? 16; // sensible mid default
  const affordability = clamp(
    Math.round(100 - ((rent - 9) / (22 - 9)) * 100),
    0,
    100,
  );

  const total = Math.round(
    footfall * weights.footfall +
      demand * weights.demand +
      gap * weights.gap +
      density * weights.density +
      affordability * weights.affordability,
  );

  return { footfall, demand, gap, density, affordability, total: clamp(total, 0, 99) };
}

// Plain-English bullets that read off the score components.
export function explainScore(
  compositeKey: string,
  breakdown: ScoreBreakdown,
): string[] {
  const stats = STATS[compositeKey];
  const bullets: string[] = [];

  // Footfall — driver #1
  if (breakdown.footfall >= 70) {
    bullets.push("High active footfall right now");
  } else if (breakdown.footfall >= 45) {
    bullets.push("Moderate active footfall");
  } else {
    bullets.push("Quiet hour — residential rhythm dominates");
  }

  // Demand generators — surface the actual POIs driving it
  if (stats && breakdown.demand >= 40) {
    const drivers: string[] = [];
    if (stats.poi_counts.office >= 30) drivers.push(`${stats.poi_counts.office} office sites`);
    if (stats.poi_counts.hotel_proper >= 5) drivers.push(`${stats.poi_counts.hotel_proper} hotels`);
    if (stats.poi_counts.university >= 1) drivers.push(`${stats.poi_counts.university} universit${stats.poi_counts.university === 1 ? "y" : "ies"}`);
    if (stats.poi_counts.transit_major >= 1) drivers.push(`${stats.poi_counts.transit_major} metro/ferry hub${stats.poi_counts.transit_major === 1 ? "" : "s"}`);
    if (drivers.length > 0) {
      bullets.push(`Strong demand: ${drivers.slice(0, 2).join(", ")}`);
    }
  }

  // Gap / saturation — the headline for whether this is a real opportunity
  if (stats) {
    const cafes = stats.densities.cafe_per_km2;
    if (cafes >= 30) {
      bullets.push(`Saturated: ${Math.round(cafes)} cafés/km² — hard to differentiate`);
    } else if (cafes >= 15) {
      bullets.push(`Balanced supply: ${Math.round(cafes)} cafés/km²`);
    } else if (cafes >= 5) {
      bullets.push(`Undersupplied: only ${Math.round(cafes)} cafés/km² — opportunity gap`);
    } else {
      bullets.push("Very low café count — verify foot traffic before committing");
    }
  }

  // Density — neighbourhood-anchor signal
  if (breakdown.density >= 60) {
    bullets.push("Dense residential base — loyal neighbourhood demand");
  } else if (breakdown.density <= 20) {
    bullets.push("Low residential density — depends on visiting flows");
  }

  // Affordability — rent vs margin
  const rent = RENT_EUR_PER_M2[compositeKey];
  if (rent != null) {
    if (rent >= 19) {
      bullets.push(`Expensive: ~€${rent}/m² — margin pressure for a new café`);
    } else if (rent <= 12) {
      bullets.push(`Affordable: ~€${rent}/m² — healthy margin headroom`);
    }
  }

  return bullets;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
