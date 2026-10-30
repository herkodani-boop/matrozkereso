// Az MVSZ (hunsail.hu) versenynaptárának feldolgozása eseményűrlap-kitöltéshez.

export type RaceCalendarEntry = {
  id: number
  title: string
  // YYYY-MM-DD, budapesti idő szerint
  startDate: string
  endDate: string
  oneDay: boolean
  location: string
  category: string | null
  host: string | null
  boatClasses: string[]
  homepage: string | null
  detailsUrl: string
}

export const RACE_CALENDAR_SOURCE_URL = "https://hunsail.hu/versenynaptar"

// A naptár szűrőinek címkéi (raceCategory[] értékek).
const CATEGORY_LABELS: Record<number, string> = {
  1: "Magyar bajnokság",
  2: "Magyar flottabajnokság",
  3: "Ranglista verseny",
  4: "Verseny",
  5: "Nemzetközi verseny",
}

type RawRaceEvent = {
  id?: unknown
  slug?: unknown
  title?: unknown
  start_ms?: unknown
  end_ms?: unknown
  location?: unknown
  category?: unknown
  eventMeta?: {
    host?: unknown
    homepage?: unknown
    boatClasses?: { boatClass?: { name?: unknown } | null }[] | null
  } | null
}

const budapestDateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" })

// A forrás *_iso mezői hibás eltolással érkeznek (helyi éjfél UTC-ként, +02:00 jelöléssel),
// ezért a dátumot az epoch ms értékből, budapesti időzónában számoljuk.
function toBudapestDate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? budapestDateFormat.format(new Date(value)) : null
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null
}

// A Next.js oldal a naptár adatait a self.__next_f.push([1,"..."]) hívásokban küldi;
// ezekből fűzzük össze a payloadot, és kiolvassuk belőle az "events" tömböt.
export function extractRaceEvents(html: string): RawRaceEvent[] {
  let payload = ""
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    payload += JSON.parse(match[1]) as string
  }

  const marker = '"events":['
  const start = payload.indexOf(marker)
  if (start < 0) throw new Error("A versenynaptár adatai nem találhatók az oldalon.")

  let depth = 0
  let inString = false
  for (let index = start + marker.length - 1; index < payload.length; index++) {
    const character = payload[index]
    if (inString) {
      if (character === "\\") index++
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === "[") depth++
    else if (character === "]" && --depth === 0) {
      return JSON.parse(payload.slice(start + marker.length - 1, index + 1)) as RawRaceEvent[]
    }
  }

  throw new Error("A versenynaptár adatai hiányosak.")
}

export function normalizeRaceEvents(events: RawRaceEvent[]): RaceCalendarEntry[] {
  const entries: RaceCalendarEntry[] = []

  for (const event of events) {
    const title = cleanText(event.title)
    const slug = cleanText(event.slug)
    const startDate = toBudapestDate(event.start_ms)
    const endDate = toBudapestDate(event.end_ms) ?? startDate
    if (typeof event.id !== "number" || !title || !slug || !startDate || !endDate) continue

    const boatClasses = Array.from(new Set(
      (event.eventMeta?.boatClasses ?? [])
        .map((item) => cleanText(item?.boatClass?.name))
        .filter((name): name is string => Boolean(name)),
    ))
    const homepage = cleanText(event.eventMeta?.homepage)

    entries.push({
      id: event.id,
      title,
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
      oneDay: endDate <= startDate,
      location: cleanText(event.location) ?? "",
      category: typeof event.category === "number" ? CATEGORY_LABELS[event.category] ?? null : null,
      host: cleanText(event.eventMeta?.host),
      boatClasses,
      homepage: homepage && /^https?:\/\//i.test(homepage) ? homepage : null,
      detailsUrl: `https://mvszhirdetotabla.hu/${encodeURIComponent(slug)}`,
    })
  }

  return entries.sort((first, second) => first.startDate.localeCompare(second.startDate) || first.title.localeCompare(second.title, "hu"))
}

export function parseRaceCalendarHtml(html: string) {
  return normalizeRaceEvents(extractRaceEvents(html))
}

// Az esemény megjegyzés mezőjébe kerülő összefoglaló.
export function buildRaceNotes(race: RaceCalendarEntry) {
  return [
    race.category ? `Kategória: ${race.category}` : null,
    race.host ? `Rendező: ${race.host}` : null,
    `Versenykiírás és részletek: ${race.detailsUrl}`,
    race.homepage ? `Honlap: ${race.homepage}` : null,
  ].filter(Boolean).join("\n")
}
