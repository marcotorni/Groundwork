# Groundwork — Project Memory

**Last updated:** 2026-05-19 (end of Day 3 session)
**Project root:** `/Users/marco/Documents/Projects/Claude_Code/Groundwork`
**Owner:** Marco Torni (`torni.marco@gmail.com`)
**GitHub:** https://github.com/marcotorni/Groundwork
**Live URL:** https://groundwork-eeu04uy0e-tornimarco-5300s-projects.vercel.app (note: 401-protected by default — flip Vercel Deployment Protection off to make public)
**Vercel project:** `tornimarco-5300s-projects/groundwork`
**Vercel Analytics:** https://vercel.com/tornimarco-5300s-projects/groundwork/analytics
**Source concept doc:** `/Users/marco/Desktop/Groundwork_v2_Full_Concept_Analysis.docx`

---

## What this project is

**Groundwork** is an AI-powered location intelligence platform for opening a specialty coffee shop in Greater Lisbon. Hero metric: the **Espresso Score** (0–99 composite), shown per parish. Users pan a map, click a parish, and get a score + 3-5 specific AI bullets explaining strengths/weaknesses, plus a 12-month projected growth percentage.

Modeled on the v2 Concept Analysis document. Position: not a population tracker — it's a **commercial location decision tool**. Strategic horizon is 12–24 months, not daily metrics. Designed for an independent founder choosing where to sign a 5-year lease.

---

## Current state at a glance

### ✅ Shipped (10 days of work compressed)

| Feature | Where |
|---|---|
| Next.js 16 App Router + TypeScript + Tailwind 4 | scaffold |
| Mapbox GL JS dark-v11 map of Greater Lisbon (8 municipalities, 64 freguesias) | `src/components/MapCanvas.tsx` |
| Population density heatmap (INE Censos 2021) | population-heat layer |
| Modeled hourly footfall heatmap (5 archetypes × 7-day × 24-hr curves) | footfall-heat layer |
| Soft-gradient heatmap rendering (no polygon edges, soft Gaussian) | Mapbox heatmap type |
| Water mask layer (kills heatmap bleed over Tagus/Atlantic) | water-mask layer |
| Year-long timeline (15% hourly week + 85% daily year) | `src/components/TimelineSlider.tsx` |
| Month divider lines + month labels on the timeline | computeMonthDividers |
| 13,113 OSM POIs via Overpass (9 categories: cafe/school/uni/office/hospital/hotel/transit/tourist/nightlife) | `public/data/greater-lisbon-pois.geojson` |
| Auto-derived archetype mixes per parish from POI counts (sqrt-area normalized) | `scripts/derive-parish-mixes.mjs` → `src/lib/derived-parish-mixes.json` |
| 208 events over 365 days (curated mega-events + cruises + recurring markets) | `public/data/lisbon-events.json` |
| Event pins on timeline (color-coded, size scales with log attendance) | TimelineSlider eventPins |
| Click event pin → snap timeline + flyTo venue + brighten heatmap | onEventFocus callback |
| Per-category event heatmap overlay (9 layers, each its own color) | event-heat-{category} |
| Hover pin → CSS-only floating event-name label + React detailed card | event-pin-group / event-pin-label |
| POI markers on map (competitor café pins + 5 demand-generator categories) | poi-cafes + poi-{cat} layers |
| Rent prices choropleth (Idealista Q4 2024 + Q1 2025) | rent-fill layer |
| Espresso Score: 5-component formula (footfall + demand + gap + density + affordability) | `src/lib/espresso-score.ts` |
| Scoring Profile panel — 5 preset chips + 5 sliders, live re-score | `src/components/ScoringProfilePanel.tsx` |
| Gemini 2.5 Flash hybrid AI scoring (formula baseline + ±10 nudge + rich bullets, 24h cache) | `src/app/api/parish-insight/route.ts` |
| AI Insights right panel with Gemini badge + adjustment display | `src/components/RightInsightsPanel.tsx` |
| Vercel Analytics wired (`<Analytics />` in `layout.tsx`) | `@vercel/analytics/next` |
| GitHub repo + Vercel auto-deploy on push | `git push origin main` triggers deploy |

### 🔮 Backlog (priority order)

1. **Disable Vercel Deployment Protection** on production — user needs to click the toggle at https://vercel.com/tornimarco-5300s-projects/groundwork/settings/deployment-protection (one-time UI step)
2. **Foursquare integration** (~1.5h) — closes the ~30-50% café coverage gap vs Google Maps. Needs free Foursquare dev account from user.
3. **Vercel Cron for daily data refresh** (~2h) — `/api/refresh` route + Vercel Blob storage + cron entry in `vercel.ts`. Replaces the local-only `npm run data:refresh`.
4. **Sports fixtures** (~1h) — thesportsdb.com free API, adds Benfica/Sporting/Belenenses home games.
5. **Real Porto de Lisboa cruise scraper** (~1.5h) — replaces 25 curated cruise events with the live schedule.
6. **Blueticket scraper** (~2-3h) — adds 200-500 real Portuguese events that Ticketmaster doesn't cover.
7. **12-month forecast chart** in right panel (~2h) — score time series with confidence bands.
8. **Compare view** — up to 5 locations side-by-side (~3h).
9. **News intelligence layer** (~2h) — NewsAPI + Claude/Gemini classifier.
10. **PDF report export** (~2-3h) — Puppeteer.

---

## Architecture

### Tech stack
- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4
- **Map:** Mapbox GL JS 3.x with `dark-v11` style
- **AI:** Gemini 2.5 Flash via `@ai-sdk/google` + `ai` (Vercel AI SDK)
- **Data layer:** Static JSON in `public/data/` (no database yet)
- **Hosting:** Vercel (auto-deploy from `main` branch)
- **Analytics:** Vercel Analytics

### Repo layout

```
src/
  app/
    layout.tsx              ← Inter font + <Analytics /> + dark bg
    page.tsx                ← Renders AppShellClient (dynamic, ssr:false)
    globals.css             ← Dark palette CSS vars + Tailwind theme + iOS toggle
    api/
      parish-insight/
        route.ts            ← POST endpoint: Gemini hybrid scoring, in-memory 24h cache
  components/
    AppShell.tsx            ← Top-level composition + ALL state (layers, events, weights, selection, AI)
    MapCanvasClient.tsx     ← `dynamic({ ssr: false })` wrapper around MapCanvas
    MapCanvas.tsx           ← Mapbox setup, all sources/layers, click handlers
    TopNav.tsx              ← Brand + tabs + search + bell + avatar
    LeftLayerPanel.tsx      ← 4 toggleable cards + Events section + Demand Generators section
    RightInsightsPanel.tsx  ← Score + Gemini badge + sparkline + bullets + Generate Full Report
    ScoringProfilePanel.tsx ← Preset chips + 5 weight sliders
    TimelineSlider.tsx      ← Custom non-linear slider + event pins + month dividers + hover labels
    ui/Toggle.tsx           ← iOS-style switch
  lib/
    mapbox.ts               ← Token + bounds + style + PARISHES_GEOJSON path
    layers.ts               ← LayerId type + LAYERS array (4 main layer cards)
    density-scale.ts        ← Heatmap color ramps + radius/intensity expressions
    events.ts               ← EventCategory + EVENT_CATEGORY_META + activeEventsAtTick
    events-data not used — data fetched at runtime
    timeline.ts             ← Mixed-resolution timeline math (calendar-day-aware!)
    pois.ts                 ← DemandPoiCategory + DEMAND_POI_META + COMPETITOR_POI_META
    rent-prices.ts          ← RENT_EUR_PER_M2 constants + RENT_STOPS + RENT_METADATA
    footfall-model.ts       ← ARCHETYPE_CURVES + computeFootfall (composite_key keyed)
    espresso-score.ts       ← 5-component score + explainScore (bullet generator)
    scoring-profiles.ts     ← 5 preset profiles + normaliseWeights helper
    derived-parish-mixes.json (generated)   ← per-parish archetype mixes + stats
    ine-2021-population.ts  ← (early Lisbon-only data, mostly superseded by geojson)
public/
  data/
    greater-lisbon-parishes.geojson    ← 64 polygons with population/area/density/composite_key
    greater-lisbon-points.geojson      ← 6,265 weighted points sampled inside parishes (heatmap kernel)
    greater-lisbon-pois.geojson        ← 13,113 POIs across 9 categories
    lisbon-events.json                 ← 208 event instances (Ticketmaster + curated + recurring)
    lisbon-parishes.geojson            ← legacy, Lisbon-only (24 parishes), not used in current build
scripts/
  build-lisbon-parishes.mjs            ← legacy, single-city
  build-greater-lisbon-parishes.mjs    ← Fetches all 8 municipalities from geoapi.pt + merges INE pop
  build-greater-lisbon-points.mjs      ← Generates stratified point cloud inside parish polygons
  fetch-osm-pois.mjs                   ← Pulls OSM POIs via Overpass API (no key)
  derive-parish-mixes.mjs              ← Aggregates POIs per parish + sqrt-area normalize + writes archetype mixes
  fetch-events.mjs                     ← Ticketmaster + curated one-offs + cruises + recurring weekly
```

### npm scripts

```bash
npm run dev                # next dev (start dev server)
npm run build              # production build
npm run typecheck          # tsc --noEmit (always run before commit)
npm run data:lisbon        # legacy single-city refresh
npm run data:greater       # parishes + sample points (rare refresh)
npm run data:pois          # OSM + derive mixes (~2 min, can run daily)
npm run data:events        # events refresh (~30s)
npm run data:refresh       # data:pois + data:events combined (the daily refresh)
```

---

## Data sources & freshness

| Data | Source | API/key needed? | Update cadence | Refresh command |
|---|---|---|---|---|
| Parish polygons | geoapi.pt (CAOP) | None | Rare | `npm run data:greater` |
| Population | INE Censos 2021 | None (constants embedded) | Decennial | N/A |
| 13k POIs | OSM Overpass | None (free) | OSM-driven, hourly globally | `npm run data:pois` |
| Archetype mixes + parish stats | Derived from POIs | None | With POI refresh | (auto in `data:pois`) |
| 208 events | Ticketmaster (PT=0) + 27 curated + 156 recurring + 25 cruises | TICKETMASTER_API_KEY env | Curated needs manual; recurring auto | `npm run data:events` |
| Rent prices | Idealista Q4 2024 + Q1 2025 reports (constants) | None | Monthly | Edit `src/lib/rent-prices.ts` |
| Footfall (modeled) | Computed from archetype mixes × time curves | None | Real-time | Auto-runs |
| AI insights | Gemini 2.5 Flash | GOOGLE_GENERATIVE_AI_API_KEY env | Per parish click, cached 24h | Auto |
| Mapbox base map | Mapbox dark-v11 | NEXT_PUBLIC_MAPBOX_TOKEN env | Live tile fetch | Auto |

---

## API keys & env vars

All in `.env.local` (gitignored). Same keys are stored encrypted on Vercel for production:

| Variable | Value (truncated) | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | `pk.eyJ1IjoibWFyY290b3JuaSI...` | https://account.mapbox.com/access-tokens |
| `TICKETMASTER_API_KEY` | `87CLTvs...` | https://developer.ticketmaster.com (PT coverage = 0, kept wired in case it lands) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `AQ.Ab8RN6I2...` | https://aistudio.google.com/apikey (free tier — 15 RPM, 1500 RPD) |

To pull Vercel env to local: `vercel env pull .env.local`.

---

## Espresso Score formula (current)

Deterministic baseline + AI nudge:

```
baseScore = 30% × footfall + 22% × demand + 20% × gap + 15% × density + 13% × affordability
finalScore = clamp(baseScore + aiNudge, 0, 99)  where aiNudge ∈ [-10, +10]
```

Components (each 0..100):
- **footfall** — current modeled active presence at this tick (archetype × time curve)
- **demand** — POI demand generators count, sqrt-area normalized: office×0.3 + uni×8 + hotel×1 + transit_major×4 + tourist_strong×0.5
- **gap** — `100 × exp(-cafes_per_km² / 25)` — high = low café saturation = better opportunity
- **density** — INE residents/km² ÷ 180 (caps at ~18k/km² → 100)
- **affordability** — `100 - (rent - 9) / (22 - 9) × 100` (inverted; €10 → ~100, €22 → ~0)

5 preset profiles in `src/lib/scoring-profiles.ts`:
- **Specialty Coffee** (default): 30/22/20/15/13
- **Neighbourhood Pastelaria**: 15/10/18/42/15 (heavy resident weight)
- **Tourist-Facing**: 42/33/10/8/7 (tolerates high rent)
- **Takeaway & Commuter**: 36/36/12/4/12
- **Digital Nomad Hub**: 32/28/22/8/10

Score normalises weights to 100% on every recalc.

---

## AI integration (Gemini hybrid scoring)

Route: `POST /api/parish-insight`
Model: `gemini-2.5-flash` via `@ai-sdk/google`
Cost: ~€0.02 per parish click, cached **24h** per `(composite_key, profile_id, day, hour, day_of_week, event_count)`

The route receives parish stats + formula breakdown + active events + current time + business profile. Gemini returns structured JSON:
- `score_adjustment` (clamped server-side to ±10)
- `projected_growth_pct` (clamped to -15..35)
- `bullets[]` (3–5 short, specific to parish + profile)
- `reasoning` (single paragraph, currently unused in UI)
- `confidence` (low/medium/high)

The prompt includes Lisbon domain context (Marvila early-mover, Misericórdia oversaturated, Cascais coastal premium, etc.) so Gemini's reasoning matches the concept doc.

In `AppShell.tsx`: a deterministic formula score renders **instantly**, then an effect fires the Gemini fetch with a `cancelled` flag, then merges:
- Score = formula + AI adjustment (clamped 0..99)
- Bullets = Gemini's if returned, else formula's `explainScore` output
- Badge in panel: "Gemini +5" with sparkle icon

---

## Recent gotchas + how we fixed them (don't repeat)

1. **Heatmap bleed over the Tagus** — fixed via a `water-mask` Mapbox layer rendered *above* heatmaps that re-paints water using the dark-v11 style's built-in `composite/water` source-layer.
2. **Stale closure bug** — the map click handler captured `onSelect` once, which closed over the initial empty `footfallByParish`. Fixed via `onSelectRef` (in `MapCanvas.tsx`) — every render writes the latest callback to the ref, the click handler reads through it.
3. **Off-by-one tick math** — clicking a Sep 13 event snapped the slider to Sep 12 when the anchor hour was later than the event hour. Fixed via **calendar-day math** (`anchorDayBaseMs` + `utcDateOnly` in `src/lib/timeline.ts`). All tick<->date conversions now go through these helpers.
4. **Estoril Open at wrong coordinates** — single `estoril` lookup served both Casino + Tennis Club. Split into `estoril_tennis` (-9.4036, 38.7077) and `estoril_casino` (-9.3970, 38.7060).
5. **Click pin but heatmap bloom not visible** — Estoril is at the west edge of default zoom; user couldn't see the heatmap. Added `onEventFocus(event)` callback in TimelineSlider → AppShell calls `window.__map.flyTo` to pan/zoom to the venue at zoom 13.
6. **Gemini schema validation failures** — `bullets[].min(8).max(120)` was too tight. Relaxed all string-length constraints + added a `NoObjectGeneratedError` catch that logs `err.text` for debugging, plus server-side clamping of the score_adjustment to ±10.
7. **Ticketmaster returns 0 events for PT** — Portugal isn't covered by Ticketmaster's marketplace. Kept the wiring in case it lands; users see 27 curated + 156 recurring + 25 cruises (208 total) sourced manually.
8. **React StrictMode + Mapbox aborts** — first dev-server mount aborts the map's style fetch during cleanup. Browser shows blank dark. **Workaround:** in dev, restart Next via clean `.next/` wipe; in prod this doesn't recur.
9. **POI marker for cafes covered only ~30-50%** of Google's data (mentioned by user). Next phase will integrate Foursquare to close the gap.

---

## Decisions locked in (don't re-litigate)

- **Territory:** Greater Lisbon inner ring (8 municipalities, ~1.5M people). Not full AML — outer municipalities have low specialty-coffee relevance.
- **Timeline:** 12-month horizon. Week 1 hourly (15% of slider width), weeks 2-52 daily (85%). Calendar-day math.
- **Event heatmap behavior:** additive boost (events brighten on top of footfall layer).
- **UI fidelity:** pixel-faithful to the reference dark dashboard the user shared.
- **Score caching:** Gemini responses cached 24h per parish/profile/day/hour combo.
- **POI rendering:** competitors (cafes) own toggle; demand generators are a separate filterable section.
- **Mapbox style:** dark-v11. Not customising via Mapbox Studio — base style is good enough.
- **Population density layer:** kept alongside footfall (toggle either or both).
- **Sample point cloud density:** 10 points/km² (was 32 originally, reduced for visual smoothness).

---

## Conventions / preferences

- **Files:** ALWAYS prefer editing existing files over creating new ones.
- **Comments:** terse. Explain why, not what. Reserve longer comments for tricky math or workarounds.
- **TypeScript:** `npx tsc --noEmit` before any meaningful commit.
- **Skill tools (Claude):** when working on this project, do NOT use `TodoWrite` — use `TaskCreate`/`TaskUpdate` if needed.
- **CLAUDE.md / AGENTS.md:** auto-loaded. PROJECT_STATE.md is referenced from CLAUDE.md.
- **User profile:** non-technical. When they need to do something (paste a key, click a UI toggle), give step-by-step links and short instructions. Don't assume CLI familiarity.
- **Data refresh:** prefer `npm run data:refresh` over remembering individual scripts.
- **Secrets:** never commit `.env.local`. Vercel env vars set via `vercel env add NAME production`.

---

## Day-1 resume workflow

When picking up tomorrow, run:

```bash
cd /Users/marco/Documents/Projects/Claude_Code/Groundwork
pkill -f "next dev" 2>/dev/null   # just in case a zombie is around
rm -rf .next                       # wipe build cache to avoid Turbopack drift
npm run dev -- --port 3001         # start fresh
```

Then open http://localhost:3001 in browser.

Or to deploy without testing locally: just `git push origin main` — Vercel auto-deploys.

---

## What I (Claude) should do at start of session

1. Read this file (you're already reading it).
2. Skim `/Users/marco/Desktop/Groundwork_v2_Full_Concept_Analysis.docx` only if a roadmap question arises.
3. Don't re-explain shipped features — assume they work.
4. Ask the user what they want to tackle from the **Backlog** above, or proceed with their explicit ask.
5. If they say "continue from where we left off" — most likely next move is **Foursquare integration** (to close the missing-cafés gap they mentioned, ~1.5h) OR **Vercel Cron for daily refresh** (~2h).

End of memory file.
