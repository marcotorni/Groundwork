"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  LISBON_BOUNDS,
  LISBON_CENTER,
  MAPBOX_STYLE,
  MAPBOX_TOKEN,
  PARISHES_GEOJSON,
} from "@/lib/mapbox";
import {
  FOOTFALL_HEATMAP_COLOR,
  HEATMAP_INTENSITY,
  HEATMAP_RADIUS,
  POPULATION_HEATMAP_COLOR,
} from "@/lib/density-scale";
import type { LayerId } from "@/lib/layers";
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_META,
  eventIntensity,
  type EventCategory,
  type EventInstance,
} from "@/lib/events";
import {
  DEMAND_POI_CATEGORIES,
  DEMAND_POI_META,
  COMPETITOR_POI_META,
  type DemandPoiCategory,
} from "@/lib/pois";
import { RENT_EUR_PER_M2, RENT_STOPS } from "@/lib/rent-prices";

export type ParishFeatureProps = {
  name: string;
  slug?: string;
  municipality?: string;
  composite_key?: string;
  population_2021: number | null;
  area_km2: number | null;
  density_per_km2: number | null;
};

const POINTS_GEOJSON = "/data/greater-lisbon-points.geojson";
const POIS_GEOJSON = "/data/greater-lisbon-pois.geojson";

const SRC_PARISHES = "lisbon-parishes";
const SRC_POINTS = "lisbon-points";
const SRC_EVENTS = "lisbon-events-active";
const SRC_POIS = "lisbon-pois";
const POP_HEAT = "population-heat";
const FOOT_HEAT = "footfall-heat";
const EVENT_HEAT_PREFIX = "event-heat-";
const POI_LAYER_PREFIX = "poi-";
const COMPETITOR_LAYER = "poi-cafes";
const RENT_FILL = "rent-fill";
const WATER_MASK = "water-mask";
const CLICK_FILL = "parish-click-fill";
const HOVER_LINE = "parish-hover-line";

// Build a heatmap colour ramp for a single category — fades from transparent
// → the category colour at half saturation → full saturation at the peak.
function categoryColorRamp(hex: string): unknown[] {
  // Mapbox accepts rgba() strings, so we convert the category hex into rgba
  // tuples with varying alpha.
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [
    "interpolate", ["linear"], ["heatmap-density"],
    0,   `rgba(${r}, ${g}, ${b}, 0)`,
    0.2, `rgba(${r}, ${g}, ${b}, 0.3)`,
    0.5, `rgba(${r}, ${g}, ${b}, 0.65)`,
    0.8, `rgba(${r}, ${g}, ${b}, 0.85)`,
    1,   `rgba(${r}, ${g}, ${b}, 0.95)`,
  ];
}

type Props = {
  activeLayers: Set<LayerId>;
  onSelect: (name: string, props: ParishFeatureProps) => void;
  footfallByParish: Record<string, number>; // keyed by composite_key
  onParishesLoaded?: (compositeKeys: string[]) => void;
  activeEvents: EventInstance[];
  enabledDemandCategories: Set<DemandPoiCategory>;
};

export function MapCanvas({
  activeLayers,
  onSelect,
  footfallByParish,
  onParishesLoaded,
  activeEvents,
  enabledDemandCategories,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  // Refs that always point at the latest props. The map's event handlers are
  // registered once in the load callback, so without these refs they'd close
  // over stale values (e.g. an empty footfallByParish on first render).
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: LISBON_CENTER,
      zoom: 10.6,
      maxBounds: [
        [LISBON_BOUNDS[0][0] - 0.5, LISBON_BOUNDS[0][1] - 0.5],
        [LISBON_BOUNDS[1][0] + 0.5, LISBON_BOUNDS[1][1] + 0.5],
      ],
      attributionControl: false,
    });
    mapRef.current = map;
    if (typeof window !== "undefined") {
      // Dev-only diagnostic hook. Harmless in prod; lets us probe the map from devtools.
      (window as unknown as { __map?: mapboxgl.Map }).__map = map;
    }
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "bottom-left");

    map.on("load", async () => {
      const [parishesRes, pointsRes, poisRes] = await Promise.all([
        fetch(PARISHES_GEOJSON),
        fetch(POINTS_GEOJSON),
        fetch(POIS_GEOJSON),
      ]);
      const parishesFc = await parishesRes.json();
      const pointsFc = await pointsRes.json();
      const poisFc = await poisRes.json();

      // Inject rent €/m² into each parish feature's properties so the rent
      // choropleth can read it via ["get", "rent_eur_per_m2"].
      for (const f of parishesFc.features) {
        const k = f.properties.composite_key as string | undefined;
        if (k) f.properties.rent_eur_per_m2 = RENT_EUR_PER_M2[k] ?? null;
      }

      map.addSource(SRC_PARISHES, { type: "geojson", data: parishesFc, generateId: true });
      map.addSource(SRC_POINTS, { type: "geojson", data: pointsFc });
      map.addSource(SRC_EVENTS, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource(SRC_POIS, { type: "geojson", data: poisFc });

      // POPULATION heatmap — weight comes from the pre-baked density_weight
      // already in each point's properties (0..1).
      map.addLayer({
        id: POP_HEAT,
        type: "heatmap",
        source: SRC_POINTS,
        paint: {
          "heatmap-weight": ["coalesce", ["get", "density_weight"], 0],
          "heatmap-intensity": HEATMAP_INTENSITY as never,
          "heatmap-radius": HEATMAP_RADIUS as never,
          "heatmap-color": POPULATION_HEATMAP_COLOR as never,
          "heatmap-opacity": 0.75,
        },
        layout: { visibility: activeLayers.has("population") ? "visible" : "none" },
      });

      // FOOTFALL heatmap — weight comes from a match expression we rebuild
      // every time the time slider moves (see footfall effect below).
      map.addLayer({
        id: FOOT_HEAT,
        type: "heatmap",
        source: SRC_POINTS,
        paint: {
          "heatmap-weight": 0,
          "heatmap-intensity": HEATMAP_INTENSITY as never,
          "heatmap-radius": HEATMAP_RADIUS as never,
          "heatmap-color": FOOTFALL_HEATMAP_COLOR as never,
          "heatmap-opacity": 0.85,
        },
        layout: { visibility: activeLayers.has("footfall") ? "visible" : "none" },
      });

      // EVENTS — one heatmap layer per category, filtered to that category's
      // active events. Each layer uses its category's brand colour ramp so the
      // heatmap on event days reads as "this colour = this kind of event".
      const eventIntensityExpr = [
        "interpolate", ["linear"], ["zoom"],
        9, 1.2, 12, 1.8, 15, 2.4,
      ];
      const eventRadiusExpr = [
        "interpolate", ["linear"], ["zoom"],
        9, 35, 11, 75, 13, 140, 15, 220,
      ];
      for (const cat of EVENT_CATEGORIES) {
        const meta = EVENT_CATEGORY_META[cat];
        if (!meta) continue;
        map.addLayer({
          id: EVENT_HEAT_PREFIX + cat,
          type: "heatmap",
          source: SRC_EVENTS,
          filter: ["==", ["get", "category"], cat],
          paint: {
            "heatmap-weight": ["coalesce", ["get", "weight"], 0],
            "heatmap-intensity": eventIntensityExpr as never,
            "heatmap-radius": eventRadiusExpr as never,
            "heatmap-color": categoryColorRamp(meta.color) as never,
            "heatmap-opacity": 0.9,
          },
          layout: { visibility: "visible" },
        });
      }

      // COMPETITOR PINS — cafés as small orange dots. Activated by the
      // "Competitor presence" left-panel toggle. Tied to the same OSM data
      // that drives the Espresso Score's saturation/gap signal.
      map.addLayer({
        id: COMPETITOR_LAYER,
        type: "circle",
        source: SRC_POIS,
        filter: ["==", ["get", "category"], "cafe"],
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 1.5, 13, 3.5, 16, 7,
          ] as never,
          "circle-color": COMPETITOR_POI_META.color,
          "circle-opacity": 0.85,
          "circle-stroke-color": "#0a1118",
          "circle-stroke-width": [
            "interpolate", ["linear"], ["zoom"],
            10, 0, 13, 0.5, 16, 1,
          ] as never,
        },
        layout: { visibility: activeLayers.has("competitors") ? "visible" : "none" },
      });

      // DEMAND GENERATOR PINS — one circle layer per category, filtered
      // independently so the left panel can toggle each on/off.
      for (const cat of DEMAND_POI_CATEGORIES) {
        const meta = DEMAND_POI_META[cat];
        map.addLayer({
          id: POI_LAYER_PREFIX + cat,
          type: "circle",
          source: SRC_POIS,
          filter: ["==", ["get", "category"], cat],
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              10, meta.radius * 0.4, 13, meta.radius, 16, meta.radius * 1.8,
            ] as never,
            "circle-color": meta.color,
            "circle-opacity": 0.9,
            "circle-stroke-color": "#0a1118",
            "circle-stroke-width": [
              "interpolate", ["linear"], ["zoom"],
              10, 0, 13, 0.6, 16, 1.2,
            ] as never,
          },
          layout: { visibility: enabledDemandCategories.has(cat) ? "visible" : "none" },
        });
      }

      // POI hover popup — single shared popup, re-targeted on hover.
      const poiPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 8,
        className: "groundwork-poi-popup",
      });
      const poiLayerIds = [COMPETITOR_LAYER, ...DEMAND_POI_CATEGORIES.map((c) => POI_LAYER_PREFIX + c)];
      for (const lid of poiLayerIds) {
        map.on("mouseenter", lid, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          map.getCanvas().style.cursor = "pointer";
          const p = f.properties as { name?: string; category?: string; tags?: string };
          const name = p.name ?? "Unnamed";
          const cat = p.category ?? "";
          const colour = cat === "cafe"
            ? COMPETITOR_POI_META.color
            : DEMAND_POI_META[cat as DemandPoiCategory]?.color ?? "#fff";
          const html = `
            <div style="font-size:11px;line-height:1.3;color:#fff;background:#0e1726;border:1px solid ${colour};padding:6px 10px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
              <div style="font-weight:600;color:#fff">${escapeHtml(name)}</div>
              <div style="color:#9ca3af;text-transform:capitalize">${cat}</div>
            </div>`;
          const geom = f.geometry as GeoJSON.Point;
          poiPopup.setLngLat(geom.coordinates as [number, number]).setHTML(html).addTo(map);
        });
        map.on("mouseleave", lid, () => {
          map.getCanvas().style.cursor = "";
          poiPopup.remove();
        });
      }

      // RENT PRICES choropleth — parishes shaded by €/m² monthly residential
      // rent. Cool blues = affordable, warm reds = expensive. Off by default.
      map.addLayer({
        id: RENT_FILL,
        type: "fill",
        source: SRC_PARISHES,
        paint: {
          "fill-color": [
            "interpolate", ["linear"],
            ["coalesce", ["get", "rent_eur_per_m2"], 0],
            ...RENT_STOPS.flatMap((s) => [s.value, s.color]),
          ] as never,
          "fill-opacity": 0.6,
        },
        layout: { visibility: activeLayers.has("rent") ? "visible" : "none" },
      });

      // WATER MASK — repaints the Tagus / Atlantic dark AFTER the heatmap
      // layers render, clipping the Gaussian kernel bleed over water. Uses
      // the dark-v11 style's built-in `water` source-layer so it adapts
      // automatically to coastline geometry.
      try {
        map.addLayer({
          id: WATER_MASK,
          type: "fill",
          source: "composite",
          "source-layer": "water",
          paint: {
            "fill-color": "#0a1118",
            "fill-opacity": 1,
          },
        });
      } catch (err) {
        // Source-layer not exposed by the style — log + continue (heatmap
        // will still render, just may bleed slightly over coast).
        console.warn("[MapCanvas] water mask skipped:", err);
      }

      // Invisible polygon fill for click + hover interaction.
      map.addLayer({
        id: CLICK_FILL,
        type: "fill",
        source: SRC_PARISHES,
        paint: { "fill-color": "#000", "fill-opacity": 0 },
      });

      // Hover outline — appears only on the parish under cursor.
      map.addLayer({
        id: HOVER_LINE,
        type: "line",
        source: SRC_PARISHES,
        paint: {
          "line-color": "#ffffff",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            2.4,
            0,
          ],
          "line-opacity": 0.85,
        },
      });

      let hoveredId: number | string | null = null;
      const setHover = (id: number | string | null) => {
        if (hoveredId !== null) {
          map.setFeatureState({ source: SRC_PARISHES, id: hoveredId }, { hover: false });
        }
        hoveredId = id;
        if (id !== null) {
          map.setFeatureState({ source: SRC_PARISHES, id }, { hover: true });
        }
      };

      map.on("mousemove", CLICK_FILL, (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (f?.id !== undefined) setHover(f.id);
      });
      map.on("mouseleave", CLICK_FILL, () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
      });
      map.on("click", CLICK_FILL, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        // Read via ref so we always call the freshest onSelect closure (which
        // captures the latest footfallByParish for score computation).
        onSelectRef.current(
          (f.properties as ParishFeatureProps).name,
          f.properties as ParishFeatureProps,
        );
      });

      loadedRef.current = true;
      applyLayerVisibility(map, activeLayers);

      const keys = parishesFc.features
        .map((f: { properties: ParishFeatureProps }) => f.properties.composite_key)
        .filter((k: string | undefined): k is string => Boolean(k));
      onParishesLoaded?.(keys);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyLayerVisibility(map, activeLayers);
  }, [activeLayers]);

  // Toggle each demand-POI category layer based on the LeftLayerPanel filters.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    for (const cat of DEMAND_POI_CATEGORIES) {
      const layerId = POI_LAYER_PREFIX + cat;
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          enabledDemandCategories.has(cat) ? "visible" : "none",
        );
      }
    }
  }, [enabledDemandCategories]);

  // Update the footfall heatmap weight whenever the time slider moves.
  // We build a Mapbox `match` expression keyed by composite_key so we mutate
  // a paint property rather than rewriting 11k point features.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const keys = Object.keys(footfallByParish);
    if (keys.length === 0) return;
    const matchExpr: unknown[] = ["match", ["get", "composite_key"]];
    for (const k of keys) {
      matchExpr.push(k, footfallByParish[k] / 100);
    }
    matchExpr.push(0);
    map.setPaintProperty(FOOT_HEAT, "heatmap-weight", matchExpr as never);
  }, [footfallByParish]);

  // Push the currently-active events into the event heatmap source. The user
  // sees the map "brighten" at venue locations when the timeline cursor lands
  // on a day with events; the brightness scales with log(attendance).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const src = map.getSource(SRC_EVENTS) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const features = activeEvents.map((e) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [e.lng, e.lat] },
      properties: {
        id: e.id,
        title: e.title,
        weight: eventIntensity(e.size_estimate),
        category: e.category,
      },
    }));
    src.setData({ type: "FeatureCollection", features });
  }, [activeEvents]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function applyLayerVisibility(map: mapboxgl.Map, active: Set<LayerId>) {
  if (map.getLayer(POP_HEAT)) {
    map.setLayoutProperty(POP_HEAT, "visibility", active.has("population") ? "visible" : "none");
  }
  if (map.getLayer(FOOT_HEAT)) {
    map.setLayoutProperty(FOOT_HEAT, "visibility", active.has("footfall") ? "visible" : "none");
  }
  if (map.getLayer(COMPETITOR_LAYER)) {
    map.setLayoutProperty(
      COMPETITOR_LAYER,
      "visibility",
      active.has("competitors") ? "visible" : "none",
    );
  }
  if (map.getLayer(RENT_FILL)) {
    map.setLayoutProperty(RENT_FILL, "visibility", active.has("rent") ? "visible" : "none");
  }
  // Event layers are gated by AppShell sending an empty `activeEvents` when
  // the user toggles Events off — no points means no heat. Demand-POI layer
  // visibility is handled in its own effect.
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
