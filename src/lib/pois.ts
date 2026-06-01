// POI rendering configuration. Drives both the map circle layers and the
// "Demand generators" filter section in the LeftLayerPanel.

import { GraduationCap, Hotel, Train, Landmark, Cross, Coffee, type LucideIcon } from "lucide-react";

export type DemandPoiCategory =
  | "university"
  | "hotel"
  | "transit"
  | "tourist"
  | "hospital";

export type DemandPoiMeta = {
  label: string;
  color: string;
  radius: number;
  description: string;
  icon: LucideIcon;
};

export const DEMAND_POI_CATEGORIES: DemandPoiCategory[] = [
  "university", "hotel", "transit", "tourist", "hospital",
];

export const DEMAND_POI_META: Record<DemandPoiCategory, DemandPoiMeta> = {
  university: {
    label: "Universities",
    color: "#a78bfa",
    radius: 5,
    description: "ULisboa · Nova · ISCTE · IST · others",
    icon: GraduationCap,
  },
  hotel: {
    label: "Hotels",
    color: "#f59e3b",
    radius: 3,
    description: "Lodging anchoring tourist trade",
    icon: Hotel,
  },
  transit: {
    label: "Metro / Ferry / Tram",
    color: "#5eb89a",
    radius: 4.5,
    description: "Commuter waves & transit-hub pull",
    icon: Train,
  },
  tourist: {
    label: "Tourist attractions",
    color: "#fbb6a8",
    radius: 2.5,
    description: "Museums, monuments, viewpoints",
    icon: Landmark,
  },
  hospital: {
    label: "Hospitals",
    color: "#ef4444",
    radius: 4,
    description: "Constant daytime catchment",
    icon: Cross,
  },
};

// Café competitor styling — used by the "Competitor presence" toggle.
export const COMPETITOR_POI_META = {
  label: "Specialty cafés",
  color: "#ff6b35",
  radius: 3.5,
  icon: Coffee,
};
