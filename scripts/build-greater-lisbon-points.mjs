#!/usr/bin/env node
// Generates a weighted point cloud sampled inside each parish polygon, used
// by the Mapbox heatmap layer for soft-gradient density visualisation.
//
// Inputs:  public/data/greater-lisbon-parishes.geojson
// Outputs: public/data/greater-lisbon-points.geojson
//
// Strategy:
//   1. For each parish polygon, compute a stratified grid of candidate points
//      inside its bounding box at a density proportional to area (~30 points
//      per km²).
//   2. Keep only points that fall inside the polygon via ray-casting.
//   3. Each retained point inherits parish metadata + a density weight.
//
// The Mapbox heatmap layer will render these points as a Gaussian glow whose
// intensity is driven by density (population layer) or _footfall (set at
// runtime by the time slider).

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IN_PATH = resolve(ROOT, "public/data/greater-lisbon-parishes.geojson");
const OUT_PATH = resolve(ROOT, "public/data/greater-lisbon-points.geojson");

const POINTS_PER_KM2 = 10; // ~3k total — sparse enough that parish-level
                            // weight differences don't blur into one blob.

// Mulberry32 — deterministic PRNG so the sampled point cloud is identical
// across builds. Keeps the heatmap visually stable.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bbox(coords) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const walk = (arr) => {
    if (typeof arr[0] === "number") {
      const [lon, lat] = arr;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of arr) walk(c);
    }
  };
  walk(coords);
  return [minLon, minLat, maxLon, maxLat];
}

// Ray-casting point-in-polygon. Treats each ring; even/odd rule handles holes.
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon, lat, geometry) {
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates;
    if (!pointInRing(lon, lat, outer)) return false;
    for (const h of holes) if (pointInRing(lon, lat, h)) return false;
    return true;
  }
  if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) {
      const [outer, ...holes] = poly;
      if (!pointInRing(lon, lat, outer)) continue;
      let inHole = false;
      for (const h of holes) if (pointInRing(lon, lat, h)) { inHole = true; break; }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}

async function main() {
  const fc = JSON.parse(await readFile(IN_PATH, "utf8"));
  const points = [];

  let parishesProcessed = 0;
  for (const feature of fc.features) {
    const { name, slug, municipality, composite_key, density_per_km2, area_km2 } =
      feature.properties;
    const geom = feature.geometry;
    if (!geom || !area_km2) continue;

    const target = Math.max(6, Math.round(area_km2 * POINTS_PER_KM2));
    // Seed per parish so distribution is reproducible per feature.
    const rng = mulberry32(hashString(composite_key ?? name));

    const [minLon, minLat, maxLon, maxLat] = bbox(geom.coordinates);
    const bboxArea = (maxLon - minLon) * (maxLat - minLat);
    if (bboxArea === 0) continue;

    // Sample 8x more candidates than target to compensate for misses outside the polygon.
    const maxAttempts = target * 8 + 200;
    let kept = 0;
    let attempts = 0;
    while (kept < target && attempts < maxAttempts) {
      const lon = minLon + rng() * (maxLon - minLon);
      const lat = minLat + rng() * (maxLat - minLat);
      attempts++;
      if (!pointInPolygon(lon, lat, geom)) continue;
      points.push({
        type: "Feature",
        geometry: {
          type: "Point",
          // Trim to ~10cm precision; heatmap doesn't need more, and this halves payload size.
          coordinates: [Number(lon.toFixed(6)), Number(lat.toFixed(6))],
        },
        properties: {
          composite_key,
          density_weight: density_per_km2 ? Math.min(1, density_per_km2 / 18000) : 0,
        },
      });
      kept++;
    }
    parishesProcessed++;
  }

  const out = {
    type: "FeatureCollection",
    metadata: {
      generated_at: new Date().toISOString(),
      parishes_processed: parishesProcessed,
      total_points: points.length,
      points_per_km2_target: POINTS_PER_KM2,
      source: "parish polygons sampled with deterministic rejection",
    },
    features: points,
  };

  await writeFile(OUT_PATH, JSON.stringify(out));
  console.log(
    `Wrote ${points.length} points across ${parishesProcessed} parishes → ${OUT_PATH}`,
  );
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
