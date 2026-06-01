# Groundwork ☕

AI-powered location intelligence for specialty coffee in Lisbon. Built per the
v2 concept document (`/Users/marco/Desktop/Groundwork_v2_Full_Concept_Analysis.docx`).

This repo is at **Phase 0 → Phase 1**: foundation laid, with the first map
layer (**population density per Lisbon freguesia**) rendering as a choropleth
heat-map on top of Mapbox GL.

---

## What works today

- Next.js 16 (App Router) + TypeScript + Tailwind
- Mapbox GL JS interactive map of Lisbon, locked to the city bounds
- Population density choropleth across all **24 Lisbon freguesias**
  - Population: INE Censos 2021 (resident population, public)
  - Geometry: geoapi.pt / CAOP (administrative boundaries)
  - Density computed as residents / km²
- Click any parish for a side-panel with population, area, density
- Toggle the density layer on/off
- 6-stop diverging colour scale (cream → espresso) calibrated for Lisbon's range
  (~1.6k → ~14.8k residents/km²)

---

## What's needed from you

### 1. Mapbox token (required — 3 minutes)
1. Sign up free at <https://account.mapbox.com/auth/signup/>
2. Copy your default public token from <https://account.mapbox.com/access-tokens/>
   (starts with `pk.`)
3. Create `.env.local` in this repo:
   ```bash
   cp .env.example .env.local
   ```
4. Paste your token into `NEXT_PUBLIC_MAPBOX_TOKEN`.

Without this the map cannot render; the app shows a clear "token missing"
fallback.

### 2. (Optional now, needed for Phase 2) — accounts to register

The concept document calls for these. Register them when we reach each phase
so the free tiers cover the entire personal build:

| Service | Used for | When |
|---|---|---|
| **OpenWeather** | weather-adjusted footfall | Phase 2 (weeks 4-6) |
| **Google Maps Platform** | Places, Popular Times, Elevation | Phase 2-4 |
| **Foursquare for Developers** | competitor pull | Phase 1-2 |
| **NewsAPI + GNews** | news intelligence layer | Phase 3 |
| **Ticketmaster Developer** | event discovery | Phase 3 |
| **Supabase** | Postgres + PostGIS storage | Phase 1 |
| **Anthropic API** | AI briefings & gap analysis | Phase 5 |
| **Mapbox** | already required (see above) | now |

All have free tiers covering personal-use volume. We will wire each one in at
the phase it is needed, not before — keeps cost at €0 until commercialisation.

### 3. Decisions I'll need from you along the way

- **Lisbon-only first, or also Porto?** Spec says Lisbon-only for V1; confirm
  when you're ready to consider Phase 2.
- **Self-host or SaaS later?** Phase 7 is optional — don't decide now.
- **Density granularity:** parish (24 cells) → H3 hex grid res 9 (~4,000 cells)
  → Eurostat 1 km² grid. Today we ship parish. H3 unlocks finer overlays and
  joins with point data; we'll switch when we add the Espresso Score in Phase 2.

---

## Run locally

```bash
# one-time
cp .env.example .env.local           # then paste your Mapbox token
npm install

# refresh the parish dataset (optional — already committed)
npm run data:lisbon

# start dev server
npm run dev
```

Open <http://localhost:3000>.

---

## Project layout

```
public/data/
  lisbon-parishes.geojson     ← 24 features with pop, area, density
scripts/
  build-lisbon-parishes.mjs   ← fetches geoapi.pt + merges with INE 2021
src/
  app/
    layout.tsx
    page.tsx                  ← loads MapCanvas
    globals.css
  components/
    MapCanvas.tsx             ← Mapbox container + layer toggle + side panel
  lib/
    mapbox.ts                 ← token + style + Lisbon bounds
    density-scale.ts          ← 6-stop colour scale + Mapbox expression
    ine-2021-population.ts    ← INE census lookup
```

---

## What's next (per the concept doc, Section 13 — Build Roadmap)

- **Phase 1 (active):** Population density layer ✅. Next: add OSM POIs
  (universities, hotels, metro stations, GIRA stations) and basic Foursquare
  competitor pull — both feed the Espresso Score.
- **Phase 2:** Footfall proxy from Google Popular Times + OpenWeather, then
  the first composite Espresso Score (3 signals).
- **Phase 3-6:** events, news intelligence, strategic forecast, AI narratives,
  PDF export.

When you're ready, say *"start phase 2"* (or pick a specific layer) and I'll
keep going.
