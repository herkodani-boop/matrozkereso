"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getTodayKey } from "@/components/captain-home/use-captain-home-data"

// A legénység-oldal adatai: események a nem saját hajókon, a csapatok, a meghívók és a profil állapota.
// A kapitányi kezdőlap "Más hajókon" kivonata és a matróz kezdőlap ugyanezekből dolgozik.

export type OtherBoatEvent = {
  id: string
  boatId: string
  title: string
  type: string
  startDate: string
  endDate: string | null
  location: string
  note: string
  boatName: string
  // confirmed: megy; declined: nem megy; open: még nem válaszolt.
  answer: "confirmed" | "declined" | "open"
}

export type CrewTeam = {
  boatId: string
  name: string
  type: string
  harbor: string
  imageUrl: string | null
  captainName: string
  // A hajó jelölőszíne a listákban; több csapatnál ebből látszik, melyik esemény melyik hajóé.
  color: string
}

type EventRow = {
  id: string
  title: string | null
  type: string | null
  start_date: string
  end_date: string | null
  location: string | null
  notes?: string | null
  boat_id: string
  boat: { name: string | null } | { name: string | null }[] | null
}

const EVENTS_LIMIT = 40
const BOAT_COLORS = ["#0e3f57", "#3e8fa8", "#e8833a", "#7a5cc2", "#2f8f5b"]

export function boatColor(index: number) {
  return BOAT_COLORS[index % BOAT_COLORS.length]
}

// A más hajók eseményei a saját válasz szerint; a "pending" és az "unset" is még meg nem válaszolt.
export function toOtherBoatEvents(rows: EventRow[], answers: Map<string, string>): OtherBoatEvent[] {
  return rows
    .map((row) => {
      const boat = Array.isArray(row.boat) ? row.boat[0] ?? null : row.boat
      const status = answers.get(String(row.id))
      return {
        id: String(row.id),
        boatId: String(row.boat_id),
        title: row.title || "Esemény",
        type: row.type || "",
        startDate: row.start_date,
        endDate: row.end_date,
        location: row.location || "",
        note: (row.notes ?? "").trim(),
        boatName: boat?.name || "Hajó",
        answer: status === "confirmed" ? "confirmed" : status === "declined" ? "declined" : "open",
      } satisfies OtherBoatEvent
    })
    .sort((first, second) => first.startDate.localeCompare(second.startDate))
}

type CrewDataState = { status: "loading" | "ready" | "error"; events: OtherBoatEvent[]; teams: CrewTeam[] }

// Csapattagként elérhető és a saját válaszú események a nem saját hajókon, a csapatokkal együtt.
// A refreshKey változásakor újratölt (pl. a fejléc oldalváltáskor).
export function useCrewData(userId: string | null, refreshKey: unknown = null) {
  const [state, setState] = useState<CrewDataState>({ status: "loading", events: [], teams: [] })

  useEffect(() => {
    if (!userId) return
    let active = true

    const load = async () => {
      const today = getTodayKey()
      const [boatsResult, membershipsResult, answersResult] = await Promise.all([
        supabase.from("boats").select("id").eq("user_id", userId),
        supabase.from("boat_team_members").select("boat_id").eq("user_id", userId).eq("status", "active"),
        supabase.from("boat_event_attendees").select("event_id, status").eq("user_id", userId),
      ])
      const firstError = boatsResult.error ?? membershipsResult.error ?? answersResult.error
      if (firstError) throw firstError

      const ownBoatIds = new Set((boatsResult.data ?? []).map((row) => String(row.id)))
      const teamBoatIds = (membershipsResult.data ?? []).map((row) => String(row.boat_id)).filter((id) => !ownBoatIds.has(id))
      const answers = new Map((answersResult.data ?? []).map((row) => [String(row.event_id), String(row.status)]))
      const answeredIds = Array.from(answers.keys())
      const columns = "id, title, type, start_date, end_date, location, notes, boat_id, boat:boats(name)"
      const upcoming = `end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`

      const [teamEventsResult, answeredEventsResult, teamBoatsResult] = await Promise.all([
        teamBoatIds.length > 0
          ? supabase.from("boat_events").select(columns).in("boat_id", teamBoatIds).or(upcoming).order("start_date").limit(EVENTS_LIMIT)
          : Promise.resolve({ data: [] as EventRow[], error: null }),
        // Csapaton kívül is lehet résztvevő (pl. egy hirdetésen keresztül hozzáadva).
        answeredIds.length > 0
          ? supabase.from("boat_events").select(columns).in("id", answeredIds).or(upcoming).order("start_date").limit(EVENTS_LIMIT)
          : Promise.resolve({ data: [] as EventRow[], error: null }),
        teamBoatIds.length > 0
          ? supabase.from("boats").select("id, name, type, harbor, image_url, original_image_url, user_id").in("id", teamBoatIds)
          : Promise.resolve({ data: [] as { id: string; name: string | null; type: string | null; harbor: string | null; image_url: string | null; original_image_url: string | null; user_id: string }[], error: null }),
      ])
      const secondError = teamEventsResult.error ?? answeredEventsResult.error ?? teamBoatsResult.error
      if (secondError) throw secondError

      const captainIds = Array.from(new Set((teamBoatsResult.data ?? []).map((boat) => String(boat.user_id))))
      const captainsResult = captainIds.length > 0
        ? await supabase.from("users").select("id, full_name").in("id", captainIds)
        : { data: [] as { id: string; full_name: string | null }[], error: null }
      if (captainsResult.error) console.error("Kapitányok nevének lekérdezési hiba:", captainsResult.error)
      const captainName = new Map((captainsResult.data ?? []).map((row) => [String(row.id), String(row.full_name ?? "").trim()]))

      const rows = new Map<string, EventRow>()
      for (const row of [...(teamEventsResult.data ?? []), ...(answeredEventsResult.data ?? [])] as EventRow[]) {
        if (!ownBoatIds.has(String(row.boat_id))) rows.set(String(row.id), row)
      }
      const teams: CrewTeam[] = (teamBoatsResult.data ?? [])
        .map((boat) => ({
          boatId: String(boat.id),
          name: boat.name || "Hajó",
          type: boat.type || "",
          harbor: boat.harbor || "",
          imageUrl: boat.image_url ?? boat.original_image_url ?? null,
          captainName: captainName.get(String(boat.user_id)) || "",
          color: "",
        }))
        .sort((first, second) => first.name.localeCompare(second.name, "hu"))
        .map((team, index) => ({ ...team, color: boatColor(index) }))

      return { events: toOtherBoatEvents(Array.from(rows.values()), answers), teams }
    }

    load()
      .then(({ events, teams }) => {
        if (active) setState({ status: "ready", events, teams })
      })
      .catch((error) => {
        console.error("Más hajók eseményeinek betöltési hiba:", error)
        if (active) setState({ status: "error", events: [], teams: [] })
      })

    return () => {
      active = false
    }
  }, [userId, refreshKey])

  const setAnswer = useCallback((eventId: string, answer: OtherBoatEvent["answer"]) =>
    setState((previous) => ({
      ...previous,
      events: previous.events.map((event) => (event.id === eventId ? { ...event, answer } : event)),
    })), [])

  return { ...state, setAnswer }
}

export async function authorizedFetch(url: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error("Ehhez be kell jelentkezned.")
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
  })
}

// Részvételi válasz egy eseményre; a hibaüzenetet a hívó jeleníti meg.
export async function respondToEvent(eventId: string, status: "confirmed" | "declined") {
  const response = await authorizedFetch("/api/events/respond", { method: "POST", body: JSON.stringify({ eventId, status }) })
  const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!response.ok || !result.ok) throw new Error(result.error || "A válaszod mentése nem sikerült.")
}

export type TeamInvitation = {
  token: string
  createdAt: string
  inviterName: string
  boat: { id: string; name: string; type: string; harbor: string; imageUrl: string | null; crewCount: number }
  upcomingEvents: { id: string; title: string; type: string; startDate: string; endDate: string | null; location: string }[]
}

export function useInvitations(userId: string | null) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; invitations: TeamInvitation[] }>({
    status: "loading",
    invitations: [],
  })

  useEffect(() => {
    if (!userId) return
    let active = true
    authorizedFetch("/api/boat-team/my-invitations")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { invitations?: TeamInvitation[] }) => {
        if (active) setState({ status: "ready", invitations: data.invitations ?? [] })
      })
      .catch((error) => {
        console.error("Meghívók betöltési hiba:", error)
        if (active) setState({ status: "error", invitations: [] })
      })
    return () => {
      active = false
    }
  }, [userId])

  const remove = useCallback((token: string) =>
    setState((previous) => ({ ...previous, invitations: previous.invitations.filter((row) => row.token !== token) })), [])

  return { ...state, remove }
}

export type ProfileGaps = { name: boolean; phone: boolean; level: boolean }

// Ami a jelentkezéshez és a kapitánnyal való kapcsolathoz hiányzik a profilból.
export function useProfileGaps(userId: string | null) {
  const [gaps, setGaps] = useState<ProfileGaps | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    supabase
      .from("users")
      .select("full_name, phone, level")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) {
          if (error) console.error("Profil lekérdezési hiba:", error)
          setGaps(null)
          return
        }
        setGaps({
          name: !String(data.full_name ?? "").trim(),
          phone: !String(data.phone ?? "").trim(),
          level: !String(data.level ?? "").trim(),
        })
      })
    return () => {
      active = false
    }
  }, [userId])

  return gaps
}
