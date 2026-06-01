#!/usr/bin/env node
// Fetches Lisbon freguesia geometries from geoapi.pt (single bulk call) and
// merges with INE 2021 population to compute residents per km² per parish.
// Outputs a GeoJSON FeatureCollection at public/data/lisbon-parishes.geojson.
//
// Usage: node scripts/build-lisbon-parishes.mjs

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = resolve(ROOT, "public/data/lisbon-parishes.geojson");
const BULK_URL = "https://json.geoapi.pt/municipio/lisboa/freguesias?json=1";

// INE — Censos 2021 resident population per Lisbon freguesia.
const INE_2021 = {
  ajuda: 14704,
  alcantara: 13943,
  alvalade: 31813,
  areeiro: 20131,
  arroios: 31485,
  "avenidas novas": 21318,
  beato: 12773,
  belem: 16528,
  benfica: 33720,
  "campo de ourique": 22082,
  campolide: 15460,
  carnide: 19218,
  estrela: 19943,
  lumiar: 47653,
  marvila: 38802,
  misericordia: 12684,
  olivais: 35468,
  "parque das nacoes": 22679,
  "penha de franca": 27762,
  "santa clara": 23138,
  "santa maria maior": 9478,
  "santo antonio": 10802,
  "sao domingos de benfica": 33348,
  "sao vicente": 14824,
};

const normalize = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBulk(retries = 8, baseDelay = 5000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(BULK_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "groundwork-data-pipeline/1.0",
      },
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      const wait = baseDelay * Math.pow(1.6, attempt);
      console.log(`  ${res.status} from geoapi.pt — retry in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText}`);
  }
  throw new Error("Exhausted retries against geoapi.pt");
}

// Spherical-excess area in km² for a single linear ring of [lon, lat] points.
function ringAreaKm2(ring) {
  const R = 6371.0088;
  let area = 0;
  const n = ring.length;
  if (n < 3) return 0;
  for (let i = 0; i < n - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    area +=
      (((lon2 - lon1) * Math.PI) / 180) *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((area * R * R) / 2);
}

function geometryAreaKm2(geom) {
  if (!geom) return 0;
  if (geom.type === "Polygon") {
    const [outer, ...holes] = geom.coordinates;
    return ringAreaKm2(outer) - holes.reduce((s, h) => s + ringAreaKm2(h), 0);
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.reduce((sum, poly) => {
      const [outer, ...holes] = poly;
      return sum + ringAreaKm2(outer) - holes.reduce((s, h) => s + ringAreaKm2(h), 0);
    }, 0);
  }
  return 0;
}

async function main() {
  console.log("Fetching Lisbon freguesias from geoapi.pt (bulk) …");
  const bulk = await fetchBulk();
  const rawFeatures = bulk?.geojsons?.freguesias;
  if (!Array.isArray(rawFeatures) || rawFeatures.length === 0) {
    throw new Error("Unexpected response shape from geoapi.pt");
  }
  console.log(`  Received ${rawFeatures.length} parish features.`);

  const features = [];
  for (const raw of rawFeatures) {
    const name = raw.properties?.nome ?? raw.properties?.freguesia ?? "unknown";
    const key = normalize(name);
    const population = INE_2021[key] ?? null;
    const areaHa = Number(raw.properties?.area_ha ?? raw.properties?.Area_T_ha ?? 0);
    const areaKm2 =
      areaHa > 0
        ? Number((areaHa / 100).toFixed(4))
        : Number(geometryAreaKm2(raw.geometry).toFixed(4));
    const density =
      population && areaKm2 ? Math.round(population / areaKm2) : null;

    features.push({
      type: "Feature",
      geometry: raw.geometry,
      properties: {
        name,
        slug: key,
        dicofre: raw.properties?.Dicofre ?? raw.properties?.dtmnfr ?? null,
        population_2021: population,
        area_km2: areaKm2,
        density_per_km2: density,
        centroid: raw.properties?.centros?.centroide ?? null,
        source_population: "INE Censos 2021",
        source_geometry: "geoapi.pt / CAOP",
      },
    });
  }

  const fc = {
    type: "FeatureCollection",
    metadata: {
      generated_at: new Date().toISOString(),
      population_source: "INE — Censos 2021 (resident population)",
      geometry_source: "geoapi.pt (derived from CAOP — Carta Administrativa Oficial de Portugal)",
      feature_count: features.length,
    },
    features,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(fc));

  // Summary table
  const sorted = [...features].sort(
    (a, b) => (b.properties.density_per_km2 ?? 0) - (a.properties.density_per_km2 ?? 0),
  );
  console.log("\nDensity ranking (residents per km²):");
  for (const f of sorted) {
    const { name, population_2021, area_km2, density_per_km2 } = f.properties;
    console.log(
      `  ${density_per_km2?.toString().padStart(6) ?? "  —"}  ${name.padEnd(26)} pop=${population_2021?.toLocaleString().padStart(7)}  area=${area_km2?.toFixed(2)} km²`,
    );
  }
  console.log(`\nWrote ${features.length} features → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Pipeline failed:", err.message);
  process.exit(1);
});
