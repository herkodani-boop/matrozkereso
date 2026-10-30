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
  icon: "applicants" | "declined" | "calendar" | "clock"
  title: string
  detail: string
  actionLabel: string
  href: string
  primary: boolean
}

export type CaptainHomeData = {
  boat: { id: string; name: string; imageUrl: string | null; type: string; harbor: string }
  crewCount: number
  upcomingCount: number
  events: HomeEvent[]
  listings: HomeListing[]
  todos: HomeTodo[]
  totalPending: number
  daysUntilNextRace: number | null
  // Kezdő lépések egy új hajónál; ha mind kész, a lépéssor eltűnik.
  onboarding: { invitedCrew: boolean; createdEvent: boolean; createdListing: boolean }
}

const EVENTS_SHOWN = 6
const RECENT_DECLINE_DAYS = 7
const UNANSWERED_WINDOW_DAYS = 14
const EXPIRY_WARNING_DAYS = 3

export function getTodayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

export function daysUntil(dateKey: string) {
  const today = new Date(`${getTodayKey()}T12:00:00`).getTime()
  return Math.round((new Date(`${dateKey}T12:00:00`).getTime() - today) / 86_400_000)
}

const longDate = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric" })

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
  boat: { id: string; name: string | null; image_url: string | null; original_image_url: string | null; type: string | null; harbor: string | null }
  team: { user_id: string | null; status: string }[]
  events: { id: string; title: string | null; type: string | null; start_date: string; end_date: string | null; location: string | null }[]
  upcomingCount: number | null
  ads: RawAd[]
  attendees: { event_id: string; user_id: string; status: string; updated_at: string }[]
  pendingApplications: { ad_id: string }[]
  profiles: { id: string; full_name: string | null; avatar_url: string | null }[]
  // Volt-e valaha eseménye / hirdetése (a múltbeliek és lezártak is számítanak).
  hasAnyEvent: boolean
  hasAnyListing: boolean
}

async function loadCaptainHome(boatId: string, captainId: string): Promise<CaptainHomeData | null> {
  const todayKey = getTodayKey()

  // 1. kör: minden, ami csak a hajótól függ. A két "head" számlálás a kezdő lépéssorhoz kell.
  const [boatResult, teamResult, eventsResult, adsResult, anyEventResult, anyListingResult] = await Promise.all([
    supabase.from("boats").select("id, name, image_url, original_image_url, type, harbor").eq("id", boatId).maybeSingle(),
    supabase.from("boat_team_members").select("user_id, status").eq("boat_id", boatId).in("status", ["active", "invited"]),
    supabase
      .from("boat_events")
      .select("id, title, type, start_date, end_date, location", { count: "exact" })
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
    supabase.from("ads").select("id", { count: "exact", head: true }).eq("boat_id", boatId),
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

  // 2. kör: résztvevők, függő jelentkezések és a csapattagok profiljai egyszerre.
  const [attendeesResult, applicationsResult, teamProfilesResult] = await Promise.all([
    eventIds.length > 0
      ? supabase.from("boat_event_attendees").select("event_id, user_id, status, updated_at").in("event_id", eventIds)
      : Promise.resolve({ data: [] as RawCaptainHome["attendees"], error: null }),
    visibleAds.length > 0
      ? supabase.from("applications").select("ad_id").in("ad_id", visibleAds.map((ad) => ad.id)).eq("status", "pending")
      : Promise.resolve({ data: [] as { ad_id: string }[], error: null }),
    loadProfiles(teamUserIds),
  ])
  const secondError = attendeesResult.error ?? applicationsResult.error ?? teamProfilesResult.error
  if (secondError) throw secondError

  // 3. kör csak akkor, ha egy eseményen csapaton kívüli résztvevő is van (pl. elfogadott jelentkező).
  const attendees = (attendeesResult.data ?? []) as RawCaptainHome["attendees"]
  const knownIds = new Set(teamUserIds)
  const missingIds = Array.from(new Set(attendees.map((row) => String(row.user_id)).filter((id) => !knownIds.has(id))))
  const extraProfilesResult = await loadProfiles(missingIds)
  if (extraProfilesResult.error) throw extraProfilesResult.error

  return buildCaptainHome({
    boat: boatResult.data as RawCaptainHome["boat"],
    team: (teamResult.data ?? []) as RawCaptainHome["team"],
    events: (eventsResult.data ?? []) as RawCaptainHome["events"],
    upcomingCount: eventsResult.count,
    ads: (adsResult.data ?? []) as RawAd[],
    attendees,
    pendingApplications: (applicationsResult.data ?? []) as RawCaptainHome["pendingApplications"],
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
  for (const application of raw.pendingApplications) {
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

    return {
      id: eventId,
      title: (row.title as string) || "Esemény",
      type: (row.type as string) || "Egyéb",
      startDate: String(row.start_date),
      endDate: (row.end_date as string | null) ?? null,
      location: (row.location as string) || "",
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

  const todos: HomeTodo[] = []
  const totalPending = listings.reduce((sum, listing) => sum + listing.pending, 0)

  if (totalPending > 0) {
    const withPending = listings.filter((listing) => listing.pending > 0)
    todos.push({
      id: "applicants",
      tone: "attention",
      icon: "applicants",
      title: `${totalPending} új jelentkező vár elbírálásra`,
      detail: withPending.slice(0, 3).map((listing) => `${listing.title} (${listing.pending})`).join(" · "),
      actionLabel: "Elbírálás",
      href: `/kapitany-dashboard?jelentkezok=${encodeURIComponent(withPending[0].id)}`,
      primary: true,
    })
  }

  const declineCutoff = now - RECENT_DECLINE_DAYS * 86_400_000
  for (const event of events) {
    const recentDecliners = attendees
      .filter((attendee) =>
        String(attendee.event_id) === event.id &&
        attendee.status === "declined" &&
        String(attendee.user_id) !== captainId &&
        new Date(attendee.updated_at).getTime() >= declineCutoff,
      )
      .map((attendee) => personFor(String(attendee.user_id)).name)
    if (recentDecliners.length === 0) continue
    const canAdvertise = !event.linkedListing
    todos.push({
      id: `declined-${event.id}`,
      tone: "attention",
      icon: "declined",
      title: recentDecliners.length === 1
        ? `${recentDecliners[0]} nem jön: ${event.title}`
        : `${recentDecliners.length} csapattag nem jön: ${event.title}`,
      detail: [formatLongDate(event.startDate), event.location].filter(Boolean).join(", "),
      actionLabel: canAdvertise ? "Hiányzó helyre hirdetek" : "Résztvevők",
      href: canAdvertise
        ? `/kapitany-dashboard?hirdetes-esemenyre=${encodeURIComponent(event.id)}`
        : `/kapitany-dashboard?esemeny=${encodeURIComponent(event.id)}`,
      primary: false,
    })
  }

  for (const event of events) {
    if (event.attendance.unanswered === 0 || daysUntil(event.startDate) > UNANSWERED_WINDOW_DAYS) continue
    todos.push({
      id: `unanswered-${event.id}`,
      tone: "info",
      icon: "calendar",
      title: `${event.attendance.unanswered} csapattag még nem jelzett vissza`,
      detail: [event.title, formatLongDate(event.startDate), event.location].filter(Boolean).join(" · "),
      actionLabel: "Résztvevők",
      href: `/kapitany-dashboard?esemeny=${encodeURIComponent(event.id)}`,
      primary: false,
    })
  }

  const expiring = listings.filter((listing) => {
    if (!listing.expiryDate) return false
    const days = daysUntil(listing.expiryDate)
    return days >= 0 && days <= EXPIRY_WARNING_DAYS
  })
  if (expiring.length > 0) {
    const days = daysUntil(expiring[0].expiryDate as string)
    const when = days === 0 ? "ma" : days === 1 ? "holnap" : `${days} nap múlva`
    todos.push({
      id: "expiring",
      tone: "info",
      icon: "clock",
      title: expiring.length === 1 ? `Egy hirdetésed ${when} lejár` : `${expiring.length} hirdetésed ${EXPIRY_WARNING_DAYS} napon belül lejár`,
      detail: expiring.map((listing) => listing.title).join(" · "),
      actionLabel: "Megnézem",
      href: `/kapitany-dashboard?jelentkezok=${encodeURIComponent(expiring[0].id)}`,
      primary: false,
    })
  }

  const nextRace = events.find((event) => event.type === "Verseny")
  const boat = raw.boat

  return {
    boat: {
      id: String(boat.id),
      name: (boat.name as string) || "Névtelen hajó",
      imageUrl: (boat.original_image_url as string | null) ?? (boat.image_url as string | null) ?? null,
      type: (boat.type as string) || "",
      harbor: (boat.harbor as string) || "",
    },
    crewCount: activeCrewCount,
    upcomingCount: raw.upcomingCount ?? events.length,
    events,
    listings,
    todos,
    totalPending,
    daysUntilNextRace: nextRace ? daysUntil(nextRace.startDate) : null,
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
