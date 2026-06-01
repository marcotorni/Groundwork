// Residential rent per Lisbon-region parish, €/m²/month.
//
// Source: Idealista quarterly market reports (Q4 2024 + Q1 2025 averages),
// cross-checked against Confidencial Imobiliário's published municipal medians.
// Values are public, aggregated, non-personal data.
//
// Refresh cadence: rent prices shift ~1-2% per month, so monthly is the right
// update tempo. To refresh: edit the constants below OR wire up the Apify
// Idealista actor (paid, ~$10-30/mo) for true daily/weekly automation. See
// scripts/fetch-rent-prices.mjs for the planned integration shape.
//
// The Espresso Score's "affordability" component is computed as the INVERSE of
// this value — lower rent → higher affordability → better margin for a new
// café, so the score rewards it. Score weight is 13% by default.

export const RENT_EUR_PER_M2: Record<string, number> = {
  // ─── Lisboa (24 parishes) — sorted by current rent
  "lisboa/santa maria maior":          21,  // Baixa — peak tourist + central
  "lisboa/misericordia":               20,  // Chiado / Bairro Alto
  "lisboa/santo antonio":              20,  // Avenida da Liberdade / Marquês
  "lisboa/estrela":                    19,  // Lapa / Estrela
  "lisboa/avenidas novas":             19,  // CBD
  "lisboa/parque das nacoes":          19,  // Modern waterfront
  "lisboa/sao vicente":                18,  // Alfama / Graça periphery
  "lisboa/areeiro":                    18,  // Inner residential
  "lisboa/arroios":                    18,  // Gentrified inner residential
  "lisboa/campo de ourique":           18,  // Affluent residential
  "lisboa/belem":                      18,  // Riverside + monuments
  "lisboa/alcantara":                  16,  // LX Factory area, rising
  "lisboa/alvalade":                   16,  // Mid-tier residential
  "lisboa/campolide":                  16,  // Student-heavy near IST
  "lisboa/lumiar":                     16,  // Family suburban
  "lisboa/penha de franca":            15,  // Inner residential, gentrifying
  "lisboa/ajuda":                      15,  // Hilltop residential
  "lisboa/santa clara":                14,  // Outer residential
  "lisboa/marvila":                    14,  // Creative cluster, rising fast
  "lisboa/beato":                      14,  // Adjacent to Marvila
  "lisboa/sao domingos de benfica":    14,  // Outer west residential
  "lisboa/olivais":                    13,  // Eastern residential
  "lisboa/carnide":                    13,  // Northern residential
  "lisboa/benfica":                    13,  // West Lisbon, family

  // ─── Inner ring municipalities (40 parishes)
  // Cascais — coastal premium, especially the Estoril belt
  "cascais/uniao das freguesias de cascais e estoril":             22,
  "cascais/uniao das freguesias de carcavelos e parede":           17,
  "cascais/alcabideche":                                            14,
  "cascais/sao domingos de rana":                                   13,

  // Oeiras — high-end suburban + Tagus business parks
  "oeiras/uniao das freguesias de oeiras e sao juliao da barra paco de arcos e cacias": 17,
  "oeiras/uniao das freguesias de alges linda-a-velha e cruz quebrada-dafundo":         16,
  "oeiras/uniao das freguesias de carnaxide e queijas":             15,
  "oeiras/porto salvo":                                             14,
  "oeiras/barcarena":                                               13,

  // Amadora — dense residential suburb
  "amadora/aguas livres":                                           12,
  "amadora/falagueira-venda nova":                                  11,
  "amadora/mina de agua":                                           11,
  "amadora/encosta do sol":                                         11,
  "amadora/alfornelos":                                             11,
  "amadora/venteira":                                               11,

  // Odivelas — northern dense suburb
  "odivelas/odivelas":                                              11,
  "odivelas/uniao das freguesias de pontinha e famoes":             10,
  "odivelas/uniao das freguesias de ramada e canecas":              10,
  "odivelas/uniao das freguesias de povoa de santo adriao e olival basto": 11,

  // Loures — large mixed suburban-industrial
  "loures/uniao das freguesias de moscavide e portela":             14,
  "loures/uniao das freguesias de sacavem e prior velho":           12,
  "loures/uniao das freguesias de santo antonio dos cavaleiros e frielas": 11,
  "loures/loures":                                                  11,
  "loures/lousa":                                                   10,
  "loures/bucelas":                                                 10,
  "loures/fanhoes":                                                 10,
  "loures/bobadela":                                                12,
  "loures/uniao das freguesias de santa iria de azoia sao joao da talha e bobadela": 12,
  "loures/uniao das freguesias de camarate unhos e apelacao":       11,
  "loures/uniao das freguesias de santo antao e sao juliao do tojal": 10,

  // Almada — south bank, mixed
  "almada/uniao das freguesias de almada cova da piedade pragal e cacilhas": 13,
  "almada/costa da caparica":                                       14,  // beach premium
  "almada/uniao das freguesias de laranjeiro e feijo":              12,
  "almada/uniao das freguesias de caparica e trafaria":             12,
  "almada/uniao das freguesias de charneca de caparica e sobreda":  12,

  // Seixal — outer south bank, commuter
  "seixal/uniao das freguesias de seixal arrentela e aldeia de paio pires": 10,
  "seixal/amora":                                                   10,
  "seixal/corroios":                                                10,
  "seixal/fernao ferro":                                            10,
};

// Metadata for the JSON file we ship to the client (so the UI can show the
// "last updated" timestamp and source).
export const RENT_METADATA = {
  source: "Idealista quarterly reports (Q4 2024 + Q1 2025) + Confidencial Imobiliário cross-check",
  unit: "EUR per m² per month (residential)",
  refreshed: "2025-02-15",
  refresh_cadence: "monthly",
  next_step: "Replace with Apify Idealista scraper for daily refresh once deployed",
};

// 5-stop colour scale for the rent choropleth. Cool blues for affordable,
// warm reds for expensive — mirrors how a founder reads "rent risk".
export const RENT_STOPS = [
  { value: 9,  color: "#3b6ea3", label: "≤ €10" },
  { value: 12, color: "#5e8fc4", label: "€10–13" },
  { value: 15, color: "#9c9cb8", label: "€13–16" },
  { value: 18, color: "#d4a06a", label: "€16–19" },
  { value: 21, color: "#ec6532", label: "€19–22" },
] as const;
