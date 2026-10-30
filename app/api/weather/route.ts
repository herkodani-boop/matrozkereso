import { NextRequest, NextResponse } from "next/server"
import {
  buildEventWeather,
  DEFAULT_PLACE,
  locationCandidates,
  nearbyWaterStations,
  parseWaterTemperatures,
  type EventWeather,
} from "@/lib/weather"

const USER_AGENT = "Matrozkereso/1.0 (+https://www.matrozkereso.com)"
// Előrejelzés óránként, vízhő naponta néhányszor frissül; a helynév koordinátája nem változik.
const FORECAST_REVALIDATE = 60 * 60
const WATER_REVALIDATE = 60 * 60 * 3
const GEOCODE_REVALIDATE = 60 * 60 * 24 * 30
// Ennél távolabbi napra az előrejelzés megbízhatatlan, ezért nem is kérjük le.
const MAX_FORECAST_DAYS = 7
const WATER_SOURCE_URL = "https://www.met.hu/idojaras/aktualis_idojaras/vizhomerseklet/main.php"

async function fetchJson<T>(url: string, revalidate: number): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate },
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as T
}

async function geocode(location: string) {
  for (const candidate of locationCandidates(location)) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(candidate)}&count=1&language=hu&countryCode=HU`
    const data = await fetchJson<{ results?: { name: string; latitude: number; longitude: number }[] }>(url, GEOCODE_REVALIDATE)
    const hit = data.results?.[0]
    if (hit) return { name: hit.name, latitude: hit.latitude, longitude: hit.longitude }
  }
  return null
}

async function loadWater(point: { latitude: number; longitude: number }): Promise<EventWeather["water"]> {
  const stations = nearbyWaterStations(point)
  if (stations.length === 0) return null
  try {
    const response = await fetch(WATER_SOURCE_URL, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: WATER_REVALIDATE },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const temperatures = parseWaterTemperatures(await response.text())
    const station = stations.find((candidate) => temperatures.has(candidate.name))
    return station ? { temperature: temperatures.get(station.name) as number, station: station.name } : null
  } catch (error) {
    // A vízhő kiegészítő adat: ha a HungaroMet nem elérhető, nélküle mutatjuk az előrejelzést.
    console.error("Vízhőmérséklet lekérése nem sikerült:", error)
    return null
  }
}

function todayInBudapest() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date())
}

export async function GET(request: NextRequest) {
  const location = (request.nextUrl.searchParams.get("location") ?? "").slice(0, 120)
  // Ha az esemény szabadon beírt helyszíne nem azonosítható, a hajó kikötőjére kérdezünk le.
  const harbor = (request.nextUrl.searchParams.get("harbor") ?? "").slice(0, 120)
  const date = request.nextUrl.searchParams.get("date") ?? ""

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Hiányzó vagy hibás dátum." }, { status: 400 })
  }

  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${todayInBudapest()}T12:00:00Z`)) / 86_400_000)
  if (days < 0 || days > MAX_FORECAST_DAYS) {
    return NextResponse.json({ weather: null, reason: "out-of-range" })
  }

  try {
    const eventPoint = location.trim() ? await geocode(location) : null
    const harborPoint = eventPoint || !harbor.trim() ? null : await geocode(harbor)
    const point = eventPoint ?? harborPoint ?? DEFAULT_PLACE
    const source = eventPoint ? "event" : harborPoint ? "harbor" : "default"

    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${point.latitude}&longitude=${point.longitude}` +
      "&daily=weather_code,temperature_2m_min,temperature_2m_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant" +
      `&wind_speed_unit=kn&timezone=Europe%2FBudapest&start_date=${date}&end_date=${date}`

    const [forecast, water] = await Promise.all([
      fetchJson<{ daily: Parameters<typeof buildEventWeather>[0] }>(forecastUrl, FORECAST_REVALIDATE),
      loadWater(point),
    ])

    const weather = buildEventWeather(forecast.daily, date, water)
    return NextResponse.json(
      { weather: weather && { ...weather, place: { name: point.name, source } } },
      { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } },
    )
  } catch (error) {
    console.error("Időjárás lekérése nem sikerült:", error)
    return NextResponse.json({ error: "Az időjárás most nem érhető el." }, { status: 502 })
  }
}
