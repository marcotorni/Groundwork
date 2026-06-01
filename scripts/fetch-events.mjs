#!/usr/bin/env node
// Fetches upcoming events across the Lisbon metro area for the next 6 months,
// normalises them, attaches venue coordinates + a footfall-impact size estimate,
// and writes a single JSON file consumed by the timeline + heatmap.
//
// Sources:
//   1. Ticketmaster Discovery API — kept wired in case PT coverage lands later
//      (today: 0 events in PT — Portuguese ticketing flows through Blueticket
//      / Ticketline, which need separate scrapers).
//   2. Curated calendar of one-off mega-events the concept doc highlights
//      (Santos Populares, NOS Alive, Web Summit, Festas de Lisboa, LEFFEST,
//      ModaLisboa, DocLisboa, BTL, Festival ao Largo, Jazz em Agosto, etc.).
//   3. Recurring weekly events expanded into per-date instances
//      (Feira da Ladra Tue+Sat; LX Market Sun).
//
// Outputs: public/data/lisbon-events.json

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = resolve(ROOT, "public/data/lisbon-events.json");

const HORIZON_DAYS = 365; // full year
const LISBON_CENTER = { lat: 38.7169, lng: -9.1399 };
const RADIUS_KM = 30;
const BBOX = { minLng: -9.55, minLat: 38.55, maxLng: -8.95, maxLat: 38.9 };

const VENUE_CAPACITY = {
  "estádio da luz": 64642, "estadio da luz": 64642,
  "estádio josé alvalade": 50095, "estadio jose alvalade": 50095,
  "estádio do restelo": 32500, "estádio nacional": 37500,
  "altice arena": 20000, "meo arena": 20000,
  "campo pequeno": 9000,
  "passeio marítimo de algés": 55000, "passeio maritimo de alges": 55000,
  "parque tejo": 80000,
  "fil": 50000, "feira internacional de lisboa": 50000,
  "pavilhão carlos lopes": 4000, "coliseu dos recreios": 4000,
  "teatro tivoli bbva": 1100, "lav lisboa ao vivo": 2000,
  "casino estoril": 1500, "hipódromo manuel possolo": 25000,
};

function categoryFromSegment(segmentName) {
  const s = (segmentName ?? "").toLowerCase();
  if (s.includes("music")) return "concert";
  if (s.includes("sport")) return "sports";
  if (s.includes("theatre") || s.includes("arts")) return "theatre";
  if (s.includes("family")) return "family";
  if (s.includes("film")) return "film";
  return "other";
}

function venueCapacity(venueName) {
  const k = (venueName ?? "").toLowerCase();
  for (const [key, cap] of Object.entries(VENUE_CAPACITY)) {
    if (k.includes(key)) return cap;
  }
  return null;
}

function defaultCapacityByCategory(cat) {
  switch (cat) {
    case "sports": return 25000;
    case "concert": return 2500;
    case "theatre": return 800;
    case "family": return 1200;
    case "film": return 400;
    default: return 800;
  }
}

const inBbox = (lng, lat) =>
  lng >= BBOX.minLng && lng <= BBOX.maxLng && lat >= BBOX.minLat && lat <= BBOX.maxLat;

async function loadDotenv() {
  try {
    const env = await readFile(resolve(ROOT, ".env.local"), "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) process.env[m[1]] = process.env[m[1]] ?? m[2];
    }
  } catch {}
}

async function fetchTicketmaster() {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return [];
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 3600 * 1000);
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const out = [];
  for (let page = 0; page < 20; page++) {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", key);
    url.searchParams.set("countryCode", "PT");
    url.searchParams.set("latlong", `${LISBON_CENTER.lat},${LISBON_CENTER.lng}`);
    url.searchParams.set("radius", String(RADIUS_KM));
    url.searchParams.set("unit", "km");
    url.searchParams.set("startDateTime", iso(now));
    url.searchParams.set("endDateTime", iso(horizon));
    url.searchParams.set("size", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", "date,asc");
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();
    const events = data?._embedded?.events ?? [];
    if (events.length === 0) break;
    for (const e of events) {
      const venue = e._embedded?.venues?.[0];
      const lng = Number(venue?.location?.longitude);
      const lat = Number(venue?.location?.latitude);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      if (!inBbox(lng, lat)) continue;
      const startISO = e.dates?.start?.dateTime || e.dates?.start?.localDate;
      if (!startISO) continue;
      const startDt = new Date(startISO);
      if (Number.isNaN(startDt.getTime())) continue;
      const category = categoryFromSegment(e.classifications?.[0]?.segment?.name);
      out.push({
        id: `tm-${e.id}`,
        title: e.name,
        start_dt: startDt.toISOString(),
        end_dt: e.dates?.end?.dateTime ?? null,
        venue_name: venue?.name ?? "",
        venue_address: [venue?.address?.line1, venue?.city?.name].filter(Boolean).join(", "),
        lng, lat,
        category,
        size_estimate: venueCapacity(venue?.name) ?? defaultCapacityByCategory(category),
        url: e.url,
        source: "ticketmaster",
      });
    }
    const total = data?.page?.totalElements ?? events.length;
    if ((page + 1) * 100 >= total) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return out;
}

// ── Curated one-off mega-events (year-templated) ─────────────────────────────
// Venue coordinates verified against Google Maps / OSM. All points sit on
// land — the water-mask layer in MapCanvas additionally clips any residual
// heatmap kernel bleed over the Tagus / Atlantic.
function curatedOneOffs(year) {
  const lng = {
    alfama:          -9.128, // Largo do Chafariz de Dentro, Alfama
    baixa:           -9.139, // Praça da Figueira / Baixa central
    av_liberdade:    -9.146, // Av. da Liberdade midpoint
    alges:           -9.226, // Passeio Marítimo de Algés — promenade, onshore
    parque_nacoes:   -9.094, // FIL / Altice Arena
    belem:           -9.205, // Mosteiro dos Jerónimos
    gulbenkian:      -9.154, // Fundação Calouste Gulbenkian
    santa_apolonia:  -9.119, // Largo de Santa Apolónia (terminal entrance)
    lx_factory:      -9.179, // LX Factory entrance, Alcântara
    sintra:          -9.385, // Sintra Vila
    estoril_tennis:  -9.4036, // Clube de Ténis do Estoril — Millennium Estoril Open court
    estoril_casino:  -9.3970, // Casino Estoril — LEFFEST gala venue
  };
  const lat = {
    alfama:          38.714,
    baixa:           38.713,
    av_liberdade:    38.720,
    alges:           38.696,
    parque_nacoes:   38.768,
    belem:           38.698,
    gulbenkian:      38.738,
    santa_apolonia:  38.715,
    lx_factory:      38.703,
    sintra:          38.798,
    estoril_tennis:  38.7077,
    estoril_casino:  38.7060,
  };
  const e = (id, title, start, end, venue, lngK, latK, cat, size) => ({
    id: `curated-${year}-${id}`,
    title,
    start_dt: `${year}-${start}.000Z`,
    end_dt: end ? `${year}-${end}.000Z` : null,
    venue_name: venue,
    venue_address: `${venue}, Lisboa`,
    lng: lng[lngK], lat: lat[latK],
    category: cat,
    size_estimate: size,
    source: "curated",
  });

  return [
    // ─── Festas de Lisboa (whole June, peak nights) ───
    e("festas-lisboa-open",         "Festas de Lisboa — Opening Weekend", "06-06T19:00:00", "06-08T01:00:00", "City-wide", "baixa", "baixa", "cultural", 80000),
    e("santos-populares-12",        "Festa de Santo António · Night 1", "06-12T18:00:00", "06-13T04:00:00", "Alfama / Mouraria / Bica", "alfama", "alfama", "cultural", 250000),
    e("santos-populares-13",        "Marchas Populares + Santo António · Night 2", "06-13T15:00:00", "06-14T03:00:00", "Avenida da Liberdade + Alfama", "av_liberdade", "av_liberdade", "cultural", 500000),
    e("sao-joao-23",                "Festa de São João", "06-23T19:00:00", "06-24T03:00:00", "Alfama / Mouraria", "alfama", "alfama", "cultural", 60000),
    e("sao-pedro-29",               "Festa de São Pedro", "06-29T18:00:00", "06-30T03:00:00", "Alfama / Bica", "alfama", "alfama", "cultural", 40000),

    // ─── Festival ao Largo (late Jun – mid Jul, Largo de São Carlos) ───
    e("festival-ao-largo-1",        "Festival ao Largo — Opening", "06-26T21:00:00", "06-27T00:00:00", "Largo de São Carlos", "baixa", "baixa", "concert", 6000),
    e("festival-ao-largo-2",        "Festival ao Largo · Week 2", "07-03T21:00:00", "07-04T00:00:00", "Largo de São Carlos", "baixa", "baixa", "concert", 6000),
    e("festival-ao-largo-3",        "Festival ao Largo · Week 3", "07-10T21:00:00", "07-11T00:00:00", "Largo de São Carlos", "baixa", "baixa", "concert", 6000),

    // ─── NOS Alive (Algés, Jul 9-11) ───
    e("nos-alive-d1",               "NOS Alive · Day 1", "07-09T16:00:00", "07-10T02:00:00", "Passeio Marítimo de Algés", "alges", "alges", "concert", 55000),
    e("nos-alive-d2",               "NOS Alive · Day 2", "07-10T16:00:00", "07-11T02:00:00", "Passeio Marítimo de Algés", "alges", "alges", "concert", 55000),
    e("nos-alive-d3",               "NOS Alive · Day 3", "07-11T16:00:00", "07-12T02:00:00", "Passeio Marítimo de Algés", "alges", "alges", "concert", 55000),

    // ─── Summer  ───
    e("festival-oceanos-jul",       "Festival dos Oceanos — Opening Week", "07-24T18:00:00", "07-26T02:00:00", "Belém", "belem", "belem", "cultural", 30000),
    e("jazz-em-agosto-d1",          "Jazz em Agosto · Day 1", "08-01T21:00:00", "08-01T23:30:00", "Gulbenkian Open-Air Amphitheatre", "gulbenkian", "gulbenkian", "concert", 1200),
    e("jazz-em-agosto-d3",          "Jazz em Agosto · Day 3", "08-03T21:00:00", "08-03T23:30:00", "Gulbenkian Open-Air Amphitheatre", "gulbenkian", "gulbenkian", "concert", 1200),
    e("jazz-em-agosto-d6",          "Jazz em Agosto · Day 6", "08-06T21:00:00", "08-06T23:30:00", "Gulbenkian Open-Air Amphitheatre", "gulbenkian", "gulbenkian", "concert", 1200),
    e("estoril-tennis-final",       "Millennium Estoril Open · Final", "09-13T15:00:00", "09-13T19:00:00", "Clube de Ténis do Estoril", "estoril_tennis", "estoril_tennis", "sports", 6000),

    // ─── Autumn ───
    e("modalisboa-d1",              "ModaLisboa Fashion Week · Day 1", "10-08T20:00:00", "10-08T23:30:00", "Pátio da Galé", "baixa", "baixa", "cultural", 5000),
    e("modalisboa-d2",              "ModaLisboa Fashion Week · Day 2", "10-09T20:00:00", "10-09T23:30:00", "Pátio da Galé", "baixa", "baixa", "cultural", 5000),
    e("modalisboa-d3",              "ModaLisboa Fashion Week · Day 3", "10-10T20:00:00", "10-10T23:30:00", "Pátio da Galé", "baixa", "baixa", "cultural", 5000),
    e("doclisboa-open",             "DocLisboa Festival — Opening", "10-15T20:00:00", "10-15T23:30:00", "Cinema Culturgest + Cinemateca", "av_liberdade", "av_liberdade", "film", 1500),
    e("doclisboa-mid",              "DocLisboa Festival — Mid-week", "10-22T20:00:00", "10-22T23:30:00", "Cinema Culturgest + Cinemateca", "av_liberdade", "av_liberdade", "film", 1500),

    // ─── Web Summit (FIL/Altice Arena, Nov 9-12) ───
    e("web-summit-d1",              "Web Summit · Day 1", "11-09T08:00:00", "11-09T20:00:00", "FIL / Altice Arena", "parque_nacoes", "parque_nacoes", "conference", 70000),
    e("web-summit-d2",              "Web Summit · Day 2", "11-10T08:00:00", "11-10T20:00:00", "FIL / Altice Arena", "parque_nacoes", "parque_nacoes", "conference", 70000),
    e("web-summit-d3",              "Web Summit · Day 3", "11-11T08:00:00", "11-11T20:00:00", "FIL / Altice Arena", "parque_nacoes", "parque_nacoes", "conference", 70000),
    e("web-summit-d4",              "Web Summit · Day 4", "11-12T08:00:00", "11-12T20:00:00", "FIL / Altice Arena", "parque_nacoes", "parque_nacoes", "conference", 70000),

    e("leffest-open",               "LEFFEST · Opening Gala", "11-14T20:00:00", "11-14T23:30:00", "Casino Estoril", "estoril_casino", "estoril_casino", "film", 2000),
    e("leffest-mid",                "LEFFEST · Mid-festival", "11-16T20:00:00", "11-16T23:30:00", "Cinemateca / Tivoli", "av_liberdade", "av_liberdade", "film", 1500),
  ];
}

// ── Recurring weekly events ──────────────────────────────────────────────────
function recurringWeekly(year, monthFrom, monthTo) {
  // For each day in the horizon, generate instances for known weekly events.
  const out = [];
  const start = new Date(`${year}-${String(monthFrom).padStart(2, "0")}-01T00:00:00Z`);
  const end = new Date(`${year}-${String(monthTo).padStart(2, "0")}-28T23:59:59Z`);
  // Campo de Santa Clara (Feira da Ladra) and LX Factory entrance — onshore.
  const lng = { campo_santa_clara: -9.123, lx_factory: -9.179 };
  const lat = { campo_santa_clara: 38.715, lx_factory: 38.703 };
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay(); // 0 Sun … 6 Sat
    const ymd = d.toISOString().slice(0, 10);

    // Feira da Ladra — Campo de Santa Clara — Tuesdays + Saturdays 09:00-18:00.
    if (dow === 2 || dow === 6) {
      out.push({
        id: `recurring-feira-da-ladra-${ymd}`,
        title: "Feira da Ladra",
        start_dt: `${ymd}T09:00:00.000Z`,
        end_dt:   `${ymd}T18:00:00.000Z`,
        venue_name: "Campo de Santa Clara",
        venue_address: "Campo de Santa Clara, Lisboa",
        lng: lng.campo_santa_clara, lat: lat.campo_santa_clara,
        category: "market",
        size_estimate: 8000,
        source: "recurring",
      });
    }

    // LX Market — LX Factory — Sundays 11:00-19:00.
    if (dow === 0) {
      out.push({
        id: `recurring-lx-market-${ymd}`,
        title: "LX Market",
        start_dt: `${ymd}T11:00:00.000Z`,
        end_dt:   `${ymd}T19:00:00.000Z`,
        venue_name: "LX Factory",
        venue_address: "Rua Rodrigues de Faria, Alcântara",
        lng: lng.lx_factory, lat: lat.lx_factory,
        category: "market",
        size_estimate: 12000,
        source: "recurring",
      });
    }
  }
  return out;
}

// ── Curated cruise arrivals ──────────────────────────────────────────────────
// Lisbon's cruise season runs primarily May–October. Each ship spends ~10 hours
// in port (~07:00–18:00 typical) and discharges 2,000–4,000 passengers into
// the Baixa / Alfama / Belém corridor. We seed a representative pattern;
// real scraping of Porto de Lisboa's published schedule is the next step.
// Cruise terminals are built on piers extending into the Tagus. We anchor the
// point at the building entrance (onshore) so the heatmap kernel reads as
// "passengers disembark and walk into Alfama/Baixa".
const CRUISE_TERMINALS = {
  santa_apolonia: { lng: -9.119, lat: 38.715, name: "Terminal Santa Apolónia" },
  jardim_tabaco:  { lng: -9.130, lat: 38.711, name: "Terminal Jardim do Tabaco" },
};

const CURATED_CRUISE_SHIPS = [
  // (relative-to-year date, terminal, ship name, passengers)
  ["05-22", "jardim_tabaco",  "MSC Grandiosa",            6334],
  ["05-25", "santa_apolonia", "Norwegian Epic",           4100],
  ["06-02", "jardim_tabaco",  "AIDAcosma",                5200],
  ["06-08", "santa_apolonia", "Costa Smeralda",           6554],
  ["06-15", "jardim_tabaco",  "MSC World Europa",         6762],
  ["06-22", "santa_apolonia", "Queen Mary 2",             2691],
  ["07-04", "jardim_tabaco",  "Symphony of the Seas",     6680],
  ["07-15", "santa_apolonia", "Anthem of the Seas",       4905],
  ["07-28", "jardim_tabaco",  "MSC Bellissima",           5686],
  ["08-09", "santa_apolonia", "Costa Toscana",            5224],
  ["08-21", "jardim_tabaco",  "Norwegian Prima",          3215],
  ["09-03", "santa_apolonia", "Celebrity Edge",           2918],
  ["09-12", "jardim_tabaco",  "MSC Grandiosa",            6334],
  ["09-19", "santa_apolonia", "AIDAperla",                3286],
  ["09-26", "jardim_tabaco",  "Costa Smeralda",           6554],
  ["10-03", "santa_apolonia", "Queen Victoria",           2014],
  ["10-10", "jardim_tabaco",  "Symphony of the Seas",     6680],
  ["10-17", "santa_apolonia", "MSC Magnifica",            3013],
  ["10-24", "jardim_tabaco",  "Norwegian Star",           2348],
  ["11-07", "santa_apolonia", "AIDAcosma",                5200], // shoulder season
  ["11-21", "jardim_tabaco",  "MSC Splendida",            3274],
  ["12-12", "santa_apolonia", "World Voyager",            172],   // expedition class
  ["01-15", "santa_apolonia", "Silver Dawn",              596],
  ["02-08", "jardim_tabaco",  "Viking Saturn",            930],
  ["03-12", "santa_apolonia", "MSC Virtuosa",             6334],  // season ramp-up
  ["04-04", "jardim_tabaco",  "AIDAcosma",                5200],
  ["04-18", "santa_apolonia", "Costa Smeralda",           6554],
];

function curatedCruises(currentYear, nextYear) {
  return CRUISE_TERMINALS && CURATED_CRUISE_SHIPS.map(([md, term, ship, pax]) => {
    const [mm, dd] = md.split("-");
    // Months 1–4 belong to nextYear (we start in May 2026, January is the next year over).
    const y = parseInt(mm) >= 5 ? currentYear : nextYear;
    const term0 = CRUISE_TERMINALS[term];
    return {
      id: `cruise-${y}-${md}-${ship.toLowerCase().replace(/\s+/g, "-")}`,
      title: `${ship} · ${pax.toLocaleString()} passengers`,
      start_dt: `${y}-${mm}-${dd}T07:00:00.000Z`,
      end_dt:   `${y}-${mm}-${dd}T18:00:00.000Z`,
      venue_name: term0.name,
      venue_address: `${term0.name}, Lisboa`,
      lng: term0.lng,
      lat: term0.lat,
      category: "cruise",
      size_estimate: pax,
      source: "curated-cruise",
    };
  });
}

function withinHorizon(events) {
  const now = Date.now();
  const horizon = now + HORIZON_DAYS * 24 * 3600 * 1000;
  return events.filter((e) => {
    const t = Date.parse(e.start_dt);
    return Number.isFinite(t) && t >= now - 12 * 3600 * 1000 && t <= horizon;
  });
}

async function main() {
  await loadDotenv();
  console.log(`Fetching events for the next ${HORIZON_DAYS} days …`);

  const tmEvents = await fetchTicketmaster();
  console.log(`  Ticketmaster: ${tmEvents.length} events (0 expected — PT coverage minimal)`);

  const now = new Date();
  const horizonDate = new Date(now.getTime() + HORIZON_DAYS * 24 * 3600 * 1000);
  const years = new Set([now.getFullYear()]);
  if (horizonDate.getFullYear() !== now.getFullYear()) years.add(horizonDate.getFullYear());

  const oneOffs = withinHorizon([...years].flatMap((y) => curatedOneOffs(y)));
  console.log(`  Curated one-off mega-events in horizon: ${oneOffs.length}`);

  const recurring = [];
  for (const y of years) {
    recurring.push(...recurringWeekly(y, 1, 12));
  }
  const recurringInHorizon = withinHorizon(recurring);
  console.log(`  Recurring weekly (Feira da Ladra + LX Market) in horizon: ${recurringInHorizon.length}`);

  const sortedYears = [...years].sort();
  const cruises = curatedCruises(
    sortedYears[0],
    sortedYears[1] ?? sortedYears[0] + 1,
  );
  const cruisesInHorizon = withinHorizon(cruises);
  console.log(`  Curated cruise arrivals in horizon: ${cruisesInHorizon.length}`);

  const all = [...tmEvents, ...oneOffs, ...recurringInHorizon, ...cruisesInHorizon]
    .sort((a, b) => Date.parse(a.start_dt) - Date.parse(b.start_dt));

  const byCategory = {};
  for (const e of all) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;

  const out = {
    type: "EventCollection",
    metadata: {
      generated_at: new Date().toISOString(),
      horizon_days: HORIZON_DAYS,
      sources: ["ticketmaster", "curated", "recurring"],
      total: all.length,
      by_category: byCategory,
    },
    events: all,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out));

  console.log(`\nBy category:`);
  for (const [k, v] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)}`);
  }
  console.log(`\nWrote ${all.length} event instances → ${OUT_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
