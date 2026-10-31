"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Contact, Eye, LogOut, Mail, Phone, Users } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { getTodayKey } from "@/components/captain-home/use-captain-home-data"
import { hungarianArticle } from "@/lib/notifications"
import { notifyCrewDataChanged, respondToEvent } from "./crew-data"
import { TeamEventDialog } from "./team-event-dialog"
import {
  BoatTag,
  DateBlock,
  GoingChip,
  capitalize,
  compactPrimary,
  compactSecondary,
  monthGroupLabel,
  primaryButton,
  rowClass,
  secondaryButton,
  weekday,
} from "./crew-ui"
import {
  attendance,
  eventDays,
  findClashes,
  leaveTeam,
  monthGrid,
  myAnswer,
  useTeams,
  type MyAnswer,
  type TeamEvent,
  type TeamMember,
  type TeamPeople,
  type TeamView,
} from "./teams-data"

const UPCOMING_SHOWN = 6
// Sok eseménynél (pl. egy egész versenynaptár) a lista ennyivel bővül kattintásonként.
const UPCOMING_STEP = 10
// Nagy (akár 30 fős) csapatnál ennyi tag látszik alapból; felette névre szűrő is jár a listához.
const MEMBERS_SHOWN = 8
const MEMBER_FILTER_FROM = 12
const AVATARS_SHOWN = 5
const monthTitleFormat = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" })
const dayMonthFormat = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric" })
const sinceFormat = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" })
const WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"]

const card = "overflow-hidden rounded-2xl border border-border bg-card"
const cardHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5"

function isUpcoming(event: TeamEvent, todayKey: string) {
  return (event.endDate ?? event.startDate) >= todayKey
}

function firstName(name: string) {
  const parts = name.trim().split(/\s+/)
  // Magyar sorrend: vezetéknév elöl, ezért a második szó a keresztnév, ha van.
  return parts.length > 1 ? parts[1] : parts[0]
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "?"
}

function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    <Image src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-brand-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials(name)}
    </span>
  )
}

// Kik jönnek: avatarok és összesítés ("5 jön · 1 nem · 2 még nem válaszolt").
function AttendanceLine({ event, team, people }: { event: TeamEvent; team: TeamView; people: TeamPeople }) {
  const { confirmed, declined, unanswered } = attendance(event, team.members)
  const memberById = new Map(team.members.map((member) => [member.id, member]))
  const parts = [`${confirmed.length} jön`, declined.length > 0 ? `${declined.length} nem` : null, unanswered.length > 0 ? `${unanswered.length} még nem válaszolt` : null]
  return (
    <div className="mt-1.5 flex items-center gap-2 text-[13px] text-foreground/75">
      {confirmed.length > 0 ? (
        <span className="flex" aria-hidden="true">
          {confirmed.slice(0, AVATARS_SHOWN).map((id, index) => {
            const person = memberById.get(id) ?? { name: people[id]?.name ?? "Résztvevő", avatarUrl: people[id]?.avatarUrl ?? null }
            return (
              <span key={id} className={`rounded-full ring-2 ring-card ${index > 0 ? "-ml-1.5" : ""}`}>
                <Avatar name={person.name} url={person.avatarUrl} size={24} />
              </span>
            )
          })}
          {confirmed.length > AVATARS_SHOWN ? (
            <span className="-ml-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-bold text-foreground/80 ring-2 ring-card">
              +{confirmed.length - AVATARS_SHOWN}
            </span>
          ) : null}
        </span>
      ) : null}
      {parts.filter(Boolean).join(" · ")}
    </div>
  )
}

export function TeamsPage() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const router = useRouter()
  const searchParams = useSearchParams()
  const data = useTeams(userId)
  const [selected, setSelected] = useState<string | null>(searchParams.get("hajo"))
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Azonosítók, nem másolat: válasz után az ablak a frissített eseményt mutatja.
  const [details, setDetails] = useState<{ eventId: string; boatId: string } | null>(null)
  const [leaving, setLeaving] = useState<TeamView | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const teams = data.teams
  const current = teams.length === 1 ? teams[0] : teams.find((team) => team.boatId === selected) ?? null

  function select(boatId: string | null) {
    setSelected(boatId)
    router.replace(boatId ? `/csapataim?hajo=${encodeURIComponent(boatId)}` : "/csapataim", { scroll: false })
  }

  async function respond(event: TeamEvent, status: "confirmed" | "declined") {
    if (respondingId) return
    setRespondingId(event.id)
    setActionError(null)
    try {
      await respondToEvent(event.id, status)
      data.setAnswer(event.id, status)
      notifyCrewDataChanged()
    } catch (error) {
      console.error("Esemény-visszajelzés mentési hiba:", error)
      setActionError(error instanceof Error ? error.message : "A válaszod mentése nem sikerült. Próbáld újra.")
    } finally {
      setRespondingId(null)
    }
  }

  const openDetails = (event: TeamEvent, team: TeamView) => {
    setActionError(null)
    setDetails({ eventId: event.id, boatId: team.boatId })
  }
  const detailsTeam = details ? teams.find((team) => team.boatId === details.boatId) ?? null : null
  const detailsEvent = details ? detailsTeam?.events.find((event) => event.id === details.eventId) ?? null : null

  const shared = { userId, people: data.people, respondingId, onRespond: respond, onOpen: openDetails }

  return (
    <div className="flex-1 bg-secondary/60">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Csapataim</h1>
            <p className="mt-1 text-muted-foreground">
              {!current && teams.length > 1
                ? "Az összesített naptárban látszik, ha ütközik valami."
                : "A csapatod naptára, eseményei és tagjai, egy helyen."}
            </p>
          </div>
          {teams.length > 1 ? <TeamTabs teams={teams} selected={current?.boatId ?? null} onSelect={select} /> : null}
        </div>

        {notice ? <p role="status" className="rounded-xl border border-border bg-card px-5 py-3.5 text-sm">{notice}</p> : null}
        {actionError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-card px-5 py-3.5 text-sm text-destructive">{actionError}</p> : null}

        {data.status === "loading" ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : data.status === "error" ? (
          <div role="alert" className={`${card} flex flex-wrap items-center justify-between gap-3 px-5 py-4`}>
            <p className="text-sm text-destructive">A csapataidat most nem sikerült betölteni.</p>
            <button type="button" onClick={data.reload} className={compactSecondary}>Újrapróbálom</button>
          </div>
        ) : teams.length === 0 ? (
          <NoTeams />
        ) : current ? (
          <TeamDetail key={current.boatId} team={current} {...shared} onLeave={() => setLeaving(current)} />
        ) : (
          <AllTeams teams={teams} {...shared} />
        )}
      </main>

      <TeamEventDialog
        item={detailsTeam && detailsEvent ? { event: detailsEvent, team: detailsTeam } : null}
        userId={userId}
        people={data.people}
        respondingId={respondingId}
        onRespond={respond}
        onClose={() => setDetails(null)}
      />

      <LeaveDialog
        team={leaving}
        onClose={() => setLeaving(null)}
        onLeft={(team) => {
          setLeaving(null)
          setSelected(null)
          router.replace("/csapataim", { scroll: false })
          setNotice(`Kiléptél ${hungarianArticle(team.name)} ${team.name} csapatából.`)
          data.reload()
          notifyCrewDataChanged()
        }}
        userId={userId}
      />
    </div>
  )
}

type SharedProps = {
  userId: string | null
  people: TeamPeople
  respondingId: string | null
  onRespond: (event: TeamEvent, status: "confirmed" | "declined") => void
  onOpen: (event: TeamEvent, team: TeamView) => void
}

function TeamTabs({ teams, selected, onSelect }: { teams: TeamView[]; selected: string | null; onSelect: (boatId: string | null) => void }) {
  const tab = (active: boolean) =>
    `inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px] transition-colors ${
      active ? "border-brand bg-brand font-semibold text-white" : "border-border bg-card font-medium text-foreground hover:border-brand/40"
    }`
  return (
    <div role="group" aria-label="Csapat választása" className="flex max-w-full gap-2 overflow-x-auto pb-1">
      <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={tab(selected === null)}>
        Összes
      </button>
      {teams.map((team) => (
        <button key={team.boatId} type="button" aria-pressed={selected === team.boatId} onClick={() => onSelect(team.boatId)} className={tab(selected === team.boatId)}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: team.color }} aria-hidden="true" />
          {team.name}
          {team.own ? <span className="text-xs font-semibold opacity-85">· a te csapatod</span> : null}
        </button>
      ))}
    </div>
  )
}

function TeamDetail({ team, onLeave, ...shared }: SharedProps & { team: TeamView; onLeave: () => void }) {
  const { userId } = shared
  const todayKey = getTodayKey()
  const upcoming = team.events.filter((event) => isUpcoming(event, todayKey))
  const captain = team.members.find((member) => member.isCaptain) ?? null
  const nextGoing = team.own ? undefined : upcoming.find((event) => myAnswer(event, userId) === "confirmed")
  const nextAny = upcoming[0]
  const [contact, setContact] = useState<TeamMember | null>(null)

  return (
    <>
      {team.own ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-brand-soft px-5 py-4 text-brand-ink">
          <Eye className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-[999_1_320px]">
            <span className="font-semibold">Így látják a csapattagjaid {hungarianArticle(team.name)} {team.name} csapatot.</span> Itt csak nézelődsz: eseményt, tagot és meghívót a Hajóm oldalon kezelsz.
          </p>
          <Link href="/kapitany-dashboard" className={primaryButton}>Kezelés a Hajóm oldalon</Link>
        </div>
      ) : null}

      <section aria-labelledby="team-name" className={`${card} flex flex-wrap`}>
        <div className="relative min-h-[200px] min-w-0 flex-[1_1_300px] bg-brand-soft">
          {team.imageUrl ? <Image src={team.imageUrl} alt={`${capitalize(hungarianArticle(team.name))} ${team.name} vitorlás`} fill sizes="(max-width: 768px) 100vw, 380px" className="object-cover" /> : null}
        </div>
        <div className="flex min-w-0 flex-[999_1_440px] flex-col gap-4 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="team-name" className="text-2xl font-bold tracking-tight sm:text-[28px]">{team.name}</h2>
              <p className="mt-1 text-muted-foreground">{[team.type, team.harbor].filter(Boolean).join(" · ")}</p>
            </div>
            {team.own ? (
              <span className="rounded-full bg-brand-orange/15 px-3 py-1 text-[13px] font-semibold text-foreground">A te csapatod · kapitány vagy</span>
            ) : team.memberSince ? (
              <span className="rounded-full bg-brand-soft px-3 py-1 text-[13px] font-semibold text-brand-ink">Csapattag {sinceFormat.format(new Date(team.memberSince))} óta</span>
            ) : null}
          </div>

          {!team.own && captain ? (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-xl bg-secondary px-3.5 py-3">
              <Avatar name={captain.name} url={captain.avatarUrl} />
              <div className="min-w-0 flex-[999_1_180px]">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {captain.name}
                  <span className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-xs font-semibold">Kapitány</span>
                </p>
                <p className="text-sm text-muted-foreground">{captain.phone || captain.email || "Nem adott meg elérhetőséget."}</p>
              </div>
              {captain.phone || captain.email ? (
                <button type="button" onClick={() => setContact(captain)} className={compactSecondary}>
                  <Contact className="h-4 w-4" aria-hidden="true" />
                  Elérhetőség
                </button>
              ) : null}
            </div>
          ) : null}

          {team.own ? <OwnStats team={team} upcoming={upcoming} /> : nextGoing ? (
            <button type="button" onClick={() => shared.onOpen(nextGoing, team)} className="flex items-center gap-2 self-start text-left text-sm text-muted-foreground hover:underline">
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              Következő vitorlázásod: <span className="font-semibold text-foreground">{nextGoing.title}, {dayMonthFormat.format(new Date(`${nextGoing.startDate}T12:00:00`))}, {weekday(nextGoing.startDate)}</span>
            </button>
          ) : nextAny ? (
            <button type="button" onClick={() => shared.onOpen(nextAny, team)} className="flex items-center gap-2 self-start text-left text-sm text-muted-foreground hover:underline">
              <span className={`h-2 w-2 shrink-0 rounded-full ${myAnswer(nextAny, userId) === "open" ? "bg-brand-orange" : "bg-muted-foreground"}`} aria-hidden="true" />
              Következő esemény: <span className="font-semibold text-foreground">{nextAny.title}, {dayMonthFormat.format(new Date(`${nextAny.startDate}T12:00:00`))}</span>
              {myAnswer(nextAny, userId) === "open" ? " · még nem válaszoltál" : " · nem mész"}
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">Most nincs közelgő esemény.</p>
          )}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <UpcomingList
            items={upcoming.map((event) => ({ event, team }))}
            emptyText={
              team.own
                ? "Még nincs közelgő eseményed. Új eseményt a Hajóm oldalon veszel fel."
                : `Most nincs közelgő esemény. Ha ${captain ? firstName(captain.name) : "a kapitány"} felvesz egyet, itt jelenik meg, és a csengőben is szólunk.`
            }
            {...shared}
          />
          <TeamCalendar teams={[team]} userId={userId} onOpen={shared.onOpen} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
          <MembersCard team={team} userId={userId} onContact={setContact} />
          {!team.own ? (
            <button type="button" onClick={onLeave} className="inline-flex h-11 items-center gap-2 self-start px-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Kilépés a csapatból
            </button>
          ) : null}
        </div>
      </div>
      <ContactDialog member={contact} boatName={team.name} onClose={() => setContact(null)} />
    </>
  )
}

function OwnStats({ team, upcoming }: { team: TeamView; upcoming: TeamEvent[] }) {
  const next = upcoming[0]
  const stats = [{ value: String(upcoming.length), label: "közelgő esemény" }]
  if (next) {
    const { confirmed, unanswered } = attendance(next, team.members)
    stats.push({ value: `${confirmed.length} / ${team.members.length}`, label: `jön: ${next.title}` })
    stats.push({ value: String(unanswered.length), label: "még nem válaszolt rá" })
  }
  return (
    <div className="flex flex-wrap gap-2.5">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0 flex-[1_1_140px] rounded-xl bg-secondary px-3.5 py-3">
          <p className="text-xl font-bold leading-tight">{stat.value}</p>
          <p className="truncate text-[13px] text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  )
}

// Az elmúlt esemény halvány: arra már nem lehet válaszolni.
type CalendarItem = {
  team: TeamView
  event: TeamEvent
  answer: MyAnswer
  past: boolean
  // Többnapos eseménynél: az első és az utolsó nap a sáv két vége; a cím az első napon és új hét elején látszik.
  first: boolean
  last: boolean
  showTitle: boolean
}

const statusText: Record<MyAnswer, string> = { confirmed: "mész", declined: "nem mész", open: "válaszra vár" }
const DOT_COLORS: Record<MyAnswer, string> = { confirmed: "#0e3f57", declined: "#b8c3cf", open: "#e8833a" }

// Havi naptár. Egy csapatnál a saját válasz színezi az eseményt, a saját csapatnál a létszám látszik;
// több csapatnál a hajó színpöttye mutatja, melyik csapaté. Mobilon pöttyös rács és a kiválasztott nap.
function TeamCalendar({ teams, userId, onOpen }: { teams: TeamView[]; userId: string | null; onOpen: (event: TeamEvent, team: TeamView) => void }) {
  const todayKey = getTodayKey()
  const today = new Date(`${todayKey}T12:00:00`)
  // Ha ebben a hónapban már nincs közelgő esemény, a következő eseményt tartalmazó hónapon nyílik.
  const [month, setMonth] = useState(() => {
    const starts = teams.flatMap((team) => team.events.filter((event) => isUpcoming(event, todayKey)).map((event) => (event.startDate > todayKey ? event.startDate : todayKey)))
    const first = starts.length > 0 ? new Date(`${starts.sort()[0]}T12:00:00`) : today
    return { year: first.getFullYear(), month: first.getMonth() }
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const multi = teams.length > 1
  const atStart = month.year === today.getFullYear() && month.month === today.getMonth()

  const byDay = new Map<string, CalendarItem[]>()
  for (const team of teams) {
    for (const event of team.events) {
      const days = eventDays(event.startDate, event.endDate)
      days.forEach((day, index) => {
        const monday = new Date(`${day}T12:00:00`).getDay() === 1
        byDay.set(day, [
          ...(byDay.get(day) ?? []),
          {
            team,
            event,
            answer: myAnswer(event, userId),
            past: !isUpcoming(event, todayKey),
            first: index === 0,
            last: index === days.length - 1,
            showTitle: index === 0 || monday,
          },
        ])
      })
    }
  }
  const clashDays = new Set(findClashes(teams, userId, todayKey).map((clash) => clash.day))
  const grid = monthGrid(month.year, month.month)
  const shift = (delta: number) => {
    const date = new Date(month.year, month.month + delta, 1, 12)
    setMonth({ year: date.getFullYear(), month: date.getMonth() })
    setSelectedDay(null)
  }

  const chipClass = (item: CalendarItem) => {
    if (item.past) return "bg-secondary text-muted-foreground"
    if (item.team.own) return "bg-brand-soft text-brand-ink"
    if (item.answer === "declined") return "bg-secondary text-muted-foreground line-through"
    if (item.answer === "open") return "bg-brand-orange/15 text-foreground ring-1 ring-inset ring-brand-orange/50"
    return multi ? "bg-secondary text-foreground" : "bg-brand text-white"
  }
  const chipLabel = (item: CalendarItem) =>
    `${item.event.title}${multi ? ` (${item.team.name})` : ""}${item.past ? ", elmúlt" : item.team.own ? "" : `, ${statusText[item.answer]}`}`
  const ownCount = (item: CalendarItem) => `${attendance(item.event, item.team.members).confirmed.length}/${item.team.members.length}`

  const dayItems = selectedDay ? byDay.get(selectedDay) ?? [] : []

  return (
    <section aria-labelledby="team-cal" className={card}>
      <div className={cardHeader}>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => shift(-1)} disabled={atStart} aria-label="Előző hónap" className={`${compactSecondary} w-10 px-0`}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <h2 id="team-cal" className="min-w-[150px] px-1.5 text-center text-[17px] font-bold">{monthTitleFormat.format(new Date(month.year, month.month, 1, 12))}</h2>
          <button type="button" onClick={() => shift(1)} aria-label="Következő hónap" className={`${compactSecondary} w-10 px-0`}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {multi ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-foreground/75">
            {teams.map((team) => (
              <span key={team.boatId} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: team.color }} aria-hidden="true" />
                {team.name}
              </span>
            ))}
          </div>
        ) : teams[0]?.own ? (
          <span className="text-[13px] text-muted-foreground">A szám: hányan jönnek</span>
        ) : null}
      </div>

      <div className="grid grid-cols-7 border-b border-border/70 bg-secondary/50" aria-hidden="true">
        {WEEKDAYS.map((day) => (
          <span key={day} className="px-2.5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground max-sm:text-center">{day}</span>
        ))}
      </div>

      {/* Asztali rács: az események a napokban. */}
      <div className="hidden grid-cols-7 sm:grid">
        {grid.map((cell, index) => {
          const items = byDay.get(cell.key) ?? []
          const clash = clashDays.has(cell.key)
          return (
            <div
              key={cell.key}
              className={`flex min-h-[100px] min-w-0 flex-col gap-1 border-border/70 p-1.5 ${index % 7 !== 6 ? "border-r" : ""} ${index < grid.length - 7 ? "border-b" : ""} ${
                clash ? "bg-brand-orange/[0.07] ring-2 ring-inset ring-brand-orange/50" : cell.inMonth ? "" : "bg-secondary/40"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px] ${
                    cell.key === todayKey ? "bg-brand font-semibold text-white" : cell.inMonth ? "font-semibold text-foreground/85" : "text-muted-foreground"
                  }`}
                >
                  {cell.day}
                </span>
                {clash ? <span className="text-[11px] font-bold text-foreground">{items.length} esemény</span> : null}
              </div>
              {items.slice(0, 3).map((item) => {
                // A sáv a cella szélén túlnyúlik (6 px kitöltés + 1 px vonal), így a napok között összefüggő.
                const shape = item.first && item.last ? "rounded-md" : item.first ? "-mr-[7px] rounded-l-md" : item.last ? "-ml-[7px] rounded-r-md" : "-mx-[7px]"
                const detail = item.team.own ? (item.past ? null : `${ownCount(item)} jön`) : multi ? item.team.name : null
                return (
                  <button
                    key={`${item.team.boatId}-${item.event.id}`}
                    type="button"
                    onClick={() => onOpen(item.event, item.team)}
                    aria-label={chipLabel(item)}
                    title={chipLabel(item)}
                    className={`flex min-w-0 items-start gap-1.5 px-1.5 py-1 text-left text-[12.5px] font-semibold leading-tight ${shape} ${chipClass(item)}`}
                  >
                    <span className={`flex min-w-0 flex-1 items-start gap-1.5 ${item.showTitle ? "" : "invisible"}`} aria-hidden={!item.showTitle}>
                      {multi ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: item.team.color }} aria-hidden="true" /> : null}
                      {!multi && !item.past && item.answer === "open" && !item.team.own ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-orange" aria-hidden="true" /> : null}
                      {!multi && !item.past && item.answer === "confirmed" && !item.team.own ? <Check className="mt-px h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.event.title}</span>
                        {detail ? <span className="block truncate text-[11px] font-medium opacity-80">{detail}</span> : null}
                      </span>
                      {multi && !item.past && item.answer === "confirmed" && !item.team.own ? <Check className="mt-px h-3 w-3 shrink-0 text-brand-ink" aria-hidden="true" /> : null}
                    </span>
                  </button>
                )
              })}
              {items.length > 3 ? <span className="px-1 text-xs text-muted-foreground">+{items.length - 3} további</span> : null}
            </div>
          )
        })}
      </div>

      {/* Mobil rács: pöttyök, a napra koppintva alul az események. */}
      <div className="grid grid-cols-7 gap-y-0.5 px-1.5 pb-2.5 sm:hidden">
        {grid.map((cell) => {
          const items = byDay.get(cell.key) ?? []
          const active = selectedDay === cell.key
          return (
            <button
              key={cell.key}
              type="button"
              disabled={items.length === 0}
              aria-pressed={active}
              aria-label={`${cell.day}.${items.length > 0 ? `, ${items.length} esemény` : ""}`}
              onClick={() => setSelectedDay(active ? null : cell.key)}
              className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-sm ${active ? "bg-brand-soft font-bold text-brand-ink" : cell.inMonth ? "text-foreground/85" : "text-muted-foreground"} ${
                clashDays.has(cell.key) ? "ring-2 ring-inset ring-brand-orange/50" : ""
              }`}
            >
              <span className={cell.key === todayKey ? "flex h-6 w-6 items-center justify-center rounded-full bg-brand font-semibold text-white" : ""}>{cell.day}</span>
              {items.length > 0 ? (
                <span className="flex gap-0.5" aria-hidden="true">
                  {items.slice(0, 3).map((item) => (
                    <span
                      key={`${item.team.boatId}-${item.event.id}`}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: item.past ? DOT_COLORS.declined : multi ? item.team.color : item.team.own ? DOT_COLORS.confirmed : DOT_COLORS[item.answer] }}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {dayItems.length > 0 ? (
        <ul className="mx-3 mb-3 flex flex-col gap-1.5 sm:hidden">
          {dayItems.map((item) => (
            <li key={`${item.team.boatId}-${item.event.id}`}>
              <button type="button" onClick={() => onOpen(item.event, item.team)} className="w-full rounded-xl bg-secondary px-3.5 py-2.5 text-left">
                <span className="block font-semibold">{item.event.title}</span>
                <span className="block text-[13px] text-muted-foreground">{[multi ? item.team.name : null, item.event.location, item.past ? "elmúlt" : item.team.own ? `${ownCount(item)} jön` : statusText[item.answer]].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

// Közelgő események hónap-/évfejlécekkel. Egy csapatnál a csapaté, az "Összes" nézetben minden csapaté hajójelöléssel.
function UpcomingList({
  items,
  emptyText,
  showBoat = false,
  userId,
  people,
  respondingId,
  onRespond,
  onOpen,
}: SharedProps & { items: { event: TeamEvent; team: TeamView }[]; emptyText: string; showBoat?: boolean }) {
  const [filter, setFilter] = useState<"all" | "awaiting" | "going">("all")
  const [shown, setShown] = useState(UPCOMING_SHOWN)
  const awaitingCount = items.filter((item) => !item.team.own && myAnswer(item.event, userId) === "open").length
  // A szűrő csak ott kell, ahol válaszolni is lehet, és van mit szűrni.
  const canFilter = items.length > UPCOMING_SHOWN && items.some((item) => !item.team.own)
  const filtered = items.filter((item) =>
    filter === "all" ? true : filter === "awaiting" ? !item.team.own && myAnswer(item.event, userId) === "open" : myAnswer(item.event, userId) === "confirmed",
  )
  const visible = filtered.slice(0, shown)
  const hidden = filtered.length - visible.length
  const filters = [
    { value: "all" as const, label: "Mind" },
    { value: "awaiting" as const, label: "Válaszra vár", count: awaitingCount },
    { value: "going" as const, label: "Megyek" },
  ]

  return (
    <section aria-labelledby="team-upcoming" className={card}>
      <div className={cardHeader}>
        <h2 id="team-upcoming" className="text-base font-semibold">
          Közelgő események {items.length > UPCOMING_SHOWN ? <span className="font-normal text-muted-foreground">· {items.length}</span> : null}
        </h2>
        {canFilter ? (
          <div role="group" aria-label="Szűrés" className="flex gap-1.5 overflow-x-auto">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => {
                  setFilter(item.value)
                  setShown(UPCOMING_SHOWN)
                }}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                  filter === item.value ? "border-brand bg-brand text-white" : "border-border bg-card text-foreground hover:border-brand/40"
                }`}
              >
                {item.label}
                {item.count ? <span className="min-w-5 rounded-full bg-brand-orange px-1.5 text-center text-xs font-bold leading-5 text-brand-orange-foreground">{item.count}</span> : null}
              </button>
            ))}
          </div>
        ) : awaitingCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80">
            <span className="h-2 w-2 rounded-full bg-brand-orange" aria-hidden="true" />
            {awaitingCount} vár a válaszodra
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">{emptyText}</p>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">{filter === "awaiting" ? "Nincs válaszra váró esemény." : "Még nem jelezted, hogy mész valahova."}</p>
      ) : (
        <ul>
          {visible.map(({ event, team }, index) => {
            const label = monthGroupLabel(event.startDate)
            // Hónap-fejléc (idén) vagy évszám (jövőre), ahol az előző eseményhez képest új kezdődik.
            const heading = index === 0 || monthGroupLabel(visible[index - 1].event.startDate) !== label ? (
              <li key={`h-${label}`} className="border-b border-border/70 bg-secondary/50 px-5 py-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</li>
            ) : null
            const answer = myAnswer(event, userId)
            const busy = respondingId === event.id
            const declined = !team.own && answer === "declined"
            const open = !team.own && answer === "open"
            return [
              heading,
              <li key={`${team.boatId}-${event.id}`} className={`${rowClass} ${open ? "bg-brand-orange/[0.06]" : ""}`}>
                <DateBlock startDate={event.startDate} endDate={event.endDate} muted={declined} />
                <div className="min-w-0 flex-[999_1_220px]">
                  <button
                    type="button"
                    onClick={() => onOpen(event, team)}
                    className={`flex flex-wrap items-center gap-2 text-left font-semibold hover:text-brand-ink hover:underline ${declined ? "text-muted-foreground" : ""}`}
                  >
                    {open ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand-orange" aria-hidden="true" /> : null}
                    {event.title}
                    {event.type ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${event.type === "Verseny" ? "bg-brand-orange/15 text-foreground" : "bg-secondary text-foreground/80"}`}>{event.type}</span>
                    ) : null}
                  </button>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    {showBoat ? <BoatTag name={team.name} color={team.color} /> : null}
                    {[capitalize(weekday(event.startDate)), event.location].filter(Boolean).join(" · ")}
                  </p>
                  <AttendanceLine event={event} team={team} people={people} />
                </div>
                {team.own ? (
                  <Link href={`/kapitany-dashboard?esemeny=${encodeURIComponent(event.id)}`} className={`${compactSecondary} border-transparent bg-transparent text-brand-ink`}>Kezelés</Link>
                ) : answer === "confirmed" ? (
                  <>
                    <GoingChip />
                    <button type="button" onClick={() => onOpen(event, team)} className={`${compactSecondary} border-transparent bg-transparent text-brand-ink`} aria-label={`Részletek: ${event.title}`}>Részletek</button>
                  </>
                ) : declined ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-sm text-muted-foreground">Nem mész</span>
                    <button type="button" disabled={respondingId !== null} onClick={() => onRespond(event, "confirmed")} className={`${compactSecondary} border-transparent bg-transparent font-medium text-muted-foreground hover:text-foreground`}>
                      {busy ? "Mentés..." : "Mégis jövök"}
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={respondingId !== null} onClick={() => onRespond(event, "confirmed")} className={compactPrimary} aria-label={`Jövök: ${event.title}`}>
                      {busy ? "Mentés..." : "Jövök"}
                    </button>
                    <button type="button" disabled={respondingId !== null} onClick={() => onRespond(event, "declined")} className={compactSecondary} aria-label={`Nem jövök: ${event.title}`}>
                      Nem jövök
                    </button>
                  </div>
                )}
              </li>,
            ]
          })}
        </ul>
      )}
      {hidden > 0 ? (
        <button type="button" onClick={() => setShown((value) => value + UPCOMING_STEP)} className="flex w-full items-center justify-center border-t border-border/70 bg-secondary/40 px-5 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-secondary">
          További {Math.min(UPCOMING_STEP, hidden)} esemény{hidden > UPCOMING_STEP ? ` (még ${hidden})` : ""}
        </button>
      ) : null}
    </section>
  )
}

function MembersCard({ team, userId, onContact }: { team: TeamView; userId: string | null; onContact: (member: TeamMember) => void }) {
  const contactButton = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-brand-ink transition-colors hover:bg-secondary"
  // Elöl a kapitány, utána te, majd a többiek névsorban.
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const members = [...team.members].sort((first, second) => {
    const rank = (member: TeamMember) => (member.isCaptain ? 0 : member.id === userId ? 1 : 2)
    return rank(first) - rank(second)
  })
  const needle = query.trim().toLocaleLowerCase("hu")
  const filtered = needle ? members.filter((member) => `${member.name} ${member.role ?? ""}`.toLocaleLowerCase("hu").includes(needle)) : members
  const visible = expanded ? filtered : members.slice(0, MEMBERS_SHOWN)
  const showFilter = expanded && members.length > MEMBER_FILTER_FROM

  return (
    <section aria-labelledby="team-members" className={card}>
      <h2 id="team-members" className="border-b border-border/70 px-5 py-3.5 text-base font-semibold">Csapat · {team.members.length} fő</h2>
      {showFilter ? (
        <div className="border-b border-border/70 px-4 py-3">
          <label htmlFor="member-filter" className="sr-only">Keresés a tagok között</label>
          <input
            id="member-filter"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Keresés név vagy poszt szerint"
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
          />
        </div>
      ) : null}
      <ul className={expanded ? "max-h-[min(60vh,560px)] overflow-y-auto" : ""}>
        {visible.length === 0 ? <li className="px-5 py-4 text-sm text-muted-foreground">Nincs ilyen nevű tag.</li> : null}
        {visible.map((member) => {
          const me = member.id === userId
          return (
            <li key={member.id} className="flex items-center gap-3 border-b border-border/70 px-5 py-3 last:border-b-0">
              <Avatar name={member.name} url={member.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                  <span className="truncate">{member.name}</span>
                  {me ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-ink">Te</span> : null}
                  {member.isCaptain ? <span className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-xs font-semibold">Kapitány</span> : null}
                </p>
                {member.role || !member.isCaptain ? <p className="text-[13px] text-muted-foreground">{member.role ?? "Csapattag"}</p> : null}
              </div>
              {!me && (member.phone || member.email) ? (
                <button type="button" onClick={() => onContact(member)} className={contactButton} aria-label={`${member.name} elérhetősége`}>
                  <Contact className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {members.length > MEMBERS_SHOWN ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value)
            setQuery("")
          }}
          className="flex w-full items-center justify-center border-t border-border/70 px-5 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-secondary"
        >
          {expanded ? "Kevesebb" : `Mind a ${members.length} tag`}
        </button>
      ) : null}
      <p className="border-t border-border/70 bg-secondary/40 px-5 py-3 text-[13px] text-muted-foreground">
        {team.own ? "Ugyanezt látják a csapattagjaid. A függő meghívókat csak te látod, a Hajóm oldalon." : "Az elérhetőségeket csak a csapat tagjai látják."}
      </p>
    </section>
  )
}

// Az összesített nézet: közös naptár és a válaszra váró események. A csapat a felső fülekkel választható.
function AllTeams({ teams, ...shared }: SharedProps & { teams: TeamView[] }) {
  const { userId, onOpen } = shared
  const todayKey = getTodayKey()
  const clashes = findClashes(teams, userId, todayKey)
  const firstClash = clashes[0]
  const upcoming = teams
    .flatMap((team) => team.events.filter((event) => isUpcoming(event, todayKey)).map((event) => ({ team, event })))
    .sort((first, second) => first.event.startDate.localeCompare(second.event.startDate) || first.team.name.localeCompare(second.team.name, "hu"))

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {firstClash ? (
        <div role="status" className="flex flex-wrap items-start gap-3 rounded-2xl border border-brand-orange/40 bg-brand-orange/[0.08] px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" aria-hidden="true" />
          <p className="min-w-0 flex-[999_1_320px] text-sm">
            <span className="font-semibold">Ugyanarra a napra ({dayMonthFormat.format(new Date(`${firstClash.day}T12:00:00`))}) több csapatodnak is van eseménye:</span>{" "}
            {firstClash.items.map((item) => `${item.event.title} (${item.team.name})`).join(" és ")}.
            {clashes.length > 1 ? ` Még ${clashes.length - 1} ilyen nap van.` : ""}
          </p>
        </div>
      ) : null}

      <UpcomingList items={upcoming} emptyText="A csapataidnak most nincs közelgő eseménye." showBoat {...shared} />
      <TeamCalendar teams={teams} userId={userId} onOpen={onOpen} />
    </div>
  )
}

// Egy tag elérhetősége: nagy, kijelölhető szám és cím. Telefonon a gombok tárcsáznak, illetve levelet nyitnak;
// számítógépen, ahol a tel:/mailto: link gyakran nem csinál semmit, a szám és a cím innen kimásolható.
function ContactDialog({ member, boatName, onClose }: { member: TeamMember | null; boatName: string; onClose: () => void }) {
  if (!member) return null
  const rows = [
    member.phone ? { label: "Telefon", value: member.phone, href: `tel:${member.phone.replace(/\s+/g, "")}`, action: "Hívás", icon: Phone } : null,
    member.email ? { label: "E-mail", value: member.email, href: `mailto:${member.email}`, action: "Írok", icon: Mail } : null,
  ].filter((row) => row !== null)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="flex flex-col items-center px-6 pb-5 pt-8 text-center">
          <Avatar name={member.name} url={member.avatarUrl} size={72} />
          <DialogTitle className="mt-3 text-xl font-bold">{member.name}</DialogTitle>
          <DialogDescription className="text-sm">
            {member.isCaptain ? "Kapitány" : member.role ?? "Csapattag"} · {boatName}
          </DialogDescription>
        </DialogHeader>
        <dl className="mx-5 mb-5 divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 px-4 py-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-ink" aria-hidden="true">
                <row.icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">{row.label}</dt>
                <dd className="select-all truncate text-[15px] font-semibold text-foreground" title={row.value}>{row.value}</dd>
              </div>
              <a href={row.href} className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-secondary">
                {row.action}
              </a>
            </div>
          ))}
        </dl>
        <p className="border-t border-border/70 bg-secondary/40 px-6 py-3 text-center text-[13px] text-muted-foreground">Az elérhetőségeket csak a csapat tagjai látják.</p>
      </DialogContent>
    </Dialog>
  )
}

function LeaveDialog({ team, userId, onClose, onLeft }: { team: TeamView | null; userId: string | null; onClose: () => void; onLeft: (team: TeamView) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!team) return null
  const captain = team.members.find((member) => member.isCaptain)
  const goingCount = team.events.filter((event) => isUpcoming(event, getTodayKey()) && myAnswer(event, userId) === "confirmed").length

  async function confirm() {
    if (!team) return
    setBusy(true)
    setError(null)
    try {
      await leaveTeam(team.boatId)
      onLeft(team)
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "A kilépés most nem sikerült.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          setError(null)
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kilépsz {hungarianArticle(team.name)} {team.name} csapatából?</DialogTitle>
          <DialogDescription className="sr-only">A kilépés következményei</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-[15px] text-foreground/85">
          <li>Nem látod tovább a csapat eseményeit és tagjait.</li>
          <li>{goingCount > 0 ? `A közelgő eseményekre adott válaszaid törlődnek, így ${goingCount} eseményről lekerülsz.` : "A közelgő eseményekre adott válaszaid törlődnek."}</li>
          <li>{captain ? `${captain.name}, a kapitány értesítést kap.` : "A kapitány értesítést kap."}</li>
          <li>Visszatérni csak új meghívóval tudsz.</li>
        </ul>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>Mégse</button>
          <button type="button" onClick={() => void confirm()} disabled={busy} className={primaryButton.replace("bg-brand ", "bg-destructive ").replace("hover:bg-brand/90", "hover:bg-destructive/90")}>
            {busy ? "Kilépés..." : "Kilépek a csapatból"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoTeams() {
  const steps = ["Jelentkezz egy szabad helyre, versenyre vagy túrára.", "Ha a kapitány kiválaszt, együtt vitorláztok.", "Ha összeszoktatok, meghív a csapatába."]
  return (
    <section aria-labelledby="no-teams" className={`${card} mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-10 text-center`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink">
        <Users className="h-7 w-7" aria-hidden="true" />
      </span>
      <div>
        <h2 id="no-teams" className="text-xl font-bold">Még nem vagy csapattag</h2>
        <p className="mt-1 text-muted-foreground">Itt látod majd a csapatod naptárát, eseményeit és tagjait. Csapatba a kapitány hív meg.</p>
      </div>
      <ol className="flex w-full flex-col gap-3 text-left">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-ink">{index + 1}</span>
            <span className="text-sm text-foreground/85">{step}</span>
          </li>
        ))}
      </ol>
      <Link href="/bongeszes" className={primaryButton}>Szabad helyek böngészése</Link>
    </section>
  )
}
