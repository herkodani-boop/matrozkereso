"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { CalendarDays, Check, ChevronDown, ChevronUp, Mail, Plus, UserCheck, UserPlus, Users } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useCaptainBoats } from "@/components/captain-boats-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { CrewOverview, useCrewOverviewData, type CrewOverviewData } from "@/components/crew/crew-overview"
import { useProfileGaps } from "@/components/crew/crew-data"
import { ProfileBanner } from "@/components/crew/crew-ui"
import { OpenListings } from "@/components/crew/open-listings"
import { EventMessageButton, EventWeatherPanel } from "./event-extras"
import {
  daysUntil,
  EXPIRY_WARNING_DAYS,
  formatLongDate,
  getTodayKey,
  useCaptainHomeData,
  type CaptainHomeData,
  type HomeEvent,
  type HomeListing,
  type HomeTodo,
} from "./use-captain-home-data"

const TODOS_SHOWN = 4
const AVATARS_SHOWN = 7

const weekdayFormat = new Intl.DateTimeFormat("hu-HU", { weekday: "long" })
const shortMonthFormat = new Intl.DateTimeFormat("hu-HU", { month: "short" })
const longMonthFormat = new Intl.DateTimeFormat("hu-HU", { month: "long" })

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function toDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`)
}

// "Nov" a dátumblokkba; az Intl "nov." alakjáról levesszük a pontot.
function shortMonth(dateKey: string) {
  return capitalize(shortMonthFormat.format(toDate(dateKey)).replace(/\.$/, ""))
}

function formatDateRange(startDate: string, endDate: string | null) {
  const start = toDate(startDate)
  if (!endDate || endDate === startDate) return capitalize(formatLongDate(startDate))
  const end = toDate(endDate)
  return start.getMonth() === end.getMonth()
    ? `${capitalize(longMonthFormat.format(start))} ${start.getDate()}–${end.getDate()}.`
    : `${capitalize(formatLongDate(startDate))} – ${formatLongDate(endDate)}`
}

function relativeDays(dateKey: string) {
  const days = daysUntil(dateKey)
  return days <= 0 ? "ma" : days === 1 ? "holnap" : `${days} nap`
}

function formatExpiry(listing: HomeListing) {
  if (!listing.expiryDate) return "Nincs lejárati dátum"
  const days = daysUntil(listing.expiryDate)
  if (days <= 0) return "Ma lejár"
  if (days === 1) return "Holnap lejár"
  if (days <= 7) return `Lejár ${days} nap múlva`
  return `Lejárat: ${formatLongDate(listing.expiryDate)}`
}

// A közeli lejárat csak tájékoztatás (nincs teendő vele), ezért itt, a hirdetésnél emeljük ki.
function isExpiringSoon(listing: HomeListing) {
  if (!listing.expiryDate) return false
  const days = daysUntil(listing.expiryDate)
  return days >= 0 && days <= EXPIRY_WARNING_DAYS
}

const meaningfulType = (type: string) => (type && type !== "Egyéb" ? type : null)

const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-brand"
const primaryButton =
  "inline-flex h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-brand"
const sectionLabel = "text-base font-semibold text-foreground"

export function CaptainHome() {
  const { user } = useAuth()
  const { boats, firstName } = useCaptainBoats()
  const { status, data, retry } = useCaptainHomeData(boats[0]?.id ?? null, user?.id ?? null)
  const otherBoats = useCrewOverviewData(user?.id ?? null)
  const gaps = useProfileGaps(user?.id ?? null)
  const capacity = data?.boat.maxCrew ?? null
  const onboarding = data ? !isOnboardingDone(data.onboarding) : false

  return (
    <div className="bg-secondary/60">
      <main className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8">
        <ProfileBanner gaps={gaps} />
        <Greeting firstName={firstName} data={data} otherBoats={otherBoats} />

        <section aria-labelledby="captain-zone-boat" className="flex flex-col gap-3.5">
          <h2 id="captain-zone-boat" className="text-xl font-bold tracking-tight">A hajóm</h2>
          {status === "error" ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-card p-5 text-sm text-destructive">
              A kezdőlap adatait nem sikerült betölteni.
              <button type="button" onClick={retry} className={secondaryButton}>
                Újrapróbálás
              </button>
            </div>
          ) : status === "loading" || !data ? (
            <HomeSkeleton />
          ) : (
            <>
              {/* Új hajónál a lépéssor mutatja az irányt; üres teendőlistát ilyenkor nem teszünk mellé. */}
              {data.todos.length > 0 || !onboarding ? <Todos todos={data.todos} /> : null}
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-w-0 flex-col gap-4">
                  {onboarding ? <GettingStarted onboarding={data.onboarding} /> : null}
                  {/* A kezdő lépések már kínálják az új eseményt: üres eseménykártya ilyenkor nem kell. */}
                  {data.events[0] || !onboarding ? (
                    <NextEvent event={data.events[0] ?? null} upcomingCount={data.upcomingCount} capacity={capacity} harbor={data.boat.harbor} />
                  ) : null}
                  <LaterEvents events={data.events.slice(1)} upcomingCount={data.upcomingCount} capacity={capacity} />
                </div>
                <aside aria-label="Hajóm és hirdetéseim" className="flex min-w-0 flex-col gap-4">
                  <BoatCard data={data} onboarding={onboarding} />
                  {data.listings.length > 0 || !onboarding ? <MyListings listings={data.listings} /> : null}
                </aside>
              </div>
            </>
          )}
        </section>

        {/* Ha a kapitány más hajón is csapattag vagy jelentkezett valahova; a teljes nézet a Vitorlázásaim oldalon. */}
        {otherBoats.loading || otherBoats.empty ? null : (
          <section aria-labelledby="captain-other-boats" className="flex flex-col gap-3.5">
            <div>
              <h2 id="captain-other-boats" className="text-xl font-bold tracking-tight">Más hajókon</h2>
              <p className="text-sm text-muted-foreground">Ahol csapattag vagy, vagy ahova jelentkeztél.</p>
            </div>
            <CrewOverview data={otherBoats} userId={user?.id ?? null} mode="summary" />
          </section>
        )}
        <OpenListings title="Más hajók keresnek legénységet" subtitle="Olyan hirdetések, amelyekre még nem jelentkeztél." />
      </main>
    </div>
  )
}

function relativeDayPhrase(dateKey: string) {
  const days = daysUntil(dateKey)
  if (days <= 0) return "Ma"
  if (days === 1) return "Holnap"
  if (days < 7) return capitalize(weekdayFormat.format(toDate(dateKey)))
  return `${days} nap múlva`
}

function Greeting({ firstName, data, otherBoats }: { firstName: string | null; data: CaptainHomeData | null; otherBoats: Pick<CrewOverviewData, "going" | "awaiting"> }) {
  const todayKey = getTodayKey()
  const dateLine = `${capitalize(weekdayFormat.format(toDate(todayKey)))}, ${formatLongDate(todayKey)}`
  const onboarding = data ? !isOnboardingDone(data.onboarding) : false

  let summary: string | null = null
  if (data) {
    const count = data.todos.length
    const todoPart = count > 0
      ? `${count} teendőd van${data.totalPending > 0 && count > 1 ? `, köztük ${data.totalPending} új jelentkező` : ""}.`
      : onboarding && !data.onboarding.invitedCrew
        ? "A hajód kész, már csak a csapat hiányzik."
        : "Minden rendben, most nincs teendőd."
    const next = data.events[0]
    const days = next ? daysUntil(next.startDate) : null
    const eventPart = !next || days === null
      ? ""
      : days <= 0
        ? ` Ma: ${next.title}.`
        : days === 1
          ? ` Holnap: ${next.title}.`
          : ` A következő esemény ${days} nap múlva: ${next.title}.`
    // Saját esemény hiányában a más hajón következő vitorlázás kerül az összefoglalóba.
    const otherNext = otherBoats.going[0]
    const otherPart = !next && otherNext ? ` ${relativeDayPhrase(otherNext.startDate)}: ${otherNext.title} (${otherNext.boatName}).` : ""
    const awaitingCount = otherBoats.awaiting.length
    const awaitingPart = awaitingCount > 0 ? ` ${awaitingCount} esemény vár a válaszodra.` : ""
    summary = todoPart + eventPart + otherPart + awaitingPart
  }

  return (
    <section aria-labelledby="captain-greeting" className="relative overflow-hidden rounded-2xl text-white">
      {/* Közös balatoni versenykép: a saját hajó fotója a hajó-kártyán szerepel, itt nem ismételjük. */}
      <Image
        src="/hero-balaton.jpg"
        alt=""
        fill
        priority
        sizes="(max-width: 1200px) 100vw, 1152px"
        className="object-cover object-[28%_82%] sm:object-[center_80%]"
      />
      {/* Sötét réteg a fotón; alul erősebb, hogy a gombok ne vesszenek el a vitorlák és a legénység előtt. */}
      <div className="relative flex min-h-[200px] flex-wrap items-end justify-between gap-5 bg-gradient-to-t from-[rgba(10,47,66,0.9)] to-[rgba(10,47,66,0.72)] p-6 sm:p-8">
        <div>
          <p className="text-sm font-medium text-white/80">{dateLine}</p>
          <h1 id="captain-greeting" className="mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-[34px]">
            {firstName ? `Szia, ${firstName}!` : "Üdv újra a fedélzeten!"}
          </h1>
          {summary ? (
            <p className="mt-2 max-w-2xl text-white/90">{summary}</p>
          ) : (
            <Skeleton className="mt-3 h-4 w-72 bg-white/20" />
          )}
        </div>
        {/* A kezdő lépések alatt a lépések adják a gombokat; itt nem ismételjük őket. */}
        {data && !onboarding ? (
        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/kapitany-dashboard?esemeny=uj"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/70 bg-[rgba(10,47,66,0.6)] px-4 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-[rgba(10,47,66,0.8)] focus-visible:outline-2 focus-visible:outline-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Új esemény
          </Link>
          <Link
            href="/kapitany-dashboard?hirdetes=uj"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-brand transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-white"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Hirdetés feladása
          </Link>
        </div>
        ) : null}
      </div>
    </section>
  )
}

// A hirdetés nem kötelező lépés: akinek megvan a csapata, annak nem kell, és az esemény kártyájáról
// bármikor feladható, amikor hiányzik valaki.
function isOnboardingDone(onboarding: CaptainHomeData["onboarding"]) {
  return onboarding.invitedCrew && onboarding.createdEvent
}

// Új hajónál a három üres állapot helyett egy rövid, sorrendbe tett útmutató; ha minden lépés kész, eltűnik.
function GettingStarted({ onboarding }: { onboarding: CaptainHomeData["onboarding"] }) {
  const steps = [
    { done: true, title: "Hajó felvéve", text: "A hajód adatai rendben vannak.", href: null, action: null },
    { done: onboarding.invitedCrew, title: "Hívd meg a csapatodat", text: "E-mailben küldhetsz meghívót a meglévő legénységednek.", href: "/kapitany-dashboard?meghivas=uj", action: "Meghívás" },
    { done: onboarding.createdEvent, title: "Vedd fel az első eseményt", text: "Versenyt, edzést vagy bármilyen hajós programot, és lásd, ki jön.", href: "/kapitany-dashboard?esemeny=uj", action: "Új esemény" },
  ]
  const doneCount = steps.filter((step) => step.done).length
  const nextIndex = steps.findIndex((step) => !step.done)

  return (
    <section aria-labelledby="captain-getting-started" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <h2 id="captain-getting-started" className="text-base font-semibold">Kezdő lépések</h2>
        <span className="text-sm text-muted-foreground">{doneCount} / {steps.length} kész</span>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li key={step.title} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/70 px-5 py-4 last:border-b-0">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                step.done ? "bg-brand-soft text-brand-ink" : index === nextIndex ? "bg-brand text-white" : "bg-secondary text-muted-foreground"
              }`}
            >
              {step.done ? <Check className="h-5 w-5" aria-hidden="true" /> : index + 1}
              <span className="sr-only">{step.done ? "Kész" : `${index + 1}. lépés`}</span>
            </span>
            <div className="min-w-0 flex-[999_1_240px]">
              <p className={`font-semibold ${step.done ? "text-muted-foreground" : ""}`}>{step.title}</p>
              {!step.done ? <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p> : null}
            </div>
            {!step.done && step.href ? (
              <Link href={step.href} className={index === nextIndex ? primaryButton : secondaryButton}>
                {step.action}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      {!onboarding.createdListing ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/70 bg-secondary/40 px-5 py-3.5">
          <p className="text-sm text-muted-foreground">Hiányzik valaki a csapatból? Hirdetéssel új csapattagot találhatsz.</p>
          <Link href="/kapitany-dashboard?hirdetes=uj" className={secondaryButton}>Hirdetés feladása</Link>
        </div>
      ) : null}
    </section>
  )
}

const todoIcons = {
  shortfall: Users,
  applicants: UserPlus,
  calendar: CalendarDays,
  accepted: UserCheck,
  invite: Mail,
}

function Todos({ todos }: { todos: HomeTodo[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? todos : todos.slice(0, TODOS_SHOWN)
  const hiddenCount = todos.length - TODOS_SHOWN

  return (
    <section aria-labelledby="captain-todos" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <h2 id="captain-todos" className="flex items-center gap-2.5 text-base font-semibold">
          Teendők
          {todos.length > 0 ? (
            <span className="min-w-[22px] rounded-full bg-brand-orange px-1.5 text-center text-[13px] font-bold leading-[22px] text-brand-orange-foreground">
              {todos.length}
            </span>
          ) : null}
        </h2>
        {todos.length > 1 ? <span className="text-sm text-muted-foreground">Fontossági sorrendben</span> : null}
      </div>

      {todos.length === 0 ? (
        <p className="flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
          <span className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand-ink">
            <Check className="h-5 w-5" aria-hidden="true" />
          </span>
          Nincs teendőd.
        </p>
      ) : (
        <ul>
          {visible.map((todo) => {
            const Icon = todoIcons[todo.icon]
            return (
              <li key={todo.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/70 px-5 py-4 last:border-b-0">
                <span
                  className={`flex h-11 w-10 shrink-0 items-center justify-center rounded-lg ${
                    todo.tone === "attention" ? "bg-brand-orange/15 text-attention-ink" : "bg-secondary text-brand-ink"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-[999_1_260px]">
                  <p className="font-semibold">{todo.title}</p>
                  {todo.detail ? <p className="mt-0.5 text-sm text-muted-foreground">{todo.detail}</p> : null}
                </div>
                <Link href={todo.href} className={todo.primary ? primaryButton : secondaryButton}>
                  {todo.actionLabel}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {hiddenCount > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((previous) => !previous)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border/70 bg-secondary/40 px-5 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-secondary"
        >
          {expanded ? "Kevesebb" : `További ${hiddenCount} teendő`}
          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
      ) : null}
    </section>
  )
}

function NextEvent({
  event,
  upcomingCount,
  capacity,
  harbor,
}: {
  event: HomeEvent | null
  upcomingCount: number
  capacity: number | null
  harbor: string
}) {
  if (!event) {
    return (
      <section aria-labelledby="captain-next-event" className="rounded-2xl border border-border bg-card p-6">
        <h2 id="captain-next-event" className={sectionLabel}>Következő esemény</h2>
        <p className="mt-3 font-semibold">Még nincs közelgő eseményed</p>
        <p className="mt-1 text-sm text-muted-foreground">Vedd fel a következő versenyt vagy edzést, és kövesd, ki jön a csapatodból.</p>
        <Link href="/kapitany-dashboard?esemeny=uj" className={`mt-4 gap-2 ${primaryButton}`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Új esemény
        </Link>
      </section>
    )
  }

  const relative = relativeDays(event.startDate)
  const countdown = relative === "ma" || relative === "holnap" ? relative : `${relative} múlva`
  const { confirmed, declined, unanswered, total } = event.attendance
  const percent = (value: number) => `${total > 0 ? (value / total) * 100 : 0}%`
  const shownPeople = event.confirmedPeople.slice(0, AVATARS_SHOWN)
  const extraPeople = event.confirmedPeople.length - shownPeople.length
  const hasFreePlaces = capacity !== null && confirmed < capacity
  const breakdown = [declined > 0 ? `${declined} nem jön` : null, unanswered > 0 ? `${unanswered} nem válaszolt` : null].filter(Boolean).join(" · ")

  return (
    // A lap fő kártyája: márkaszínű keret és enyhe árnyék emeli ki a többi, lapos kártya közül.
    <section aria-labelledby="captain-next-event" className="rounded-2xl border border-brand/35 bg-card p-5 shadow-lg shadow-brand/10 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 id="captain-next-event" className={sectionLabel}>Következő esemény</h2>
          <span className="text-sm font-medium text-brand-ink">· {countdown}</span>
        </div>
        <Link href="/kapitany-dashboard?ful=esemenyek" className="text-sm font-medium text-brand-ink underline-offset-4 hover:underline">
          Összes esemény{upcomingCount > 1 ? ` (${upcomingCount})` : ""}
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="w-[72px] shrink-0 rounded-xl bg-brand py-2.5 text-center text-white" aria-hidden="true">
          <div className="text-[13px] font-semibold uppercase tracking-widest text-white/85">{shortMonth(event.startDate)}</div>
          {/* A visszaszámlálás a kártya fejlécében van, itt csak a dátum. */}
          <div className="text-[30px] font-bold leading-tight">{toDate(event.startDate).getDate()}</div>
        </div>
        <div className="min-w-0 flex-[999_1_240px]">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[22px] font-bold tracking-tight">{event.title}</h3>
            {meaningfulType(event.type) ? (
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[13px] font-semibold text-brand-ink">{event.type}</span>
            ) : null}
            {event.linkedListing ? (
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[13px] font-semibold text-brand-ink">
                Aktív hirdetés{event.linkedListing.pending > 0 ? ` · ${event.linkedListing.pending} új jelentkező` : ""}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-muted-foreground">
            {[formatDateRange(event.startDate, event.endDate), event.location].filter(Boolean).join(" · ")}
          </p>
          {event.note ? <p className="mt-1.5 line-clamp-2 text-sm text-foreground/85">{event.note}</p> : null}
        </div>
      </div>

      <EventWeatherPanel event={event} harbor={harbor} />

      <div className="mt-5 border-t border-border/70 pt-5">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Még nincs csapattagod. A kapitányi felületen hívhatod meg őket.</p>
        ) : capacity ? (
          <CapacityAttendance confirmed={confirmed} unanswered={unanswered} breakdown={breakdown} capacity={capacity} isRace={event.type === "Verseny"} />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{confirmed} / {total} fő jön</p>
              {breakdown ? <p className="text-sm text-muted-foreground">{breakdown}</p> : null}
            </div>
            <div
              role="img"
              aria-label={`Részvétel: ${confirmed} jön, ${declined} nem jön, ${unanswered} nem válaszolt a ${total} főből`}
              className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-secondary"
            >
              <span className="bg-brand-ink" style={{ width: percent(confirmed) }} />
              <span className="bg-bar-declined" style={{ width: percent(declined) }} />
              <span className="bg-brand-orange" style={{ width: percent(unanswered) }} />
            </div>
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3.5">
          <Link
            href={`/kapitany-dashboard?esemeny=${encodeURIComponent(event.id)}`}
            className="-mx-2 flex min-h-11 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-brand"
          >
            {shownPeople.length > 0 ? (
            <span className="flex items-center">
              {shownPeople.map((person, index) => (
                <span
                  key={person.id}
                  title={person.name}
                  className={`relative flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border-2 border-card bg-brand-soft text-[13px] font-semibold text-brand-ink ${index > 0 ? "-ml-2" : ""}`}
                >
                  {person.avatarUrl ? (
                    <Image src={person.avatarUrl} alt={person.name} fill sizes="34px" className="object-cover" />
                  ) : (
                    person.name.charAt(0).toUpperCase()
                  )}
                </span>
              ))}
              {extraPeople > 0 ? (
                <span title={`További ${extraPeople} fő`} className="-ml-2 flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-card bg-secondary text-[13px] font-semibold text-muted-foreground">
                  +{extraPeople}
                </span>
              ) : null}
            </span>
            ) : null}
            <span className="text-sm font-semibold text-brand-ink">
              Résztvevők <span aria-hidden="true">→</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
          <EventMessageButton event={event} dateLabel={formatDateRange(event.startDate, event.endDate)} />
          {/* Csak akkor kérünk figyelmet, ha van mit elbírálni. */}
          {event.linkedListing ? (
            event.linkedListing.pending > 0 ? (
              <Link
                href={`/kapitany-dashboard?jelentkezok=${encodeURIComponent(event.linkedListing.id)}`}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-orange px-4 text-sm font-semibold text-brand-orange-foreground transition-colors hover:bg-brand-orange/90 focus-visible:outline-2 focus-visible:outline-brand"
              >
                {event.linkedListing.pending} új jelentkező
              </Link>
            ) : null
          ) : hasFreePlaces ? (
            // A visszajelzések alapján nincs tele a hajó: kézre adjuk a hirdetést a hiányzó helyekre.
            <Link
              href={`/kapitany-dashboard?hirdetes-esemenyre=${encodeURIComponent(event.id)}`}
              className={`gap-2 ${secondaryButton}`}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Hirdetés feladása
            </Link>
          ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

// A hajó létszámához mérve: a sáv a helyek betöltöttségét mutatja. Ha többen jönnek (pl. hajószerelésre
// az egész csapat), az nem hiba, csak tájékoztatjuk a kapitányt. Szabad helyet csak versenynél írunk ki:
// edzésre, hajószerelésre nem kell teljes legénység, ott a "8 hely szabad" hiányt sugallna.
function CapacityAttendance({
  confirmed,
  unanswered,
  breakdown,
  capacity,
  isRace,
}: {
  confirmed: number
  unanswered: number
  breakdown: string
  capacity: number
  isRace: boolean
}) {
  const confirmedShare = Math.min(confirmed, capacity)
  const unansweredShare = Math.min(unanswered, capacity - confirmedShare)
  const percent = (value: number) => `${(value / capacity) * 100}%`
  const note =
    confirmed > capacity
      ? `${confirmed - capacity} fővel többen jönnek, mint a hajó létszáma`
      : confirmed === capacity
        ? "Megvan a teljes létszám"
        : isRace
          ? `${capacity - confirmed} hely szabad`
          : null

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{isRace ? `${confirmed} fő jön · ${capacity} fős hajó` : `${confirmed} fő jön`}</p>
        {breakdown ? <p className="text-sm text-muted-foreground">{breakdown}</p> : null}
      </div>
      <div
        role="img"
        aria-label={`${confirmed} fő jön a ${capacity} fős hajóra, ${unanswered} még nem válaszolt`}
        className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-secondary"
      >
        <span className="bg-brand-ink" style={{ width: percent(confirmedShare) }} />
        <span className="bg-brand-orange" style={{ width: percent(unansweredShare) }} />
      </div>
      {note ? <p className="mt-2 text-sm text-muted-foreground">{note}</p> : null}
    </>
  )
}

function LaterEvents({ events, upcomingCount, capacity }: { events: HomeEvent[]; upcomingCount: number; capacity: number | null }) {
  if (events.length === 0) return null
  // Az első esemény fent külön kártyán van, ezért a "további" szám a teljesből és a látható listából adódik.
  const remaining = upcomingCount - events.length - 1

  return (
    <section aria-labelledby="captain-later-events" className="overflow-hidden rounded-2xl border border-border bg-card">
      <h2 id="captain-later-events" className={`border-b border-border/70 px-5 py-3.5 ${sectionLabel}`}>Később</h2>
      <ul>
        {events.map((event) => {
          const { confirmed, declined, total } = event.attendance
          const status = total === 0
            ? ""
            : confirmed + declined === 0
              ? "Még nincs válasz"
              : capacity && event.type === "Verseny"
                ? `${confirmed} / ${capacity} fő`
                : capacity
                  ? `${confirmed} fő jön`
                  : `${confirmed} / ${total} jön`
          return (
            <li key={event.id} className="border-b border-border/70 last:border-b-0">
              <Link
                href={`/kapitany-dashboard?esemeny=${encodeURIComponent(event.id)}`}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/50"
              >
                <span className="w-14 shrink-0 text-sm font-semibold text-brand-ink">
                  {shortMonth(event.startDate)} {toDate(event.startDate).getDate()}.
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{event.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {[meaningfulType(event.type), event.location].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {status ? <span className="shrink-0 text-sm text-muted-foreground">{status}</span> : null}
              </Link>
            </li>
          )
        })}
      </ul>
      {remaining > 0 ? (
        <Link
          href="/kapitany-dashboard?ful=esemenyek"
          className="flex items-center justify-center border-t border-border/70 bg-secondary/40 px-5 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-secondary"
        >
          További {remaining} esemény
        </Link>
      ) : null}
    </section>
  )
}

const CREW_AVATARS_SHOWN = 6

// Az eseményeket és a hirdetéseket a saját kártyáik mutatják; itt a csapat kerül előtérbe.
function BoatCard({ data, onboarding }: { data: CaptainHomeData; onboarding: boolean }) {
  const shownCrew = data.crew.slice(0, CREW_AVATARS_SHOWN)
  const extraCrew = data.crewCount - shownCrew.length
  const innerLink = "relative z-10 text-sm font-semibold text-brand-ink underline-offset-4 hover:underline"

  return (
    <section aria-labelledby="captain-boat" className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-brand/40">
      <div className="relative h-[150px] bg-brand">
        {data.boat.imageUrl ? (
          <Image src={data.boat.imageUrl} alt={`A ${data.boat.name} vitorlás`} fill sizes="360px" className="object-cover" />
        ) : null}
      </div>
      <div className="px-5 pb-5 pt-4">
        <h2 id="captain-boat" className="text-lg font-bold">
          {/* A teljes kártya kattintható: a link a kártyára feszül. */}
          <Link href="/kapitany-dashboard" className="after:absolute after:inset-0 after:rounded-2xl group-hover:text-brand-ink focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand">
            {data.boat.name} <span aria-hidden="true" className="text-muted-foreground">→</span>
          </Link>
        </h2>
        <p className="text-sm text-muted-foreground">{[data.boat.type, data.boat.harbor].filter(Boolean).join(" · ")}</p>
        {data.crewCount === 0 ? (
          onboarding ? (
            <p className="mt-3 text-sm text-muted-foreground">Még nincs csapattagod. A kezdő lépések végigvisznek rajta.</p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Még nincs csapattagod.{" "}
              <Link href="/kapitany-dashboard?meghivas=uj" className={innerLink}>Meghívás →</Link>
            </p>
          )
        ) : (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-secondary px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex shrink-0 items-center">
                {shownCrew.map((person, index) => (
                  <span
                    key={person.id}
                    title={person.name}
                    className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-secondary bg-brand-soft text-xs font-semibold text-brand-ink ${index > 0 ? "-ml-2" : ""}`}
                  >
                    {person.avatarUrl ? <Image src={person.avatarUrl} alt={person.name} fill sizes="32px" className="object-cover" /> : person.name.charAt(0).toUpperCase()}
                  </span>
                ))}
                {extraCrew > 0 ? (
                  <span className="-ml-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-secondary bg-card text-xs font-semibold text-muted-foreground">+{extraCrew}</span>
                ) : null}
              </span>
              <span className="text-sm font-semibold">{data.crewCount} csapattag</span>
            </div>
            <Link href="/kapitany-dashboard?ful=csapat" className={innerLink}>Csapat kezelése →</Link>
          </div>
        )}
      </div>
    </section>
  )
}

function MyListings({ listings }: { listings: HomeListing[] }) {
  return (
    <section aria-labelledby="captain-listings" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
        <h2 id="captain-listings" className={sectionLabel}>Hirdetéseid</h2>
        {listings.length > 0 ? (
          <Link href="/kapitany-dashboard?ful=hirdetesek" className="text-sm font-medium text-brand-ink underline-offset-4 hover:underline">
            Összes ({listings.length})
          </Link>
        ) : null}
      </div>
      {listings.length === 0 ? (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          Nincs aktív hirdetésed.{" "}
          <Link href="/kapitany-dashboard?hirdetes=uj" className="font-semibold text-brand-ink underline-offset-4 hover:underline">
            Hirdetés feladása
          </Link>
        </div>
      ) : (
        <ul>
          {listings.slice(0, 5).map((listing) => (
            <li key={listing.id} className="border-b border-border/70 last:border-b-0">
              <Link
                href={`/kapitany-dashboard?jelentkezok=${encodeURIComponent(listing.id)}`}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-secondary/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{listing.title}</span>
                  <span className={`block text-sm ${isExpiringSoon(listing) ? "font-medium text-attention-ink" : "text-muted-foreground"}`}>
                    {formatExpiry(listing)}
                  </span>
                </span>
                {listing.pending > 0 ? (
                  <span className="shrink-0 rounded-full bg-brand-orange px-2.5 py-0.5 text-[13px] font-bold text-brand-orange-foreground">
                    {listing.pending} új
                  </span>
                ) : (
                  <span className="shrink-0 text-sm text-muted-foreground">Nincs új</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Betöltés">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  )
}
