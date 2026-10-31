"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { CalendarDays, Check, UserRound } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { daysUntil } from "@/components/captain-home/use-captain-home-data"
import { EventWeatherPanel } from "@/components/captain-home/event-extras"
import { authorizedFetch, type CrewTeam, type OtherBoatEvent, type ProfileGaps, type TeamInvitation } from "./crew-data"

export const primaryButton =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
export const secondaryButton =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
export const compactPrimary = primaryButton.replace("h-11", "h-10").replace("px-4", "px-3.5")
export const compactSecondary = secondaryButton.replace("h-11", "h-10").replace("px-4", "px-3.5")
export const groupHeading = "flex items-center gap-2 border-b border-border/70 bg-secondary/50 px-5 py-3 text-sm font-semibold text-muted-foreground"
export const rowClass = "flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/70 px-5 py-4 last:border-b-0"

const shortMonthFormat = new Intl.DateTimeFormat("hu-HU", { month: "short" })
const weekdayFormat = new Intl.DateTimeFormat("hu-HU", { weekday: "long" })
const longDateFormat = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" })
const monthYearFormat = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" })
const monthFormat = new Intl.DateTimeFormat("hu-HU", { month: "long" })

export function toDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`)
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function weekday(dateKey: string) {
  return weekdayFormat.format(toDate(dateKey))
}

export function formatDateRange(startDate: string, endDate: string | null) {
  const start = longDateFormat.format(toDate(startDate))
  return endDate && endDate !== startDate ? `${start} – ${longDateFormat.format(toDate(endDate))}` : start
}

function shortMonth(date: Date) {
  return shortMonthFormat.format(date).replace(/\.$/, "")
}

// "Holnap", "Szombaton"-szerű relatív nap a köszöntésbe és a kártyákra.
export function relativeDay(dateKey: string) {
  const days = daysUntil(dateKey)
  if (days <= 0) return "ma"
  if (days === 1) return "holnap"
  if (days < 7) return weekday(dateKey)
  return `${days} nap múlva`
}

// Hónap-csoport címe: az idei hónapok névvel, a jövő éviek évszámmal.
export function monthGroupLabel(dateKey: string) {
  const date = toDate(dateKey)
  return capitalize(date.getFullYear() === new Date().getFullYear() ? monthFormat.format(date) : monthYearFormat.format(date))
}

export function DateBlock({ startDate, endDate, strong = false, muted = false }: { startDate: string | null; endDate?: string | null; strong?: boolean; muted?: boolean }) {
  const tone = strong ? "bg-brand text-white" : "bg-brand-soft text-brand-ink"
  if (!startDate) {
    return (
      <span className={`flex h-[52px] w-[60px] shrink-0 items-center justify-center rounded-lg ${tone}`} aria-hidden="true">
        <CalendarDays className="h-5 w-5" />
      </span>
    )
  }
  const start = toDate(startDate)
  const end = endDate && endDate !== startDate ? toDate(endDate) : null
  const day = end && end.getMonth() === start.getMonth() ? `${start.getDate()}–${end.getDate()}.` : `${start.getDate()}.`
  return (
    <time dateTime={startDate} className={`flex w-[60px] shrink-0 flex-col items-center rounded-lg py-1.5 ${tone} ${muted ? "opacity-60" : ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider">{shortMonth(start)}</span>
      <span className={`font-bold leading-tight ${day.length > 4 ? "text-[15px]" : "text-xl"}`}>{day}</span>
    </time>
  )
}

export function BoatTag({ name, color }: { name: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-secondary px-2.5 py-0.5 text-[13px] font-medium text-foreground/85">
      {color ? <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" /> : null}
      {name}
    </span>
  )
}

export function GoingChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[13px] font-semibold text-brand-ink">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      Jössz
    </span>
  )
}

// Hiányos profil: bármelyik kezdőlap tetejére kerülhet, és eltűnik, ha a profil teljes.
export function ProfileBanner({ gaps }: { gaps: ProfileGaps | null }) {
  if (!gaps) return null
  const missing = [gaps.name ? "a neved" : null, gaps.phone ? "a telefonszámod" : null, gaps.level ? "a tapasztalatod" : null].filter(Boolean) as string[]
  if (missing.length === 0) return null
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} és ${missing[missing.length - 1]}`

  return (
    <section aria-labelledby="profile-banner" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-brand-orange/40 bg-brand-orange/10 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-attention-ink">
        <UserRound className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-[999_1_260px]">
        <p id="profile-banner" className="font-semibold">Egészítsd ki a profilodat</p>
        <p className="mt-0.5 text-sm text-foreground/80">
          Hiányzik {list}. Ezek nélkül a kapitány nehezen dönt, és nem tud elérni.
        </p>
      </div>
      <Link href="/profil" className={primaryButton}>Profil kiegészítése</Link>
    </section>
  )
}

// Csapatmeghívó: ez az első és legfontosabb teendő, ezért a köszöntés helyére kerül.
export function InvitationCard({ invitation, onDone }: { invitation: TeamInvitation; onDone: (accepted: boolean) => void }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const days = Math.max(0, -daysUntil(invitation.createdAt.slice(0, 10)))
  const boat = invitation.boat

  async function act(kind: "accept" | "decline") {
    setBusy(kind)
    setError(null)
    try {
      const response = await authorizedFetch(kind === "accept" ? "/api/boat-team/accept" : "/api/boat-team/decline", {
        method: "POST",
        body: JSON.stringify({ token: invitation.token }),
      })
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!response.ok || !result.ok) throw new Error(result.error || "Nem sikerült elmenteni a válaszodat.")
      onDone(kind === "accept")
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Nem sikerült elmenteni a válaszodat.")
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby={`invite-${invitation.token}`} className="flex flex-wrap overflow-hidden rounded-2xl border-2 border-brand bg-card">
      <div className="relative min-h-[220px] min-w-0 flex-[1_1_320px] bg-brand-soft">
        {boat.imageUrl ? <Image src={boat.imageUrl} alt={`A ${boat.name} vitorlás`} fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover" /> : null}
      </div>
      <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-4 p-6 sm:p-8">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
            Meghívó · {days === 0 ? "ma" : `${days} napja`}
          </p>
          <h1 id={`invite-${invitation.token}`} className="mt-1.5 text-2xl font-bold leading-tight tracking-tight sm:text-[30px]">
            {invitation.inviterName} meghívott a {boat.name} csapatába
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            {[boat.type, boat.harbor, boat.crewCount > 0 ? `${boat.crewCount} csapattag` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ul className="flex flex-col gap-2 text-[15px] text-foreground/85">
          {[
            "Látod a hajó összes eseményét, és jelezheted, mikor mész.",
            "A kapitány és a csapat látja a nevedet és az elérhetőségedet.",
            "Bármikor kiléphetsz a profilodban.",
          ].map((line) => (
            <li key={line} className="flex gap-2.5">
              <Check className="mt-1 h-4 w-4 shrink-0 text-success-ink" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
        {invitation.upcomingEvents.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Következő eseményeik: {invitation.upcomingEvents.map((event) => `${event.title} (${formatDateRange(event.startDate, event.endDate)})`).join(", ")}
          </p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2.5">
          <button type="button" disabled={busy !== null} onClick={() => void act("accept")} className={`${primaryButton} h-12 px-6 text-[15px]`}>
            {busy === "accept" ? "Csatlakozás..." : "Elfogadom"}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void act("decline")} className={`${secondaryButton} h-12 px-6 text-[15px]`}>
            {busy === "decline" ? "Mentés..." : "Most nem"}
          </button>
        </div>
      </div>
    </section>
  )
}

type Person = { id: string; name: string; avatarUrl: string | null }

// Akik jönnek az eseményre (a saját válaszon kívül), avatarral.
function useConfirmedPeople(eventId: string) {
  const [people, setPeople] = useState<Person[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data: rows, error } = await supabase.from("boat_event_attendees").select("user_id").eq("event_id", eventId).eq("status", "confirmed")
      if (error) throw error
      const ids = (rows ?? []).map((row) => String(row.user_id))
      if (ids.length === 0) return []
      const { data: profiles, error: profileError } = await supabase.from("users").select("id, full_name, avatar_url").in("id", ids)
      if (profileError) throw profileError
      const byId = new Map((profiles ?? []).map((row) => [String(row.id), row]))
      return ids.map((id) => ({
        id,
        name: String(byId.get(id)?.full_name ?? "").trim() || "Csapattag",
        avatarUrl: (byId.get(id)?.avatar_url as string | null | undefined) ?? null,
      }))
    }
    load()
      .then((next) => {
        if (active) setPeople(next)
      })
      .catch((error) => console.error("Résztvevők betöltési hiba:", error))
    return () => {
      active = false
    }
  }, [eventId])

  return people
}

const AVATARS_SHOWN = 6

// A következő vitorlázás a matróz szemével: mikor, hol, milyen idő, mit írt a kapitány, kik jönnek.
export function NextSailingCard({
  event,
  team,
  compact = false,
  busy,
  onCancel,
  onDetails,
}: {
  event: OtherBoatEvent
  team: CrewTeam | null
  compact?: boolean
  busy: boolean
  onCancel: () => void
  onDetails: () => void
}) {
  const people = useConfirmedPeople(event.id)
  const shown = people.slice(0, AVATARS_SHOWN)
  const days = daysUntil(event.startDate)
  const start = toDate(event.startDate)

  return (
    <section aria-labelledby="next-sailing" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="next-sailing" className="text-base font-semibold">Következő vitorlázásod</h2>
        <GoingChip />
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="w-[72px] shrink-0 rounded-xl bg-brand py-2.5 text-center text-white" aria-hidden="true">
          <div className="text-[13px] font-semibold uppercase tracking-widest text-white/85">{shortMonth(start)}</div>
          <div className="text-[30px] font-bold leading-tight">{start.getDate()}</div>
          <div className="text-[13px] text-white/85">{days <= 0 ? "ma" : days === 1 ? "holnap" : `${days} nap`}</div>
        </div>
        <div className="min-w-0 flex-[999_1_240px]">
          <h3 className="text-[22px] font-bold tracking-tight">{event.title}</h3>
          <p className="mt-1 text-muted-foreground">
            {[event.boatName, event.location, weekday(event.startDate)].filter(Boolean).join(" · ")}
          </p>
          {event.note ? (
            <p className="mt-3 rounded-lg border border-border/70 bg-secondary/50 px-3.5 py-2.5 text-sm text-foreground/90">
              <span className="font-semibold">{team?.captainName ? `${team.captainName}, a kapitány:` : "A kapitány:"}</span> {event.note}
            </p>
          ) : null}
        </div>
      </div>

      {compact ? null : <EventWeatherPanel event={event} harbor={team?.harbor ?? ""} />}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3.5 border-t border-border/70 pt-4">
        <div className="flex items-center gap-2.5">
          {shown.length > 0 ? (
            <span className="flex items-center">
              {shown.map((person, index) => (
                <span
                  key={person.id}
                  title={person.name}
                  className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-brand-soft text-xs font-semibold text-brand-ink ${index > 0 ? "-ml-2" : ""}`}
                >
                  {person.avatarUrl ? <Image src={person.avatarUrl} alt={person.name} fill sizes="32px" className="object-cover" /> : person.name.charAt(0).toUpperCase()}
                </span>
              ))}
            </span>
          ) : null}
          <span className="text-sm text-muted-foreground">{people.length > 0 ? `${people.length} fő jön, te is` : "Te jössz"}</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" disabled={busy} onClick={onCancel} className={secondaryButton}>
            {busy ? "Mentés..." : "Mégsem tudok menni"}
          </button>
          <button type="button" onClick={onDetails} className={primaryButton}>Részletek</button>
        </div>
      </div>
    </section>
  )
}

// Csapataim: hol vagyok csapattag, és ott mi vár rám.
export function TeamsCard({ teams, events, large = false }: { teams: CrewTeam[]; events: OtherBoatEvent[]; large?: boolean }) {
  if (teams.length === 0) return null

  const statusFor = (team: CrewTeam) => {
    const own = events.filter((event) => event.boatId === team.boatId)
    const awaiting = own.filter((event) => event.answer === "open").length
    const next = own.find((event) => event.answer === "confirmed")
    if (awaiting > 0) return `${awaiting} vár válaszra`
    if (next) return `${capitalize(relativeDay(next.startDate))} mész`
    return null
  }

  if (large && teams.length === 1) {
    const team = teams[0]
    return (
      <section aria-labelledby="crew-teams" className="overflow-hidden rounded-2xl border border-border bg-card">
        <h2 id="crew-teams" className="border-b border-border/70 px-5 py-4 text-base font-semibold">Csapataim</h2>
        <div className="relative h-[120px] bg-brand-soft">
          {team.imageUrl ? <Image src={team.imageUrl} alt={`A ${team.name} vitorlás`} fill sizes="360px" className="object-cover" /> : null}
        </div>
        <div className="px-5 pb-5 pt-3.5">
          <p className="text-[17px] font-bold">{team.name}</p>
          <p className="text-sm text-muted-foreground">{[team.type, team.harbor].filter(Boolean).join(" · ")}</p>
          {team.captainName ? <p className="mt-2 text-sm text-foreground/80">Kapitány: {team.captainName}</p> : null}
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="crew-teams" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <h2 id="crew-teams" className="text-base font-semibold">Csapataim</h2>
        <span className="text-sm text-muted-foreground">{teams.length}</span>
      </div>
      <ul>
        {teams.map((team) => {
          const status = statusFor(team)
          return (
            <li key={team.boatId} className="flex items-center gap-3.5 border-b border-border/70 px-5 py-3.5 last:border-b-0">
              <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-brand-soft">
                {team.imageUrl ? <Image src={team.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : null}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-bold">
                  <span className="h-2 w-2 rounded-full" style={{ background: team.color }} aria-hidden="true" />
                  {team.name}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {[team.captainName ? `Kapitány: ${team.captainName}` : null, status].filter(Boolean).join(" · ")}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
