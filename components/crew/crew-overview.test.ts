import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabase: {} }))

import { crewSummary, withoutDuplicates, type CrewOverviewData } from "./crew-overview"
import type { OtherBoatEvent } from "./crew-data"
import type { MyApplication } from "@/components/my-applications"

function inDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const event = (id: string, days: number, answer: OtherBoatEvent["answer"]): OtherBoatEvent => ({
  id, boatId: "nemere", title: id, type: "", startDate: inDays(days), endDate: null, location: "", note: "", boatName: "Nemere", answer,
})

const application = (status: MyApplication["status"]): MyApplication => ({
  id: status, status, createdAt: "2026-10-28T10:00:00Z", title: "Őszi túra", adClosed: null, eventId: null, boatId: null, boatName: "Nemere",
  location: "", dateText: "", startDate: inDays(7), endDate: null, roles: [], contact: null,
})

function data(overrides: Partial<CrewOverviewData>): CrewOverviewData {
  return { going: [], awaiting: [], declined: [], accepted: [], otherApplications: [], ...overrides } as unknown as CrewOverviewData
}

describe("crewSummary", () => {
  it("leads with the next sailing and counts what needs an answer", () => {
    expect(crewSummary(data({
      going: [event("Hajószerelés", 1, "confirmed")],
      awaiting: [event("a", 5, "open"), event("b", 9, "open")],
      otherApplications: [application("pending")],
    }))).toBe("Holnap: Hajószerelés (Nemere). 2 esemény vár a válaszodra. 1 jelentkezésed elbírálás alatt van.")
  })

  it("celebrates an accepted application when there is no team event yet", () => {
    expect(crewSummary(data({ accepted: [application("accepted")] }))).toBe("Elfogadták a jelentkezésedet: Őszi túra (Nemere), 7 nap múlva.")
  })

  it("names the date instead of counting days for a far-away sailing", () => {
    const far = event("Balatoni Évadnyitó", 189, "confirmed")
    const date = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric" }).format(new Date(`${far.startDate}T12:00:00`))
    expect(crewSummary(data({ going: [far] }))).toBe(`Következő vitorlázásod: ${date}, Balatoni Évadnyitó (Nemere).`)
  })
})

describe("withoutDuplicates", () => {
  const sailing = event("Őszi túra", 7, "confirmed")

  it("drops an accepted application once its event shows up among my events", () => {
    expect(withoutDuplicates([{ ...application("accepted"), eventId: sailing.id }], [sailing])).toEqual([])
  })

  it("drops it when I joined the team and the boat has an event that day", () => {
    expect(withoutDuplicates([{ ...application("accepted"), boatId: "nemere" }], [sailing])).toEqual([])
  })

  it("keeps it when nothing on my list covers it", () => {
    const kept = { ...application("accepted"), boatId: "sirocco" }
    expect(withoutDuplicates([kept], [sailing])).toEqual([kept])
  })
})
