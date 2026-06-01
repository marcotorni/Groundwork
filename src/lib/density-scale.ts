// Heatmap color ramps. Mapbox's `heatmap-color` interpolates on the implicit
// `heatmap-density` variable in [0, 1].
//
// - Population: cool blues, glows underneath as a quieter base signal.
// - Footfall:   warm oranges/reds, dominates on top — matches the reference UI.
//
// Each layer's weight is set separately so the two stack legibly.

// Mapbox expressions are recursive — strings/numbers at the leaves, arrays
// for operators. `unknown[]` is the pragmatic choice (Mapbox's own TS types
// already use a custom Expression union we don't import here).
export type HeatmapColorRamp = unknown[];

export const POPULATION_HEATMAP_COLOR: HeatmapColorRamp = [
  "interpolate", ["linear"], ["heatmap-density"],
  0,    "rgba(74, 140, 214, 0)",
  0.15, "rgba(74, 140, 214, 0.2)",
  0.4,  "rgba(74, 140, 214, 0.55)",
  0.7,  "rgba(94, 178, 230, 0.78)",
  1,    "rgba(140, 200, 240, 0.88)",
];

// Smooth warm ramp: amber → orange → deep red. No top "white" bloom so the
// peaks don't speckle into single bright dots.
export const FOOTFALL_HEATMAP_COLOR: HeatmapColorRamp = [
  "interpolate", ["linear"], ["heatmap-density"],
  0,    "rgba(245, 158, 59, 0)",
  0.2,  "rgba(245, 158, 59, 0.22)",
  0.45, "rgba(245, 140, 50, 0.5)",
  0.7,  "rgba(236, 101, 50, 0.78)",
  1,    "rgba(200, 50, 40, 0.92)",
];

// Larger radii so sample-point spacing (~250m at zoom 10-11) blurs into a
// continuous gradient rather than discrete dots.
export const HEATMAP_RADIUS: HeatmapColorRamp = [
  "interpolate", ["linear"], ["zoom"],
  9, 25,
  10, 38,
  11, 55,
  12, 80,
  13, 110,
  14, 150,
  16, 220,
];

// Low base intensity so adjacent points don't sum to saturation; lets weight
// differences (Mon 11am vs Sun 4am) read visually instead of bleeding to a
// single red blob.
export const HEATMAP_INTENSITY: HeatmapColorRamp = [
  "interpolate", ["linear"], ["zoom"],
  9, 0.25,
  11, 0.4,
  13, 0.7,
  15, 1.1,
];
