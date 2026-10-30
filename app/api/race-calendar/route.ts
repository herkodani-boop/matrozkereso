import { NextRequest, NextResponse } from "next/server"
import { parseRaceCalendarHtml, RACE_CALENDAR_SOURCE_URL, type RaceCalendarEntry } from "@/lib/race-calendar"
import snapshot2027 from "@/lib/race-calendar-2027.json"

// Ha a hunsail.hu nem érhető el vagy megváltozik az oldal szerkezete, ebből szolgálunk ki.
const SNAPSHOTS: Record<number, { fetchedAt: string; races: RaceCalendarEntry[] }> = {
  2027: snapshot2027,
}

// A szövetség oldalát évenként legfeljebb naponta egyszer kérjük le.
const REVALIDATE_SECONDS = 60 * 60 * 24

export async function GET(request: NextRequest) {
  const currentYear = new Date().getFullYear()
  const year = Number(request.nextUrl.searchParams.get("year") ?? currentYear + 1)

  if (!Number.isInteger(year) || year < currentYear || year > currentYear + 1) {
    return NextResponse.json({ error: "Csak az idei és a jövő évi versenynaptár kérhető le." }, { status: 400 })
  }

  try {
    const response = await fetch(`${RACE_CALENDAR_SOURCE_URL}?ev=${year}`, {
      headers: { "User-Agent": "Matrozkereso/1.0 (+https://www.matrozkereso.com)" },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const races = parseRaceCalendarHtml(await response.text())
    return NextResponse.json({ year, source: "live", races })
  } catch (error) {
    console.error(`Versenynaptár lekérése nem sikerült (${year}):`, error)

    const snapshot = SNAPSHOTS[year]
    if (snapshot) {
      return NextResponse.json({ year, source: "snapshot", fetchedAt: snapshot.fetchedAt, races: snapshot.races })
    }

    return NextResponse.json({ error: "A versenynaptár most nem érhető el." }, { status: 502 })
  }
}
