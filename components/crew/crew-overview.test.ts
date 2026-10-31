import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabase: {} }))

import { crewSummary, type CrewOverviewData } from "./crew-overview"
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
  id: status, status, createdAt: "2026-10-28T10:00:00Z", title: "Őszi túra", adClosed: null, boatName: "Nemere",
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
    expect(crewSummary(data({ accepted: [application("accepted")] }))).toBe("Elfogadták a jelentkezésedet: 7 nap múlva Őszi túra (Nemere).")
  })
})
