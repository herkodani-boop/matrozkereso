import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabase: {} }))

import { boatColor, toOtherBoatEvents } from "./crew-data"

describe("toOtherBoatEvents", () => {
  it("sorts by date, keeps the captain's note and treats pending and unset as not yet answered", () => {
    const row = (id: string, start: string, notes: string | null = null) => ({
      id, title: id, type: "Verseny", start_date: start, end_date: null, location: "Balatonfüred", notes, boat_id: "sirocco", boat: [{ name: "Sirocco" }],
    })
    const events = toOtherBoatEvents(
      [row("kupa", "2027-04-17"), row("szereles", "2026-11-02", " 9:00 gyülekező "), row("nyito", "2027-05-08"), row("zaro", "2026-11-20")],
      new Map([["szereles", "confirmed"], ["nyito", "declined"], ["zaro", "pending"]]),
    )

    expect(events.map((event) => [event.id, event.answer])).toEqual([
      ["szereles", "confirmed"],
      ["zaro", "open"],
      ["kupa", "open"],
      ["nyito", "declined"],
    ])
    expect(events[0]).toMatchObject({ boatId: "sirocco", boatName: "Sirocco", note: "9:00 gyülekező" })
  })

  it("cycles boat colors so neighbouring teams differ", () => {
    expect(boatColor(0)).not.toBe(boatColor(1))
    expect(boatColor(5)).toBe(boatColor(0))
  })
})
