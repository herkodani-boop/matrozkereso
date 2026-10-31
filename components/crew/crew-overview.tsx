"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { EventDetailsModal, type EventDetailsSummary } from "@/components/event-details-modal"
import {
  AcceptedApplicationDetails,
  ApplicationItem,
  ApplicationStatusChip,
  applicationMeta,
  useMyApplications,
  type MyApplication,
} from "@/components/my-applications"
import { daysUntil } from "@/components/captain-home/use-captain-home-data"
import { respondToEvent, useCrewData, type CrewTeam, type OtherBoatEvent } from "./crew-data"
import {
  BoatTag,
  DateBlock,
  GoingChip,
  NEAR_DAYS,
  NextSailingCard,
  TeamsCard,
  capitalize,
  compactPrimary,
  compactSecondary,
  formatDateRange,
  groupHeading,
  monthGroupLabel,
  relativeDay,
  rowClass,
  weekday,
} from "./crew-ui"

export type CrewOverviewData = ReturnType<typeof useCrewOverviewData>

// A legénység-nézet minden adata egy helyen; a kapitányi kezdőlap kivonata és a matróz kezdőlap is ezt kapja.
export function useCrewOverviewData(userId: string | null, refreshKey: unknown = null) {
  const crew = useCrewData(userId, refreshKey)
  const applications = useMyApplications()
  const going = crew.events.filter((event) => event.answer === "confirmed")
  const awaiting = crew.events.filter((event) => event.answer === "open")
  const declined = crew.events.filter((event) => event.answer === "declined")
  const accepted = withoutDuplicates(applications.applications.filter((row) => row.status === "accepted"), crew.events)
  const otherApplications = applications.applications.filter((row) => row.status !== "accepted")
  const loading = crew.status === "loading" || applications.status === "loading"
  // Betöltési hibánál nem tudjuk, üres-e: ilyenkor ne a kezdő lépések jöjjenek, hanem a szokásos nézet a hibával.
  const failed = crew.status === "error" || applications.status === "error"
  const empty = !failed && crew.teams.length === 0 && crew.events.length === 0 && applications.applications.length === 0
  return { crew, applications, going, awaiting, declined, accepted, otherApplications, loading, failed, empty }
}

// Az elfogadott jelentkezés kimarad, ha az alkalma már a saját eseményeim között van: a kapitány az
// eseményre is felvett (ugyanaz az esemény), vagy csapattag lettem, és a hajó aznapi eseménye látszik.
export function withoutDuplicates(accepted: MyApplication[], events: OtherBoatEvent[]): MyApplication[] {
  const eventIds = new Set(events.map((event) => event.id))
  const boatDays = new Set(events.map((event) => `${event.boatId}|${event.startDate}`))
  return accepted.filter((application) =>
    !(application.eventId && eventIds.has(application.eventId)) &&
    !(application.boatId && application.startDate && boatDays.has(`${application.boatId}|${application.startDate}`)),
  )
}

const AWAITING_SHOWN = 3
const SUMMARY_SHOWN = 2
// A matróz időrendi listájában ennyi sor látszik, a többi a "További N esemény" mögött.
const TIMELINE_SHOWN = 8

type TimelineFilter = "all" | "awaiting" | "going"

type GoingItem =
  | { kind: "event"; date: string | null; event: OtherBoatEvent }
  | { kind: "application"; date: string | null; application: MyApplication }

// Események és elfogadott jelentkezések egy időrendben (a dátum nélküliek a végén).
export function goingItems(events: OtherBoatEvent[], applications: MyApplication[]): GoingItem[] {
  return [
    ...events.map((event) => ({ kind: "event" as const, date: event.startDate, event })),
    ...applications.map((application) => ({ kind: "application" as const, date: application.startDate, application })),
  ].sort((first, second) => (first.date ?? "9999").localeCompare(second.date ?? "9999"))
}

// "full": matróz kezdőlap és a Vitorlázásaim oldal; "summary": a kapitányi kezdőlap kivonata.
export function CrewOverview({ data, userId, mode }: { data: CrewOverviewData; userId: string | null; mode: "full" | "summary" }) {
  const { crew, applications, going, awaiting, accepted, otherApplications } = data
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [details, setDetails] = useState<EventDetailsSummary | null>(null)
  const [filter, setFilter] = useState<TimelineFilter>("all")
  const [showAll, setShowAll] = useState(false)

  const teamFor = (boatId: string): CrewTeam | null => crew.teams.find((team) => team.boatId === boatId) ?? null
  const colorFor = (boatId: string) => (crew.teams.length > 1 ? teamFor(boatId)?.color : undefined)

  async function respond(event: OtherBoatEvent, status: "confirmed" | "declined") {
    if (respondingId) return
    setRespondingId(event.id)
    setActionError(null)
    try {
      await respondToEvent(event.id, status)
      crew.setAnswer(event.id, status)
      if (status === "declined") setDetails(null)
    } catch (error) {
      console.error("Esemény-visszajelzés mentési hiba:", error)
      setActionError(error instanceof Error ? error.message : "A válaszod mentése nem sikerült. Próbáld újra.")
    } finally {
      setRespondingId(null)
    }
  }

  const openDetails = (event: OtherBoatEvent) =>
    setDetails({ id: event.id, title: event.title, date: formatDateRange(event.startDate, event.endDate), location: event.location, boatName: event.boatName })
  const detailsEvent = details ? crew.events.find((event) => event.id === details.id) ?? null : null

  // Válaszra váró sor halvány narancs háttérrel és pöttyel; a lemondott halványítva, szerény "Mégis jövök"-kel.
  const awaitingRow = (event: OtherBoatEvent) => {
    const busy = respondingId === event.id
    const declinedRow = event.answer === "declined"
    return (
      <li key={event.id} className={`${rowClass} ${declinedRow ? "" : "bg-brand-orange/[0.06]"}`}>
        <DateBlock startDate={event.startDate} endDate={event.endDate} muted={declinedRow} />
        <div className="min-w-0 flex-[999_1_220px]">
          <button
            type="button"
            onClick={() => openDetails(event)}
            className={`flex items-center gap-2 text-left font-semibold hover:text-brand-ink hover:underline ${declinedRow ? "text-muted-foreground" : ""}`}
          >
            {declinedRow ? null : <span className="h-2 w-2 shrink-0 rounded-full bg-brand-orange" aria-hidden="true" />}
            {event.title}
            {declinedRow ? null : <span className="sr-only">(válaszra vár)</span>}
          </button>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {crew.teams.length > 1 ? <BoatTag name={event.boatName} color={colorFor(event.boatId)} /> : null}
            {[event.type, crew.teams.length > 1 ? null : event.boatName, event.location].filter(Boolean).join(" · ")}
          </p>
        </div>
        {declinedRow ? (
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-sm text-muted-foreground">Nem mész</span>
            <button
              type="button"
              disabled={respondingId !== null}
              onClick={() => void respond(event, "confirmed")}
              className={`${compactSecondary} border-transparent bg-transparent font-medium text-muted-foreground hover:text-foreground`}
            >
              {busy ? "Mentés..." : "Mégis jövök"}
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-2">
            <button type="button" disabled={respondingId !== null} onClick={() => void respond(event, "confirmed")} className={compactPrimary} aria-label={`Jövök: ${event.title}`}>
              {busy ? "Mentés..." : "Jövök"}
            </button>
            <button type="button" disabled={respondingId !== null} onClick={() => void respond(event, "declined")} className={compactSecondary} aria-label={`Nem jövök: ${event.title}`}>
              Nem jövök
            </button>
          </div>
        )}
      </li>
    )
  }

  const goingRow = (item: GoingItem) =>
    item.kind === "event" ? (
      <li key={`event-${item.event.id}`} className={rowClass}>
        <DateBlock startDate={item.event.startDate} endDate={item.event.endDate} />
        <div className="min-w-0 flex-[999_1_220px]">
          <p className="font-semibold">{item.event.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {crew.teams.length > 1 ? <BoatTag name={item.event.boatName} color={colorFor(item.event.boatId)} /> : null}
            {[crew.teams.length > 1 ? null : item.event.boatName, item.event.location, weekday(item.event.startDate)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <GoingChip />
        <button type="button" onClick={() => openDetails(item.event)} className={`${compactSecondary} border-transparent bg-transparent text-brand-ink`} aria-label={`Részletek: ${item.event.title}`}>
          Részletek
        </button>
      </li>
    ) : (
      <li key={`application-${item.application.id}`} className={`${rowClass} items-start`}>
        <DateBlock startDate={item.application.startDate} endDate={item.application.endDate} strong />
        <div className="min-w-0 flex-[999_1_220px]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{item.application.title}</p>
            <ApplicationStatusChip status="accepted" />
            {item.application.adClosed === "deleted" ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">A hirdetést visszavonták</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{applicationMeta(item.application)}</p>
          <AcceptedApplicationDetails application={item.application} />
        </div>
      </li>
    )

  const errors = (
    <>
      {crew.status === "error" ? <p role="alert" className="border-b border-border/70 px-5 py-3 text-sm text-destructive">A más hajók eseményeit most nem sikerült betölteni.</p> : null}
      {applications.status === "error" ? <p role="alert" className="border-b border-border/70 px-5 py-3 text-sm text-destructive">A jelentkezéseidet most nem sikerült betölteni.</p> : null}
      {actionError ? <p role="alert" className="border-b border-border/70 px-5 py-3 text-sm text-destructive">{actionError}</p> : null}
    </>
  )

  const modal = (
    <EventDetailsModal
      event={details}
      open={details !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setDetails(null)
      }}
      currentUserId={userId}
      onCancelParticipation={detailsEvent?.answer === "confirmed" ? () => void respond(detailsEvent, "declined") : undefined}
      canceling={details !== null && respondingId === details.id}
      actionError={actionError}
    />
  )

  if (mode === "summary") {
    const items = goingItems(going, accepted)
    return (
      <>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {errors}
          {items.length > 0 ? (
            <>
              <h3 className={groupHeading}>Megyek</h3>
              <ul>{items.slice(0, SUMMARY_SHOWN).map(goingRow)}</ul>
            </>
          ) : null}
          {awaiting.length > 0 ? (
            <>
              <h3 className={groupHeading}>Válaszra vár <CountBadge count={awaiting.length} /></h3>
              <ul>{awaiting.slice(0, AWAITING_SHOWN).map(awaitingRow)}</ul>
            </>
          ) : null}
          {otherApplications.length > 0 ? (
            <>
              <h3 className={groupHeading}>Jelentkezéseid</h3>
              <ul>
                {otherApplications.slice(0, SUMMARY_SHOWN).map((application) => (
                  <ApplicationItem key={application.id} application={application} onCancel={applications.cancel} onHide={applications.hide} />
                ))}
              </ul>
            </>
          ) : null}
          <MoreLink href="/vitorlazasaim">Minden vitorlázásom</MoreLink>
        </div>
        {modal}
      </>
    )
  }

  const next = going[0] ?? null

  const nextCard = next ? (
    <NextSailingCard
      event={next}
      team={teamFor(next.boatId)}
      busy={respondingId === next.id}
      onCancel={() => void respond(next, "declined")}
      onDetails={() => openDetails(next)}
    />
  ) : null

  const applicationsList = otherApplications.length > 0 ? (
    <ul>
      {otherApplications.map((application) => (
        <ApplicationItem key={application.id} application={application} onCancel={applications.cancel} onHide={applications.hide} />
      ))}
    </ul>
  ) : null

  // EGY időrendi lista: a következő vitorlázás utáni minden esemény a saját állapotával
  // (válaszra vár / megyek / nem mész), plusz az elfogadott jelentkezések. Igen után a sor helyben marad.
  const timeline: GoingItem[] = goingItems(crew.events.filter((event) => event.id !== next?.id), accepted)
  const filtered = timeline.filter((item) =>
    filter === "all"
      ? true
      : filter === "awaiting"
        ? item.kind === "event" && item.event.answer === "open"
        : item.kind === "application" || item.event.answer === "confirmed",
  )
  const visible = showAll ? filtered : filtered.slice(0, TIMELINE_SHOWN)
  const monthOf = (item: GoingItem) => (item.date ? monthGroupLabel(item.date) : "Időpont nélkül")
  const timelineRow = (item: GoingItem) =>
    item.kind === "event" && item.event.answer !== "confirmed" ? awaitingRow(item.event) : goingRow(item)
  const filters: { value: TimelineFilter; label: string; count?: number }[] = [
    { value: "all", label: "Mind" },
    { value: "awaiting", label: "Válaszra vár", count: awaiting.length },
    { value: "going", label: "Megyek" },
  ]

  // Csapattagnak akkor is ott a kártya, ha épp nincs eseménye; különben üres maradna a bal oszlop.
  const timelineCard = timeline.length > 0 || crew.teams.length > 0 || data.failed || actionError ? (
    <section aria-labelledby="crew-timeline" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
        <h2 id="crew-timeline" className="text-base font-semibold">{next ? "Később" : "Vitorlázásaim"}</h2>
        {timeline.length > 3 ? (
          <div role="group" aria-label="Szűrés" className="flex gap-1.5 overflow-x-auto">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => {
                  setFilter(item.value)
                  setShowAll(false)
                }}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                  filter === item.value ? "border-brand bg-brand text-white" : "border-border bg-card text-foreground hover:border-brand/40"
                }`}
              >
                {item.label}
                {item.count ? <CountBadge count={item.count} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {errors}
      {timeline.length === 0 ? (
        data.failed ? null : (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            {next
              ? "Ezután nincs több közelgő esemény."
              : "A csapataidnak most nincs közelgő eseménye. Ha a kapitány felvesz egyet, itt jelenik meg, és a csengőben is szólunk."}
          </p>
        )
      ) : visible.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          {filter === "awaiting" ? "Nincs válaszra váró esemény." : "Ebben a nézetben nincs esemény."}
        </p>
      ) : (
        <ul>
          {visible.map((item, index) => {
            const month = monthOf(item)
            // Hónap-fejléc ott, ahol az előző tételhez képest új hónap kezdődik.
            const heading = index === 0 || monthOf(visible[index - 1]) !== month
              ? <li key={`m-${month}`} className="border-b border-border/70 bg-secondary/50 px-5 py-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{month}</li>
              : null
            return [heading, timelineRow(item)]
          })}
        </ul>
      )}
      <ShowMore hidden={filtered.length - visible.length} label="esemény" onClick={() => setShowAll(true)} />
    </section>
  ) : null

  const applicationsCard = applicationsList ? (
    <section aria-labelledby="crew-applications" className="overflow-hidden rounded-2xl border border-border bg-card">
      <h2 id="crew-applications" className="border-b border-border/70 px-5 py-4 text-base font-semibold">Jelentkezéseid</h2>
      {applicationsList}
    </section>
  ) : null

  const side = crew.teams.length > 0 || (timelineCard && applicationsCard)

  return (
    <div className="flex flex-col gap-6">
      {nextCard}
      {side ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">{timelineCard}</div>
          <div className="flex min-w-0 flex-col gap-6">
            <TeamsCard teams={crew.teams} events={crew.events} large={crew.teams.length === 1} />
            {applicationsCard}
          </div>
        </div>
      ) : (
        <>
          {timelineCard}
          {applicationsCard}
        </>
      )}
      {modal}
    </div>
  )
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null
  return <span className="min-w-5 rounded-full bg-brand-orange px-1.5 text-center text-xs font-bold leading-5 text-brand-orange-foreground">{count}</span>
}

function ShowMore({ hidden, label, onClick }: { hidden: number; label: string; onClick: () => void }) {
  if (hidden <= 0) return null
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-center border-t border-border/70 bg-secondary/40 px-5 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-secondary">
      További {hidden} {label}
    </button>
  )
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-center border-t border-border/70 bg-secondary/40 px-5 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-secondary">
      {children} <span aria-hidden="true" className="ml-1">→</span>
    </Link>
  )
}

// A köszöntés összefoglalója a legénység szemével: mi a következő, mi vár válaszra.
export function crewSummary(data: CrewOverviewData) {
  const next = data.going[0]
  const parts: string[] = []
  if (data.accepted.length > 0 && !next) {
    const first = data.accepted[0]
    parts.push(`Elfogadták a jelentkezésedet: ${first.title} (${first.boatName})${first.startDate ? `, ${relativeDay(first.startDate)}` : ""}.`)
  }
  if (next) {
    // Közel: "Holnap: Hajószerelés (Nemere)."; távol: "Következő vitorlázásod: május 8., Balatoni Évadnyitó (Sirocco)."
    parts.push(daysUntil(next.startDate) < NEAR_DAYS
      ? `${capitalize(relativeDay(next.startDate))}: ${next.title} (${next.boatName}).`
      : `Következő vitorlázásod: ${relativeDay(next.startDate)}, ${next.title} (${next.boatName}).`)
  }
  if (data.awaiting.length > 0) parts.push(`${data.awaiting.length} esemény vár a válaszodra.`)
  const pending = data.otherApplications.filter((row) => row.status === "pending").length
  if (pending > 0) parts.push(`${pending} jelentkezésed elbírálás alatt van.`)
  return parts.join(" ")
}
