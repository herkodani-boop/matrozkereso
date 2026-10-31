// A csengő értesítései: nincs külön értesítéstábla, a meglévő időbélyegekből állnak össze
// (visszajelzések, jelentkezések, csapatba lépések). Új az, ami az utolsó megnézés után történt.

// A kapitány (visszajelzések, jelentkezők, új tagok) és a legénység (új esemény, módosítás,
// döntés a jelentkezésről, meghívó) értesítései ugyanabban a csengőben jelennek meg.
export type NotificationKind =
  | "confirmed" | "declined" | "applied" | "joined"
  | "event-new" | "event-changed" | "event-cancelled" | "application-accepted" | "application-rejected"
  | "invited" | "team-removed" | "member-left"

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

export type RawCrewNotificationData = {
  // Események a csapataim hajóin (a saját hajó nélkül), a hajó nevével.
  events: { id: string; title: string | null; boat_name: string | null; start_date: string; created_at: string; updated_at: string }[]
  // A saját válaszom eseményenként: módosításról csak akkor szólunk, ha megyek vagy még nem válaszoltam.
  answers: Map<string, string>
  // A kapitány döntése a jelentkezéseimről (decided_at a döntés ideje).
  decisions: { ad_title: string | null; boat_name: string | null; status: string; decided_at: string | null }[]
  invitations: { token: string; inviterName: string; boatName: string; createdAt: string }[]
  // A törölt eseményekről, a csapatból eltávolításról és (a kapitánynak) a kilépésről a crew_notices tábla őrzi a nyomot.
  notices: { id: string; kind: string; boat_name: string | null; title: string | null; event_date: string | null; created_at: string }[]
  since: string
  // Hová vigyen a kattintás: a matróznál a kezdőlap, a kapitánynál a Vitorlázásaim oldal.
  crewHref: string
}

// Névelő a név elé: magánhangzóval kezdődő név előtt "az" ("az Avalon"), egyébként "a" ("a Sirocco").
export function hungarianArticle(word: string) {
  return /^[aáeéiíoóöőuúüű]/i.test(word.trim()) ? "az" : "a"
}

// Egy esemény "módosult", ha a felvétele után legalább ennyivel később szerkesztették.
const EDIT_GRACE_MS = 5 * 60_000
const shortDate = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric" })

export function buildCrewNotifications(raw: RawCrewNotificationData): Omit<CaptainNotification, "unread">[] {
  const since = new Date(raw.since).getTime()
  const items: Omit<CaptainNotification, "unread">[] = []

  for (const event of raw.events) {
    const created = new Date(event.created_at).getTime()
    const updated = new Date(event.updated_at).getTime()
    const title = event.title?.trim() || "Esemény"
    const boat = event.boat_name?.trim() || "A csapatod"
    const when = shortDate.format(new Date(`${event.start_date}T12:00:00`))
    if (created >= since) {
      items.push({ id: `event-new-${event.id}`, kind: "event-new", actor: boat, headline: "új eseményt vett fel", subject: `${title} · ${when}`, at: event.created_at, href: raw.crewHref })
      continue
    }
    const answer = raw.answers.get(String(event.id))
    if (updated >= since && updated - created > EDIT_GRACE_MS && answer !== "declined") {
      items.push({ id: `event-changed-${event.id}-${event.updated_at}`, kind: "event-changed", actor: boat, headline: "módosított egy eseményt", subject: `${title} · ${when}`, at: event.updated_at, href: raw.crewHref })
    }
  }

  for (const decision of raw.decisions) {
    if (!decision.decided_at || new Date(decision.decided_at).getTime() < since) continue
    const accepted = decision.status === "accepted"
    if (!accepted && decision.status !== "rejected") continue
    const subject = [decision.ad_title?.trim() || "Hirdetés", decision.boat_name?.trim()].filter(Boolean).join(" · ")
    items.push({
      id: `decision-${subject}-${decision.decided_at}`,
      kind: accepted ? "application-accepted" : "application-rejected",
      actor: accepted ? "Elfogadták" : "Most nem jött össze",
      headline: accepted ? "a jelentkezésedet" : "a jelentkezésed",
      subject,
      at: decision.decided_at,
      href: raw.crewHref,
    })
  }

  for (const invitation of raw.invitations) {
    if (new Date(invitation.createdAt).getTime() < since) continue
    items.push({
      id: `invite-${invitation.token}`,
      kind: "invited",
      actor: invitation.inviterName,
      headline: `meghívott ${hungarianArticle(invitation.boatName)} ${invitation.boatName} csapatába`,
      subject: "",
      at: invitation.createdAt,
      href: "/",
    })
  }

  for (const notice of raw.notices) {
    if (new Date(notice.created_at).getTime() < since) continue
    const boat = notice.boat_name?.trim() || "Hajó"
    if (notice.kind === "event-cancelled") {
      const title = notice.title?.trim() || "Esemény"
      const when = notice.event_date ? shortDate.format(new Date(`${notice.event_date}T12:00:00`)) : null
      items.push({ id: `notice-${notice.id}`, kind: "event-cancelled", actor: boat, headline: "lemondott egy eseményt", subject: [title, when].filter(Boolean).join(" · "), at: notice.created_at, href: raw.crewHref })
    } else if (notice.kind === "team-removed") {
      items.push({ id: `notice-${notice.id}`, kind: "team-removed", actor: "Kikerültél", headline: `${hungarianArticle(boat)} ${boat} csapatából`, subject: "", at: notice.created_at, href: raw.crewHref })
    } else if (notice.kind === "member-left") {
      // A kapitánynak szól: a title itt a kilépett tag neve.
      items.push({ id: `notice-${notice.id}`, kind: "member-left", actor: notice.title?.trim() || "Egy csapattag", headline: `kilépett ${hungarianArticle(boat)} ${boat} csapatából`, subject: "", at: notice.created_at, href: "/kapitany-dashboard?ful=csapat" })
    }
  }

  return items
}

// A két forrás összefésülése: legújabb elöl, legfeljebb 20, és olvasatlan, ami az utolsó megnézés után történt.
export function mergeNotifications(items: Omit<CaptainNotification, "unread">[], seenAt: string | null): CaptainNotification[] {
  const seen = seenAt ? new Date(seenAt).getTime() : 0
  return [...items]
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
