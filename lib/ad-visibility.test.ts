import { describe, expect, it } from "vitest"
import { isAdVisibleByDate } from "@/lib/ad-visibility"

describe("isAdVisibleByDate", () => {
  it("shows a single-event listing while today is on or before the start date", () => {
    expect(
      isAdVisibleByDate(
        { commitment: "egy-verseny", start_date: "2026-10-01" },
        new Date("2026-09-29T12:00:00"),
      ),
    ).toBe(true)
  })

  it("hides a single-event listing once today is after the start date", () => {
    expect(
      isAdVisibleByDate(
        { commitment: "egy-verseny", start_date: "2026-09-01" },
        new Date("2026-09-29T12:00:00"),
      ),
    ).toBe(false)
  })

  it("shows a season listing while today is on or before the end date", () => {
    expect(
      isAdVisibleByDate(
        { commitment: "szezon", end_date: "2026-10-31" },
        new Date("2026-09-29T12:00:00"),
      ),
    ).toBe(true)
  })

  it("hides a season listing once today is after the end date", () => {
    expect(
      isAdVisibleByDate(
        { commitment: "szezon", end_date: "2026-09-01" },
        new Date("2026-09-29T12:00:00"),
      ),
    ).toBe(false)
  })

  it("defaults to visible when dates are missing or commitment is unknown", () => {
    expect(isAdVisibleByDate({ commitment: "egy-verseny" })).toBe(true)
    expect(isAdVisibleByDate({ commitment: "szezon" })).toBe(true)
    expect(isAdVisibleByDate({ commitment: "ismeretlen" })).toBe(true)
  })
})
