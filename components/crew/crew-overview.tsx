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
import { respondToEvent, useCrewData, type CrewTeam, type OtherBoatEvent } from "./crew-data"
import {
  BoatTag,
  DateBlock,
  GoingChip,
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
  const accepted = applications.applications.filter((row) => row.status === "accepted")
  const otherApplications = applications.applications.filter((row) => row.status !== "accepted")
  const loading = crew.status === "loading" || applications.status === "loading"
  const empty = crew.teams.length === 0 && crew.events.length === 0 && applications.applications.length === 0
  return { crew, applications, going, awaiting, declined, accepted, otherApplications, loading, empty }
}

const AWAITING_SHOWN = 3
const GOING_SHOWN = 5
const SUMMARY_SHOWN = 2

type GoingItem =
  | { kind: "event"; date: string | null; event: OtherBoatEvent }
  | { kind: "application"; date: string | null; application: MyApplication }

function goingItems(events: OtherBoatEvent[], applications: MyApplication[]): GoingItem[] {
  return [
    ...events.map((event) => ({ kind: "event" as const, date: event.startDate, event })),
    ...applications.map((application) => ({ kind: "application" as const, date: application.startDate, application })),
  ].sort((first, second) => (first.date ?? "9999").localeCompare(second.date ?? "9999"))
}

// "full": matróz kezdőlap és a Vitorlázásaim oldal; "summary": a kapitányi kezdőlap kivonata.
export function CrewOverview({ data, userId, mode }: { data: CrewOverviewData; userId: string | null; mode: "full" | "summary" }) {
  const { crew, applications, going, awaiting, declined, accepted, otherApplications } = data
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [details, setDetails] = useState<EventDetailsSummary | null>(null)
  const [showAllAwaiting, setShowAllAwaiting] = useState(false)
  const [showAllGoing, setShowAllGoing] = useState(false)

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

  const awaitingRow = (event: OtherBoatEvent) => {
    const busy = respondingId === event.id
    return (
      <li key={event.id} className={rowClass}>
        <DateBlock startDate={event.startDate} endDate={event.endDate} muted={event.answer === "declined"} />
        <div className="min-w-0 flex-[999_1_220px]">
          <button type="button" onClick={() => openDetails(event)} className="text-left font-semibold hover:text-brand-ink hover:underline">
            {event.title}
          </button>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {crew.teams.length > 1 ? <BoatTag name={event.boatName} color={colorFor(event.boatId)} /> : null}
            {[event.type, crew.teams.length > 1 ? null : event.boatName, event.location].filter(Boolean).join(" · ")}
          </p>
        </div>
        {event.answer === "declined" ? (
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm text-muted-foreground">Nem mész</span>
            <button type="button" disabled={respondingId !== null} onClick={() => void respond(event, "confirmed")} className={compactSecondary}>
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
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{applicationMeta(item.application)}</p>
          <AcceptedApplicationDetails application={item.application} />
        </div>
      </li>
    )

  const errors = (
    <>
      {crew.status === "error" ? <p role="alert" className="border-b border-border/70 px-5 py-3 text-sm text-destructive">A más hajók eseményeit most nem sikerült betölteni.</p> : null}
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

  const answerGroups = [...awaiting, ...declined]

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
  const laterGoing = goingItems(going.slice(1), accepted)
  const busy = crew.teams.length > 1 || answerGroups.length + laterGoing.length > 5

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

  if (busy) {
    const visibleAwaiting = showAllAwaiting ? answerGroups : answerGroups.slice(0, AWAITING_SHOWN)
    const visibleGoing = showAllGoing ? laterGoing : laterGoing.slice(0, GOING_SHOWN)
    const monthOf = (item: GoingItem) => (item.date ? monthGroupLabel(item.date) : "Időpont nélkül")

    return (
      <div className="flex flex-col gap-6">
        {nextCard}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            {errors}
            {answerGroups.length > 0 ? (
              <section aria-labelledby="crew-awaiting" className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
                  <h2 id="crew-awaiting" className="flex items-center gap-2 text-base font-semibold">Válaszra vár <CountBadge count={awaiting.length} /></h2>
                  <span className="text-sm text-muted-foreground">Időrendben</span>
                </div>
                <ul>{visibleAwaiting.map(awaitingRow)}</ul>
                <ShowMore hidden={answerGroups.length - visibleAwaiting.length} label="esemény" onClick={() => setShowAllAwaiting(true)} />
              </section>
            ) : null}
            {laterGoing.length > 0 ? (
              <section aria-labelledby="crew-going" className="overflow-hidden rounded-2xl border border-border bg-card">
                <h2 id="crew-going" className="border-b border-border/70 px-5 py-4 text-base font-semibold">Megyek</h2>
                <ul>
                  {visibleGoing.map((item, index) => {
                    const month = monthOf(item)
                    // Hónap-fejléc ott, ahol az előző tételhez képest új hónap kezdődik.
                    const heading = index === 0 || monthOf(visibleGoing[index - 1]) !== month
                      ? <li key={`m-${month}`} className="border-b border-border/70 bg-secondary/50 px-5 py-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{month}</li>
                      : null
                    return [heading, goingRow(item)]
                  })}
                </ul>
                <ShowMore hidden={laterGoing.length - visibleGoing.length} label="esemény" onClick={() => setShowAllGoing(true)} />
              </section>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <TeamsCard teams={crew.teams} events={crew.events} />
            {applicationsList ? (
              <section aria-labelledby="crew-applications" className="overflow-hidden rounded-2xl border border-border bg-card">
                <h2 id="crew-applications" className="border-b border-border/70 px-5 py-4 text-base font-semibold">Jelentkezéseid</h2>
                {applicationsList}
              </section>
            ) : null}
          </div>
        </div>
        {modal}
      </div>
    )
  }

  const listCard = answerGroups.length > 0 || laterGoing.length > 0 || applicationsList || crew.status === "error" || actionError ? (
    <section aria-labelledby="crew-list" className="overflow-hidden rounded-2xl border border-border bg-card">
      <h2 id="crew-list" className="sr-only">Vitorlázásaim</h2>
      {errors}
      {answerGroups.length > 0 ? (
        <>
          <h3 className={groupHeading}>Válaszra vár <CountBadge count={awaiting.length} /></h3>
          <ul>{answerGroups.map(awaitingRow)}</ul>
        </>
      ) : null}
      {laterGoing.length > 0 ? (
        <>
          <h3 className={groupHeading}>{next ? "Később megyek" : "Megyek"}</h3>
          <ul>{laterGoing.map(goingRow)}</ul>
        </>
      ) : null}
      {applicationsList ? (
        <>
          <h3 className={groupHeading}>Jelentkezéseid</h3>
          {applicationsList}
        </>
      ) : null}
    </section>
  ) : null

  return (
    <div className="flex flex-col gap-6">
      {nextCard}
      {crew.teams.length > 0 ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">{listCard}</div>
          <TeamsCard teams={crew.teams} events={crew.events} large />
        </div>
      ) : (
        listCard
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
    parts.push(`Elfogadták a jelentkezésedet: ${first.startDate ? `${relativeDay(first.startDate)} ` : ""}${first.title} (${first.boatName}).`)
  }
  if (next) parts.push(`${capitalize(relativeDay(next.startDate))}: ${next.title} (${next.boatName}).`)
  if (data.awaiting.length > 0) parts.push(`${data.awaiting.length} esemény vár a válaszodra.`)
  const pending = data.otherApplications.filter((row) => row.status === "pending").length
  if (pending > 0) parts.push(`${pending} jelentkezésed elbírálás alatt van.`)
  return parts.join(" ")
}
