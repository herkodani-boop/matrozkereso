import { describe, expect, it, vi } from "vitest"
import { buildCaptainHome, type RawCaptainHome } from "./use-captain-home-data"

vi.mock("@/lib/supabase", () => ({ supabase: {} }))

const DAY = 86_400_000

function inDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * DAY).toISOString()
}

function raw(overrides: Partial<RawCaptainHome> = {}): RawCaptainHome {
  return {
    boat: { id: "boat", name: "Sirocco", image_url: "/small.jpg", original_image_url: "/big.jpg", type: "70-es cirkáló", harbor: "Balatonfüred" },
    team: [
      { user_id: "bence", status: "active" },
      { user_id: "reka", status: "active" },
      { user_id: "mate", status: "invited", invited_at: daysAgoIso(2) },
      // E-mailben meghívott, még fiók nélkül: nem számít a résztvevők közé.
      { user_id: null, status: "invited", email: "uj@example.com", invited_at: daysAgoIso(1) },
    ],
    events: [
      { id: "der", title: "Dér Kupa", type: "Verseny", start_date: inDays(6), end_date: inDays(7), location: "Balatonszemes" },
    ],
    upcomingCount: 1,
    ads: [],
    attendees: [],
    applications: [],
    profiles: [
      { id: "captain", full_name: "Dani", avatar_url: null },
      { id: "bence", full_name: "Bence", avatar_url: "/bence.jpg" },
      { id: "reka", full_name: "Réka", avatar_url: null },
      { id: "mate", full_name: "Máté", avatar_url: null },
      { id: "applicant", full_name: "Anna", avatar_url: null },
    ],
    hasAnyEvent: false,
    hasAnyListing: false,
    ...overrides,
  }
}

const withCapacity = (maxCrew: number) => ({ ...raw().boat, max_crew_size: maxCrew })

describe("buildCaptainHome", () => {
  it("counts attendance like the dashboard roster: team members plus other attendees", () => {
    const home = buildCaptainHome(raw({
      attendees: [
        { event_id: "der", user_id: "captain", status: "confirmed", updated_at: daysAgoIso(20) },
        { event_id: "der", user_id: "applicant", status: "confirmed", updated_at: daysAgoIso(20) },
        { event_id: "der", user_id: "reka", status: "declined", updated_at: daysAgoIso(20) },
      ],
    }), "captain")

    // csapat (bence, reka, mate) + kapitány + jelentkező = 5 fő
    expect(home.events[0].attendance).toEqual({ confirmed: 2, declined: 1, unanswered: 2, total: 5 })
    expect(home.events[0].confirmedPeople.map((person) => person.name)).toEqual(["Dani", "Anna"])
    expect(home.crewCount).toBe(2)
    expect(home.boat.imageUrl).toBe("/big.jpg")
  })

  it("flags a race where fewer than half of the boat's places are confirmed", () => {
    const home = buildCaptainHome(raw({
      boat: withCapacity(6),
      attendees: [
        { event_id: "der", user_id: "captain", status: "confirmed", updated_at: daysAgoIso(3) },
        { event_id: "der", user_id: "bence", status: "confirmed", updated_at: daysAgoIso(2) },
      ],
    }), "captain")

    expect(home.todos.find((todo) => todo.icon === "shortfall")).toMatchObject({
      title: "Dér Kupa: eddig 2 fő jelezte, hogy jön",
      detail: "6 nap múlva · 6 fős hajó · 2 még nem válaszolt",
      actionLabel: "Hirdetés feladása",
      href: "/kapitany-dashboard?hirdetes-esemenyre=der",
    })
  })

  it("stays quiet at half capacity, for non-race events, with a listing or without capacity", () => {
    const halfFull = buildCaptainHome(raw({
      boat: withCapacity(6),
      attendees: ["captain", "bence", "reka"].map((user_id) => ({ event_id: "der", user_id, status: "confirmed", updated_at: daysAgoIso(1) })),
    }), "captain")
    expect(halfFull.todos.some((todo) => todo.icon === "shortfall")).toBe(false)

    const maintenance = buildCaptainHome(raw({
      boat: withCapacity(10),
      events: [{ id: "fix", title: "Hajószerelés", type: "Egyéb", start_date: inDays(8), end_date: null, location: "Balatonalmádi" }],
    }), "captain")
    expect(maintenance.todos.some((todo) => todo.icon === "shortfall")).toBe(false)

    const advertised = buildCaptainHome(raw({
      boat: withCapacity(10),
      ads: [{ id: "der-ad", title: "Dér Kupa legénység", commitment: "egy-verseny", start_date: inDays(6), end_date: null, event_id: "der" }],
    }), "captain")
    expect(advertised.todos.some((todo) => todo.icon === "shortfall")).toBe(false)

    const unknown = buildCaptainHome(raw(), "captain")
    expect(unknown.todos.some((todo) => todo.icon === "shortfall")).toBe(false)
  })

  it("names who has not answered, only for events within a week", () => {
    const home = buildCaptainHome(raw({
      events: [
        { id: "soon", title: "Dér Kupa", type: "Verseny", start_date: inDays(6), end_date: null, location: "Balatonszemes" },
        { id: "later", title: "Tavaszi regatta", type: "Verseny", start_date: inDays(10), end_date: null, location: "Tihany" },
      ],
      upcomingCount: 2,
      attendees: [{ event_id: "soon", user_id: "bence", status: "confirmed", updated_at: daysAgoIso(1) }],
    }), "captain")

    const unanswered = home.todos.filter((todo) => todo.icon === "calendar")
    expect(unanswered).toHaveLength(1)
    expect(unanswered[0]).toMatchObject({
      title: "Réka és Máté még nem jelzett vissza",
      detail: "Dér Kupa · 6 nap múlva",
      href: "/kapitany-dashboard?esemeny=soon",
    })
  })

  it("counts pending applicants only on listings that are still visible", () => {
    const home = buildCaptainHome(raw({
      events: [],
      upcomingCount: 0,
      ads: [
        { id: "kek", title: "Kékszalag", commitment: "egy-verseny", start_date: inDays(200), end_date: null, event_id: null },
        { id: "der-ad", title: "Dér Kupa legénység", commitment: "egy-verseny", start_date: inDays(6), end_date: null, event_id: "der" },
        { id: "expired", title: "Régi", commitment: "egy-verseny", start_date: inDays(-3), end_date: null, event_id: null },
      ],
      applications: [
        { ad_id: "der-ad", user_id: "a1", status: "pending" },
        { ad_id: "kek", user_id: "a2", status: "pending" }, { ad_id: "kek", user_id: "a3", status: "pending" }, { ad_id: "kek", user_id: "a4", status: "pending" },
        { ad_id: "kek", user_id: "a5", status: "accepted" },
        { ad_id: "expired", user_id: "a6", status: "pending" },
      ],
    }), "captain")

    expect(home.totalPending).toBe(4)
    expect(home.listings.map((listing) => [listing.id, listing.pending])).toEqual([["kek", 3], ["der-ad", 1]])
    expect(home.todos[0]).toMatchObject({
      title: "4 új jelentkező vár elbírálásra",
      detail: "Kékszalag (3) · Dér Kupa legénység (1)",
      href: "/kapitany-dashboard?jelentkezok=kek",
      primary: true,
    })
  })

  it("reminds about accepted applicants who are not on the event yet", () => {
    const home = buildCaptainHome(raw({
      ads: [{ id: "der-ad", title: "Dér Kupa legénység", commitment: "egy-verseny", start_date: inDays(6), end_date: null, event_id: "der" }],
      applications: [
        { ad_id: "der-ad", user_id: "applicant", status: "accepted" },
        { ad_id: "der-ad", user_id: "added", status: "accepted" },
      ],
      attendees: [{ event_id: "der", user_id: "added", status: "confirmed", updated_at: daysAgoIso(1) }],
    }), "captain")

    expect(home.todos.find((todo) => todo.icon === "accepted")).toMatchObject({
      title: "Anna elfogadva, de még nincs a résztvevők között",
      actionLabel: "Hozzáadás az eseményhez",
      href: "/kapitany-dashboard?jelentkezok=der-ad",
    })
  })

  it("flags team invitations pending for over a week, but not fresh ones", () => {
    const home = buildCaptainHome(raw({
      team: [
        { user_id: "bence", status: "active" },
        { user_id: null, status: "invited", display_name: "Kovács Péter", email: "peter@example.com", invited_at: daysAgoIso(9) },
        { user_id: null, status: "invited", email: "friss@example.com", invited_at: daysAgoIso(2) },
      ],
    }), "captain")

    const invites = home.todos.filter((todo) => todo.icon === "invite")
    expect(invites).toEqual([expect.objectContaining({ title: "Kovács Péter 9 napja nem fogadta el a meghívódat", href: "/kapitany-dashboard?ful=csapat" })])
  })

  it("no longer lists expiring listings as todos", () => {
    const home = buildCaptainHome(raw({
      events: [],
      upcomingCount: 0,
      ads: [{ id: "soon", title: "Őszi edzések", commitment: "szezon", start_date: inDays(-60), end_date: inDays(2), event_id: null }],
    }), "captain")

    expect(home.todos).toEqual([])
  })

  it("tracks onboarding steps, counting past events and closed listings too", () => {
    const fresh = buildCaptainHome(raw({ team: [], events: [], upcomingCount: 0 }), "captain")
    expect(fresh.onboarding).toEqual({ invitedCrew: false, createdEvent: false, createdListing: false })

    const seasoned = buildCaptainHome(raw({ events: [], upcomingCount: 0, hasAnyEvent: true, hasAnyListing: true }), "captain")
    expect(seasoned.onboarding).toEqual({ invitedCrew: true, createdEvent: true, createdListing: true })
  })

  it("orders todos by how soon they matter and highlights only the first", () => {
    const home = buildCaptainHome(raw({
      boat: withCapacity(8),
      events: [
        { id: "training", title: "Edzés", type: "Edzés", start_date: inDays(2), end_date: null, location: "Balatonfüred" },
        { id: "der", title: "Dér Kupa", type: "Verseny", start_date: inDays(6), end_date: null, location: "Balatonszemes" },
      ],
      upcomingCount: 2,
      // A jelentkezők egy távoli hirdetésre jöttek: a közeli hiányok megelőzik őket.
      ads: [{ id: "far", title: "Kékszalag", commitment: "egy-verseny", start_date: inDays(200), end_date: null, event_id: null }],
      applications: [{ ad_id: "far", user_id: "x", status: "pending" }],
    }), "captain")

    expect(home.todos.map((todo) => todo.id)).toEqual([
      "unanswered-training", "shortfall-der", "unanswered-der", "applicants",
    ])
    expect(home.todos.map((todo) => todo.primary)).toEqual([true, false, false, false])
  })
})
