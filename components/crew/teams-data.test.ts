import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabase: {} }))

import { attendance, eventDays, findClashes, monthGrid, myAnswer, orderTeams, type TeamEvent, type TeamMember, type TeamView } from "./teams-data"

const member = (id: string, isCaptain = false): TeamMember => ({ id, name: id, avatarUrl: null, phone: null, email: null, role: null, isCaptain })

const event = (id: string, startDate: string, answers: Record<string, string> = {}, endDate: string | null = null): TeamEvent => ({
  id, title: id, type: "", startDate, endDate, location: "", note: "", answers,
})

const team = (boatId: string, events: TeamEvent[], own = false): Omit<TeamView, "color"> => ({
  boatId, name: boatId, type: "", harbor: "", imageUrl: null, own, memberSince: null, captainId: "cap", members: [member("cap", true), member("me")], events,
})

describe("monthGrid", () => {
  it("starts on Monday and fills whole weeks (2026 November starts on a Sunday)", () => {
    const grid = monthGrid(2026, 10)
    expect(grid).toHaveLength(42)
    expect(grid[0]).toEqual({ key: "2026-10-26", day: 26, inMonth: false })
    expect(grid[6]).toEqual({ key: "2026-11-01", day: 1, inMonth: true })
    expect(grid[41]).toEqual({ key: "2026-12-06", day: 6, inMonth: false })
  })
})

describe("eventDays", () => {
  it("lists every day of a multi-day event across a month boundary", () => {
    expect(eventDays("2026-11-30", "2026-12-02")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"])
    expect(eventDays("2026-12-05", null)).toEqual(["2026-12-05"])
  })
})

describe("attendance", () => {
  it("counts members without an answer as unanswered", () => {
    const result = attendance(event("e", "2026-11-07", { cap: "confirmed", guest: "confirmed", me: "declined" }), [member("cap", true), member("me"), member("anna")])
    expect(result).toEqual({ confirmed: ["cap", "guest"], declined: ["me"], unanswered: ["anna"] })
  })
})

describe("findClashes", () => {
  it("flags days where two different teams have events I have not declined", () => {
    const teams = orderTeams([
      team("Sirocco", [event("szereles", "2026-11-14"), event("grill", "2026-11-21", { me: "declined" })]),
      team("Nemere", [event("edzes", "2026-11-14", { me: "confirmed" }), event("vacsora", "2026-11-21")]),
    ])
    const clashes = findClashes(teams, "me", "2026-10-31")
    expect(clashes.map((clash) => [clash.day, clash.items.map((item) => item.event.id)])).toEqual([["2026-11-14", ["edzes", "szereles"]]])
  })
})

describe("orderTeams and myAnswer", () => {
  it("puts my own boat first and colors the rest like the home page", () => {
    const ordered = orderTeams([team("Sirocco", []), team("Pogácsa", [], true), team("Nemere", [])])
    expect(ordered.map((item) => [item.name, item.color])).toEqual([["Pogácsa", "#e8833a"], ["Nemere", "#0e3f57"], ["Sirocco", "#3e8fa8"]])
  })

  it("treats pending and unset as not answered yet", () => {
    expect(myAnswer(event("e", "2026-11-07", { me: "pending" }), "me")).toBe("open")
    expect(myAnswer(event("e", "2026-11-07", { me: "confirmed" }), "me")).toBe("confirmed")
  })
})
