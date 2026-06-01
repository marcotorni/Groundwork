// Layer registry. Each layer has an id, label, an "intensity" badge displayed
// in parentheses (mirrors the reference UI's "(Very High)" / "(€€€)" pattern),
// and an icon name from lucide-react.

export type LayerId =
  | "footfall"
  | "population"
  | "rent"
  | "competitors";

export type LayerDef = {
  id: LayerId;
  label: string;
  intensity: string;
  iconName: "Users" | "Building2" | "Euro" | "Coffee";
  defaultOn: boolean;
  available: boolean; // false = visible in panel but disabled (Phase 2+ data)
};

export const LAYERS: LayerDef[] = [
  {
    id: "footfall",
    label: "Footfall",
    intensity: "(modeled)",
    iconName: "Users",
    defaultOn: true,
    available: true,
  },
  {
    id: "population",
    label: "Population density",
    intensity: "(Census 2021)",
    iconName: "Building2",
    defaultOn: true,
    available: true,
  },
  {
    id: "rent",
    label: "Rent prices",
    intensity: "(€/m² · monthly)",
    iconName: "Euro",
    defaultOn: false,
    available: true,
  },
  {
    id: "competitors",
    label: "Competitor presence",
    intensity: "(2,936 cafés)",
    iconName: "Coffee",
    defaultOn: false,
    available: true, // Now backed by the OSM cafe POI ingest
  },
];
