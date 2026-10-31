import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

vi.mock("@/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/components/event-details-modal", () => ({ EventDetailsModal: () => null }))
vi.mock("./crew-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./crew-ui")>()),
  NextSailingCard: () => null,
}))

import { CrewOverview, type CrewOverviewData } from "./crew-overview"
import type { OtherBoatEvent } from "./crew-data"

function inDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const event = (id: string, days: number, answer: OtherBoatEvent["answer"]): OtherBoatEvent => ({
  id, boatId: "sirocco", title: id, type: "Verseny", startDate: inDays(days), endDate: null, location: "", note: "", boatName: "Sirocco", answer,
})

function data(events: OtherBoatEvent[]): CrewOverviewData {
  return {
    crew: { status: "ready", events, teams: [], setAnswer: () => {} },
    applications: { status: "ready", applications: [], cancel: async () => {}, hide: () => {} },
    going: events.filter((row) => row.answer === "confirmed"),
    awaiting: events.filter((row) => row.answer === "open"),
    declined: events.filter((row) => row.answer === "declined"),
    accepted: [],
    otherApplications: [],
    loading: false,
    empty: false,
  } as unknown as CrewOverviewData
}

describe("CrewOverview timeline", () => {
  const events = [
    event("Hajószerelés", 1, "confirmed"),
    event("Dér Kupa", 8, "open"),
    event("Évzáró grillezés", 20, "declined"),
    event("Őszi túra", 15, "confirmed"),
    event("Évzáró edzés", 22, "open"),
  ]

  it("lists everything after the next sailing in one chronological list with each row's own state", () => {
    render(<CrewOverview data={data(events)} userId="me" mode="full" />)
    const list = within(screen.getByRole("region", { name: "Később" }))

    const titles = list.getAllByRole("listitem").map((item) => item.textContent ?? "")
    const order = ["Dér Kupa", "Őszi túra", "Évzáró grillezés", "Évzáró edzés"].map((title) => titles.findIndex((text) => text.includes(title)))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(list.queryByText("Hajószerelés")).not.toBeInTheDocument()

    expect(list.getByRole("button", { name: "Jövök: Dér Kupa" })).toBeInTheDocument()
    expect(list.getByText("Nem mész")).toBeInTheDocument()
    expect(list.getByRole("button", { name: "Mégis jövök" })).toBeInTheDocument()
    expect(list.getByText("Jössz")).toBeInTheDocument()
  })

  it("filters to what needs an answer", () => {
    render(<CrewOverview data={data(events)} userId="me" mode="full" />)
    const list = within(screen.getByRole("region", { name: "Később" }))

    fireEvent.click(list.getByRole("button", { name: /Válaszra vár/ }))

    expect(list.getByText("Dér Kupa")).toBeInTheDocument()
    expect(list.getByText("Évzáró edzés")).toBeInTheDocument()
    expect(list.queryByText("Őszi túra")).not.toBeInTheDocument()
    expect(list.queryByText("Évzáró grillezés")).not.toBeInTheDocument()
  })
})
