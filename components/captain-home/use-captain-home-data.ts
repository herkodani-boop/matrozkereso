"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { isAdVisibleByDate } from "@/lib/ad-visibility"

export type HomePerson = { id: string; name: string; avatarUrl: string | null }

export type HomeEvent = {
  id: string
  title: string
  type: string
  startDate: string
  endDate: string | null
  location: string
  // Az esemény megjegyzésének első sora (pl. gyülekező), üres, ha nincs.
  note: string
  // Üzenetküldéshez: hány címzett van csoportonként (a kapitány nélkül).
  audience: { confirmed: number; unanswered: number; declined: number }
  // Ugyanaz a kör, mint a dashboard résztvevőlistájában: csapattagok (aktív és meghívott) és a többi résztvevő.
  attendance: { confirmed: number; declined: number; unanswered: number; total: number }
  confirmedPeople: HomePerson[]
  linkedListing: { id: string; pending: number } | null
}

export type HomeListing = {
  id: string
  title: string
  expiryDate: string | null
  pending: number
}

export type HomeTodo = {
  id: string
  // "attention": döntésre vár (narancs ikon), "info": érdemes ránézni
  tone: "attention" | "info"
  icon: "shortfall" | "applicants" | "calendar" | "accepted" | "invite"
  title: string
  detail: string
  actionLabel: string
  href: string
  primary: boolean
}

export type CaptainHomeData = {
  boat: { id: string; name: string; imageUrl: string | null; type: string; harbor: string; maxCrew: number | null }
  crewCount: number
  // Az aktív csapattagok a hajókártya avatarjaihoz (a kapitány nélkül).
  crew: HomePerson[]
  upcomingCount: number
  events: HomeEvent[]
  listings: HomeListing[]
  todos: HomeTodo[]
  totalPending: number
  // Kezdő lépések egy új hajónál; ha mind kész, a lépéssor eltűnik.
  onboarding: { invitedCrew: boolean; createdEvent: boolean; createdListing: boolean }
}

const EVENTS_SHOWN = 6
// Ennyi napon belüli versenynél jelezzük, ha kevés a jelentkező.
const SHORTFALL_WINDOW_DAYS = 21
// Ennyi napon belüli eseménynél soroljuk fel, ki nem válaszolt még.
const UNANSWERED_WINDOW_DAYS = 7
const STALE_INVITE_DAYS = 7
// A "Hirdetéseid" listában ennyi napon belüli lejáratot emelünk ki.
export const EXPIRY_WARNING_DAYS = 3

export function getTodayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

export function daysUntil(dateKey: string) {
  const today = new Date(`${getTodayKey()}T12:00:00`).getTime()
  return Math.round((new Date(`${dateKey}T12:00:00`).getTime() - today) / 86_400_000)
}

const longDate = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric" })

function whenLabel(days: number) {
  return days <= 0 ? "ma" : days === 1 ? "holnap" : `${days} nap múlva`
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// "Gábor", "Gábor és Réka", "Gábor, Réka és még 2 fő"
function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length === 2) return `${names[0]} és ${names[1]}`
  return `${names[0]}, ${names[1]} és még ${names.length - 2} fő`
}

export function formatLongDate(dateKey: string) {
  return longDate.format(new Date(`${dateKey}T12:00:00`))
}

// A hirdetés a dashboard logikája szerint jár le: egy versenyre szólónál a kezdés, szezonálisnál a vége napján.
function getListingExpiry(ad: { commitment: string | null; start_date: string | null; end_date: string | null }) {
  return ad.commitment === "szezon" ? ad.end_date : ad.start_date
}

type RawAd = { id: string; title: string | null; commitment: string | null; start_date: string | null; end_date: string | null; event_id: string | null }

// A lekérdezések nyers eredménye; a feldolgozás külön, tiszta függvényben van, hogy tesztelhető legyen.
export type RawCaptainHome = {
  boat: { id: string; name: string | null; image_url: string | null; original_image_url: string | null; type: string | null; harbor: string | null; max_crew_size?: number | null }
  team: { user_id: string | null; status: string; display_name?: string | null; email?: string | null; invited_at?: string | null }[]
  events: { id: string; title: string | null; type: string | null; start_date: string; end_date: string | null; location: string | null; notes?: string | null }[]
  upcomingCount: number | null
  ads: RawAd[]
  attendees: { event_id: string; user_id: string; status: string; updated_at: string }[]
  // Függő és elfogadott jelentkezések az élő hirdetésekre.
  applications: { ad_id: string; user_id: string | null; status: string }[]
  profiles: { id: string; full_name: string | null; avatar_url: string | null }[]
  // Volt-e valaha eseménye / hirdetése (a múltbeliek és lezártak is számítanak).
  hasAnyEvent: boolean
  hasAnyListing: boolean
}

async function loadCaptainHome(boatId: string, captainId: string): Promise<CaptainHomeData | null> {
  const todayKey = getTodayKey()

  // 1. kör: minden, ami csak a hajótól függ. A két "head" számlálás a kezdő lépéssorhoz kell.
  const [boatResult, teamResult, eventsResult, adsResult, anyEventResult, anyListingResult] = await Promise.all([
    supabase.from("boats").select("id, name, image_url, original_image_url, type, harbor, max_crew_size").eq("id", boatId).maybeSingle(),
    supabase.from("boat_team_members").select("user_id, status, display_name, email, invited_at").eq("boat_id", boatId).in("status", ["active", "invited"]),
    supabase
      .from("boat_events")
      .select("id, title, type, start_date, end_date, location, notes", { count: "exact" })
      .eq("boat_id", boatId)
      .or(`end_date.gte.${todayKey},and(end_date.is.null,start_date.gte.${todayKey})`)
      .order("start_date", { ascending: true })
      .limit(EVENTS_SHOWN),
    supabase
      .from("ads")
      .select("id, title, commitment, start_date, end_date, event_id")
      .eq("boat_id", boatId)
      .eq("is_active", true)
      .eq("is_deleted", false),
    supabase.from("boat_events").select("id", { count: "exact", head: true }).eq("boat_id", boatId),
    // A visszavont hirdetés nem számít: különben a lépés kész lenne, miközben nincs hirdetés.
    supabase.from("ads").select("id", { count: "exact", head: true }).eq("boat_id", boatId).eq("is_deleted", false),
  ])

  const firstError = boatResult.error ?? teamResult.error ?? eventsResult.error ?? adsResult.error ?? anyEventResult.error ?? anyListingResult.error
  if (firstError) throw firstError
  if (!boatResult.data) return null

  const visibleAds = (adsResult.data ?? []).filter((ad) => isAdVisibleByDate(ad))
  const eventIds = (eventsResult.data ?? []).map((event) => String(event.id))
  const teamUserIds = (teamResult.data ?? []).map((member) => member.user_id as string | null).filter((id): id is string => Boolean(id))

  type ProfileRow = RawCaptainHome["profiles"][number]
  const loadProfiles = (ids: string[]) =>
    ids.length > 0
      ? supabase.from("users").select("id, full_name, avatar_url").in("id", ids)
      : Promise.resolve({ data: [] as ProfileRow[], error: null })

  // 2. kör: résztvevők, függő és elfogadott jelentkezések és a csapattagok profiljai egyszerre.
  const [attendeesResult, applicationsResult, teamProfilesResult] = await Promise.all([
    eventIds.length > 0
      ? supabase.from("boat_event_attendees").select("event_id, user_id, status, updated_at").in("event_id", eventIds)
      : Promise.resolve({ data: [] as RawCaptainHome["attendees"], error: null }),
    visibleAds.length > 0
      ? supabase.from("applications").select("ad_id, user_id, status").in("ad_id", visibleAds.map((ad) => ad.id)).in("status", ["pending", "accepted"])
      : Promise.resolve({ data: [] as RawCaptainHome["applications"], error: null }),
    loadProfiles(teamUserIds),
  ])
  const secondError = attendeesResult.error ?? applicationsResult.error ?? teamProfilesResult.error
  if (secondError) throw secondError

  // 3. kör csak akkor, ha csapaton kívüli résztvevő vagy elfogadott jelentkező is van.
  const attendees = (attendeesResult.data ?? []) as RawCaptainHome["attendees"]
  const applications = (applicationsResult.data ?? []) as RawCaptainHome["applications"]
  const knownIds = new Set(teamUserIds)
  const acceptedIds = applications.filter((row) => row.status === "accepted" && row.user_id).map((row) => String(row.user_id))
  const missingIds = Array.from(new Set([...attendees.map((row) => String(row.user_id)), ...acceptedIds].filter((id) => !knownIds.has(id))))
  const extraProfilesResult = await loadProfiles(missingIds)
  if (extraProfilesResult.error) throw extraProfilesResult.error

  return buildCaptainHome({
    boat: boatResult.data as RawCaptainHome["boat"],
    team: (teamResult.data ?? []) as RawCaptainHome["team"],
    events: (eventsResult.data ?? []) as RawCaptainHome["events"],
    upcomingCount: eventsResult.count,
    ads: (adsResult.data ?? []) as RawAd[],
    attendees,
    applications,
    profiles: [...(teamProfilesResult.data ?? []), ...(extraProfilesResult.data ?? [])] as ProfileRow[],
    hasAnyEvent: (anyEventResult.count ?? 0) > 0,
    hasAnyListing: (anyListingResult.count ?? 0) > 0,
  }, captainId)
}

export function buildCaptainHome(raw: RawCaptainHome, captainId: string, now = Date.now()): CaptainHomeData {
  const visibleAds = raw.ads.filter((ad) => isAdVisibleByDate(ad))
  const eventRows = raw.events
  const attendees = raw.attendees
  const teamUserIds = raw.team.map((member) => member.user_id).filter((id): id is string => Boolean(id))
  const activeCrewCount = raw.team.filter((member) => member.status === "active").length
  const profileById = new Map(raw.profiles.map((row) => [String(row.id), row]))
  const personFor = (userId: string): HomePerson => {
    const profile = profileById.get(userId)
    return {
      id: userId,
      name: (profile?.full_name as string | null)?.trim() || "Csapattag",
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
    }
  }

  const pendingByAd = new Map<string, number>()
  for (const application of raw.applications) {
    if (application.status !== "pending") continue
    pendingByAd.set(String(application.ad_id), (pendingByAd.get(String(application.ad_id)) ?? 0) + 1)
  }

  const listings: HomeListing[] = visibleAds
    .map((ad) => ({
      id: String(ad.id),
      title: (ad.title as string) || "Hirdetés",
      expiryDate: getListingExpiry(ad),
      pending: pendingByAd.get(String(ad.id)) ?? 0,
    }))
    .sort((first, second) => second.pending - first.pending || (first.expiryDate ?? "9999").localeCompare(second.expiryDate ?? "9999"))

  // A hirdetés időpontja a teendők sorrendjéhez: a hozzá tartozó esemény vagy a hirdetés kezdete.
  const listingDate = new Map(visibleAds.map((ad) => {
    const linkedEvent = eventRows.find((row) => String(row.id) === String(ad.event_id ?? ""))
    return [String(ad.id), String(linkedEvent?.start_date ?? ad.start_date ?? "9999-12-31")] as const
  }))
  const unansweredByEvent = new Map<string, HomePerson[]>()

  const events: HomeEvent[] = eventRows.map((row) => {
    const eventId = String(row.id)
    const rows = attendees.filter((attendee) => String(attendee.event_id) === eventId)
    const roster = new Set([...teamUserIds, ...rows.map((attendee) => String(attendee.user_id))])
    const confirmedRows = rows.filter((attendee) => attendee.status === "confirmed")
    const declined = rows.filter((attendee) => attendee.status === "declined").length
    // A kapitány elöl, utána a többi résztvevő.
    const confirmedPeople = confirmedRows
      .map((attendee) => personFor(String(attendee.user_id)))
      .sort((first, second) => Number(second.id === captainId) - Number(first.id === captainId))
    const linkedAd = visibleAds.find((ad) => String(ad.event_id ?? "") === eventId)
    const answeredIds = new Set(rows.filter((attendee) => attendee.status === "confirmed" || attendee.status === "declined").map((attendee) => String(attendee.user_id)))
    unansweredByEvent.set(
      eventId,
      Array.from(roster).filter((userId) => !answeredIds.has(userId) && userId !== captainId).map((userId) => personFor(userId)),
    )

    return {
      id: eventId,
      title: (row.title as string) || "Esemény",
      type: (row.type as string) || "Egyéb",
      startDate: String(row.start_date),
      endDate: (row.end_date as string | null) ?? null,
      location: (row.location as string) || "",
      note: String(row.notes ?? "").split("\n").map((line) => line.trim()).find(Boolean) ?? "",
      audience: {
        confirmed: confirmedRows.filter((attendee) => String(attendee.user_id) !== captainId).length,
        unanswered: (unansweredByEvent.get(eventId) ?? []).length,
        declined: rows.filter((attendee) => attendee.status === "declined" && String(attendee.user_id) !== captainId).length,
      },
      attendance: {
        confirmed: confirmedRows.length,
        declined,
        unanswered: Math.max(roster.size - confirmedRows.length - declined, 0),
        total: roster.size,
      },
      confirmedPeople,
      linkedListing: linkedAd ? { id: String(linkedAd.id), pending: pendingByAd.get(String(linkedAd.id)) ?? 0 } : null,
    }
  })

  // Minden teendőhöz tartozik egy dátum (a kapcsolódó esemény napja): ami időben a legsürgetőbb, az kerül előre.
  type RankedTodo = HomeTodo & { sortDate: string; rank: number }
  const ranked: RankedTodo[] = []
  const capacity = typeof raw.boat.max_crew_size === "number" && raw.boat.max_crew_size > 0 ? raw.boat.max_crew_size : null
  const teamIdSet = new Set(teamUserIds)

  // 1. Kevés a jelentkező egy közelgő versenyre: a hajó létszámának kevesebb mint fele jelezte, hogy jön.
  //    Edzésre, hajószerelésre nem kell teljes legénység, ezért csak versenyt figyelünk. Ha már van
  //    hirdetés az eseményre, a kapitány lépett; az új jelentkezőket a 2. pont jelzi.
  for (const event of events) {
    const days = daysUntil(event.startDate)
    if (!capacity || event.type !== "Verseny" || event.linkedListing || days < 0 || days > SHORTFALL_WINDOW_DAYS) continue
    const { confirmed, unanswered } = event.attendance
    if (confirmed * 2 >= capacity) continue
    ranked.push({
      id: `shortfall-${event.id}`,
      tone: "attention",
      icon: "shortfall",
      title: confirmed === 0
        ? `${event.title}: még senki nem jelezte, hogy jön`
        : `${event.title}: eddig ${confirmed} fő jelezte, hogy jön`,
      detail: [capitalize(whenLabel(days)), `${capacity} fős hajó`, unanswered > 0 ? `${unanswered} még nem válaszolt` : null]
        .filter(Boolean)
        .join(" · "),
      actionLabel: "Hirdetés feladása",
      href: `/kapitany-dashboard?hirdetes-esemenyre=${encodeURIComponent(event.id)}`,
      primary: false,
      sortDate: event.startDate,
      rank: 0,
    })
  }

  // 2. Új jelentkezők: az időpontot a hirdetés (vagy a hozzá tartozó esemény) kezdete adja.
  const totalPending = listings.reduce((sum, listing) => sum + listing.pending, 0)
  if (totalPending > 0) {
    const withPending = listings.filter((listing) => listing.pending > 0)
    const earliest = withPending
      .map((listing) => listingDate.get(listing.id) ?? "9999-12-31")
      .sort()[0]
    ranked.push({
      id: "applicants",
      tone: "attention",
      icon: "applicants",
      title: `${totalPending} új jelentkező vár elbírálásra`,
      detail: withPending.slice(0, 3).map((listing) => `${listing.title} (${listing.pending})`).join(" · "),
      actionLabel: "Elbírálás",
      href: `/kapitany-dashboard?jelentkezok=${encodeURIComponent(withPending[0].id)}`,
      primary: false,
      sortDate: earliest,
      rank: 1,
    })
  }

  // 3. Közeli esemény, ahol valaki még nem válaszolt: név szerint, mert őket kell megkeresni.
  for (const event of events) {
    const days = daysUntil(event.startDate)
    const people = unansweredByEvent.get(event.id) ?? []
    if (people.length === 0 || days < 0 || days > UNANSWERED_WINDOW_DAYS) continue
    ranked.push({
      id: `unanswered-${event.id}`,
      tone: "info",
      icon: "calendar",
      title: `${joinNames(people.map((person) => person.name))} még nem jelzett vissza`,
      detail: `${event.title} · ${whenLabel(days)}`,
      actionLabel: "Résztvevők",
      href: `/kapitany-dashboard?esemeny=${encodeURIComponent(event.id)}`,
      primary: false,
      sortDate: event.startDate,
      rank: 2,
    })
  }

  // 4. Elfogadott jelentkező, aki még nincs az esemény résztvevői között.
  for (const event of events) {
    const ad = visibleAds.find((candidate) => String(candidate.event_id ?? "") === event.id)
    if (!ad) continue
    const onEvent = new Set(attendees.filter((row) => String(row.event_id) === event.id).map((row) => String(row.user_id)))
    const waiting = raw.applications
      .filter((application) =>
        String(application.ad_id) === String(ad.id) &&
        application.status === "accepted" &&
        application.user_id &&
        !onEvent.has(String(application.user_id)) &&
        !teamIdSet.has(String(application.user_id)),
      )
      .map((application) => personFor(String(application.user_id)))
    if (waiting.length === 0) continue
    const days = daysUntil(event.startDate)
    ranked.push({
      id: `accepted-${event.id}`,
      tone: "info",
      icon: "accepted",
      title: waiting.length === 1
        ? `${waiting[0].name} elfogadva, de még nincs a résztvevők között`
        : `${waiting.length} elfogadott jelentkező még nincs a résztvevők között`,
      detail: `${event.title} · ${whenLabel(days)}`,
      actionLabel: "Hozzáadás az eseményhez",
      href: `/kapitany-dashboard?jelentkezok=${encodeURIComponent(String(ad.id))}`,
      primary: false,
      sortDate: event.startDate,
      rank: 3,
    })
  }

  // 5. Régóta függő csapatmeghívó. Nincs eseménydátuma, ezért a lista végére kerül.
  const inviteCutoff = now - STALE_INVITE_DAYS * 86_400_000
  const staleInvites = raw.team.filter((member) =>
    member.status === "invited" && member.invited_at && new Date(member.invited_at).getTime() < inviteCutoff,
  )
  if (staleInvites.length > 0) {
    const first = staleInvites[0]
    const firstName = first.display_name?.trim() || first.email || "Egy meghívott"
    const waitedDays = Math.floor((now - new Date(first.invited_at as string).getTime()) / 86_400_000)
    ranked.push({
      id: "invites",
      tone: "info",
      icon: "invite",
      title: staleInvites.length === 1
        ? `${firstName} ${waitedDays} napja nem fogadta el a meghívódat`
        : `${staleInvites.length} csapatmeghívód régóta függőben van`,
      detail: staleInvites.length === 1 ? "Érdemes újraküldeni vagy rákérdezni." : staleInvites.slice(0, 3).map((member) => member.display_name?.trim() || member.email).filter(Boolean).join(" · "),
      actionLabel: "Meghívó újraküldése",
      href: "/kapitany-dashboard?ful=csapat",
      primary: false,
      sortDate: "9999-12-31",
      rank: 4,
    })
  }

  ranked.sort((first, second) => first.sortDate.localeCompare(second.sortDate) || first.rank - second.rank)
  // Egyetlen kiemelt gomb: a legsürgetőbb teendőé.
  const todos: HomeTodo[] = ranked.map((item, index) => ({
    id: item.id,
    tone: item.tone,
    icon: item.icon,
    title: item.title,
    detail: item.detail,
    actionLabel: item.actionLabel,
    href: item.href,
    primary: index === 0,
  }))

  const boat = raw.boat

  return {
    boat: {
      id: String(boat.id),
      name: (boat.name as string) || "Névtelen hajó",
      // A kapitány által beállított kivágás (image_url) jelenjen meg; az eredeti kép csak tartalék.
      imageUrl: (boat.image_url as string | null) ?? (boat.original_image_url as string | null) ?? null,
      type: (boat.type as string) || "",
      harbor: (boat.harbor as string) || "",
      maxCrew: typeof boat.max_crew_size === "number" && boat.max_crew_size > 0 ? boat.max_crew_size : null,
    },
    crewCount: activeCrewCount,
    crew: raw.team
      .filter((member) => member.status === "active" && member.user_id && member.user_id !== captainId)
      .map((member) => {
        const person = personFor(String(member.user_id))
        return person.name === "Csapattag" && member.display_name?.trim() ? { ...person, name: member.display_name.trim() } : person
      }),
    upcomingCount: raw.upcomingCount ?? events.length,
    events,
    listings,
    todos,
    totalPending,
    onboarding: {
      invitedCrew: raw.team.length > 0,
      createdEvent: raw.hasAnyEvent || events.length > 0,
      createdListing: raw.hasAnyListing || raw.ads.length > 0,
    },
  }
}

export function useCaptainHomeData(boatId: string | null, captainId: string | null) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data: CaptainHomeData | null }>({
    status: "loading",
    data: null,
  })
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!boatId || !captainId) return
    let active = true

    loadCaptainHome(boatId, captainId)
      .then((data) => {
        if (active) setState({ status: "ready", data })
      })
      .catch((error) => {
        console.error("Kapitányi kezdőlap betöltési hiba:", error)
        if (active) setState({ status: "error", data: null })
      })

    return () => {
      active = false
    }
  }, [boatId, captainId, retryKey])

  return {
    ...state,
    retry: () => {
      setState({ status: "loading", data: null })
      setRetryKey((key) => key + 1)
    },
  }
}
