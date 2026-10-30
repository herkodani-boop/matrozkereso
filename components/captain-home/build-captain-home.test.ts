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
      { user_id: "mate", status: "invited" },
      // E-mailben meghívott, még fiók nélkül: nem számít a résztvevők közé.
      { user_id: null, status: "invited" },
    ],
    events: [
      { id: "der", title: "Dér Kupa", type: "Verseny", start_date: inDays(6), end_date: inDays(7), location: "Balatonszemes" },
    ],
    upcomingCount: 1,
    ads: [],
    attendees: [],
    pendingApplications: [],
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

  it("reports a recent decline with a shortcut to advertise the empty spot", () => {
    const home = buildCaptainHome(raw({
      attendees: [{ event_id: "der", user_id: "bence", status: "declined", updated_at: daysAgoIso(2) }],
    }), "captain")

    const decline = home.todos.find((todo) => todo.icon === "declined")
    expect(decline).toMatchObject({
      title: "Bence nem jön: Dér Kupa",
      actionLabel: "Hiányzó helyre hirdetek",
      href: "/kapitany-dashboard?hirdetes-esemenyre=der",
    })
  })

  it("ignores old declines and the captain's own decline", () => {
    const home = buildCaptainHome(raw({
      attendees: [
        { event_id: "der", user_id: "bence", status: "declined", updated_at: daysAgoIso(10) },
        { event_id: "der", user_id: "captain", status: "declined", updated_at: daysAgoIso(1) },
      ],
    }), "captain")

    expect(home.todos.some((todo) => todo.icon === "declined")).toBe(false)
  })

  it("asks for missing answers only for events in the next two weeks", () => {
    const home = buildCaptainHome(raw({
      events: [
        { id: "soon", title: "Dér Kupa", type: "Verseny", start_date: inDays(6), end_date: null, location: "Balatonszemes" },
        { id: "later", title: "Tavaszi regatta", type: "Verseny", start_date: inDays(40), end_date: null, location: "Tihany" },
      ],
      upcomingCount: 2,
    }), "captain")

    const unanswered = home.todos.filter((todo) => todo.icon === "calendar")
    expect(unanswered).toHaveLength(1)
    expect(unanswered[0]).toMatchObject({ title: "3 csapattag még nem jelzett vissza", href: "/kapitany-dashboard?esemeny=soon" })
  })

  it("counts pending applicants only on listings that are still visible", () => {
    const home = buildCaptainHome(raw({
      ads: [
        { id: "kek", title: "Kékszalag", commitment: "egy-verseny", start_date: inDays(200), end_date: null, event_id: null },
        { id: "der-ad", title: "Dér Kupa legénység", commitment: "egy-verseny", start_date: inDays(6), end_date: null, event_id: "der" },
        { id: "expired", title: "Régi", commitment: "egy-verseny", start_date: inDays(-3), end_date: null, event_id: null },
      ],
      pendingApplications: [
        { ad_id: "der-ad" },
        { ad_id: "kek" }, { ad_id: "kek" }, { ad_id: "kek" },
        { ad_id: "expired" },
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
    // Az eseményhez kötött hirdetés megjelenik az esemény kártyáján.
    expect(home.events[0].linkedListing).toEqual({ id: "der-ad", pending: 1 })
  })

  it("warns about listings expiring within three days", () => {
    const home = buildCaptainHome(raw({
      ads: [
        { id: "soon", title: "Őszi edzések", commitment: "szezon", start_date: inDays(-60), end_date: inDays(2), event_id: null },
        { id: "far", title: "Szezon 2027", commitment: "szezon", start_date: inDays(-60), end_date: inDays(100), event_id: null },
      ],
    }), "captain")

    const expiring = home.todos.filter((todo) => todo.icon === "clock")
    expect(expiring).toEqual([expect.objectContaining({ title: "Egy hirdetésed 2 nap múlva lejár", detail: "Őszi edzések" })])
  })

  it("tracks onboarding steps, counting past events and closed listings too", () => {
    const fresh = buildCaptainHome(raw({ team: [], events: [], upcomingCount: 0 }), "captain")
    expect(fresh.onboarding).toEqual({ invitedCrew: false, createdEvent: false, createdListing: false })

    const seasoned = buildCaptainHome(raw({ events: [], upcomingCount: 0, hasAnyEvent: true, hasAnyListing: true }), "captain")
    expect(seasoned.onboarding).toEqual({ invitedCrew: true, createdEvent: true, createdListing: true })
  })

  it("orders todos by urgency and finds the next race, skipping trainings", () => {
    const home = buildCaptainHome(raw({
      events: [
        { id: "training", title: "Edzés", type: "Edzés", start_date: inDays(2), end_date: null, location: "Balatonfüred" },
        { id: "der", title: "Dér Kupa", type: "Verseny", start_date: inDays(6), end_date: null, location: "Balatonszemes" },
      ],
      upcomingCount: 2,
      ads: [{ id: "ad", title: "Őszi edzések", commitment: "szezon", start_date: inDays(-10), end_date: inDays(1), event_id: null }],
      pendingApplications: [{ ad_id: "ad" }],
      attendees: [{ event_id: "der", user_id: "bence", status: "declined", updated_at: daysAgoIso(1) }],
    }), "captain")

    expect(home.todos.map((todo) => todo.icon)).toEqual(["applicants", "declined", "calendar", "calendar", "clock"])
    expect(home.daysUntilNextRace).toBe(6)
  })
})
