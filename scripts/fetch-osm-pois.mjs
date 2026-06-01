#!/usr/bin/env node
// Pull POIs across the Greater-Lisbon inner ring from the OpenStreetMap
// Overpass API, classify them into the 8 demand-generator categories the
// concept doc lists (Section 5), and save as a single GeoJSON FeatureCollection.
//
// Outputs: public/data/greater-lisbon-pois.geojson
//
// Overpass is free, no key. We chunk queries by category to stay under the
// per-request timeout. ~1-2 minutes total runtime.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = resolve(ROOT, "public/data/greater-lisbon-pois.geojson");
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Bounding box for the inner ring: (south, west, north, east) — matches
// the LISBON_BOUNDS constant in src/lib/mapbox.ts.
const BBOX = "38.55,-9.55,38.9,-8.95";

// Each category lists OSM key/value selectors. `out center` returns ways as
// their bbox centroid, so we can treat polygons as points.
const CATEGORIES = {
  school: [
    `node["amenity"="school"](${BBOX});`,
    `way["amenity"="school"](${BBOX});`,
    `node["amenity"="kindergarten"](${BBOX});`,
    `way["amenity"="kindergarten"](${BBOX});`,
  ],
  university: [
    `node["amenity"="university"](${BBOX});`,
    `way["amenity"="university"](${BBOX});`,
    `node["amenity"="college"](${BBOX});`,
    `way["amenity"="college"](${BBOX});`,
  ],
  office: [
    `node["office"](${BBOX});`,
    `way["office"](${BBOX});`,
    `way["building"="office"](${BBOX});`,
    `way["building"="commercial"](${BBOX});`,
    `node["amenity"="coworking_space"](${BBOX});`,
  ],
  hospital: [
    `node["amenity"="hospital"](${BBOX});`,
    `way["amenity"="hospital"](${BBOX});`,
    `node["amenity"="clinic"](${BBOX});`,
    `way["amenity"="clinic"](${BBOX});`,
  ],
  hotel: [
    `node["tourism"="hotel"](${BBOX});`,
    `way["tourism"="hotel"](${BBOX});`,
    `node["tourism"="hostel"](${BBOX});`,
    `node["tourism"="apartment"](${BBOX});`,
    `node["tourism"="guest_house"](${BBOX});`,
  ],
  transit: [
    `node["railway"="station"](${BBOX});`,
    `node["station"="subway"](${BBOX});`,
    `node["railway"="tram_stop"](${BBOX});`,
    `node["amenity"="ferry_terminal"](${BBOX});`,
    `node["public_transport"="station"](${BBOX});`,
  ],
  tourist: [
    `node["tourism"="attraction"](${BBOX});`,
    `way["tourism"="attraction"](${BBOX});`,
    `node["tourism"="museum"](${BBOX});`,
    `way["tourism"="museum"](${BBOX});`,
    `node["tourism"="viewpoint"](${BBOX});`,
    `node["historic"](${BBOX});`,
    `way["historic"](${BBOX});`,
  ],
  nightlife: [
    `node["amenity"="bar"](${BBOX});`,
    `node["amenity"="pub"](${BBOX});`,
    `node["amenity"="nightclub"](${BBOX});`,
  ],
  // Competitor signal — directly drives the saturation component of the
  // Espresso Score. `amenity=cafe` is the canonical OSM tag for cafés;
  // `shop=coffee` catches specialty roasters; `cuisine=coffee_shop` is rarer
  // but used by some mappers.
  cafe: [
    `node["amenity"="cafe"](${BBOX});`,
    `way["amenity"="cafe"](${BBOX});`,
    `node["shop"="coffee"](${BBOX});`,
    `node["cuisine"="coffee_shop"](${BBOX});`,
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpassQuery(body, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "User-Agent": "groundwork-pipeline/1.0" },
        body,
      });
      if (res.ok) return res.json();
      const wait = 8000 * Math.pow(1.5, attempt);
      console.log(`  ${res.status} — retry in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
    } catch (err) {
      const wait = 8000 * Math.pow(1.5, attempt);
      console.log(`  network error: ${err.message} — retry in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
    }
  }
  throw new Error("Overpass: exhausted retries");
}

function toFeature(category, element) {
  const lon = element.lon ?? element.center?.lon;
  const lat = element.lat ?? element.center?.lat;
  if (lon == null || lat == null) return null;
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(lon.toFixed(6)), Number(lat.toFixed(6))] },
    properties: {
      category,
      osm_id: element.id,
      osm_type: element.type,
      name: element.tags?.name ?? null,
      // Keep a small subset of tags so we can audit / debug.
      tags: pickTags(element.tags ?? {}),
    },
  };
}

const KEEP_TAG_KEYS = new Set([
  "amenity", "office", "tourism", "historic", "railway", "station",
  "public_transport", "building", "operator",
]);
function pickTags(tags) {
  const out = {};
  for (const k of Object.keys(tags)) if (KEEP_TAG_KEYS.has(k)) out[k] = tags[k];
  return out;
}

async function main() {
  const allFeatures = [];
  const summary = {};

  for (const [category, selectors] of Object.entries(CATEGORIES)) {
    console.log(`Fetching ${category} …`);
    const query = `[out:json][timeout:90];(${selectors.join("")});out center;`;
    const data = await overpassQuery(query);
    const elements = data?.elements ?? [];
    let kept = 0;
    for (const el of elements) {
      const f = toFeature(category, el);
      if (f) {
        allFeatures.push(f);
        kept++;
      }
    }
    summary[category] = kept;
    console.log(`  ${kept} POIs`);
    await sleep(2000); // polite spacing between category requests
  }

  const fc = {
    type: "FeatureCollection",
    metadata: {
      generated_at: new Date().toISOString(),
      bbox: BBOX,
      source: "OpenStreetMap via Overpass API",
      license: "ODbL — © OpenStreetMap contributors",
      summary,
      total: allFeatures.length,
    },
    features: allFeatures,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(fc));

  console.log("\nCategory totals:");
  for (const [cat, n] of Object.entries(summary)) {
    console.log(`  ${cat.padEnd(12)} ${n.toString().padStart(5)}`);
  }
  console.log(`\nWrote ${allFeatures.length} POIs → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Pipeline failed:", err.message);
  process.exit(1);
});
