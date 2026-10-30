"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ExternalLink, MapPin, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RaceCalendarEntry } from "@/lib/race-calendar"
import { formatEventDate } from "./format-utils"

type CalendarResponse = { year: number; source: "live" | "snapshot"; fetchedAt?: string; races: RaceCalendarEntry[] }

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; races: RaceCalendarEntry[]; snapshotDate: string | null }

const monthFormat = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" })

function getTodayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

function formatRaceDate(race: RaceCalendarEntry) {
  return race.oneDay ? formatEventDate(race.startDate) : `${formatEventDate(race.startDate)} – ${formatEventDate(race.endDate)}`
}

// Évenként egyszer töltjük be, a panel újranyitásakor nem kérjük le újra. A sikertelen évet újrapróbáljuk.
const calendarRequests = new Map<number, Promise<CalendarResponse | null>>()

function loadCalendarYear(year: number) {
  let request = calendarRequests.get(year)
  if (!request) {
    request = fetch(`/api/race-calendar?year=${year}`)
      .then(async (response) => (response.ok ? ((await response.json()) as CalendarResponse) : null))
      .catch(() => null)
      .then((calendar) => {
        if (!calendar) calendarRequests.delete(year)
        return calendar
      })
    calendarRequests.set(year, request)
  }
  return request
}

function buildLoadState(calendars: CalendarResponse[]): LoadState {
  const todayKey = getTodayKey()
  const snapshot = calendars.find((calendar) => calendar.source === "snapshot")
  return {
    status: "ready",
    races: calendars
      .flatMap((calendar) => calendar.races)
      // Az űrlap múltbeli kezdődátumot nem fogad el, ezért a már elkezdett versenyeket sem kínáljuk.
      .filter((race) => race.startDate >= todayKey)
      .sort((first, second) => first.startDate.localeCompare(second.startDate)),
    snapshotDate: snapshot?.fetchedAt ? formatEventDate(snapshot.fetchedAt.slice(0, 10)) : null,
  }
}

export function RaceCalendarPicker({
  onSelect,
  onClose,
}: {
  onSelect: (race: RaceCalendarEntry) => void
  onClose: () => void
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [query, setQuery] = useState("")

  // Az idei és a jövő évi naptárat külön töltjük: amelyik előbb megjön, azt már mutatjuk,
  // így egy lassú vagy elérhetetlen év nem tartja vissza a másikat.
  useEffect(() => {
    let active = true
    const currentYear = new Date().getFullYear()
    const years = [currentYear, currentYear + 1]
    const loaded: CalendarResponse[] = []
    let settled = 0

    for (const year of years) {
      void loadCalendarYear(year).then((calendar) => {
        if (!active) return
        settled += 1
        if (calendar) loaded.push(calendar)
        if (loaded.length > 0) setState(buildLoadState(loaded))
        else if (settled === years.length) setState({ status: "error" })
      })
    }

    return () => {
      active = false
    }
  }, [])

  const groups = useMemo(() => {
    if (state.status !== "ready") return []
    const needle = query.trim().toLocaleLowerCase("hu")
    const matches = needle
      ? state.races.filter((race) =>
          [race.title, race.location, race.host ?? "", ...race.boatClasses].some((value) =>
            value.toLocaleLowerCase("hu").includes(needle),
          ),
        )
      : state.races

    const byMonth = new Map<string, RaceCalendarEntry[]>()
    for (const race of matches) {
      const key = race.startDate.slice(0, 7)
      byMonth.set(key, [...(byMonth.get(key) ?? []), race])
    }
    return Array.from(byMonth, ([key, races]) => ({
      label: monthFormat.format(new Date(`${key}-01T12:00:00`)),
      races,
    }))
  }, [state, query])

  // Ha a keresés egy hajóosztályra illik, megmutatjuk, mert a verseny nevéből ez nem derül ki.
  const needle = query.trim().toLocaleLowerCase("hu")
  const matchingClasses = (race: RaceCalendarEntry) =>
    needle ? race.boatClasses.filter((boatClass) => boatClass.toLocaleLowerCase("hu").includes(needle)) : []

  return (
    // A szülő görgeti a tartalmat; a keresősáv ehhez ragad, így hosszú listánál is kéznél van.
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-popover px-3 py-3 sm:px-4">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="shrink-0 gap-1 px-2">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Vissza
        </Button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // A panel az eseményűrlapon belül van: Enterre ne mentse el az eseményt.
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault()
            }}
            placeholder="Név, helyszín, rendező, hajóosztály"
            aria-label="Verseny keresése"
            autoFocus
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
      </div>

      <div>
        {state.status === "loading" ? (
          <p role="status" className="p-4 text-sm text-muted-foreground">Versenynaptár betöltése...</p>
        ) : state.status === "error" ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            A versenynaptár most nem érhető el. Az esemény adatait kézzel is megadhatod.
          </p>
        ) : groups.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {query.trim() ? "Nincs a keresésnek megfelelő verseny." : "Nincs közelgő verseny a naptárban."}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="bg-secondary/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-4">
                {group.label}
              </p>
              <ul>
                {group.races.map((race) => (
                  <li key={race.id} className="flex items-start gap-3 border-b border-border/60 px-3 py-3 last:border-b-0 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{race.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatRaceDate(race)}
                        </span>
                        {race.location ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {race.location}
                          </span>
                        ) : null}
                        {race.category && race.category !== "Verseny" ? <span>{race.category}</span> : null}
                      </p>
                      {race.host ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{race.host}</p> : null}
                      {matchingClasses(race).length > 0 ? (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {matchingClasses(race).map((boatClass) => (
                            <span key={boatClass} className="rounded bg-brand-tint px-1.5 py-0.5 text-[11px] font-medium text-brand">
                              {boatClass}
                            </span>
                          ))}
                        </p>
                      ) : null}
                      <a
                        href={race.detailsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand underline-offset-2 hover:underline"
                      >
                        Kiírás és részletek
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => onSelect(race)} className="shrink-0">
                      Kiválasztás
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground sm:px-4">
        Forrás: MVSZ versenynaptár (hunsail.hu)
        {state.status === "ready" && state.snapshotDate ? ` · ${state.snapshotDate}-i állapot` : ""}
      </p>
    </div>
  )
}
