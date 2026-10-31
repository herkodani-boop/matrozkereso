import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabase: {} }))

import { formatListingDate } from "./open-listings"

const now = new Date("2026-10-31T12:00:00")

describe("formatListingDate", () => {
  it("drops this year and spells out the month", () => {
    expect(formatListingDate("2026-10-31", null, "2026. 10. 31.", now)).toBe("október 31.")
    expect(formatListingDate("2027-01-23", null, "2027. 01. 23.", now)).toBe("2027. január 23.")
  })

  it("merges a range within one month and keeps longer ranges readable", () => {
    expect(formatListingDate("2027-07-08", "2027-07-11", "", now)).toBe("2027. július 8–11.")
    expect(formatListingDate("2027-04-01", "2027-10-31", "", now)).toBe("2027. április 1. – október 31.")
  })

  it("falls back to the captain's text without a date", () => {
    expect(formatListingDate(null, null, "Egész szezon", now)).toBe("Egész szezon")
  })
})
