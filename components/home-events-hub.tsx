"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import { ArrowRight, CalendarDays, Check, Compass, LoaderCircle, MapPin, ShipWheel, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import { EventDetailsModal, type EventDetailsSummary } from "@/components/event-details-modal"

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
  endDate: string | null
  boatName: string
  type: string
  response: "declined" | null
}

function getTodayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

function formatFullEventDate(dateValue: string) {
  const parsed = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" }).format(parsed)
}

function formatFullEventDateRange(startDate: string, endDate: string | null) {
  if (!endDate || endDate === startDate) {
    return formatFullEventDate(startDate)
  }
  return `${formatFullEventDate(startDate)} – ${formatFullEventDate(endDate)}`
}

function EventDateBadge({ startDate, endDate }: { startDate: string; endDate: string | null }) {
  const parse = (value: string) => new Date(`${value}T12:00:00`)
  const start = parse(startDate)
  const end = endDate ? parse(endDate) : null
  const isValidStart = !Number.isNaN(start.getTime())
  const isValidEnd = Boolean(end && !Number.isNaN(end.getTime()))
  const shortMonth = (date: Date) =>
    new Intl.DateTimeFormat("hu-HU", { month: "short" }).format(date).replace(/\.$/, "").toLocaleUpperCase("hu-HU")
  const sameMonth = Boolean(isValidEnd && end && start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth())
  const monthLabel = isValidStart
    ? sameMonth || !isValidEnd || !end
      ? shortMonth(start)
      : `${shortMonth(start)}–${shortMonth(end)}`
    : "DÁTUM"
  const dayLabel = isValidStart
    ? sameMonth && end
      ? `${start.getDate()}–${end.getDate()}.`
      : isValidEnd && end
        ? `${start.getDate()}–${end.getDate()}.`
        : `${start.getDate()}.`
    : startDate
  const fullDate = (date: Date) => new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
  const accessibleLabel = isValidStart
    ? isValidEnd && end && endDate !== startDate
      ? `${fullDate(start)} – ${fullDate(end)}`
      : fullDate(start)
    : startDate

  return (
    <time
      dateTime={startDate}
      aria-label={accessibleLabel}
      className="flex min-h-12 w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-md bg-accent/10 px-1 py-1 text-accent"
    >
      <span className="text-[10px] font-semibold leading-4">{monthLabel}</span>
      <span className="text-sm font-bold leading-5">{dayLabel}</span>
    </time>
  )
}

function normalizeBoat(boat: unknown) {
  return Array.isArray(boat) ? boat[0] ?? null : boat
}

export function HomeEventsHub() {
  const [user, setUser] = useState<User | null>(null)
  const [authResolved, setAuthResolved] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [profileMissing, setProfileMissing] = useState(false)
  const [isTeamMember, setIsTeamMember] = useState(false)
  const [events, setEvents] = useState<PersonalEvent[]>([])
  const [opportunities, setOpportunities] = useState<EventOpportunity[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [respondingEventId, setRespondingEventId] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [detailsEvent, setDetailsEvent] = useState<EventDetailsSummary | null>(null)

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
      setProfileMissing(false)
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
        supabase.from("boat_event_attendees").select("event_id, status").eq("user_id", user.id),
      ])

      const queryErrors = [profileResult.error, boatsResult.error, membershipsResult.error, attendeesResult.error]
        .filter(Boolean)
      queryErrors.forEach((error) => console.error("Főoldali eseményblokk lekérdezési hiba:", error))

      // Hiányzó profilsor törölt/árva auth munkamenetre utal (pl. a felhasználó közvetlenül az adatbázisból lett törölve).
      const profileIsMissing = !profileResult.error && !profileResult.data
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

      const eventRows = new Map<string, any>()
      ;[...(boatEventsResult.data ?? []), ...(attendeeEventsResult.data ?? [])].forEach((event: any) => {
        eventRows.set(String(event.id), event)
      })

      const nextEvents = Array.from(eventRows.values())
        .filter((event: any) => {
          const status = attendeeStatuses.get(String(event.id))
          return status === "confirmed" || status === "pending" || (
            status === undefined && ownedBoatIds.includes(String(event.boat_id))
          )
        })
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

      const availableEvents = teamEventRows
        .filter((event: any) => {
          const eventId = String(event.id)
          const status = attendeeStatuses.get(eventId)
          return status === undefined || status === "declined" || status === "unset"
        })
        .slice(0, 3)
        .map((event: any) => {
          const boat = normalizeBoat(event.boat)
          return {
            id: String(event.id),
            title: String(event.title ?? "Esemény"),
            location: String(event.location ?? ""),
            startDate: String(event.start_date ?? ""),
            endDate: event.end_date ? String(event.end_date) : null,
            boatName: String(boat?.name ?? "Hajó"),
            type: String(event.type ?? "Esemény"),
            response: attendeeStatuses.get(String(event.id)) === "declined" ? "declined" : null,
          } satisfies EventOpportunity
        })

      if (!active) return
      setRole(profileRole)
      setProfileMissing(profileIsMissing)
      setIsTeamMember(teamBoatIds.length > 0)
      setEvents(nextEvents)
      setOpportunities(availableEvents)
      setLoadError(queryErrors.length > 0 || Boolean(boatEventsResult.error || attendeeEventsResult.error))
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

  async function respondToEvent(event: EventOpportunity, status: "confirmed" | "declined") {
    if (!user || respondingEventId) return

    setRespondingEventId(event.id)
    setActionError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error("A válasz mentéséhez be kell jelentkezned.")
      }

      const response = await fetch("/api/events/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventId: event.id, status }),
      })
      const result = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "A részvételi válasz mentése nem sikerült.")
      }
    } catch (error) {
      console.error("Esemény-visszajelzés mentési hiba:", error)
      setActionError(error instanceof Error
        ? error.message
        : status === "confirmed"
          ? "A részvétel jelzése nem sikerült. Próbáld újra."
          : "A visszautasítás mentése nem sikerült. Próbáld újra.")
      setRespondingEventId(null)
      return
    }

    if (status === "confirmed") {
      setOpportunities((previous) => previous.filter((item) => item.id !== event.id))
      setEvents((previous) => [
        {
          ...event,
          participation: "Részt veszel",
        },
        ...previous.filter((item) => item.id !== event.id),
      ].sort((first, second) => first.startDate.localeCompare(second.startDate)).slice(0, 4))
    } else {
      setOpportunities((previous) => previous.map((item) =>
        item.id === event.id ? { ...item, response: "declined" } : item,
      ))
      setEvents((previous) => previous.filter((item) => item.id !== event.id))
    }

    setRespondingEventId(null)
  }

  async function cancelEventParticipation(eventId: string) {
    if (!user || respondingEventId) return

    setRespondingEventId(eventId)
    setActionError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error("A részvétel törléséhez be kell jelentkezned.")
      }

      const response = await fetch("/api/events/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventId, status: "declined" }),
      })
      const result = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "A részvétel törlése nem sikerült.")
      }
    } catch (error) {
      console.error("Részvétel törlési hiba:", error)
      setActionError(error instanceof Error ? error.message : "A részvétel törlése nem sikerült. Próbáld újra.")
      setRespondingEventId(null)
      return
    }

    setOpportunities((previous) => previous.map((item) => (item.id === eventId ? { ...item, response: "declined" } : item)))
    setEvents((previous) => previous.filter((item) => item.id !== eventId))
    setRespondingEventId(null)
    setDetailsEvent(null)
  }

  if (!authResolved || !user) return null
  if (!loading && profileMissing) return null

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
              <ShipWheel className="h-4 w-4" aria-hidden="true" />
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

        {actionError ? (
          <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
            {actionError}
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
                    <li key={event.id} className="flex items-center gap-3 py-3">
                      <EventDateBadge startDate={event.startDate} endDate={event.endDate} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><ShipWheel className="h-3 w-3" aria-hidden="true" />{event.boatName}</span>
                          {event.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{event.location}</span> : null}
                          <span>{event.participation}</span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Részletek: ${event.title}`}
                        title="Részletek"
                        className="h-8 shrink-0 gap-1.5 rounded-full bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/20 hover:text-accent"
                        onClick={() =>
                          setDetailsEvent({
                            id: event.id,
                            title: event.title,
                            date: formatFullEventDateRange(event.startDate, event.endDate),
                            location: event.location,
                            boatName: event.boatName,
                          })
                        }
                      >
                        Részletek
                      </Button>
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
                    <li key={opportunity.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
                      <EventDateBadge startDate={opportunity.startDate} endDate={opportunity.endDate} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{opportunity.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {opportunity.type} · {opportunity.boatName}{opportunity.location ? ` · ${opportunity.location}` : ""}
                        </span>
                        {opportunity.response === "declined" ? (
                          <span className="mt-1 block text-xs font-medium text-rose-700">Nem veszel részt</span>
                        ) : null}
                      </span>
                      <div className="ml-auto flex shrink-0 items-center gap-1.5">
                        {opportunity.response === "declined" ? (
                          <Button
                            type="button"
                            variant="outline"
                            aria-label={`Részvétel vállalása: ${opportunity.title}`}
                            title="Mégis részt veszek"
                            className="h-8 w-8 p-0"
                            disabled={respondingEventId !== null}
                            onClick={() => void respondToEvent(opportunity, "confirmed")}
                          >
                            {respondingEventId === opportunity.id
                              ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                              : <Check className="h-4 w-4" aria-hidden="true" />}
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              aria-label={`Részvétel vállalása: ${opportunity.title}`}
                              title="Részt veszek"
                              className="h-8 w-8 p-0"
                              disabled={respondingEventId !== null}
                              onClick={() => void respondToEvent(opportunity, "confirmed")}
                            >
                              {respondingEventId === opportunity.id
                                ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                                : <Check className="h-4 w-4" aria-hidden="true" />}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              aria-label={`Részvétel visszautasítása: ${opportunity.title}`}
                              title="Nem veszek részt"
                              className="h-8 w-8 p-0"
                              disabled={respondingEventId !== null}
                              onClick={() => void respondToEvent(opportunity, "declined")}
                            >
                              {respondingEventId === opportunity.id
                                ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                                : <X className="h-4 w-4" aria-hidden="true" />}
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Részletek: ${opportunity.title}`}
                          title="Részletek"
                          className="h-8 gap-1.5 rounded-full bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/20 hover:text-accent"
                          onClick={() =>
                            setDetailsEvent({
                              id: opportunity.id,
                              title: opportunity.title,
                              date: formatFullEventDateRange(opportunity.startDate, opportunity.endDate),
                              location: opportunity.location,
                              boatName: opportunity.boatName,
                            })
                          }
                        >
                          Részletek
                        </Button>
                      </div>
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

      <EventDetailsModal
        event={detailsEvent}
        open={detailsEvent !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDetailsEvent(null)
        }}
        currentUserId={user?.id ?? null}
        onCancelParticipation={detailsEvent ? () => void cancelEventParticipation(detailsEvent.id) : undefined}
        canceling={detailsEvent !== null && respondingEventId === detailsEvent.id}
        actionError={actionError}
      />
    </section>
  )
}