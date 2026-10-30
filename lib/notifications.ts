// A csengő értesítései: nincs külön értesítéstábla, a meglévő időbélyegekből állnak össze
// (visszajelzések, jelentkezések, csapatba lépések). Új az, ami az utolsó megnézés után történt.

export type NotificationKind = "confirmed" | "declined" | "applied" | "joined"

export type CaptainNotification = {
  id: string
  kind: NotificationKind
  actor: string
  headline: string
  subject: string
  at: string
  href: string
  unread: boolean
}

export const NOTIFICATION_WINDOW_DAYS = 14
const MAX_NOTIFICATIONS = 20

export type RawNotificationData = {
  captainId: string
  events: { id: string; title: string | null }[]
  ads: { id: string; title: string | null }[]
  attendees: { event_id: string; user_id: string; status: string; updated_at: string }[]
  applications: { ad_id: string; user_id: string; created_at: string }[]
  joined: { user_id: string | null; display_name: string | null; accepted_at: string | null }[]
  profiles: { id: string; full_name: string | null }[]
  seenAt: string | null
}

export function buildNotifications(raw: RawNotificationData): CaptainNotification[] {
  const nameById = new Map(raw.profiles.map((row) => [String(row.id), (row.full_name ?? "").trim()]))
  const eventTitle = new Map(raw.events.map((row) => [String(row.id), row.title?.trim() || "Esemény"]))
  const adTitle = new Map(raw.ads.map((row) => [String(row.id), row.title?.trim() || "Hirdetés"]))
  const seen = raw.seenAt ? new Date(raw.seenAt).getTime() : 0
  const nameOf = (userId: string, fallback = "Valaki") => nameById.get(userId) || fallback

  const items: Omit<CaptainNotification, "unread">[] = []

  for (const row of raw.attendees) {
    if (row.user_id === raw.captainId || (row.status !== "confirmed" && row.status !== "declined")) continue
    const confirmed = row.status === "confirmed"
    items.push({
      id: `attend-${row.event_id}-${row.user_id}`,
      kind: confirmed ? "confirmed" : "declined",
      actor: nameOf(row.user_id),
      headline: confirmed ? "jön" : "nem jön",
      subject: eventTitle.get(String(row.event_id)) ?? "Esemény",
      at: row.updated_at,
      href: `/kapitany-dashboard?esemeny=${encodeURIComponent(row.event_id)}`,
    })
  }

  for (const row of raw.applications) {
    items.push({
      id: `apply-${row.ad_id}-${row.user_id}`,
      kind: "applied",
      actor: nameOf(row.user_id),
      headline: "jelentkezett",
      subject: `${adTitle.get(String(row.ad_id)) ?? "Hirdetés"} hirdetés`,
      at: row.created_at,
      href: `/kapitany-dashboard?jelentkezok=${encodeURIComponent(row.ad_id)}`,
    })
  }

  for (const row of raw.joined) {
    if (!row.accepted_at) continue
    items.push({
      id: `join-${row.user_id ?? row.display_name}`,
      kind: "joined",
      actor: (row.user_id ? nameById.get(row.user_id) : null) || row.display_name?.trim() || "Új tag",
      headline: "csatlakozott a csapatodhoz",
      subject: "",
      at: row.accepted_at,
      href: "/kapitany-dashboard?ful=csapat",
    })
  }

  return items
    .sort((first, second) => second.at.localeCompare(first.at))
    .slice(0, MAX_NOTIFICATIONS)
    .map((item) => ({ ...item, unread: new Date(item.at).getTime() > seen }))
}

export function formatRelativeTime(at: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(at).getTime()) / 60_000))
  if (minutes < 1) return "most"
  if (minutes < 60) return `${minutes} perce`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} órája`
  const days = Math.round(hours / 24)
  return days === 1 ? "tegnap" : `${days} napja`
}
