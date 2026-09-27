"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, CalendarDays, Compass, MapPin, Ship, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"

type PersonalEvent = {
  id: string
  title: string
  type: string
  startDate: string
  endDate: string | null
  location: string
  boatName: string
  participation: string
}

type EventOpportunity = {
  id: string
  title: string
  location: string
  startDate: string
  boatName: string
  type: string
}

function getTodayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

function formatEventDate(startDate: string, endDate: string | null) {
  const format = (value: string) => {
    const date = new Date(`${value}T12:00:00`)
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("hu-HU", { month: "short", day: "numeric" }).format(date)
  }

  return endDate && endDate !== startDate ? `${format(startDate)} – ${format(endDate)}` : format(startDate)
}

function normalizeBoat(boat: unknown) {
  return Array.isArray(boat) ? boat[0] ?? null : boat
}

export function HomeEventsHub() {
  const [user, setUser] = useState<User | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [isTeamMember, setIsTeamMember] = useState(false)
  const [events, setEvents] = useState<PersonalEvent[]>([])
  const [opportunities, setOpportunities] = useState<EventOpportunity[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true
    const updateUser = (nextUser: User | null) => {
      if (!active) return
      setUser(nextUser)
      setAuthResolved(true)
    }

    void supabase.auth.getUser().then(({ data }) => updateUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      updateUser(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setRole(null)
      setIsTeamMember(false)
      setEvents([])
      setOpportunities([])
      return
    }

    let active = true
    const loadHub = async () => {
      setLoading(true)
      setLoadError(false)
      const today = getTodayKey()

      const [profileResult, boatsResult, membershipsResult, attendeesResult] = await Promise.all([
        supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("boats").select("id").eq("user_id", user.id),
        supabase.from("boat_team_members").select("boat_id").eq("user_id", user.id).eq("status", "active"),
        supabase.from("boat_event_attendees").select("event_id, status").eq("user_id", user.id).neq("status", "declined"),
      ])

      const queryErrors = [profileResult.error, boatsResult.error, membershipsResult.error, attendeesResult.error]
        .filter(Boolean)
      queryErrors.forEach((error) => console.error("Főoldali eseményblokk lekérdezési hiba:", error))

      const profileRole = profileResult.data?.role ?? null
      const ownedBoatIds = (boatsResult.data ?? []).map((boat) => String(boat.id))
      const teamBoatIds = (membershipsResult.data ?? []).map((member) => String(member.boat_id))
      const boatIds = Array.from(new Set([...ownedBoatIds, ...teamBoatIds]))
      const attendeeRows = attendeesResult.data ?? []
      const attendeeStatuses = new Map(attendeeRows.map((row) => [String(row.event_id), row.status]))
      const attendeeEventIds = attendeeRows.map((row) => String(row.event_id))

      const [boatEventsResult, attendeeEventsResult] = await Promise.all([
        boatIds.length > 0
          ? supabase
              .from("boat_events")
              .select("id, title, type, start_date, end_date, location, boat_id, boat:boats(name)")
              .in("boat_id", boatIds)
              .gte("start_date", today)
              .order("start_date", { ascending: true })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
        attendeeEventIds.length > 0
          ? supabase
              .from("boat_events")
              .select("id, title, type, start_date, end_date, location, boat_id, boat:boats(name)")
              .in("id", attendeeEventIds)
              .gte("start_date", today)
              .order("start_date", { ascending: true })
              .limit(8)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (boatEventsResult.error || attendeeEventsResult.error) {
        console.error("Közelgő főoldali események lekérdezési hiba:", boatEventsResult.error ?? attendeeEventsResult.error)
      }

      const teamEventRows = (boatEventsResult.data ?? []).filter((event: any) => teamBoatIds.includes(String(event.boat_id)))
      const teamEventIds = teamEventRows.map((event: any) => String(event.id))
      const eventApplicationsResult = teamEventIds.length > 0
        ? await supabase
            .from("ads")
            .select("event_id, applications(user_id)")
            .in("event_id", teamEventIds)
        : { data: [], error: null }

      if (eventApplicationsResult.error) {
        console.error("Csapattagként elérhető események lekérdezési hiba:", eventApplicationsResult.error)
      }

      const eventRows = new Map<string, any>()
      ;[...(boatEventsResult.data ?? []), ...(attendeeEventsResult.data ?? [])].forEach((event: any) => {
        eventRows.set(String(event.id), event)
      })

      const nextEvents = Array.from(eventRows.values())
        .filter((event: any) => attendeeStatuses.has(String(event.id)) || ownedBoatIds.includes(String(event.boat_id)))
        .map((event: any) => {
          const eventId = String(event.id)
          const boat = normalizeBoat(event.boat)
          const attendeeStatus = attendeeStatuses.get(eventId)
          const isOwnedBoatEvent = ownedBoatIds.includes(String(event.boat_id))
          return {
            id: eventId,
            title: String(event.title ?? "Esemény"),
            type: String(event.type ?? "Esemény"),
            startDate: String(event.start_date ?? ""),
            endDate: event.end_date ? String(event.end_date) : null,
            location: String(event.location ?? ""),
            boatName: String(boat?.name ?? "Hajó"),
            participation: attendeeStatus === "confirmed"
              ? "Részt veszel"
              : attendeeStatus === "pending"
                ? "Visszajelzésre vár"
                : attendeeStatus === "unset"
                  ? "Visszajelzés szükséges"
                  : isOwnedBoatEvent
                    ? "Saját esemény"
                    : "Csapatesemény",
          } satisfies PersonalEvent
        })
        .sort((first, second) => first.startDate.localeCompare(second.startDate))
        .slice(0, 4)

      const appliedEventIds = new Set<string>()
      ;(eventApplicationsResult.data ?? []).forEach((ad: any) => {
        const eventId = String(ad.event_id ?? "")
        if (!eventId) return

        const applications = ad.applications ?? []
        if (applications.some((application: any) => application.user_id === user.id)) {
          appliedEventIds.add(eventId)
        }
      })

      const availableEvents = teamEventRows
        .filter((event: any) => {
          const eventId = String(event.id)
          return !appliedEventIds.has(eventId) && !attendeeStatuses.has(eventId)
        })
        .slice(0, 3)
        .map((event: any) => {
          const boat = normalizeBoat(event.boat)
          return {
            id: String(event.id),
            title: String(event.title ?? "Esemény"),
            location: String(event.location ?? ""),
            startDate: String(event.start_date ?? ""),
            boatName: String(boat?.name ?? "Hajó"),
            type: String(event.type ?? "Esemény"),
          } satisfies EventOpportunity
        })

      if (!active) return
      setRole(profileRole)
      setIsTeamMember(teamBoatIds.length > 0)
      setEvents(nextEvents)
      setOpportunities(availableEvents)
      setLoadError(queryErrors.length > 0 || Boolean(boatEventsResult.error || attendeeEventsResult.error || eventApplicationsResult.error))
      setLoading(false)
    }

    void loadHub().catch((error) => {
      console.error("Főoldali eseményblokk betöltési hiba:", error)
      if (active) {
        setLoadError(true)
        setLoading(false)
      }
    })

    return () => {
      active = false
    }
  }, [user, retryKey])

  if (!authResolved || !user) return null

  const isCaptain = role === "skipper" || role === "kapitany"
  const isCrewRole = role === "sailor" || role === "mancsaft"

  return (
    <section className="border-b border-border bg-secondary/35" aria-labelledby="home-events-heading">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Személyes áttekintés</p>
            <h2 id="home-events-heading" className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">
              A következő vitorlázásod
            </h2>
          </div>
          {isCaptain ? (
            <Link
              href="/kapitany-dashboard"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Ship className="h-4 w-4" aria-hidden="true" />
              Kapitányi dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : isTeamMember || isCrewRole ? (
            <Button type="button" variant="outline" disabled title="A mancsafthoz készült dashboard hamarosan érkezik.">
              <Users className="h-4 w-4" aria-hidden="true" />
              Mancsaft dashboard · hamarosan
            </Button>
          ) : null}
        </div>

        {loadError ? (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
            <span>Néhány eseményadatot nem sikerült betölteni.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setRetryKey((key) => key + 1)}>
              Újrapróbálás
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {[0, 1].map((item) => (
              <div key={item} className="space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-7 lg:grid-cols-2 lg:gap-8">
            <div>
              <div className="mb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CalendarDays className="h-4 w-4 text-accent" aria-hidden="true" />
                  Következő eseményeid
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isCaptain ? "Saját, közelgő eseményeid." : "Események, amelyekre jelentkeztél."}
                </p>
              </div>
              {events.length > 0 ? (
                <ul className="divide-y divide-border border-y border-border">
                  {events.map((event) => (
                    <li key={event.id} className="flex items-start gap-3 py-3">
                      <span className="min-w-14 pt-0.5 text-xs font-semibold text-accent">
                        {formatEventDate(event.startDate, event.endDate)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Ship className="h-3 w-3" aria-hidden="true" />{event.boatName}</span>
                          {event.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{event.location}</span> : null}
                          <span>{event.participation}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-y border-border py-4 text-sm text-muted-foreground">
                  Még nincs közelgő eseményed.
                </p>
              )}
            </div>

            <div className="lg:border-l lg:border-border lg:pl-8">
              <div className="mb-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
                  Csapattagságból elérhető események
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Események azokon a hajókon, amelyeknek csapattagja vagy.
                </p>
              </div>
              {opportunities.length > 0 ? (
                <ul className="divide-y divide-border border-y border-border">
                  {opportunities.map((opportunity) => (
                    <li key={opportunity.id} className="flex items-start gap-3 py-3">
                      <span className="min-w-14 pt-0.5 text-xs font-semibold text-accent">
                        {formatEventDate(opportunity.startDate, null)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{opportunity.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {opportunity.type} · {opportunity.boatName}{opportunity.location ? ` · ${opportunity.location}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-y border-border py-4 text-sm text-muted-foreground">
                  Jelenleg nincs olyan közelgő esemény, amelyre még nem jelentkeztél.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}