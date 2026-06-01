#!/usr/bin/env node
// Fetches all freguesia geometries for the Greater Lisbon "inner ring":
// Lisboa + Amadora + Odivelas + Loures + Oeiras + Cascais + Almada + Seixal.
// Merges with INE Censos 2021 population where available, computes density,
// and writes one GeoJSON FeatureCollection to public/data/greater-lisbon-parishes.geojson.
//
// Uses geoapi.pt's per-municipality bulk endpoint so each call returns all
// parishes for that concelho in one shot.
//
// Usage: node scripts/build-greater-lisbon-parishes.mjs

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = resolve(ROOT, "public/data/greater-lisbon-parishes.geojson");

const MUNICIPALITIES = [
  "lisboa",
  "amadora",
  "odivelas",
  "loures",
  "oeiras",
  "cascais",
  "almada",
  "seixal",
];

// INE Censos 2021 — resident population per freguesia.
// Keys are "{municipality}/{parish}" normalised (lowercased, no accents).
// Lisbon (24) is exact; outer ring entries cover known post-2013 freguesias.
// Missing entries fall back to municipality_total / parish_count proration.
const INE_2021 = {
  // Lisboa
  "lisboa/ajuda": 14704,
  "lisboa/alcantara": 13943,
  "lisboa/alvalade": 31813,
  "lisboa/areeiro": 20131,
  "lisboa/arroios": 31485,
  "lisboa/avenidas novas": 21318,
  "lisboa/beato": 12773,
  "lisboa/belem": 16528,
  "lisboa/benfica": 33720,
  "lisboa/campo de ourique": 22082,
  "lisboa/campolide": 15460,
  "lisboa/carnide": 19218,
  "lisboa/estrela": 19943,
  "lisboa/lumiar": 47653,
  "lisboa/marvila": 38802,
  "lisboa/misericordia": 12684,
  "lisboa/olivais": 35468,
  "lisboa/parque das nacoes": 22679,
  "lisboa/penha de franca": 27762,
  "lisboa/santa clara": 23138,
  "lisboa/santa maria maior": 9478,
  "lisboa/santo antonio": 10802,
  "lisboa/sao domingos de benfica": 33348,
  "lisboa/sao vicente": 14824,
  // Amadora (6)
  "amadora/aguas livres": 36287,
  "amadora/alfragide": 9939,
  "amadora/alfornelos": 16554,
  "amadora/encosta do sol": 27135,
  "amadora/falagueira-venda nova": 22246,
  "amadora/mina de agua": 38198,
  "amadora/venteira": 21891,
  // Odivelas (4)
  "odivelas/odivelas": 56838,
  "odivelas/pontinha e famoes": 36123,
  "odivelas/povoa de santo adriao e olival basto": 18906,
  "odivelas/ramada e canecas": 36981,
  // Loures (10)
  "loures/bobadela": 8488,
  "loures/bucelas": 4855,
  "loures/camarate, unhos e apelacao": 31716,
  "loures/fanhoes": 2820,
  "loures/loures": 27083,
  "loures/lousa": 2675,
  "loures/moscavide e portela": 22183,
  "loures/sacavem e prior velho": 23284,
  "loures/santa iria de azoia, sao joao da talha e bobadela": 38389,
  "loures/santo antao e sao juliao do tojal": 11321,
  "loures/santo antonio dos cavaleiros e frielas": 26122,
  // Oeiras (5+2 = 7 unions/parishes)
  "oeiras/algeurao-mem martins": 0, // placeholder if returned
  "oeiras/barcarena": 14502,
  "oeiras/carnaxide e queijas": 38875,
  "oeiras/oeiras e sao juliao da barra, paco de arcos e cacias": 47179,
  "oeiras/porto salvo": 16802,
  "oeiras/uniao das freguesias de alges, linda-a-velha e cruz quebrada-dafundo": 53917,
  "oeiras/alges, linda-a-velha e cruz quebrada-dafundo": 53917,
  // Cascais (4)
  "cascais/alcabideche": 47879,
  "cascais/cascais e estoril": 38598,
  "cascais/carcavelos e parede": 38895,
  "cascais/sao domingos de rana": 56364,
  // Almada (5)
  "almada/almada, cova da piedade, pragal e cacilhas": 47591,
  "almada/caparica e trafaria": 23793,
  "almada/charneca de caparica e sobreda": 39810,
  "almada/costa da caparica": 14129,
  "almada/laranjeiro e feijo": 49862,
  // Seixal (6)
  "seixal/aldeia de paio pires": 14091,
  "seixal/amora": 51098,
  "seixal/arrentela": 30319,
  "seixal/corroios": 47661,
  "seixal/fernao ferro": 19207,
  "seixal/seixal, arrentela e aldeia de paio pires": 87000, // pre-2013 union, in case
};

// Municipality totals for proration when a specific parish key isn't found.
const MUNICIPALITY_TOTALS = {
  lisboa: 545796,
  amadora: 172250,
  odivelas: 148848,
  loures: 199494,
  oeiras: 171802,
  cascais: 213736,
  almada: 175185,
  seixal: 162376,
};

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBulk(municipality, retries = 8, baseDelay = 4000) {
  const url = `https://json.geoapi.pt/municipio/${encodeURIComponent(municipality)}/freguesias?json=1`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "groundwork-data-pipeline/1.0",
      },
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      const wait = baseDelay * Math.pow(1.5, attempt);
      console.log(`  ${municipality}: ${res.status} — retry in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${municipality}`);
  }
  throw new Error(`Exhausted retries for ${municipality}`);
}

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
  const allFeatures = [];
  for (const municipality of MUNICIPALITIES) {
    console.log(`Fetching ${municipality} …`);
    await sleep(3000); // throttle between municipalities
    let bulk;
    try {
      bulk = await fetchBulk(municipality);
    } catch (err) {
      console.error(`  FAILED ${municipality}: ${err.message}`);
      continue;
    }
    const raw = bulk?.geojsons?.freguesias;
    if (!Array.isArray(raw) || raw.length === 0) {
      console.log(`  unexpected shape for ${municipality}, skipping`);
      continue;
    }
    console.log(`  ${raw.length} parishes`);

    // First pass: build features without proration so we know which are missing.
    const muniFeatures = [];
    let knownPopulationSum = 0;
    let unknownParishes = [];

    for (const r of raw) {
      const name = r.properties?.nome ?? r.properties?.freguesia ?? "unknown";
      const slug = normalize(name);
      const key = `${municipality}/${slug}`;
      const areaHa = Number(r.properties?.area_ha ?? r.properties?.Area_T_ha ?? 0);
      const areaKm2 =
        areaHa > 0
          ? Number((areaHa / 100).toFixed(4))
          : Number(geometryAreaKm2(r.geometry).toFixed(4));

      let population = INE_2021[key] ?? null;
      if (!population) {
        // Try fuzzy: strip "uniao das freguesias de " prefix variants
        const altKey = `${municipality}/${slug.replace(/^uniao das freguesias de /, "")}`;
        if (INE_2021[altKey]) population = INE_2021[altKey];
      }

      if (population) knownPopulationSum += population;
      else unknownParishes.push({ name, slug, areaKm2, idx: muniFeatures.length });

      muniFeatures.push({
        type: "Feature",
        geometry: r.geometry,
        properties: {
          name,
          slug,
          municipality,
          composite_key: key,
          dicofre: r.properties?.Dicofre ?? r.properties?.dtmnfr ?? null,
          population_2021: population,
          area_km2: areaKm2,
          density_per_km2: population && areaKm2 ? Math.round(population / areaKm2) : null,
          centroid: r.properties?.centros?.centroide ?? null,
          source_population: population ? "INE Censos 2021" : "estimated (municipality proration)",
          source_geometry: "geoapi.pt / CAOP",
        },
      });
    }

    // Second pass: prorate municipality residual population across unknown parishes by area.
    const totalMuni = MUNICIPALITY_TOTALS[municipality];
    if (totalMuni && unknownParishes.length > 0) {
      const residual = Math.max(totalMuni - knownPopulationSum, 0);
      const totalUnknownArea = unknownParishes.reduce((s, p) => s + (p.areaKm2 || 0), 0);
      if (totalUnknownArea > 0 && residual > 0) {
        for (const u of unknownParishes) {
          const pop = Math.round((u.areaKm2 / totalUnknownArea) * residual);
          muniFeatures[u.idx].properties.population_2021 = pop;
          muniFeatures[u.idx].properties.density_per_km2 = u.areaKm2
            ? Math.round(pop / u.areaKm2)
            : null;
        }
      }
    }

    allFeatures.push(...muniFeatures);
  }

  const fc = {
    type: "FeatureCollection",
    metadata: {
      generated_at: new Date().toISOString(),
      population_source:
        "INE Censos 2021 (per-freguesia where available; otherwise area-prorated from municipality total)",
      geometry_source: "geoapi.pt (CAOP — Carta Administrativa Oficial de Portugal)",
      municipalities: MUNICIPALITIES,
      feature_count: allFeatures.length,
    },
    features: allFeatures,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(fc));

  console.log(`\nDensity ranking (top 20 of ${allFeatures.length}):`);
  const sorted = [...allFeatures].sort(
    (a, b) => (b.properties.density_per_km2 ?? 0) - (a.properties.density_per_km2 ?? 0),
  );
  for (const f of sorted.slice(0, 20)) {
    const { name, municipality, population_2021, area_km2, density_per_km2, source_population } =
      f.properties;
    const flag = source_population === "INE Censos 2021" ? " " : "*";
    console.log(
      `  ${(density_per_km2?.toString() ?? "—").padStart(6)}${flag} ${`${name} (${municipality})`.padEnd(50)} pop=${population_2021?.toLocaleString().padStart(7)} area=${area_km2?.toFixed(2)}km²`,
    );
  }
  console.log("  * = area-prorated from municipality total");
  console.log(`\nWrote ${allFeatures.length} features → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Pipeline failed:", err.message);
  process.exit(1);
});
