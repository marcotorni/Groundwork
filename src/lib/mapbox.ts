// Centralised Mapbox configuration.
// Token is read from NEXT_PUBLIC_MAPBOX_TOKEN at build/runtime.

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export const MAPBOX_STYLE =
  process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? "mapbox://styles/mapbox/dark-v11";

// Greater Lisbon "inner ring" — Lisbon + 7 adjacent municipalities.
// Centre is roughly the midpoint of the inner-ring bounding box.
export const LISBON_CENTER: [number, number] = [-9.225, 38.7];
export const LISBON_BOUNDS: [[number, number], [number, number]] = [
  [-9.55, 38.55], // SW (Almada/Cascais corner)
  [-8.95, 38.9],  // NE (Loures/Odivelas corner)
];

export const PARISHES_GEOJSON = "/data/greater-lisbon-parishes.geojson";
