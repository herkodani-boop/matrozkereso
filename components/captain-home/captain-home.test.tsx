import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { CaptainHome } from "./captain-home"
import type { CaptainHomeData, HomeEvent } from "./use-captain-home-data"

// A vi.mock a fájl elejére emelkedik; az adatot vi.hoisted-del tesszük elérhetővé neki.
const mockState = vi.hoisted(() => ({
  data: null as CaptainHomeData | null,
  going: [] as { id: string; title: string; boatName: string; startDate: string }[],
  awaiting: [] as { id: string }[],
}))

vi.mock("@/lib/supabase", () => ({ supabase: {} }))
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ status: "ready", user: { id: "captain" }, session: null }),
}))
vi.mock("@/components/captain-boats-provider", () => ({
  useCaptainBoats: () => ({ status: "ready", firstName: "Dani", boats: [{ id: "boat-1", name: "Sirocco", imageUrl: "https://example.com/sirocco.jpg" }], ownerId: "captain" }),
}))
vi.mock("@/components/crew/open-listings", () => ({ OpenListings: () => null }))
vi.mock("@/components/crew/crew-data", () => ({ useProfileGaps: () => null }))
vi.mock("@/components/crew/crew-overview", () => ({
  CrewOverview: () => null,
  useCrewOverviewData: () => ({ going: mockState.going, awaiting: mockState.awaiting, loading: false, empty: true }),
}))
vi.mock("./event-extras", () => ({ EventWeatherPanel: () => null, EventMessageButton: () => null }))

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
    note: "",
    audience: { confirmed: 0, unanswered: 0, declined: 0 },
    attendance: { confirmed: 0, declined: 0, unanswered: 0, total: 14 },
    confirmedPeople: [],
    linkedListing: null,
    ...overrides,
  }
}

// A jóváhagyott terv "forgalmas hajó" változata.
function busyBoat(): CaptainHomeData {
  return {
    boat: { id: "boat-1", name: "Sirocco", imageUrl: null, type: "70-es cirkáló", harbor: "Balatonfüred", maxCrew: 6 },
    crewCount: 14,
    crew: Array.from({ length: 14 }, (_, index) => ({ id: `c${index}`, name: `Tag ${index}`, avatarUrl: null })),
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
      { id: "b", tone: "attention", icon: "shortfall", title: "2 ember hiányzik: Dér Kupa", detail: "", actionLabel: "Hiányzó helyre hirdetek", href: "/x", primary: false },
      { id: "c", tone: "info", icon: "calendar", title: "3 csapattag még nem jelzett vissza", detail: "", actionLabel: "Résztvevők", href: "/x", primary: false },
      { id: "d", tone: "info", icon: "invite", title: "Egy hirdetésed 3 nap múlva lejár", detail: "", actionLabel: "Meghívó újraküldése", href: "/x", primary: false },
      { id: "e", tone: "info", icon: "calendar", title: "Ötödik teendő", detail: "", actionLabel: "Megnézem", href: "/x", primary: false },
      { id: "f", tone: "info", icon: "calendar", title: "Hatodik teendő", detail: "", actionLabel: "Megnézem", href: "/x", primary: false },
    ],
    totalPending: 9,
    onboarding: { invitedCrew: true, createdEvent: true, createdListing: true },
  }
}

describe("CaptainHome", () => {
  beforeEach(() => {
    mockState.data = busyBoat()
    mockState.going = []
    mockState.awaiting = []
  })

  it("greets the captain and summarizes todos and the next event", () => {
    render(<CaptainHome />)

    expect(screen.getByRole("heading", { name: "Szia, Dani!" })).toBeInTheDocument()
    expect(screen.getByText("6 teendőd van, köztük 9 új jelentkező. A következő esemény 6 nap múlva: Dér Kupa.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Hirdetés feladása/ })).toHaveAttribute("href", "/kapitany-dashboard?hirdetes=uj")
  })

  it("shows the first four todos and reveals the rest on demand", () => {
    render(<CaptainHome />)

    expect(screen.getByText("2 ember hiányzik: Dér Kupa")).toBeInTheDocument()
    expect(screen.queryByText("Ötödik teendő")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /További 2 teendő/ }))

    expect(screen.getByText("Hatodik teendő")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Kevesebb/ })).toHaveAttribute("aria-expanded", "true")
  })

  it("shows attendance and the linked listing for the next event", () => {
    render(<CaptainHome />)

    // A 6 fős hajóra 9-en jönnek: ez nem hiba, csak jelezzük.
    expect(screen.getByText("9 fő jön · 6 fős hajó")).toBeInTheDocument()
    expect(screen.getByText("2 nem jön · 3 nem válaszolt")).toBeInTheDocument()
    expect(screen.getByText("3 fővel többen jönnek, mint a hajó létszáma")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "9 fő jön a 6 fős hajóra, 3 még nem válaszolt" })).toBeInTheDocument()
    // 7 avatar látszik, a maradék 2 egy "+2" jelzésben.
    expect(screen.getByText("+2")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "4 új jelentkező" })).toHaveAttribute("href", "/kapitany-dashboard?jelentkezok=ad-der")
  })

  it("lists later events with the remaining count", () => {
    render(<CaptainHome />)

    // Edzésnél nem a hajó létszámához mérünk, csak azt mutatjuk, hányan jönnek.
    expect(screen.getByText("11 fő jön")).toBeInTheDocument()
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

  it("shows the boat photo only once, on the boat card", () => {
    const { container } = render(<CaptainHome />)

    expect(container.querySelector("section[aria-labelledby=\"captain-greeting\"] img")?.getAttribute("src")).toContain("hero-balaton")
  })

  it("offers a listing for the next event only while the boat is not full", () => {
    const data = busyBoat()
    const withoutListing = { ...data.events[0], linkedListing: null }
    mockState.data = { ...data, boat: { ...data.boat, maxCrew: 12 }, events: [withoutListing, ...data.events.slice(1)] }
    const { unmount } = render(<CaptainHome />)
    const nextEvent = () => within(screen.getByRole("region", { name: "Következő esemény" }))
    expect(nextEvent().getByRole("link", { name: "Hirdetés feladása" })).toHaveAttribute("href", "/kapitany-dashboard?hirdetes-esemenyre=der")
    unmount()

    mockState.data = { ...data, boat: { ...data.boat, maxCrew: 6 }, events: [withoutListing, ...data.events.slice(1)] }
    render(<CaptainHome />)
    expect(nextEvent().queryByRole("link", { name: "Hirdetés feladása" })).not.toBeInTheDocument()
  })

  it("shows the crew on the boat card instead of repeating event and listing counts", () => {
    render(<CaptainHome />)

    expect(screen.getByText("14 csapattag")).toBeInTheDocument()
    expect(screen.getByText("+8")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Csapat kezelése →" })).toHaveAttribute("href", "/kapitany-dashboard?ful=csapat")
  })

  it("does not talk about free places for a non-race event", () => {
    const data = busyBoat()
    const repair = { ...data.events[0], type: "Hajószerelés", attendance: { confirmed: 2, declined: 0, unanswered: 1, total: 14 } }
    mockState.data = { ...data, boat: { ...data.boat, maxCrew: 10 }, events: [repair, ...data.events.slice(1)] }
    render(<CaptainHome />)

    expect(screen.getByText("2 fő jön")).toBeInTheDocument()
    expect(screen.queryByText(/hely szabad/)).not.toBeInTheDocument()
  })

  it("shows free places when fewer people come than the boat holds", () => {
    const data = busyBoat()
    mockState.data = { ...data, boat: { ...data.boat, maxCrew: 12 } }
    render(<CaptainHome />)

    expect(screen.getByText("9 fő jön · 12 fős hajó")).toBeInTheDocument()
    expect(screen.getByText("3 hely szabad")).toBeInTheDocument()
  })

  it("guides a new captain with getting-started steps instead of an empty todo list", () => {
    mockState.data = {
      ...busyBoat(),
      events: [], listings: [], todos: [], totalPending: 0, upcomingCount: 0,
      onboarding: { invitedCrew: false, createdEvent: false, createdListing: false },
    }
    render(<CaptainHome />)

    expect(screen.getByRole("heading", { name: "Kezdő lépések" })).toBeInTheDocument()
    expect(screen.getByText("1 / 3 kész")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Meghívás" })).toHaveAttribute("href", "/kapitany-dashboard?meghivas=uj")
    expect(screen.queryByRole("heading", { name: /Teendők/ })).not.toBeInTheDocument()
  })

  it("treats the listing as optional: crew and a first event finish the getting-started steps", () => {
    mockState.data = { ...busyBoat(), onboarding: { invitedCrew: true, createdEvent: true, createdListing: false } }
    render(<CaptainHome />)
    expect(screen.queryByRole("heading", { name: "Kezdő lépések" })).not.toBeInTheDocument()
  })

  it("offers each action once while the getting-started steps are open", () => {
    mockState.data = {
      ...busyBoat(),
      crewCount: 0, events: [], listings: [], todos: [], totalPending: 0, upcomingCount: 0,
      onboarding: { invitedCrew: false, createdEvent: false, createdListing: false },
    }
    mockState.going = [{ id: "sz", title: "Hajószerelés", boatName: "Nemere", startDate: inDays(1) }]
    mockState.awaiting = [{ id: "a" }, { id: "b" }, { id: "c" }]
    render(<CaptainHome />)

    // Csak a lépéssor kínálja: nincs gyorsgomb a köszöntésben és üres esemény- vagy hirdetéskártya.
    expect(screen.getAllByRole("link", { name: /Új esemény/ })).toHaveLength(1)
    expect(screen.getAllByRole("link", { name: /Hirdetés feladása/ })).toHaveLength(1)
    expect(screen.queryByText("Még nincs közelgő eseményed")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Hirdetéseid" })).not.toBeInTheDocument()
    expect(screen.getByText("Még nincs csapattagod. A kezdő lépések végigvisznek rajta.")).toBeInTheDocument()
    expect(
      screen.getByText("A hajód kész, már csak a csapat hiányzik. Holnap: Hajószerelés (Nemere). 3 esemény vár a válaszodra."),
    ).toBeInTheDocument()
  })

  it("handles a quiet boat without events, listings or todos", () => {
    mockState.data = { ...busyBoat(), events: [], listings: [], todos: [], totalPending: 0, upcomingCount: 0 }
    render(<CaptainHome />)

    expect(screen.getByText("Minden rendben, most nincs teendőd.")).toBeInTheDocument()
    expect(screen.getByText("Nincs teendőd.")).toBeInTheDocument()
    expect(screen.getByText("Még nincs közelgő eseményed")).toBeInTheDocument()
    expect(screen.getByText(/Nincs aktív hirdetésed/)).toBeInTheDocument()
  })
})
