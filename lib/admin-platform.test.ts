import { describe, expect, it } from "vitest"
import {
  cleanAdminSearch,
  isAdminCategory,
  pickEditableFields,
} from "./admin-platform"

describe("admin platform request validation", () => {
  it("accepts only configured categories", () => {
    expect(isAdminCategory("users")).toBe(true)
    expect(isAdminCategory("reports")).toBe(false)
    expect(isAdminCategory(null)).toBe(false)
  })

  it("removes characters that could alter the PostgREST search expression", () => {
    expect(cleanAdminSearch("Kovács, (Péter)%")).toBe("Kovács Péter")
  })

  it("allows only correctly typed editable fields", () => {
    expect(pickEditableFields("events", { is_one_day: true, title: "Verseny" })).toEqual({
      is_one_day: true,
      title: "Verseny",
    })
    expect(pickEditableFields("events", { is_deleted: true })).toBeNull()
    expect(pickEditableFields("events", { is_one_day: "true" })).toBeNull()
    expect(pickEditableFields("boats", { max_crew_size: 0 })).toBeNull()
    expect(pickEditableFields("listings", { positions: ["kormanyos"] })).toEqual({
      positions: ["kormanyos"],
    })
  })
})
