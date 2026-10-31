"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Bell } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  buildCrewNotifications,
  buildNotifications,
  formatRelativeTime,
  mergeNotifications,
  NOTIFICATION_WINDOW_DAYS,
  type CaptainNotification,
  type RawNotificationData,
} from "@/lib/notifications"
import { authorizedFetch } from "@/components/crew/crew-data"

// Ha az "utoljára megnézve" mező még nincs az adatbázisban, a böngészőben tartjuk nyilván.
const localSeenKey = (userId: string) => `notifications-seen-at:${userId}`

function readLocalSeen(userId: string) {
  try {
    return window.localStorage.getItem(localSeenKey(userId))
  } catch {
    return null
  }
}

function writeLocalSeen(userId: string, value: string) {
  try {
    window.localStorage.setItem(localSeenKey(userId), value)
  } catch {
    // Privát ablakban a tárolás tilthatja; ilyenkor csak erre a munkamenetre jegyezzük meg.
  }
}

function latestTimestamp(...values: (string | null | undefined)[]) {
  const times = values.filter((value): value is string => Boolean(value)).map((value) => new Date(value).getTime())
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null
}

type NotificationItem = Omit<CaptainNotification, "unread">

async function loadSeenAt(userId: string) {
  const seenResult = await supabase.from("users").select("notifications_seen_at").eq("id", userId).maybeSingle()
  // Az adatbázisban és a böngészőben tárolt időpont közül a későbbi számít: ha az adatbázisba
  // írás nem sikerült, a böngészőben megjegyzett olvasás akkor is érvényes.
  const dbSeen = seenResult.error ? null : ((seenResult.data?.notifications_seen_at as string | null) ?? null)
  return latestTimestamp(dbSeen, readLocalSeen(userId))
}

// A kapitány és a legénység értesítései egy csengőben; ha az egyik forrás hibázik, a másik attól még megjelenik.
async function loadNotifications(userId: string, boatId: string | null, crewHref: string): Promise<CaptainNotification[]> {
  const [captainItems, crewItems, seenAt] = await Promise.all([
    boatId ? loadCaptainItems(userId, boatId) : Promise.resolve([] as NotificationItem[]),
    loadCrewItems(userId, crewHref).catch((error) => {
      console.error("Legénység-értesítések betöltési hiba:", error)
      return [] as NotificationItem[]
    }),
    loadSeenAt(userId),
  ])
  return mergeNotifications([...captainItems, ...crewItems], seenAt)
}

async function loadCrewItems(userId: string, crewHref: string): Promise<NotificationItem[]> {
  const since = new Date(Date.now() - NOTIFICATION_WINDOW_DAYS * 86_400_000).toISOString()
  const today = new Date().toISOString().slice(0, 10)

  const [membershipsResult, ownBoatsResult, decisionsResult, noticesResult, invitations] = await Promise.all([
    supabase.from("boat_team_members").select("boat_id").eq("user_id", userId).eq("status", "active"),
    supabase.from("boats").select("id").eq("user_id", userId),
    // A decided_at oszlop a application-decided-at-migration.sql-lel jön; amíg nincs, ez a forrás üres marad.
    supabase
      .from("applications")
      .select("status, decided_at, ad:ads(title, boat:boats(name))")
      .eq("user_id", userId)
      .gte("decided_at", since),
    // A crew_notices tábla a crew-notices-migration.sql-lel jön; amíg nincs, ez a forrás is üres marad.
    supabase
      .from("crew_notices")
      .select("id, kind, boat_name, title, event_date, created_at")
      .eq("user_id", userId)
      .gte("created_at", since),
    authorizedFetch("/api/boat-team/my-invitations")
      .then((response) => (response.ok ? response.json() : { invitations: [] }))
      .then((data: { invitations?: { token: string; inviterName: string; createdAt: string; boat: { name: string } }[] }) => data.invitations ?? [])
      .catch(() => []),
  ])
  const firstError = membershipsResult.error ?? ownBoatsResult.error
  if (firstError) throw firstError

  const ownBoatIds = new Set((ownBoatsResult.data ?? []).map((row) => String(row.id)))
  const teamBoatIds = (membershipsResult.data ?? []).map((row) => String(row.boat_id)).filter((id) => !ownBoatIds.has(id))

  const eventsResult = teamBoatIds.length > 0
    ? await supabase
        .from("boat_events")
        .select("id, title, start_date, created_at, updated_at, boat:boats(name)")
        .in("boat_id", teamBoatIds)
        .gte("start_date", today)
        .or(`created_at.gte.${since},updated_at.gte.${since}`)
    : { data: [], error: null }
  if (eventsResult.error) throw eventsResult.error
  const events = (eventsResult.data ?? []).map((row) => {
    const boat = (Array.isArray(row.boat) ? row.boat[0] : row.boat) as { name: string | null } | null
    return { id: String(row.id), title: row.title as string | null, boat_name: boat?.name ?? null, start_date: String(row.start_date), created_at: String(row.created_at), updated_at: String(row.updated_at) }
  })

  const answersResult = events.length > 0
    ? await supabase.from("boat_event_attendees").select("event_id, status").eq("user_id", userId).in("event_id", events.map((event) => event.id))
    : { data: [], error: null }
  if (answersResult.error) throw answersResult.error

  if (decisionsResult.error) console.error("Jelentkezési döntések lekérdezési hiba (hiányzik a migráció?):", decisionsResult.error)
  const decisions = (decisionsResult.error ? [] : decisionsResult.data ?? []).map((row) => {
    const ad = (Array.isArray(row.ad) ? row.ad[0] : row.ad) as { title: string | null; boat: { name: string | null } | { name: string | null }[] | null } | null
    const boat = ad ? (Array.isArray(ad.boat) ? ad.boat[0] : ad.boat) : null
    return { ad_title: ad?.title ?? null, boat_name: boat?.name ?? null, status: String(row.status), decided_at: (row.decided_at as string | null) ?? null }
  })

  if (noticesResult.error) console.error("Legénységi értesítések lekérdezési hiba (hiányzik a migráció?):", noticesResult.error)
  const notices = (noticesResult.error ? [] : noticesResult.data ?? []).map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    boat_name: (row.boat_name as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    event_date: (row.event_date as string | null) ?? null,
    created_at: String(row.created_at),
  }))

  return buildCrewNotifications({
    events,
    answers: new Map((answersResult.data ?? []).map((row) => [String(row.event_id), String(row.status)])),
    decisions,
    invitations: invitations.map((row) => ({ token: row.token, inviterName: row.inviterName, boatName: row.boat.name, createdAt: row.createdAt })),
    notices,
    since,
    crewHref,
  })
}

async function loadCaptainItems(userId: string, boatId: string): Promise<NotificationItem[]> {
  const since = new Date(Date.now() - NOTIFICATION_WINDOW_DAYS * 86_400_000).toISOString()

  const [eventsResult, adsResult, joinedResult] = await Promise.all([
    supabase.from("boat_events").select("id, title").eq("boat_id", boatId).gte("start_date", since.slice(0, 10)),
    supabase.from("ads").select("id, title").eq("boat_id", boatId),
    supabase
      .from("boat_team_members")
      .select("user_id, display_name, accepted_at")
      .eq("boat_id", boatId)
      .eq("status", "active")
      .gte("accepted_at", since),
  ])
  const firstError = eventsResult.error ?? adsResult.error ?? joinedResult.error
  if (firstError) throw firstError

  const eventIds = (eventsResult.data ?? []).map((row) => String(row.id))
  const adIds = (adsResult.data ?? []).map((row) => String(row.id))
  const [attendeesResult, applicationsResult] = await Promise.all([
    eventIds.length > 0
      ? supabase.from("boat_event_attendees").select("event_id, user_id, status, updated_at").in("event_id", eventIds).gte("updated_at", since)
      : Promise.resolve({ data: [] as RawNotificationData["attendees"], error: null }),
    adIds.length > 0
      ? supabase.from("applications").select("ad_id, user_id, created_at").in("ad_id", adIds).gte("created_at", since)
      : Promise.resolve({ data: [] as RawNotificationData["applications"], error: null }),
  ])
  const secondError = attendeesResult.error ?? applicationsResult.error
  if (secondError) throw secondError

  const attendees = (attendeesResult.data ?? []) as RawNotificationData["attendees"]
  const applications = (applicationsResult.data ?? []) as RawNotificationData["applications"]
  const joined = (joinedResult.data ?? []) as RawNotificationData["joined"]
  const userIds = Array.from(new Set([
    ...attendees.map((row) => String(row.user_id)),
    ...applications.map((row) => String(row.user_id)),
    ...joined.map((row) => row.user_id).filter((id): id is string => Boolean(id)),
  ]))
  const profilesResult = userIds.length > 0
    ? await supabase.from("users").select("id, full_name").in("id", userIds)
    : { data: [] as RawNotificationData["profiles"], error: null }
  if (profilesResult.error) throw profilesResult.error

  // Az olvasottságot az összefésülés állítja be (felülírja az itteni unread mezőt).
  return buildNotifications({
    captainId: userId,
    events: (eventsResult.data ?? []) as RawNotificationData["events"],
    ads: (adsResult.data ?? []) as RawNotificationData["ads"],
    attendees,
    applications,
    joined,
    profiles: (profilesResult.data ?? []) as RawNotificationData["profiles"],
    seenAt: null,
  })
}

// boatId: a saját hajó (kapitánynak); nélküle csak a legénység-értesítések jönnek.
export function NotificationsMenu({ userId, boatId, crewHref }: { userId: string; boatId: string | null; crewHref: string }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<CaptainNotification[] | null>(null)
  const [failed, setFailed] = useState(false)
  // A megnyitáskor újnak számító tételek: a számláló azonnal nullázódik, de amíg nyitva van a lista, ezek kiemelve maradnak.
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement | null>(null)
  const unreadCount = (items ?? []).filter((item) => item.unread).length

  const refresh = useCallback(() => {
    loadNotifications(userId, boatId, crewHref)
      .then((next) => {
        setItems(next)
        setFailed(false)
      })
      .catch((error) => {
        console.error("Értesítések betöltési hiba:", error)
        setFailed(true)
      })
  }, [userId, boatId, crewHref])

  // Betöltéskor, és amikor a felhasználó visszatér a lapra, frissítünk: így a csengő akkor is friss, ha a lap sokáig nyitva volt.
  useEffect(() => {
    refresh()
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [refresh])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [open])

  async function markSeen(current: CaptainNotification[]) {
    // A legújabb tétel idejénél sem lehet korábbi, így a gép órájának eltérése sem hagy olvasatlant.
    const seenAt = latestTimestamp(new Date().toISOString(), ...current.map((item) => item.at)) as string
    setItems((previous) => previous?.map((item) => ({ ...item, unread: false })) ?? previous)
    writeLocalSeen(userId, seenAt)
    const { error } = await supabase.from("users").update({ notifications_seen_at: seenAt }).eq("id", userId)
    if (error) console.error("Értesítések olvasottra állítása az adatbázisban nem sikerült:", error)
  }

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    const unreadIds = (items ?? []).filter((item) => item.unread).map((item) => item.id)
    setHighlighted(new Set(unreadIds))
    if (unreadIds.length > 0 && items) void markSeen(items)
    setOpen(true)
  }

  const fresh = (items ?? []).filter((item) => highlighted.has(item.id))
  const earlier = (items ?? []).filter((item) => !highlighted.has(item.id))

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={unreadCount > 0 ? `Értesítések, ${unreadCount} új` : "Értesítések"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-muted hover:text-foreground ${
          open ? "bg-muted text-foreground" : "text-muted-foreground"
        }`}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-brand-orange px-1 text-[11px] font-bold text-brand-orange-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Értesítések"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl border border-border bg-popover pb-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-full sm:mt-2 sm:max-h-[70vh] sm:w-[380px] sm:rounded-2xl sm:pb-1.5"
          >
            <div className="sticky top-0 bg-popover px-4 pt-3 pb-2">
              <span className="text-base font-bold text-foreground">Értesítések</span>
            </div>

            {failed ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Az értesítéseket most nem sikerült betölteni.</p>
            ) : items === null ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Betöltés…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Az elmúlt két hétben nem történt semmi új.</p>
            ) : (
              <div className="px-1.5">
                <NotificationList items={fresh} isNew onNavigate={() => setOpen(false)} />
                {earlier.length > 0 ? (
                  <>
                    {fresh.length > 0 ? <p className="px-3 pt-2.5 pb-1 text-[13px] font-semibold text-muted-foreground">Korábban</p> : null}
                    <NotificationList items={earlier} isNew={false} onNavigate={() => setOpen(false)} />
                  </>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function NotificationList({ items, isNew, onNavigate }: { items: CaptainNotification[]; isNew: boolean; onNavigate: () => void }) {
  if (items.length === 0) return null
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <Link href={item.href} onClick={onNavigate} className="flex gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted">
            <span
              className={`mt-2 h-2 w-2 shrink-0 rounded-full ${isNew ? "bg-brand-orange" : "bg-transparent"}`}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className={`block text-[15px] ${isNew ? "text-foreground" : "text-foreground/80"}`}>
                <span className="font-semibold">{item.actor}</span> {item.headline}
                {isNew ? <span className="sr-only"> (új)</span> : null}
              </span>
              <span className="block truncate text-[13px] text-muted-foreground">
                {[item.subject, formatRelativeTime(item.at)].filter(Boolean).join(" · ")}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
