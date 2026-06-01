// Scoring profile presets — match the concept doc's Section 11 design.
// Each preset weights the five available Espresso Score components.

export type ScoringWeights = {
  footfall: number;
  demand: number;
  gap: number;
  density: number;
  affordability: number;
};

export type ScoringProfile = {
  id: string;
  label: string;
  description: string;
  weights: ScoringWeights;
};

export const SCORING_PROFILES: ScoringProfile[] = [
  {
    id: "specialty",
    label: "Specialty Coffee",
    description: "Default — balanced footfall + demand + low saturation + margin",
    weights: { footfall: 0.30, demand: 0.22, gap: 0.20, density: 0.15, affordability: 0.13 },
  },
  {
    id: "pastelaria",
    label: "Neighbourhood Pastelaria",
    description: "Loyal residential, affordable rent, less concerned with saturation",
    weights: { footfall: 0.15, demand: 0.10, gap: 0.18, density: 0.42, affordability: 0.15 },
  },
  {
    id: "tourist",
    label: "Tourist-Facing",
    description: "Footfall + tourist demand generators — accepts higher rent",
    weights: { footfall: 0.42, demand: 0.33, gap: 0.10, density: 0.08, affordability: 0.07 },
  },
  {
    id: "takeaway",
    label: "Takeaway & Commuter",
    description: "Transit demand + footfall, low rent (small footprint, thin margins)",
    weights: { footfall: 0.36, demand: 0.36, gap: 0.12, density: 0.04, affordability: 0.12 },
  },
  {
    id: "nomad",
    label: "Digital Nomad Hub",
    description: "Footfall + office demand, breathing room from competitors, mid rent",
    weights: { footfall: 0.32, demand: 0.28, gap: 0.22, density: 0.08, affordability: 0.10 },
  },
];

export const DEFAULT_PROFILE = SCORING_PROFILES[0];

export function normaliseWeights(w: ScoringWeights): ScoringWeights {
  const sum = w.footfall + w.demand + w.gap + w.density + w.affordability;
  if (sum === 0) return w;
  return {
    footfall:      w.footfall / sum,
    demand:        w.demand / sum,
    gap:           w.gap / sum,
    density:       w.density / sum,
    affordability: w.affordability / sum,
  };
}
