// AI-powered parish insight endpoint.
// Receives parish data + the deterministic Espresso Score breakdown, asks
// Gemini 2.5 Flash to add qualitative reasoning, and returns a structured
// adjustment + narrative.
//
// Responses are cached in-memory per (compositeKey, profileId, day-bucket) so
// a single parish-day-profile combination only hits Gemini once per day.

import { google } from "@ai-sdk/google";
import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Looser constraints — Gemini sometimes writes 150-char bullets and we don't
// want to bin a good response over a few characters. Final clamping happens
// in the consuming code.
const InsightSchema = z.object({
  score_adjustment: z
    .number()
    .describe("Adjustment to apply to the base Espresso Score. Should be in -10..+10 range. Use 0 if the formula already captures the situation well."),
  projected_growth_pct: z
    .number()
    .describe("12-month projected commercial footfall growth percentage. Typically in -15..35 range."),
  bullets: z
    .array(z.string())
    .describe("3 to 5 short, concrete bullet insights — what makes this parish strong or weak for a new specialty coffee shop right now. Each bullet should be 1 sentence, 8 to 200 characters. Avoid generic platitudes."),
  reasoning: z
    .string()
    .describe("Single short paragraph (max 280 chars) explaining the adjustment direction."),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe("Confidence in the analysis given data completeness."),
});

type ParishInsightRequest = {
  composite_key: string;
  name: string;
  municipality: string;
  density_per_km2: number | null;
  rent_eur_per_m2: number | null;
  poi_counts: Record<string, number>;
  base_score: number;
  breakdown: {
    footfall: number;
    demand: number;
    gap: number;
    density: number;
    affordability: number;
  };
  profile_id: string | null;
  profile_label: string;
  weights: Record<string, number>;
  active_events: Array<{ title: string; category: string; venue_name: string; size: number }>;
  current_day_of_week: string;
  current_hour: number;
};

// Naive in-memory cache. Keyed on (composite_key, profile_id, day-bucket).
// Lives for the dev-server process; clears on restart. Good enough for now.
const cache = new Map<string, { value: z.infer<typeof InsightSchema>; expiresAt: number }>();
const TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(req: ParishInsightRequest): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${req.composite_key}|${req.profile_id ?? "custom"}|${day}|h${req.current_hour}|d${req.current_day_of_week}|e${req.active_events.length}`;
}

function buildPrompt(req: ParishInsightRequest): string {
  const events =
    req.active_events.length === 0
      ? "(none right now)"
      : req.active_events
          .map((e) => `${e.title} (${e.category}, ${e.venue_name}, ~${e.size.toLocaleString()} expected)`)
          .join("; ");

  const cafes = req.poi_counts.cafe ?? 0;
  const offices = req.poi_counts.office ?? 0;
  const hotels = req.poi_counts.hotel_proper ?? 0;
  const universities = req.poi_counts.university ?? 0;
  const transit = req.poi_counts.transit_major ?? 0;
  const touristStrong = req.poi_counts.tourist_strong ?? 0;
  const nightlife = (req.poi_counts.bar_pub ?? 0) + (req.poi_counts.nightclub ?? 0);

  return `You are an expert Lisbon retail-location analyst evaluating a parish for opening a new specialty coffee shop.

Parish: ${req.name}, ${req.municipality}
Time context: ${req.current_day_of_week} ${String(req.current_hour).padStart(2, "0")}:00
Business profile: ${req.profile_label}

DETERMINISTIC FORMULA SCORE (0–100): ${req.base_score}
  - Footfall component:      ${req.breakdown.footfall}/100  (weight ${(req.weights.footfall * 100).toFixed(0)}%)
  - Demand generators:       ${req.breakdown.demand}/100   (weight ${(req.weights.demand * 100).toFixed(0)}%)
  - Opportunity gap:         ${req.breakdown.gap}/100      (weight ${(req.weights.gap * 100).toFixed(0)}%) — high means LOW cafe saturation
  - Residential density:     ${req.breakdown.density}/100  (weight ${(req.weights.density * 100).toFixed(0)}%)
  - Affordability:           ${req.breakdown.affordability}/100  (weight ${(req.weights.affordability * 100).toFixed(0)}%)

DATA ON THIS PARISH:
  - Resident density: ${req.density_per_km2 ?? "?"} / km²
  - Residential rent: €${req.rent_eur_per_m2 ?? "?"} per m² per month
  - Cafés within parish: ${cafes}
  - Office sites: ${offices}
  - Hotels (proper): ${hotels}
  - Universities: ${universities}
  - Metro/ferry hubs: ${transit}
  - Strong tourist POIs (museums/attractions): ${touristStrong}
  - Bars + nightclubs: ${nightlife}

ACTIVE EVENTS happening on this date at this parish or nearby: ${events}

LISBON DOMAIN CONTEXT (use this when relevant):
  - Marvila / Beato: creative cluster, early-mover window, rising rents but undersupplied for specialty coffee
  - Misericórdia: Bairro Alto + Cais do Sodré, dense nightlife, oversaturated for daytime coffee
  - Santa Maria Maior: tourist core (Baixa/Alfama), seasonal Nov–Feb dip, oversaturated
  - Avenidas Novas / Santo António: CBD, strong weekday AM commuter rush, fierce competition
  - Campo de Ourique: quiet residential anchor, loyal customer base, low risk
  - Parque das Nações: modern business district, weekday-heavy, growing
  - Cascais / Estoril: coastal premium, weekend leisure peak, expensive
  - Almada / Costa da Caparica: summer beach destination, off-season quiet
  - Penha de França / Arroios: gentrifying inner residential
  - Outer ring (Amadora, Odivelas, Loures, Seixal): commuter-residential, low rent, low tourist

YOUR TASK
Apply qualitative reasoning the formula cannot:
  - If an active event is happening here, boost the score for the brief window
  - Identify synergies (e.g., university + low café count = student opportunity)
  - Flag structural risk (e.g., tourist-only = seasonal volatility)
  - Match the business profile to the parish character

Return strict JSON matching the schema. The score_adjustment must respect the ±10 bound. Bullets must be specific to THIS parish + business profile — no generic advice. Use the Lisbon context above when it applies.`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ParishInsightRequest;

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json(
        { error: "GOOGLE_GENERATIVE_AI_API_KEY missing in .env.local" },
        { status: 500 },
      );
    }

    const key = cacheKey(body);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return Response.json({ ...hit.value, cached: true });
    }

    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: InsightSchema,
      prompt: buildPrompt(body),
      temperature: 0.4,
    });

    // Clamp the values into their target ranges after generation, so the AI
    // never blows past the score-adjustment guardrail even if it returns ±12.
    const safe = {
      score_adjustment: Math.max(-10, Math.min(10, Math.round(object.score_adjustment))),
      projected_growth_pct: Math.max(-15, Math.min(35, Math.round(object.projected_growth_pct))),
      bullets: object.bullets.slice(0, 5).map((b) => b.length > 220 ? b.slice(0, 217) + "…" : b),
      reasoning: object.reasoning.length > 320 ? object.reasoning.slice(0, 317) + "…" : object.reasoning,
      confidence: object.confidence,
    };

    cache.set(key, { value: safe, expiresAt: Date.now() + TTL_MS });
    return Response.json({ ...safe, cached: false });
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      console.error("[parish-insight] schema-mismatch. Raw text:", err.text?.slice(0, 600));
      return Response.json(
        { error: "schema mismatch", raw: err.text?.slice(0, 600) },
        { status: 500 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[parish-insight] failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
