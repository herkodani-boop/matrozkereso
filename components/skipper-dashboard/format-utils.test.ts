import { describe, expect, it } from "vitest"
import {
  calculateAge,
  experienceLevelLabel,
  formatPositionLabel,
  isMatchingListingToEvent,
  normalizeMatchText,
  resolveCrewTypeLabel,
} from "@/components/skipper-dashboard/format-utils"
import type { EventItem, Listing } from "@/components/skipper-dashboard/types"

describe("calculateAge", () => {
  it("computes age relative to today, adjusting for month/day not yet reached", () => {
    const today = new Date()
    const birthdate = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate() + 1)
    expect(calculateAge(birthdate.toISOString())).toBe(29)
  })

  it("returns undefined for invalid input", () => {
    expect(calculateAge("not-a-date")).toBeUndefined()
  })
})

describe("experienceLevelLabel", () => {
  it("maps known level keys to Hungarian labels", () => {
    expect(experienceLevelLabel("kezdo")).toBe("Kezdő")
    expect(experienceLevelLabel("halado")).toBe("Haladó")
    expect(experienceLevelLabel("profi")).toBe("Profi / Versenyző")
  })

  it("falls back to Kezdő for unknown values", () => {
    expect(experienceLevelLabel(undefined)).toBe("Kezdő")
    expect(experienceLevelLabel("ismeretlen")).toBe("Kezdő")
  })
})

describe("formatPositionLabel", () => {
  it("normalizes accented/hyphenated position keys to display labels", () => {
    expect(formatPositionLabel("kormanyos")).toBe("Kormányos")
    expect(formatPositionLabel("main-trim")).toBe("Main Trim")
    expect(formatPositionLabel("jib trim")).toBe("Jib trim")
  })

  it("falls back to Legénység for empty input", () => {
    expect(formatPositionLabel(null)).toBe("Legénység")
  })
})

describe("resolveCrewTypeLabel", () => {
  it("resolves known crew type values to labels", () => {
    expect(resolveCrewTypeLabel("tura")).toBe("Túra / Hobbi vitorlázás")
  })

  it("returns a default message when value is missing", () => {
    expect(resolveCrewTypeLabel(null)).toBe("Nincs megadva")
  })
})

describe("normalizeMatchText", () => {
  it("strips accents, trims, and collapses whitespace", () => {
    expect(normalizeMatchText("  Balatonfüred   Kikötő  ")).toBe("balatonfured kikoto")
  })
})

describe("isMatchingListingToEvent", () => {
  const baseEvent: EventItem = {
    id: "event-1",
    title: "Balaton Kupa",
    date: "2026.09.29.",
    location: "Balatonfüred",
    type: "Verseny",
    details: "",
    startDate: "2026-09-29",
    endDate: "2026-09-29",
    oneDay: true,
    participants: [],
  }

  const baseListing: Listing = {
    id: "listing-1",
    eventId: null,
    commitment: "egy-verseny",
    event: "Balaton Kupa",
    location: "Balatonfüred",
    date: "",
    expiryDate: null,
    isActive: true,
    isDeleted: false,
    isHistorical: false,
    positions: [],
    applicants: [],
  }

  it("matches directly via eventId when present", () => {
    expect(isMatchingListingToEvent({ ...baseListing, eventId: "event-1" }, baseEvent)).toBe(true)
    expect(isMatchingListingToEvent({ ...baseListing, eventId: "other" }, baseEvent)).toBe(false)
  })

  it("falls back to fuzzy title/location/date matching when eventId is absent", () => {
    expect(isMatchingListingToEvent(baseListing, baseEvent)).toBe(true)
    expect(isMatchingListingToEvent({ ...baseListing, location: "Siófok" }, baseEvent)).toBe(false)
  })

  it("returns false when either side is missing", () => {
    expect(isMatchingListingToEvent(undefined, baseEvent)).toBe(false)
    expect(isMatchingListingToEvent(baseListing, undefined)).toBe(false)
  })
})
