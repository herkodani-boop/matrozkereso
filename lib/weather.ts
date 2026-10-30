// Időjárás a következő eseményhez: Open-Meteo előrejelzés és a HungaroMet napi vízhőmérséklet-mérése.
// A lekérdezés a szerveren fut (app/api/weather), itt csak a tiszta, tesztelhető feldolgozás van.

export type EventWeather = {
  date: string
  description: string
  weatherCode: number
  tempMin: number
  tempMax: number
  windKnots: number
  gustKnots: number
  windDirection: number
  windDirectionLabel: string
  water: { temperature: number; station: string } | null
  // Melyik helyre szól az előrejelzés, és honnan vettük: az esemény helyszínéből vagy a hajó kikötőjéből.
  place: { name: string; source: "event" | "harbor" | "default" } | null
}

// A HungaroMet tavi mérőhelyei; a vízhőt a helyszínhez legközelebbiből mutatjuk.
export const WATER_STATIONS = [
  { name: "Siófok", latitude: 46.909, longitude: 18.049 },
  { name: "Tihanyrév", latitude: 46.894, longitude: 17.889 },
  { name: "Balatonakali", latitude: 46.882, longitude: 17.754 },
  { name: "Agárd", latitude: 47.187, longitude: 18.596 },
  { name: "Fertőrákos", latitude: 47.72, longitude: 16.65 },
  { name: "Tiszafüred", latitude: 47.62, longitude: 20.761 },
] as const

// Ha sem az esemény helyszíne, sem a hajó kikötője nem azonosítható, erre a helyre kérünk előrejelzést.
export const DEFAULT_PLACE = { name: "Balatonfüred", latitude: 46.962, longitude: 17.872 }

// Ennél messzebbi mérőhely vize már nem mond semmit az esemény helyszínéről.
export const MAX_WATER_STATION_KM = 40

const WEATHER_LABELS: [number[], string][] = [
  [[0], "Derült"],
  [[1], "Többnyire derült"],
  [[2], "Részben felhős"],
  [[3], "Borult"],
  [[45, 48], "Ködös"],
  [[51, 53, 55], "Szitálás"],
  [[56, 57], "Ónos szitálás"],
  [[61], "Gyenge eső"],
  [[63], "Eső"],
  [[65], "Erős eső"],
  [[66, 67], "Ónos eső"],
  [[71, 73, 75, 77], "Havazás"],
  [[80, 81, 82], "Záporok"],
  [[85, 86], "Hózápor"],
  [[95], "Zivatar"],
  [[96, 99], "Zivatar jégesővel"],
]

export function describeWeatherCode(code: number) {
  return WEATHER_LABELS.find(([codes]) => codes.includes(code))?.[1] ?? "Változó idő"
}

const COMPASS = ["É", "ÉK", "K", "DK", "D", "DNy", "Ny", "ÉNy"]

// A meteorológiai szélirány azt mondja meg, honnan fúj a szél.
export function compassLabel(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360
  return COMPASS[Math.round(normalized / 45) % 8]
}

export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (value: number) => (value * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// A közeli mérőhelyek távolság szerint; ha a legközelebbinek aznap nincs adata, a következőt használjuk.
export function nearbyWaterStations(point: { latitude: number; longitude: number }) {
  return WATER_STATIONS.map((station) => ({ station, km: distanceKm(point, station) }))
    .filter((entry) => entry.km <= MAX_WATER_STATION_KM)
    .sort((a, b) => a.km - b.km)
    .map((entry) => entry.station)
}

// A HungaroMet vízhőmérséklet-táblázata: "Siófok 11", hiányzó adatnál "Balatonakali -".
export function parseWaterTemperatures(html: string) {
  const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")
  const result = new Map<string, number>()
  for (const station of WATER_STATIONS) {
    const match = text.match(new RegExp(`${station.name}\\s+(-?\\d+(?:[.,]\\d+)?)`))
    if (match) result.set(station.name, Number(match[1].replace(",", ".")))
  }
  return result
}

// Több szóból álló helyszínnél ("BYC kikötő, Balatonfüred") a részeket is kipróbáljuk.
// A kikötőket gyakran így írják be: "Szigliget kikötő", "Füredi móló". Ezeket a szavakat elhagyva a településnév marad.
const PLACE_NOISE = /(?<=^|\s)(kikötő\p{L}*|móló\p{L}*|öböl|öblö\p{L}*|strand\p{L}*|marina|yacht ?club|vitorlás ?klub|hajókikötő\p{L}*)(?=\s|$)/giu

export function locationCandidates(location: string) {
  const trimmed = location.trim()
  if (!trimmed) return []
  const parts = trimmed.split(/[,;/]/).map((part) => part.trim()).filter(Boolean)
  const cleaned = parts.map((part) => part.replace(PLACE_NOISE, " ").replace(/s+/g, " ").trim()).filter(Boolean)
  return Array.from(new Set([trimmed, ...parts, ...cleaned]))
}

type DailyForecast = {
  time: string[]
  weather_code: number[]
  temperature_2m_min: number[]
  temperature_2m_max: number[]
  wind_speed_10m_max: number[]
  wind_gusts_10m_max: number[]
  wind_direction_10m_dominant: number[]
}

export function buildEventWeather(
  daily: DailyForecast,
  date: string,
  water: EventWeather["water"],
): EventWeather | null {
  const index = daily.time.indexOf(date)
  if (index < 0) return null
  const code = daily.weather_code[index]
  const values = [code, daily.temperature_2m_min[index], daily.temperature_2m_max[index], daily.wind_speed_10m_max[index]]
  if (values.some((value) => typeof value !== "number")) return null
  const direction = daily.wind_direction_10m_dominant[index] ?? 0

  return {
    date,
    description: describeWeatherCode(code),
    weatherCode: code,
    tempMin: Math.round(daily.temperature_2m_min[index]),
    tempMax: Math.round(daily.temperature_2m_max[index]),
    windKnots: Math.round(daily.wind_speed_10m_max[index]),
    gustKnots: Math.round(daily.wind_gusts_10m_max[index] ?? daily.wind_speed_10m_max[index]),
    windDirection: direction,
    windDirectionLabel: compassLabel(direction),
    water,
    place: null,
  }
}
