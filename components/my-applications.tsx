"use client"

import { useCallback, useEffect, useState } from "react"
import { Mail, Phone } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { supabase } from "@/lib/supabase"
import { isAdVisibleByDate } from "@/lib/ad-visibility"
import { crewRoleLabel } from "@/lib/crew-roles"

export type MyApplication = {
  id: string
  status: "pending" | "accepted" | "rejected"
  createdAt: string
  title: string
  // A hirdetést a kapitány visszavonta vagy lezárta; a jelentkezés ettől még látszik.
  adClosed: "deleted" | "closed" | null
  boatName: string
  location: string
  dateText: string
  startDate: string | null
  endDate: string | null
  roles: string[]
  contact: { name: string | null; email: string | null; phone: string | null } | null
}

type BoatEmbed = { name: string | null }
type AdEmbed = {
  title: string | null
  location: string | null
  date_text: string | null
  is_active: boolean
  is_deleted: boolean
  positions: unknown[] | null
  commitment: string | null
  start_date: string | null
  end_date: string | null
  boat: BoatEmbed | BoatEmbed[] | null
}
type ApplicationQueryRow = {
  id: string
  status: string
  created_at: string
  captain_contact_shared_at: string | null
  captain_contact_name: string | null
  captain_contact_email: string | null
  captain_contact_phone: string | null
  ad: AdEmbed | AdEmbed[] | null
}

const HIDDEN_KEY = "matrozkereso:hidden-applications"

// Az elrejtett elutasítások csak ennek a böngészőnek a kényelmét szolgálják, ezért elég a localStorage.
function readHiddenIds(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]") as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function writeHiddenIds(ids: string[]) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids.slice(-100)))
  } catch {
    // Privát ablakban a tárolás tilthatja; ilyenkor csak erre a megtekintésre rejtjük el.
  }
}

function toApplication(row: ApplicationQueryRow): MyApplication | null {
  const ad = Array.isArray(row.ad) ? row.ad[0] ?? null : row.ad
  if (!ad) return null
  const boat = Array.isArray(ad.boat) ? ad.boat[0] ?? null : ad.boat
  const status = row.status === "accepted" || row.status === "rejected" ? row.status : "pending"
  return {
    id: String(row.id),
    status,
    createdAt: row.created_at,
    title: ad.title || "Hirdetés",
    adClosed: ad.is_deleted ? "deleted" : ad.is_active === false ? "closed" : null,
    boatName: boat?.name || "Hajó",
    location: ad.location || "",
    dateText: ad.date_text || "",
    startDate: ad.start_date,
    endDate: ad.end_date,
    roles: (ad.positions ?? []).map((position) => crewRoleLabel(position)),
    contact: row.captain_contact_shared_at
      ? { name: row.captain_contact_name, email: row.captain_contact_email, phone: row.captain_contact_phone }
      : null,
  }
}

// A saját jelentkezések: a lejárt alkalmakra szólók és az elrejtett elutasítások nélkül.
export function useMyApplications() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; applications: MyApplication[] }>({
    status: "loading",
    applications: [],
  })
  const [hiddenIds, setHiddenIds] = useState<string[]>([])

  useEffect(() => {
    if (!userId) return
    let active = true

    supabase
      .from("applications")
      .select("id, status, created_at, captain_contact_shared_at, captain_contact_name, captain_contact_email, captain_contact_phone, ad:ads!inner(title, location, date_text, is_active, is_deleted, positions, commitment, start_date, end_date, boat:boats(name))")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error("Jelentkezések lekérdezési hiba:", error)
          setState({ status: "error", applications: [] })
          return
        }
        const rows = ((data ?? []) as unknown as ApplicationQueryRow[])
          .map((row) => {
            const ad = Array.isArray(row.ad) ? row.ad[0] : row.ad
            return ad && isAdVisibleByDate(ad) ? toApplication(row) : null
          })
          .filter((row): row is MyApplication => row !== null)
        // Az elrejtett azonosítókat a betöltéssel együtt olvassuk, így szerveroldalon nem nyúlunk a localStorage-hoz.
        setHiddenIds(readHiddenIds())
        setState({ status: "ready", applications: rows })
      })

    return () => {
      active = false
    }
  }, [userId])

  const cancel = useCallback(async (applicationId: string) => {
    const { error } = await supabase.from("applications").delete().eq("id", applicationId)
    if (error) {
      console.error("Visszavonási hiba:", error)
      throw new Error("A jelentkezés visszavonása nem sikerült.")
    }
    setState((previous) => ({ ...previous, applications: previous.applications.filter((row) => row.id !== applicationId) }))
  }, [])

  const hide = useCallback((applicationId: string) => {
    setHiddenIds((previous) => {
      const next = [...previous, applicationId]
      writeHiddenIds(next)
      return next
    })
  }, [])

  return {
    status: userId ? state.status : "ready",
    applications: userId ? state.applications.filter((row) => !hiddenIds.includes(row.id)) : [],
    cancel,
    hide,
  }
}

const dayMonthFormat = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric" })

function formatDay(dateKey: string) {
  return dayMonthFormat.format(new Date(`${dateKey}T12:00:00`))
}

export function applicationMeta(application: MyApplication) {
  return [application.boatName, application.dateText, application.location, ...application.roles].filter(Boolean).join(" · ")
}

const statusChip = {
  pending: { label: "Elbírálás alatt", className: "bg-secondary text-muted-foreground" },
  accepted: { label: "Elfogadva erre az alkalomra", className: "bg-success-soft text-success-ink" },
  rejected: { label: "Most nem jött össze", className: "bg-secondary text-muted-foreground" },
}

const quietButton =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"

export function ApplicationStatusChip({ status }: { status: MyApplication["status"] }) {
  const chip = statusChip[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
}

// Elfogadott jelentkezés: egy mondat arról, mire szól, és ha a kapitány megosztotta, az elérhetősége.
export function AcceptedApplicationDetails({ application }: { application: MyApplication }) {
  const contact = application.contact
  if (!contact) {
    return <p className="mt-2.5 text-sm text-muted-foreground">A kapitány a profilodban megadott elérhetőségeden keres a részletekkel.</p>
  }
  return (
    <>
      <p className="mt-2.5 text-sm text-muted-foreground">A kapitány erre az alkalomra vesz fel. Vedd fel vele a kapcsolatot a részletekért:</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-secondary px-3.5 py-2.5 text-sm">
        {contact.name ? <span className="font-semibold">{contact.name}</span> : null}
        {contact.phone ? (
          <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-brand-ink">
            <Phone className="h-3.5 w-3.5 text-brand-ink" aria-hidden="true" />
            {contact.phone}
          </a>
        ) : null}
        {contact.email ? (
          <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:text-brand-ink">
            <Mail className="h-3.5 w-3.5 text-brand-ink" aria-hidden="true" />
            {contact.email}
          </a>
        ) : null}
      </div>
      <p className="mt-2.5 text-[13px] text-muted-foreground">
        Ez nem csapattagság: ha a kapitány később a csapatába hív, arról külön meghívót kapsz.
      </p>
    </>
  )
}

// Egy jelentkezés egy sorban: állapot, legfeljebb egy teendő (visszavonás vagy elrejtés).
export function ApplicationItem({
  application,
  onCancel,
  onHide,
}: {
  application: MyApplication
  onCancel: (id: string) => Promise<void>
  onHide: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rejected = application.status === "rejected"

  async function cancel() {
    setBusy(true)
    setError(null)
    try {
      await onCancel(application.id)
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "A jelentkezés visszavonása nem sikerült.")
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-border/70 px-5 py-4 last:border-b-0">
      <div className="min-w-0 flex-[999_1_280px]">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`font-semibold ${rejected ? "text-muted-foreground" : ""}`}>{application.title}</p>
          <ApplicationStatusChip status={application.status} />
          {application.adClosed ? (
            <span className="text-xs text-muted-foreground">
              {application.adClosed === "deleted" ? "A hirdetést visszavonták" : "A hirdetés lezárult"}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{applicationMeta(application)}</p>
        {application.status === "pending" ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            Elküldve {formatDay(application.createdAt.slice(0, 10))}. Ha a kapitány dönt, e-mailt kapsz.
          </p>
        ) : null}
        {application.status === "accepted" ? <AcceptedApplicationDetails application={application} /> : null}
        {error ? <p role="alert" className="mt-1.5 text-sm text-destructive">{error}</p> : null}
      </div>
      {application.status === "pending" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void cancel()}
          className={`${quietButton} border border-border bg-card text-foreground hover:bg-secondary`}
        >
          {busy ? "Visszavonás..." : "Visszavonom"}
        </button>
      ) : rejected ? (
        <button type="button" onClick={() => onHide(application.id)} className={`${quietButton} text-muted-foreground hover:bg-secondary`}>
          Elrejtés
        </button>
      ) : null}
    </li>
  )
}
