import { describe, expect, it } from "vitest"
import { buildRaceNotes, parseRaceCalendarHtml } from "@/lib/race-calendar"

// A hunsail.hu oldal szerkezetét utánozza: az adatok több flight-darabra bontva, JSON stringként érkeznek.
function buildHtml(events: unknown[]) {
  const payload = `27:["$","$L2b",null,{"year":2027,"events":${JSON.stringify(events)},"note":"]"}]`
  const middle = Math.floor(payload.length / 2)
  return [payload.slice(0, middle), payload.slice(middle)]
    .map((part) => `<script>self.__next_f.push([1,${JSON.stringify(part)}])</script>`)
    .join("")
}

const raiffeisen = {
  id: 10190,
  slug: "raiffeisen-ifjusagi-kupa-2027",
  title: "Raiffeisen ifjúsági  kupa",
  start_ms: 1807912800000,
  start_iso: "2027-04-16T22:00:00+02:00",
  end_ms: 1807999200000,
  location: "Balatonföldvár",
  category: 4,
  eventMeta: {
    host: "Spartacus Vitorlás Egylet",
    homepage: "",
    boatClasses: [
      { boatClass: { name: "ILCA 4" } },
      { boatClass: { name: "Optimist" } },
      { boatClass: { name: "ILCA 4" } },
    ],
  },
}

describe("parseRaceCalendarHtml", () => {
  it("reads the events split across flight chunks and uses Budapest dates", () => {
    const [race] = parseRaceCalendarHtml(buildHtml([raiffeisen]))

    expect(race).toEqual({
      id: 10190,
      title: "Raiffeisen ifjúsági kupa",
      startDate: "2027-04-17",
      endDate: "2027-04-18",
      oneDay: false,
      location: "Balatonföldvár",
      category: "Verseny",
      host: "Spartacus Vitorlás Egylet",
      boatClasses: ["ILCA 4", "Optimist"],
      homepage: null,
      detailsUrl: "https://mvszhirdetotabla.hu/raiffeisen-ifjusagi-kupa-2027",
    })
  })

  it("marks same-day races as one-day and sorts by start date", () => {
    const oneDay = { ...raiffeisen, id: 1, slug: "a", title: "Egynapos", start_ms: 1807999200000, end_ms: 1807999200000 }
    const races = parseRaceCalendarHtml(buildHtml([oneDay, raiffeisen]))

    expect(races.map((race) => race.title)).toEqual(["Raiffeisen ifjúsági kupa", "Egynapos"])
    expect(races[1]).toMatchObject({ startDate: "2027-04-18", endDate: "2027-04-18", oneDay: true })
  })

  it("skips incomplete entries and rejects non-http homepages", () => {
    const races = parseRaceCalendarHtml(buildHtml([
      { ...raiffeisen, id: 2, title: "" },
      { ...raiffeisen, id: 3, eventMeta: { ...raiffeisen.eventMeta, homepage: "javascript:alert(1)" } },
    ]))

    expect(races).toHaveLength(1)
    expect(races[0]).toMatchObject({ id: 3, homepage: null })
  })

  it("throws when the page no longer contains the calendar data", () => {
    expect(() => parseRaceCalendarHtml("<html></html>")).toThrow()
  })
})

describe("buildRaceNotes", () => {
  it("summarizes category, host and links", () => {
    const [race] = parseRaceCalendarHtml(buildHtml([raiffeisen]))

    expect(buildRaceNotes(race)).toBe(
      "Kategória: Verseny\nRendező: Spartacus Vitorlás Egylet\nVersenykiírás és részletek: https://mvszhirdetotabla.hu/raiffeisen-ifjusagi-kupa-2027",
    )
  })
})
