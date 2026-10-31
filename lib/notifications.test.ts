import { describe, expect, it } from "vitest"
import { buildCrewNotifications, buildNotifications, formatRelativeTime, mergeNotifications, type RawNotificationData } from "./notifications"
import { selectRecipientIds } from "./event-message"

const HOUR = 3_600_000
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()

function raw(overrides: Partial<RawNotificationData> = {}): RawNotificationData {
  return {
    captainId: "captain",
    events: [{ id: "der", title: "Dér Kupa" }],
    ads: [{ id: "kek", title: "Kékszalag 2027" }],
    attendees: [],
    applications: [],
    joined: [],
    profiles: [
      { id: "gabor", full_name: "Gábor" },
      { id: "anna", full_name: "Anna" },
      { id: "peter", full_name: "Kovács Péter" },
    ],
    seenAt: null,
    ...overrides,
  }
}

describe("buildNotifications", () => {
  it("lists answers, applications and new members newest first, without the captain", () => {
    const items = buildNotifications(raw({
      attendees: [
        { event_id: "der", user_id: "gabor", status: "confirmed", updated_at: ago(2) },
        { event_id: "der", user_id: "captain", status: "confirmed", updated_at: ago(1) },
        { event_id: "der", user_id: "anna", status: "pending", updated_at: ago(1) },
      ],
      applications: [{ ad_id: "kek", user_id: "anna", created_at: ago(5) }],
      joined: [{ user_id: "peter", display_name: null, accepted_at: ago(30) }],
    }))

    expect(items.map((item) => `${item.actor} ${item.headline} | ${item.subject}`)).toEqual([
      "Gábor jön | Dér Kupa",
      "Anna jelentkezett | Kékszalag 2027 hirdetés",
      "Kovács Péter csatlakozott a csapatodhoz | ",
    ])
    expect(items[0].href).toBe("/kapitany-dashboard?esemeny=der")
  })

  it("marks only what happened after the last look as unread", () => {
    const items = buildNotifications(raw({
      attendees: [
        { event_id: "der", user_id: "gabor", status: "declined", updated_at: ago(1) },
        { event_id: "der", user_id: "anna", status: "confirmed", updated_at: ago(10) },
      ],
      seenAt: ago(5),
    }))
    expect(items.map((item) => [item.actor, item.headline, item.unread])).toEqual([
      ["Gábor", "nem jön", true],
      ["Anna", "jön", false],
    ])
  })

  it("formats relative times in Hungarian", () => {
    const now = Date.now()
    expect(formatRelativeTime(new Date(now - 20_000).toISOString(), now)).toBe("most")
    expect(formatRelativeTime(new Date(now - 3 * HOUR).toISOString(), now)).toBe("3 órája")
    expect(formatRelativeTime(new Date(now - 30 * HOUR).toISOString(), now)).toBe("tegnap")
    expect(formatRelativeTime(new Date(now - 72 * HOUR).toISOString(), now)).toBe("3 napja")
  })
})

describe("buildCrewNotifications", () => {
  const since = ago(14 * 24)
  const base = { events: [], answers: new Map<string, string>(), decisions: [], invitations: [], notices: [], since, crewHref: "/" }

  it("announces new events, edits of events I go to, decisions and invitations", () => {
    const items = mergeNotifications(buildCrewNotifications({
      ...base,
      events: [
        { id: "mikulas", title: "Mikulás Kupa", boat_name: "Pogácsa", start_date: "2026-12-05", created_at: ago(3), updated_at: ago(3) },
        { id: "szereles", title: "Hajószerelés", boat_name: "Sirocco", start_date: "2026-11-02", created_at: ago(400), updated_at: ago(2) },
        { id: "grill", title: "Grillezés", boat_name: "Sirocco", start_date: "2026-11-21", created_at: ago(400), updated_at: ago(1) },
      ],
      answers: new Map([["szereles", "confirmed"], ["grill", "declined"]]),
      decisions: [{ ad_title: "Őszi túra", boat_name: "Nemere", status: "accepted", decided_at: ago(5) }],
      invitations: [{ token: "t1", inviterName: "Gábor", boatName: "Avalon", createdAt: ago(10) }],
    }), ago(4))

    expect(items.map((item) => [`${item.actor} ${item.headline}`, item.unread])).toEqual([
      ["Sirocco módosított egy eseményt", true],
      ["Pogácsa új eseményt vett fel", true],
      ["Elfogadták a jelentkezésedet", false],
      ["Gábor meghívott az Avalon csapatába", false],
    ])
  })

  it("ignores events created long ago and never edited, and decisions outside the window", () => {
    const items = buildCrewNotifications({
      ...base,
      events: [{ id: "old", title: "Régi", boat_name: "Sirocco", start_date: "2026-12-01", created_at: ago(400), updated_at: ago(400) }],
      decisions: [{ ad_title: "Régi", boat_name: null, status: "rejected", decided_at: ago(400) }],
    })
    expect(items).toEqual([])
  })
})

describe("crew notices", () => {
  it("tells about cancelled events and being removed from a team", () => {
    const items = mergeNotifications(buildCrewNotifications({
      events: [], answers: new Map(), decisions: [], invitations: [], since: ago(14 * 24), crewHref: "/",
      notices: [
        { id: "n1", kind: "event-cancelled", boat_name: "Sirocco", title: "Grillezés", event_date: "2026-11-21", created_at: ago(1) },
        { id: "n2", kind: "team-removed", boat_name: "Avalon", title: null, event_date: null, created_at: ago(2) },
        { id: "n3", kind: "team-removed", boat_name: "Régi", title: null, event_date: null, created_at: ago(400) },
      ],
    }), null)
    expect(items.map((item) => `${item.actor} ${item.headline} | ${item.subject}`)).toEqual([
      "Sirocco lemondott egy eseményt | Grillezés · november 21.",
      "Kikerültél az Avalon csapatából | ",
    ])
  })
})

describe("selectRecipientIds", () => {
  const input = {
    teamUserIds: ["captain", "gabor", "reka", "mate"],
    attendees: [
      { user_id: "captain", status: "confirmed" },
      { user_id: "gabor", status: "confirmed" },
      { user_id: "reka", status: "declined" },
      { user_id: "anna", status: "confirmed" },
    ],
    captainId: "captain",
  }

  it("picks the chosen groups and never the captain", () => {
    expect(selectRecipientIds({ ...input, groups: ["confirmed"] }).sort()).toEqual(["anna", "gabor"])
    expect(selectRecipientIds({ ...input, groups: ["unanswered"] })).toEqual(["mate"])
    expect(selectRecipientIds({ ...input, groups: ["declined", "unanswered"] }).sort()).toEqual(["mate", "reka"])
  })
})
