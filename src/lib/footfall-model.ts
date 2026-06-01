// Modeled footfall (active-presence) per Lisbon-region parish, varying by
// hour x day. TRANSPARENT MODEL, not measured data.
//
// Each parish is expressed as a mix of 5 archetypes (residential / office /
// student / tourist / nightlife), each with its own 7-day x 24-hour activity
// curve. Total weight is normalised at compute time.
//
// Phase-1 mix sources:
//   - Lisbon's 24 parishes: hand-tuned from the concept doc
//   - Inner-ring municipalities: municipality default + handful of known
//     overrides (Costa da Caparica, Cascais e Estoril, Carnaxide office hub)
//
// The next phase auto-derives every mix from OSM POI counts; this file will
// then be reduced to just the archetype curves.

export type Archetype = "residential" | "office" | "student" | "tourist" | "nightlife";

type Curve = number[][]; // [day 0..6][hour 0..23], values 0..1

const repeat = (arr: number[], n: number) => Array(n).fill(arr);

const residential: Curve = [
  ...repeat(
    [0.9, 0.95, 0.95, 0.95, 0.9, 0.8, 0.6, 0.35, 0.25, 0.2, 0.2, 0.25, 0.3, 0.3, 0.3, 0.35, 0.45, 0.6, 0.75, 0.85, 0.9, 0.9, 0.92, 0.92],
    5,
  ),
  [0.85, 0.9, 0.9, 0.9, 0.88, 0.82, 0.7, 0.55, 0.5, 0.55, 0.6, 0.65, 0.7, 0.7, 0.7, 0.7, 0.72, 0.78, 0.82, 0.85, 0.88, 0.9, 0.9, 0.88],
  [0.85, 0.9, 0.9, 0.9, 0.88, 0.82, 0.7, 0.55, 0.5, 0.55, 0.6, 0.6, 0.6, 0.6, 0.6, 0.65, 0.7, 0.75, 0.78, 0.82, 0.88, 0.9, 0.9, 0.88],
];

const office: Curve = [
  ...repeat(
    [0, 0, 0, 0, 0, 0.02, 0.1, 0.35, 0.75, 0.95, 1.0, 1.0, 0.85, 0.7, 0.9, 1.0, 0.95, 0.7, 0.35, 0.15, 0.08, 0.05, 0.02, 0],
    5,
  ),
  Array(24).fill(0.05),
  Array(24).fill(0.03),
];

const student: Curve = [
  ...repeat(
    [0, 0, 0, 0, 0, 0.05, 0.2, 0.55, 0.9, 0.95, 0.95, 0.85, 0.5, 0.65, 0.95, 0.95, 0.85, 0.7, 0.45, 0.3, 0.15, 0.08, 0.03, 0],
    5,
  ),
  [0, 0, 0, 0, 0, 0, 0.05, 0.1, 0.2, 0.3, 0.35, 0.4, 0.4, 0.4, 0.4, 0.35, 0.3, 0.25, 0.2, 0.1, 0.05, 0.02, 0, 0],
  [0, 0, 0, 0, 0, 0, 0.05, 0.1, 0.2, 0.25, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.25, 0.2, 0.1, 0.05, 0.02, 0, 0, 0],
];

const tourist: Curve = [
  ...repeat(
    [0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.2, 0.35, 0.6, 0.85, 1.0, 1.0, 1.0, 1.0, 0.95, 0.85, 0.75, 0.65, 0.5, 0.4, 0.3, 0.2, 0.1, 0.08],
    5,
  ),
  [0.1, 0.08, 0.08, 0.08, 0.1, 0.15, 0.25, 0.4, 0.65, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15],
  [0.1, 0.08, 0.08, 0.08, 0.1, 0.15, 0.25, 0.4, 0.65, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.15, 0.08],
];

const nightlife: Curve = [
  ...repeat(
    [0.08, 0.05, 0.03, 0.02, 0.02, 0.02, 0.02, 0.02, 0.05, 0.05, 0.05, 0.1, 0.15, 0.15, 0.15, 0.15, 0.2, 0.3, 0.4, 0.45, 0.5, 0.45, 0.3, 0.2],
    3,
  ),
  [0.15, 0.1, 0.08, 0.05, 0.03, 0.02, 0.02, 0.02, 0.05, 0.05, 0.05, 0.1, 0.15, 0.15, 0.15, 0.2, 0.3, 0.4, 0.55, 0.7, 0.85, 0.85, 0.7, 0.5],
  [0.4, 0.3, 0.2, 0.1, 0.05, 0.03, 0.02, 0.02, 0.05, 0.05, 0.05, 0.1, 0.2, 0.2, 0.2, 0.25, 0.4, 0.55, 0.75, 0.9, 1.0, 1.0, 1.0, 0.85],
  [0.7, 0.6, 0.45, 0.3, 0.15, 0.08, 0.05, 0.05, 0.08, 0.08, 0.1, 0.15, 0.25, 0.25, 0.25, 0.3, 0.45, 0.6, 0.8, 0.95, 1.0, 1.0, 1.0, 0.95],
  [0.6, 0.4, 0.25, 0.12, 0.06, 0.04, 0.04, 0.04, 0.06, 0.06, 0.08, 0.12, 0.15, 0.15, 0.15, 0.15, 0.2, 0.25, 0.35, 0.4, 0.4, 0.3, 0.2, 0.15],
];

export const ARCHETYPE_CURVES: Record<Archetype, Curve> = {
  residential,
  office,
  student,
  tourist,
  nightlife,
};

type Mix = Partial<Record<Archetype, number>>;

// Municipality-level defaults (used when a parish has no specific override).
const MUNICIPALITY_DEFAULTS: Record<string, Mix> = {
  lisboa:   { residential: 0.5, office: 0.2, student: 0.1, tourist: 0.1, nightlife: 0.1 },
  amadora:  { residential: 0.78, office: 0.12, student: 0.04, tourist: 0.02, nightlife: 0.04 },
  odivelas: { residential: 0.82, office: 0.08, student: 0.05, tourist: 0.02, nightlife: 0.03 },
  loures:   { residential: 0.7, office: 0.18, student: 0.05, tourist: 0.04, nightlife: 0.03 },
  oeiras:   { residential: 0.5, office: 0.35, student: 0.08, tourist: 0.04, nightlife: 0.03 },
  cascais:  { residential: 0.45, office: 0.1, student: 0.05, tourist: 0.35, nightlife: 0.05 },
  almada:   { residential: 0.75, office: 0.12, student: 0.06, tourist: 0.05, nightlife: 0.02 },
  seixal:   { residential: 0.85, office: 0.08, student: 0.03, tourist: 0.02, nightlife: 0.02 },
};

// Hand-tuned overrides. Primary source of truth is now the POI-derived data
// in derived-parish-mixes.json. We only override here when:
//   (a) OSM data is structurally incomplete for the parish, OR
//   (b) editorial knowledge (concept doc, ground truth) strongly disagrees.
//
// Keep this list short. Every override is a TODO to investigate why the
// OSM-derived mix didn't capture the parish correctly.
const PARISH_MIX: Record<string, Mix> = {
  // Belém — Mosteiro dos Jerónimos, Torre de Belém, MAAT, Padrão dos
  // Descobrimentos cluster a few major attractions in a small waterfront strip
  // of a large parish. Per-km² normalisation underrates this concentration.
  "lisboa/belem": { tourist: 0.55, residential: 0.25, office: 0.1, student: 0.05, nightlife: 0.05 },

  // Costa da Caparica — large beach-residential parish where tourism is
  // entirely seasonal beachfront concentrated on a narrow strip OSM doesn't
  // tag as densely as the activity merits.
  "almada/costa da caparica": { tourist: 0.55, residential: 0.35, nightlife: 0.05, office: 0.03, student: 0.02 },

  // Marvila — Phase-1 thesis from the concept doc: creative-cluster trajectory,
  // 3-year early-mover window. OSM still shows it as residential because the
  // creative offices and breweries don't carry strong commercial tags yet.
  "lisboa/marvila": { residential: 0.45, office: 0.3, student: 0.05, tourist: 0.1, nightlife: 0.1 },
};

// Mixes auto-derived from OpenStreetMap POI counts via
// scripts/derive-parish-mixes.mjs. This file is generated, not edited by hand.
import derivedParishMixes from "@/lib/derived-parish-mixes.json";

const DERIVED_MIXES = (derivedParishMixes as { mixes: Record<string, Mix> }).mixes;

// Lookup priority:
//   1. Hand-tuned override in PARISH_MIX (above) — gives us editorial control
//      for special cases the OSM data underestimates.
//   2. POI-derived mix from DERIVED_MIXES — the default for every parish.
//   3. Municipality default — only as a last resort if a parish is missing
//      both above (shouldn't happen for the inner ring).
function mixForKey(compositeKey: string): Mix {
  if (PARISH_MIX[compositeKey]) return PARISH_MIX[compositeKey];
  if (DERIVED_MIXES[compositeKey]) return DERIVED_MIXES[compositeKey];
  const municipality = compositeKey.split("/")[0];
  return MUNICIPALITY_DEFAULTS[municipality] ?? MUNICIPALITY_DEFAULTS.lisboa;
}

// Compute a 0..100 footfall index for a single parish at a given (day, hour).
function footfallFor(compositeKey: string, day: number, hour: number): number {
  const mix = mixForKey(compositeKey);
  let v = 0;
  let totalWeight = 0;
  for (const [archetype, weight] of Object.entries(mix) as [Archetype, number][]) {
    const curve = ARCHETYPE_CURVES[archetype];
    v += (curve[day]?.[hour] ?? 0) * weight;
    totalWeight += weight;
  }
  return Math.round((v / Math.max(totalWeight, 0.01)) * 100);
}

// Compute footfall for every parish given a list of composite keys.
export function computeFootfall(
  compositeKeys: string[],
  day: number,
  hour: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of compositeKeys) {
    out[key] = footfallFor(key, day, hour);
  }
  return out;
}
