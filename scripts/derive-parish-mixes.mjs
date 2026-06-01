#!/usr/bin/env node
// Aggregates OSM POIs by parish (via point-in-polygon), then derives each
// parish's archetype mix from real category counts.
//
// Inputs:
//   public/data/greater-lisbon-parishes.geojson  (polygons)
//   public/data/greater-lisbon-pois.geojson      (categorised points)
// Outputs:
//   src/lib/derived-parish-mixes.json
//
// Archetype derivation:
//   office_signal     = (office × 1.0)
//   student_signal    = (university × 5) + (school × 0.3)
//   tourist_signal    = (hotel × 2) + (tourist × 1) + (transit_terminal × 0.5)
//   nightlife_signal  = (bar/pub × 1) + (nightclub × 2)
//   residential_signal = max(0, 1 - sum_of_normalized_other_signals)
//
// Each signal is normalised against the *maximum* across all parishes so the
// busiest tourist parish gets tourist_weight≈1.0 etc. Final mixes are
// normalised to sum to 1.0.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PARISHES_PATH = resolve(ROOT, "public/data/greater-lisbon-parishes.geojson");
const POIS_PATH = resolve(ROOT, "public/data/greater-lisbon-pois.geojson");
const OUT_PATH = resolve(ROOT, "src/lib/derived-parish-mixes.json");

// Point-in-polygon (ray casting), same as the points builder.
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

async function main() {
  const parishes = JSON.parse(await readFile(PARISHES_PATH, "utf8"));
  const pois = JSON.parse(await readFile(POIS_PATH, "utf8"));

  // Pre-compute bbox per parish for fast bbox-first rejection during the
  // point-in-polygon scan.
  // Re-classify the raw POIs into sub-buckets so noisy OSM tags (e.g. every
  // `historic=*` plaque) don't dominate the tourist signal.
  function subCategory(poi) {
    const tags = poi.properties.tags ?? {};
    const cat = poi.properties.category;
    if (cat === "hotel") {
      // Real lodging vs Airbnb-style apartment listings (which flood residential parishes).
      if (tags.tourism === "hotel" || tags.tourism === "hostel" || tags.tourism === "guest_house") {
        return "hotel_proper";
      }
      return "short_let"; // tourism=apartment and similar
    }
    if (cat === "tourist") {
      if (tags.tourism === "museum" || tags.tourism === "attraction") return "tourist_strong";
      if (tags.tourism === "viewpoint") return "tourist_weak";
      if (tags.historic && !tags.tourism) return "tourist_weak";
      return "tourist_weak";
    }
    if (cat === "nightlife") {
      if (tags.amenity === "nightclub") return "nightclub";
      return "bar_pub";
    }
    if (cat === "transit") {
      if (tags.station === "subway" || tags.amenity === "ferry_terminal") return "transit_major";
      return "transit_minor";
    }
    return cat;
  }

  const ZERO_COUNTS = {
    school: 0, university: 0, office: 0, hospital: 0,
    hotel_proper: 0, short_let: 0,
    transit_major: 0, transit_minor: 0,
    tourist_strong: 0, tourist_weak: 0,
    bar_pub: 0, nightclub: 0,
    cafe: 0,
  };
  const parishMeta = parishes.features.map((f) => ({
    feature: f,
    key: f.properties.composite_key,
    area_km2: f.properties.area_km2 ?? 1,
    bbox: bbox(f.geometry.coordinates),
    counts: { ...ZERO_COUNTS },
  }));

  let assigned = 0;
  for (const poi of pois.features) {
    const [lon, lat] = poi.geometry.coordinates;
    const sub = subCategory(poi);
    for (const p of parishMeta) {
      const [minLon, minLat, maxLon, maxLat] = p.bbox;
      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
      if (pointInPolygon(lon, lat, p.feature.geometry)) {
        p.counts[sub] = (p.counts[sub] ?? 0) + 1;
        assigned++;
        break;
      }
    }
  }
  console.log(`Assigned ${assigned} of ${pois.features.length} POIs to parishes.`);

  // √-area normalisation. Tourism and nightlife concentrate along corridors
  // (waterfront, main street, beachfront), so dividing by sqrt(area) instead
  // of area better captures intensity in large parishes with concentrated
  // activity (Belém, Costa da Caparica, Cascais).
  const signals = parishMeta.map((p) => {
    const c = p.counts;
    const perKm = (n) => n / Math.sqrt(Math.max(p.area_km2, 0.1));
    return {
      key: p.key,
      name: p.feature.properties.name,
      municipality: p.feature.properties.municipality,
      counts: c,
      raw: {
        office:    perKm(c.office) * 1.0,
        student:   perKm(c.university) * 8 + perKm(c.school) * 0.08,
        tourist:   perKm(c.hotel_proper) * 3.0
                 + perKm(c.short_let) * 0.4
                 + perKm(c.tourist_strong) * 2.5
                 + perKm(c.tourist_weak) * 0.1
                 + perKm(c.transit_major) * 0.4,
        nightlife: perKm(c.bar_pub) * 0.7 + perKm(c.nightclub) * 2.5,
      },
    };
  });

  // Smooth absorption: as total raw signal grows, the parish's non-residential
  // share asymptotically approaches the cap. Keeps proportions among the four
  // archetypes intact (no per-signal clamp distorting them).
  const NONRES_CAP = 0.85;
  const ABSORPTION = 0.012; // re-tuned for √-area scaled signals

  const mixes = {};
  for (const s of signals) {
    const raw = s.raw;
    const totalRaw = raw.office + raw.student + raw.tourist + raw.nightlife;
    const otherShare = NONRES_CAP * (1 - Math.exp(-totalRaw * ABSORPTION));
    const residentialShare = 1 - otherShare;

    if (totalRaw === 0) {
      mixes[s.key] = { residential: 1, office: 0, student: 0, tourist: 0, nightlife: 0 };
      continue;
    }
    mixes[s.key] = {
      residential: round(residentialShare),
      office:    round(otherShare * (raw.office / totalRaw)),
      student:   round(otherShare * (raw.student / totalRaw)),
      tourist:   round(otherShare * (raw.tourist / totalRaw)),
      nightlife: round(otherShare * (raw.nightlife / totalRaw)),
    };
  }

  // Per-parish summary stats — these feed the Espresso Score at runtime.
  const stats = {};
  for (const p of parishMeta) {
    const c = p.counts;
    const area = Math.max(p.area_km2, 0.1);
    const perKm = (n) => Math.round((n / area) * 100) / 100;
    stats[p.key] = {
      name: p.feature.properties.name,
      municipality: p.feature.properties.municipality,
      area_km2: p.area_km2,
      population_2021: p.feature.properties.population_2021,
      density_per_km2: p.feature.properties.density_per_km2,
      poi_counts: { ...c },
      densities: {
        cafe_per_km2:           perKm(c.cafe),
        office_per_km2:         perKm(c.office),
        hotel_per_km2:          perKm(c.hotel_proper),
        tourist_per_km2:        perKm(c.tourist_strong + c.tourist_weak),
        bar_pub_per_km2:        perKm(c.bar_pub + c.nightclub),
        transit_major_per_km2:  perKm(c.transit_major),
        university_per_km2:     perKm(c.university),
      },
    };
  }

  // Audit print — top 5 by each archetype
  console.log("\nTop 5 by café density (saturation indicator):");
  Object.entries(stats)
    .sort((a, b) => b[1].densities.cafe_per_km2 - a[1].densities.cafe_per_km2)
    .slice(0, 5)
    .forEach(([k, s]) => console.log(`  ${k.padEnd(48)} ${s.densities.cafe_per_km2}/km²`));

  console.log("\nTop 5 by office share:");
  rank(mixes, "office").slice(0, 5).forEach((r) => console.log(`  ${r.key.padEnd(48)} office=${r.val}`));
  console.log("\nTop 5 by tourist share:");
  rank(mixes, "tourist").slice(0, 5).forEach((r) => console.log(`  ${r.key.padEnd(48)} tourist=${r.val}`));
  console.log("\nTop 5 by student share:");
  rank(mixes, "student").slice(0, 5).forEach((r) => console.log(`  ${r.key.padEnd(48)} student=${r.val}`));
  console.log("\nTop 5 by nightlife share:");
  rank(mixes, "nightlife").slice(0, 5).forEach((r) => console.log(`  ${r.key.padEnd(48)} nightlife=${r.val}`));

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify({
    metadata: {
      generated_at: new Date().toISOString(),
      source_pois: "public/data/greater-lisbon-pois.geojson",
      source_parishes: "public/data/greater-lisbon-parishes.geojson",
      normalisation: "√area + smooth absorption",
      parish_count: signals.length,
    },
    mixes,
    stats,
    debug_signals: signals,
  }, null, 2));
  console.log(`\nWrote ${Object.keys(mixes).length} parish mixes → ${OUT_PATH}`);
}

function round(x) { return Math.round(x * 100) / 100; }
function rank(mixes, archetype) {
  return Object.entries(mixes)
    .map(([key, m]) => ({ key, val: m[archetype] }))
    .sort((a, b) => b.val - a.val);
}

main().catch((err) => { console.error(err); process.exit(1); });
