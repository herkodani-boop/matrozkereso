import { describe, expect, it } from "vitest"

import { crewRoleLabel, normalizeCrewRole, normalizeCrewRoles } from "./crew-roles"

describe("normalizeCrewRole", () => {
  it("maps known keys, accents and legacy values to canonical keys", () => {
    expect(normalizeCrewRole("Kormányos")).toBe("kormanyos")
    expect(normalizeCrewRole("main trim")).toBe("main-trim")
    expect(normalizeCrewRole("Foredeck")).toBe("fordeck")
    expect(normalizeCrewRole("barmilyen")).toBe("mancsaft")
  })

  it("keeps custom role names as written and drops empty values", () => {
    expect(normalizeCrewRole("  fotós ")).toBe("fotós")
    expect(normalizeCrewRole("")).toBeNull()
    expect(normalizeCrewRole(null)).toBeNull()
  })
})

describe("crewRoleLabel", () => {
  it("returns plain Hungarian labels", () => {
    expect(crewRoleLabel("main-trim")).toBe("Nagyvitorla-kezelő")
    expect(crewRoleLabel("fordeck")).toBe("Orrban")
    expect(crewRoleLabel("mancsaft")).toBe("Segítő legénység")
    expect(crewRoleLabel("fotós")).toBe("fotós")
    expect(crewRoleLabel(null)).toBe("Segítő legénység")
  })
})

describe("normalizeCrewRoles", () => {
  it("dedupes after normalizing", () => {
    expect(normalizeCrewRoles(["barmilyen", "mancsaft", "foredeck", "", "fotós"])).toEqual(["mancsaft", "fordeck", "fotós"])
    expect(normalizeCrewRoles(null)).toEqual([])
  })
})
