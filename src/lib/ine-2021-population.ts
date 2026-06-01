// INE 2021 Census — resident population per Lisbon freguesia
// Source: Instituto Nacional de Estatística (INE), Censos 2021, freguesia-level resident population.
// Public domain administrative statistic.
// Keys are lowercased, accent-stripped freguesia names to match geoapi.pt slugs.
export const ineLisbonPopulation2021: Record<string, number> = {
  ajuda: 14704,
  alcantara: 13943,
  alvalade: 31813,
  areeiro: 20131,
  arroios: 31485,
  "avenidas novas": 21318,
  beato: 12773,
  belem: 16528,
  benfica: 33720,
  "campo de ourique": 22082,
  campolide: 15460,
  carnide: 19218,
  estrela: 19943,
  lumiar: 47653,
  marvila: 38802,
  misericordia: 12684,
  olivais: 35468,
  "parque das nacoes": 22679,
  "penha de franca": 27762,
  "santa clara": 23138,
  "santa maria maior": 9478,
  "santo antonio": 10802,
  "sao domingos de benfica": 33348,
  "sao vicente": 14824,
};

export function normalizeParishName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}
