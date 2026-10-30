import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { CaptainHome } from "./captain-home"
import type { CaptainHomeData, HomeEvent } from "./use-captain-home-data"

// A vi.mock a fájl elejére emelkedik; az adatot vi.hoisted-del tesszük elérhetővé neki.
const mockState = vi.hoisted(() => ({ data: null as CaptainHomeData | null }))

vi.mock("@/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ status: "ready", user: { id: "captain" }, session: null }),
}))
vi.mock("@/components/captain-boats-provider", () => ({
  useCaptainBoats: () => ({ status: "ready", firstName: "Dani", boats: [{ id: "boat-1", name: "Sirocco", imageUrl: "https://example.com/sirocco.jpg" }], ownerId: "captain" }),
}))
vi.mock("./captain-other-listings", () => ({ CaptainOtherListings: () => null }))

vi.mock("./use-captain-home-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-captain-home-data")>()),
  useCaptainHomeData: () => ({ status: "ready", data: mockState.data, retry: () => {} }),
}))

function inDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function event(overrides: Partial<HomeEvent>): HomeEvent {
  return {
    id: "event",
    title: "Esemény",
    type: "Verseny",
    startDate: inDays(6),
    endDate: null,
    location: "Balatonfüred",
    attendance: { confirmed: 0, declined: 0, unanswered: 0, total: 14 },
    confirmedPeople: [],
    linkedListing: null,
    ...overrides,
  }
}

// A jóváhagyott terv "forgalmas hajó" változata.
function busyBoat(): CaptainHomeData {
  return {
    boat: { id: "boat-1", name: "Sirocco", imageUrl: null, type: "70-es cirkáló", harbor: "Balatonfüred" },
    crewCount: 14,
    upcomingCount: 12,
    events: [
      event({
        id: "der",
        title: "Dér Kupa",
        endDate: inDays(7),
        location: "Balatonszemes",
        attendance: { confirmed: 9, declined: 2, unanswered: 3, total: 14 },
        confirmedPeople: Array.from({ length: 9 }, (_, index) => ({ id: `p${index}`, name: `Tag ${index}`, avatarUrl: null })),
        linkedListing: { id: "ad-der", pending: 4 },
      }),
      event({ id: "e2", title: "Évzáró edzés", type: "Edzés", startDate: inDays(21), attendance: { confirmed: 11, declined: 0, unanswered: 3, total: 14 } }),
      event({ id: "e3", title: "Szezonnyitó regatta", startDate: inDays(160) }),
    ],
    listings: [
      { id: "ad-kek", title: "Kékszalag 2027", expiryDate: inDays(250), pending: 5 },
      { id: "ad-der", title: "Dér Kupa – legénység", expiryDate: inDays(6), pending: 4 },
      { id: "ad-osz", title: "Őszi edzések", expiryDate: inDays(3), pending: 0 },
    ],
    todos: [
      { id: "a", tone: "attention", icon: "applicants", title: "9 új jelentkező vár elbírálásra", detail: "", actionLabel: "Elbírálás", href: "/kapitany-dashboard?jelentkezok=ad-kek", primary: true },
      { id: "b", tone: "attention", icon: "declined", title: "Bence nem jön: Dér Kupa", detail: "", actionLabel: "Hiányzó helyre hirdetek", href: "/x", primary: false },
      { id: "c", tone: "info", icon: "calendar", title: "3 csapattag még nem jelzett vissza", detail: "", actionLabel: "Résztvevők", href: "/x", primary: false },
      { id: "d", tone: "info", icon: "clock", title: "Egy hirdetésed 3 nap múlva lejár", detail: "", actionLabel: "Megnézem", href: "/x", primary: false },
      { id: "e", tone: "info", icon: "calendar", title: "Ötödik teendő", detail: "", actionLabel: "Megnézem", href: "/x", primary: false },
      { id: "f", tone: "info", icon: "calendar", title: "Hatodik teendő", detail: "", actionLabel: "Megnézem", href: "/x", primary: false },
    ],
    totalPending: 9,
    daysUntilNextRace: 6,
    onboarding: { invitedCrew: true, createdEvent: true, createdListing: true },
  }
}

describe("CaptainHome", () => {
  beforeEach(() => {
    mockState.data = busyBoat()
  })

  it("greets the captain and summarizes todos and the next race", () => {
    render(<CaptainHome />)

    expect(screen.getByRole("heading", { name: "Szia, Dani!" })).toBeInTheDocument()
    expect(screen.getByText("6 dolog vár a döntésedre, köztük 9 új jelentkező. A következő versenyig 6 nap van hátra.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Hirdetés feladása/ })).toHaveAttribute("href", "/kapitany-dashboard?hirdetes=uj")
  })

  it("shows the first four todos and reveals the rest on demand", () => {
    render(<CaptainHome />)

    expect(screen.getByText("Bence nem jön: Dér Kupa")).toBeInTheDocument()
    expect(screen.queryByText("Ötödik teendő")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /További 2 teendő/ }))

    expect(screen.getByText("Hatodik teendő")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Kevesebb/ })).toHaveAttribute("aria-expanded", "true")
  })

  it("shows attendance and the linked listing for the next event", () => {
    render(<CaptainHome />)

    expect(screen.getByText("9 / 14 fő jön")).toBeInTheDocument()
    expect(screen.getByText("2 nem jön · 3 nem válaszolt")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Részvétel: 9 jön, 2 nem jön, 3 nem válaszolt a 14 főből" })).toBeInTheDocument()
    // 7 avatar látszik, a maradék 2 egy "+2" jelzésben.
    expect(screen.getByText("+2")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Jelentkezők (4)" })).toHaveAttribute("href", "/kapitany-dashboard?jelentkezok=ad-der")
  })

  it("lists later events with the remaining count", () => {
    render(<CaptainHome />)

    expect(screen.getByText("11 / 14 jön")).toBeInTheDocument()
    expect(screen.getByText("Még nincs válasz")).toBeInTheDocument()
    // 12 közelgőből 1 fent, 2 a listában → 9 további.
    expect(screen.getByRole("link", { name: "További 9 esemény" })).toBeInTheDocument()
  })

  it("shows the boat stats and listings with pending counts", () => {
    render(<CaptainHome />)

    expect(screen.getByRole("heading", { name: "Sirocco" })).toBeInTheDocument()
    expect(screen.getByText("70-es cirkáló · Balatonfüred")).toBeInTheDocument()
    expect(screen.getByText("5 új")).toBeInTheDocument()
    expect(screen.getByText("Lejár 3 nap múlva")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Összes (3)" })).toHaveAttribute("href", "/kapitany-dashboard?ful=hirdetesek")
  })

  it("uses the captain's own boat photo behind the greeting", () => {
    const { container } = render(<CaptainHome />)

    expect(container.querySelector("section[aria-labelledby=\"captain-greeting\"] img")?.getAttribute("src")).toContain("sirocco.jpg")
  })

  it("guides a new captain with getting-started steps instead of an empty todo list", () => {
    mockState.data = {
      ...busyBoat(),
      events: [], listings: [], todos: [], totalPending: 0, upcomingCount: 0, daysUntilNextRace: null,
      onboarding: { invitedCrew: false, createdEvent: false, createdListing: false },
    }
    render(<CaptainHome />)

    expect(screen.getByRole("heading", { name: "Kezdő lépések" })).toBeInTheDocument()
    expect(screen.getByText("1 / 4 kész")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Meghívás" })).toHaveAttribute("href", "/kapitany-dashboard?meghivas=uj")
    expect(screen.queryByRole("heading", { name: /Teendők/ })).not.toBeInTheDocument()
  })

  it("handles a quiet boat without events, listings or todos", () => {
    mockState.data = { ...busyBoat(), events: [], listings: [], todos: [], totalPending: 0, upcomingCount: 0, daysUntilNextRace: null }
    render(<CaptainHome />)

    expect(screen.getByText("Minden rendben, most nincs döntésre váró teendőd.")).toBeInTheDocument()
    expect(screen.getByText("Nincs döntésre váró teendőd.")).toBeInTheDocument()
    expect(screen.getByText("Még nincs közelgő eseményed")).toBeInTheDocument()
    expect(screen.getByText(/Nincs aktív hirdetésed/)).toBeInTheDocument()
  })
})
