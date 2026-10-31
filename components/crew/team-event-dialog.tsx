"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { CalendarDays, Check, MapPin } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getTodayKey } from "@/components/captain-home/use-captain-home-data"
import { EventWeatherPanel } from "@/components/captain-home/event-extras"
import { NoteText, capitalize, compactPrimary, compactSecondary, formatDateRange, primaryButton, weekday } from "./crew-ui"
import { attendance, myAnswer, type TeamEvent, type TeamPeople, type TeamView } from "./teams-data"

// Egy csoportban ennyi név látszik; nagy (akár 30 fős) csapatnál a többi a "+N további" mögött.
const NAMES_SHOWN = 12

type Person = { id: string; name: string; avatarUrl: string | null }

function SmallAvatar({ person }: { person: Person }) {
  return person.avatarUrl ? (
    <Image src={person.avatarUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" />
  ) : (
    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand-ink">
      {person.name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("")}
    </span>
  )
}

function PeopleGroup({ title, people, muted = false, meId }: { title: string; people: Person[]; muted?: boolean; meId: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (people.length === 0) return null
  const visible = expanded ? people : people.slice(0, NAMES_SHOWN)
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {title}
        <span className="min-w-6 rounded-full bg-secondary px-2 text-center text-xs font-bold leading-6">{people.length}</span>
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {visible.map((person) => (
          <li key={person.id} className={`inline-flex items-center gap-2 rounded-full bg-secondary py-1 pl-1 pr-3 text-sm ${muted ? "text-muted-foreground" : "font-medium"}`}>
            <SmallAvatar person={person} />
            {person.id === meId ? "Te" : person.name}
          </li>
        ))}
        {people.length > visible.length ? (
          <li>
            <button type="button" onClick={() => setExpanded(true)} className="inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-brand-ink hover:bg-secondary">
              +{people.length - visible.length} további
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

// Egy csapatesemény részletei a "Csapataim" oldalon: itt lehet válaszolni is (a naptárból ide jut a felhasználó),
// a kapitány megjegyzése, az időjárás és a csapat válaszai csoportosítva. Az adat a már betöltött csapatadatból jön.
export function TeamEventDialog({
  item,
  userId,
  people,
  respondingId,
  onRespond,
  onClose,
}: {
  item: { event: TeamEvent; team: TeamView } | null
  userId: string | null
  people: TeamPeople
  respondingId: string | null
  onRespond: (event: TeamEvent, status: "confirmed" | "declined") => void
  onClose: () => void
}) {
  if (!item) return null
  const { event, team } = item
  const todayKey = getTodayKey()
  const past = (event.endDate ?? event.startDate) < todayKey
  const answer = myAnswer(event, userId)
  const busy = respondingId === event.id
  const captain = team.members.find((member) => member.isCaptain)
  const memberById = new Map(team.members.map((member) => [member.id, member]))
  const toPerson = (id: string): Person => {
    const member = memberById.get(id)
    return { id, name: member?.name ?? people[id]?.name ?? "Résztvevő", avatarUrl: member?.avatarUrl ?? people[id]?.avatarUrl ?? null }
  }
  // A saját név elöl, a többi névsorban.
  const sorted = (ids: string[]) =>
    ids.map(toPerson).sort((first, second) => (first.id === userId ? -1 : second.id === userId ? 1 : first.name.localeCompare(second.name, "hu")))
  const { confirmed, declined, unanswered } = attendance(event, team.members)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg">
        <div className="relative h-36 w-full shrink-0 bg-brand-soft">
          {team.imageUrl ? <Image src={team.imageUrl} alt="" fill sizes="(max-width: 640px) 100vw, 512px" className="object-cover" /> : null}
        </div>

        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-6">
          <DialogHeader className="gap-1.5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: team.color }} aria-hidden="true" />
              {team.name}
            </p>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight">
              {event.title}
              {event.type ? (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${event.type === "Verseny" ? "bg-brand-orange/15 text-foreground" : "bg-secondary text-foreground/80"}`}>{event.type}</span>
              ) : null}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {formatDateRange(event.startDate, event.endDate)}, {weekday(event.startDate)}
              </span>
              {event.location ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {event.location}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {team.own ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-soft px-4 py-3 text-brand-ink">
              <p className="text-sm font-medium">A te eseményed: a résztvevőket és a részleteket a Hajóm oldalon kezeled.</p>
              <Link href={`/kapitany-dashboard?esemeny=${encodeURIComponent(event.id)}`} className={compactPrimary}>Kezelés</Link>
            </div>
          ) : past ? (
            <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">Ez az esemény már elmúlt.</p>
          ) : answer === "open" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-orange/[0.1] px-4 py-3">
              <p className="flex flex-[1_1_160px] items-center gap-2 font-semibold">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand-orange" aria-hidden="true" />
                Ott leszel?
              </p>
              <button type="button" disabled={respondingId !== null} onClick={() => onRespond(event, "confirmed")} className={primaryButton}>
                {busy ? "Mentés..." : "Jövök"}
              </button>
              <button type="button" disabled={respondingId !== null} onClick={() => onRespond(event, "declined")} className={compactSecondary.replace("h-10", "h-11")}>
                Nem jövök
              </button>
            </div>
          ) : answer === "confirmed" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-soft px-4 py-3">
              <p className="flex items-center gap-2 font-semibold text-brand-ink">
                <Check className="h-4 w-4" aria-hidden="true" />
                Jössz
              </p>
              <button type="button" disabled={respondingId !== null} onClick={() => onRespond(event, "declined")} className={compactSecondary}>
                {busy ? "Mentés..." : "Mégsem tudok menni"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3">
              <p className="font-semibold text-muted-foreground">Nem mész</p>
              <button type="button" disabled={respondingId !== null} onClick={() => onRespond(event, "confirmed")} className={compactSecondary}>
                {busy ? "Mentés..." : "Mégis jövök"}
              </button>
            </div>
          )}

          {event.note ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {captain ? `${captain.name.trim().split(/\s+/).at(-1)}, a kapitány megjegyzése` : "A kapitány megjegyzése"}
              </p>
              <p className="whitespace-pre-line rounded-xl bg-secondary px-4 py-3 text-sm leading-relaxed">
                <NoteText text={event.note} />
              </p>
            </div>
          ) : null}

          {!past ? <EventWeatherPanel event={{ startDate: event.startDate, location: event.location }} harbor={team.harbor} /> : null}

          <div className="flex flex-col gap-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{capitalize(past ? "kik voltak ott" : "ki jön a csapatból")}</p>
            {confirmed.length === 0 && declined.length === 0 ? <p className="text-sm text-muted-foreground">Még senki nem válaszolt.</p> : null}
            <PeopleGroup title="Jön" people={sorted(confirmed)} meId={userId} />
            <PeopleGroup title="Nem jön" people={sorted(declined)} muted meId={userId} />
            {!past ? <PeopleGroup title="Még nem válaszolt" people={sorted(unanswered)} muted meId={userId} /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
