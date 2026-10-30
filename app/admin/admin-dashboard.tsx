"use client"

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react"
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  LoaderCircle,
  Megaphone,
  RotateCcw,
  Search,
  Sailboat,
  Save,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type AdminSection = "statistics" | "platform"
type PlatformArea = "users" | "boats" | "listings" | "events" | "reports"
type ListStatus =
  | "all"
  | "active"
  | "deleted"
  | "reported"
  | "admin_deleted_listings"
  | "valid_reports_received"
  | "pending_reports_received"
  | "invalid_reports_sent"
type AdminRow = Record<string, unknown> & { id: string }
type FieldDefinition = { key: string; label: string; type?: "text" | "date" | "number" | "boolean" | "array" }

const PAGE_SIZE = 25
const reportColumns = [
  { key: "listing_title", label: "Hirdetés" },
  { key: "reporter_name", label: "Bejelentő" },
  { key: "report_type", label: "Ok" },
  { key: "evaluation_status", label: "Értékelés" },
  { key: "extra_text", label: "Leírás" },
  { key: "created_at", label: "Dátum" },
  { key: "listing_deletion_reason", label: "Hirdetés törlésének oka" },
  { key: "is_deleted", label: "Állapot" },
]

const sections: { id: AdminSection; label: string; icon: LucideIcon }[] = [
  { id: "statistics", label: "Statisztikák", icon: BarChart3 },
  { id: "platform", label: "Platformkezelés", icon: Users },
]

const platformAreas: { id: PlatformArea; label: string; icon: LucideIcon }[] = [
  { id: "users", label: "Felhasználók", icon: Users },
  { id: "listings", label: "Hirdetések", icon: Megaphone },
  { id: "boats", label: "Hajók", icon: Sailboat },
  { id: "events", label: "Események", icon: CalendarDays },
  { id: "reports", label: "Bejelentések", icon: Flag },
]

const categoryFields: Record<Exclude<PlatformArea, "reports">, FieldDefinition[]> = {
  users: [
    { key: "full_name", label: "Teljes név" },
    { key: "email", label: "Email-cím" },
    { key: "role", label: "Szerepkör" },
    { key: "phone", label: "Telefonszám" },
    { key: "birthdate", label: "Születési dátum", type: "date" },
    { key: "level", label: "Tapasztalati szint" },
    { key: "avatar_url", label: "Profilkép URL" },
  ],
  boats: [
    { key: "name", label: "Hajó neve" },
    { key: "type", label: "Típus" },
    { key: "harbor", label: "Kikötő" },
    { key: "max_crew_size", label: "Legénység maximális létszáma", type: "number" },
    { key: "team_type", label: "Csapat típusa" },
    { key: "image_url", label: "Hajókép URL" },
  ],
  listings: [
    { key: "title", label: "Cím" },
    { key: "location", label: "Helyszín" },
    { key: "date_text", label: "Dátum szöveg" },
    { key: "positions", label: "Keresett pozíciók (vesszővel elválasztva)", type: "array" },
    { key: "commitment", label: "Elköteleződés" },
    { key: "experience_level", label: "Tapasztalati szint" },
    { key: "start_date", label: "Kezdő dátum", type: "date" },
    { key: "end_date", label: "Záró dátum", type: "date" },
    { key: "captain_note", label: "Megjegyzés" },
    { key: "max_applicants", label: "Jelentkezők maximális száma", type: "number" },
    { key: "crew_needed", label: "Keresett létszám", type: "number" },
    { key: "is_active", label: "Aktív hirdetés", type: "boolean" },
  ],
  events: [
    { key: "title", label: "Esemény neve" },
    { key: "type", label: "Típus" },
    { key: "start_date", label: "Kezdő dátum", type: "date" },
    { key: "end_date", label: "Záró dátum", type: "date" },
    { key: "is_one_day", label: "Egynapos esemény", type: "boolean" },
    { key: "location", label: "Helyszín" },
    { key: "notes", label: "Megjegyzések" },
  ],
}

const columns: Record<Exclude<PlatformArea, "reports">, { key: string; label: string }[]> = {
  users: [
    { key: "full_name", label: "Név" },
    { key: "email", label: "Email" },
    { key: "admin_deleted_listings", label: "Admin által törölt hirdetések" },
    { key: "received_reports", label: "Hirdetéseire érkezett bejelentések" },
    { key: "invalid_reports_sent", label: "Érvénytelen bejelentései" },
  ],
  boats: [
    { key: "name", label: "Hajó" },
    { key: "type", label: "Típus" },
    { key: "harbor", label: "Kikötő" },
    { key: "created_at", label: "Létrehozva" },
  ],
  listings: [
    { key: "title", label: "Hirdetés" },
    { key: "creator_name", label: "Létrehozta" },
    { key: "location", label: "Helyszín" },
    { key: "start_date", label: "Kezdés" },
    { key: "report_count", label: "Bejelentések" },
  ],
  events: [
    { key: "title", label: "Esemény" },
    { key: "type", label: "Típus" },
    { key: "location", label: "Helyszín" },
    { key: "start_date", label: "Kezdés" },
  ],
}

type Counts = {
  total: number
  active: number
  reported: number
  deleted: number
  adminDeletedListingUsers?: number
  validReportsReceivedUsers?: number
  pendingReportsReceivedUsers?: number
  invalidReports?: number
}

export function AdminDashboard() {
  const [activeSection, setActiveSection] = useState<AdminSection>("statistics")
  const [activePlatformArea, setActivePlatformArea] = useState<PlatformArea>("users")
  const activeSectionLabel = sections.find((section) => section.id === activeSection)?.label

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/40">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8 lg:px-8 lg:py-8">
        <aside className="w-full shrink-0 lg:w-64">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adminisztráció
            </p>
            <nav aria-label="Adminisztrációs oldalak" className="flex gap-2 overflow-x-auto lg:flex-col">
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={activeSection === id ? "page" : undefined}
                  onClick={() => setActiveSection(id)}
                  className={`flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors lg:w-full ${
                    activeSection === id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="mb-6">
            <p className="text-sm font-medium text-muted-foreground">Adminisztráció</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{activeSectionLabel}</h1>
          </div>
          {activeSection === "statistics" ? (
            <StatisticsPlaceholder />
          ) : (
            <PlatformManagement
              activeArea={activePlatformArea}
              onAreaChange={setActivePlatformArea}
            />
          )}
        </section>
      </div>
    </main>
  )
}

function StatisticsPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-sm sm:p-12">
      <BarChart3 className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold text-foreground">A statisztikák előkészítés alatt</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        Itt jelennek majd meg az oldal felhasználóira, hajóira és hirdetéseire vonatkozó összesítések.
      </p>
    </div>
  )
}

function PlatformManagement({
  activeArea,
  onAreaChange,
}: {
  activeArea: PlatformArea
  onAreaChange: (area: PlatformArea) => void
}) {
  const [status, setStatus] = useState<ListStatus>(activeArea === "reports" || activeArea === "users" ? "all" : "active")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState(activeArea === "listings" ? "report_count" : activeArea === "users" ? "full_name" : "created_at")
  const [deletionReason, setDeletionReason] = useState("all")
  const [direction, setDirection] = useState<"asc" | "desc">("desc")
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminRow[]>([])
  const [counts, setCounts] = useState<Counts>({ total: 0, active: 0, reported: 0, deleted: 0 })
  const [matchCount, setMatchCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedRow, setSelectedRow] = useState<AdminRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState<AdminRow | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        category: activeArea,
        status,
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        sort,
        direction,
        deletionReason,
      })
      const response = await fetch(`/api/admin/platform?${params}`, { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Nem sikerült betölteni a listát.")
      setRows(payload.rows ?? [])
      setCounts(payload.counts ?? { total: 0, active: 0, reported: 0, deleted: 0 })
      setMatchCount(payload.matchCount ?? 0)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Nem sikerült betölteni a listát.")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [activeArea, deletionReason, direction, page, search, sort, status])

  useEffect(() => {
    void loadRows()
  }, [activeArea, loadRows])

  function changeCategory(area: PlatformArea) {
    setNotice(null)
    setError(null)
    setSearchInput("")
    setSearch("")
    setSort(area === "listings" ? "report_count" : area === "users" ? "full_name" : "created_at")
    setStatus(area === "users" || area === "reports" ? "all" : "active")
    setDeletionReason("all")
    setPage(1)
    onAreaChange(area)
  }

  async function mutate(body: Record<string, unknown>, successMessage: string) {
    setError(null)
    setNotice(null)
    const response = await fetch("/api/admin/platform", {
      method: body.fields ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error ?? "A művelet nem sikerült.")
    setNotice(successMessage)
    await loadRows()
    return payload
  }

  async function handleDelete() {
    if (!deleteConfirmation) return
    try {
      setDeletePending(true)
      await mutate(
        { category: activeArea, id: deleteConfirmation.id, action: "delete" },
        "Az elem törölve lett.",
      )
      setDeleteConfirmation(null)
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "A törlés nem sikerült.")
    } finally {
      setDeletePending(false)
    }
  }

  async function handleUserRestore(row: AdminRow) {
    try {
      await mutate(
        { category: "users", id: row.id, action: "restore" },
        "A felhasználó és a törléskor vele együtt törölt adatai vissza lettek állítva.",
      )
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "A felhasználó visszaállítása nem sikerült.")
    }
  }

  async function handleSave(fields: Record<string, unknown>) {
    if (!selectedRow) return
    setSaving(true)
    try {
      await mutate(
        { category: activeArea, id: selectedRow.id, fields },
        "A módosítások elmentve.",
      )
      setSelectedRow(null)
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "A mentés nem sikerült.")
    } finally {
      setSaving(false)
    }
  }

  async function handleReportEvaluation(reportId: string, evaluationStatus: "valid" | "invalid") {
    await mutate(
      { category: "reports", id: reportId, action: "evaluate", evaluationStatus },
      evaluationStatus === "valid"
        ? "A bejelentés jóváhagyva, a hirdetés és az összes hozzá tartozó bejelentés törölve."
        : "A bejelentés elutasítva és törölve.",
    )
    if (evaluationStatus === "valid") {
      setSelectedRow(null)
      return
    }
    setSelectedRow((current) => {
      if (!current || !Array.isArray(current.report_details)) return current
      return {
        ...current,
        report_details: (current.report_details as Array<Record<string, unknown>>).filter(
          (report) => report.id !== reportId,
        ),
      }
    })
  }

  const categoryLabel = platformAreas.find((area) => area.id === activeArea)?.label ?? ""
  const sortOptions = activeArea === "reports"
    ? reportColumns.map(({ key, label }) => ({ key, label }))
    : activeArea === "users"
      ? [
          { key: "full_name", label: "Név" },
          { key: "email", label: "Email" },
          { key: "admin_deleted_listings", label: "Admin által törölt hirdetések" },
          { key: "received_reports", label: "Hirdetéseire érkezett bejelentések" },
          { key: "invalid_reports_sent", label: "Érvénytelen bejelentései" },
        ]
    : activeArea === "listings"
      ? [
          { key: "title", label: "Hirdetés neve" },
          { key: "creator_name", label: "Létrehozó" },
          { key: "start_date", label: "Kezdés" },
          { key: "report_count", label: "Bejelentések száma" },
        ]
    : [
        { key: "created_at", label: "Létrehozva" },
        ...columns[activeArea].filter(({ key }) => key !== "created_at"),
      ]

  return (
    <div className="space-y-5">
      <nav aria-label="Kezelendő adatok" className="flex flex-wrap gap-2">
        {platformAreas.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeArea === id}
            onClick={() => changeCategory(id)}
            className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${
              activeArea === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      <>
          {activeArea === "users" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Felhasználók szűrése">
              {([
                ["all", "Összes felhasználó", counts.total],
                ["active", "Aktív", counts.active],
                ["reported", "Jelentett", counts.reported],
                ["deleted", "Törölt", counts.deleted],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => {
                    setStatus(value)
                    setPage(1)
                  }}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition-colors ${
                    status === value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:bg-muted/60"
                  }`}
                >
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="mt-1 block text-2xl font-semibold tracking-tight text-foreground">
                    {count.toLocaleString("hu-HU")}
                  </span>
                </button>
              ))}
            </div>
          ) : activeArea === "reports" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Bejelentések szűrése">
              {([
                ["all", "Összes", counts.total],
                ["active", "Aktív", counts.active],
                ["deleted", "Törölt", counts.deleted],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => {
                    setStatus(value)
                    setPage(1)
                  }}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition-colors ${
                    status === value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:bg-muted/60"
                  }`}
                >
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="mt-1 block text-2xl font-semibold tracking-tight text-foreground">
                    {count.toLocaleString("hu-HU")}
                  </span>
                </button>
              ))}
            </div>
          ) : activeArea === "listings" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Hirdetések szűrése">
              {([
                ["all", "Összes", counts.total],
                ["active", "Aktív", counts.active],
                ["reported", "Jelentett", counts.reported],
                ["deleted", "Törölt", counts.deleted],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => {
                    setStatus(value)
                    setPage(1)
                  }}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition-colors ${
                    status === value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:bg-muted/60"
                  }`}
                >
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="mt-1 block text-2xl font-semibold tracking-tight text-foreground">
                    {count.toLocaleString("hu-HU")}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {([
                ["all", "Összes", counts.total],
                ["active", "Aktív", counts.active],
                ["deleted", "Törölt", counts.deleted],
              ] as const).map(([value, label, count]) => {
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={status === value}
                    onClick={() => {
                      setStatus(value)
                      setPage(1)
                    }}
                    className={`rounded-2xl border p-4 text-left shadow-sm transition-colors ${
                      status === value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted/60"
                    }`}
                  >
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="mt-1 block text-2xl font-semibold tracking-tight text-foreground">
                      {count.toLocaleString("hu-HU")}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm xl:flex-row xl:items-end">
            <div className="min-w-0 flex-1 xl:w-80 xl:flex-none">
              <Label htmlFor="admin-search">Keresés</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="admin-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={`${categoryLabel} keresése...`}
                  className="pl-9"
                />
              </div>
            </div>
            <div className={`grid items-end gap-3 ${
              activeArea === "reports" ? "sm:grid-cols-3" : "sm:grid-cols-2"
            } xl:w-auto`}>
              <label className="text-sm font-medium">
                Rendezés
                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value)
                    setPage(1)
                  }}
                  className="mt-1.5 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {sortOptions.map(({ key, label }) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDirection((value) => value === "desc" ? "asc" : "desc")
                  setPage(1)
                }}
                aria-label={`Rendezési irány: ${direction === "desc" ? "csökkenő" : "növekvő"}. Kattints az irány megfordításához.`}
                title={direction === "desc" ? "Csökkenő sorrend; kattints a növekvőhöz" : "Növekvő sorrend; kattints a csökkenőhöz"}
                className="h-9 w-full self-end"
              >
                {direction === "desc" ? "↓ Csökkenő" : "↑ Növekvő"}
              </Button>
              {activeArea === "reports" ? (
                <label className="text-sm font-medium">
                  Hirdetés törlésének oka
                  <select
                    value={deletionReason}
                    onChange={(event) => {
                      setDeletionReason(event.target.value)
                      setPage(1)
                    }}
                    className="mt-1.5 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="all">Mindegyik</option>
                    <option value="expired">Lejárt</option>
                    <option value="admin">Admin törölte</option>
                    <option value="owner">Felhasználó törölte</option>
                    <option value="not_deleted">Nincs törölve</option>
                    <option value="unknown">Ismeretlen ok</option>
                  </select>
                </label>
              ) : null}
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-foreground">{notice}</p>}

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {(activeArea === "reports" ? reportColumns : columns[activeArea]).map(({ key, label }) => (
                        <th key={key} scope="col" className={`px-4 py-3 font-semibold ${
                          activeArea === "listings" && key === "report_count"
                          || activeArea === "users" && ["admin_deleted_listings", "received_reports", "invalid_reports_sent"].includes(key)
                            ? "text-center"
                            : ""
                        }`}>{label}</th>
                      ))}
                      {activeArea !== "reports" && <th scope="col" className="px-4 py-3 text-right font-semibold">Művelet</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr><td colSpan={(activeArea === "reports" ? reportColumns.length : columns[activeArea].length) + (activeArea === "reports" ? 0 : 1)} className="px-4 py-12 text-center text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Betöltés...</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={(activeArea === "reports" ? reportColumns.length : columns[activeArea].length) + (activeArea === "reports" ? 0 : 1)} className="px-4 py-12 text-center text-muted-foreground">{error ? "Az adatok nem tölthetők be." : "Nincs megjeleníthető elem."}</td></tr>
                    ) : rows.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/40">
                        {(activeArea === "reports" ? reportColumns : columns[activeArea]).map(({ key }) => (
                          <td
                            key={key}
                            className={`max-w-64 px-4 py-3 ${key === "extra_text" ? "whitespace-pre-wrap break-words" : "truncate"} ${
                              activeArea === "listings" && key === "report_count"
                              || activeArea === "users" && ["admin_deleted_listings", "received_reports", "invalid_reports_sent"].includes(key)
                                ? "text-center tabular-nums"
                                : ""
                            }`}
                          >
                            {key === "report_type"
                              ? formatReportType(row[key])
                              : key === "evaluation_status"
                              ? formatReportEvaluation(row[key])
                              : key === "is_deleted"
                              ? row[key] ? "Törölt" : "Aktív"
                              : key === "listing_deletion_reason"
                              ? formatDeletionReason(row[key])
                              : key === "received_reports"
                              ? formatValue(Number(row.valid_reports_received ?? 0) + Number(row.pending_reports_received ?? 0))
                              : key === "positions" && Array.isArray(row[key])
                              ? row[key].join(", ")
                              : formatValue(row[key])}
                          </td>
                        ))}
                        {activeArea !== "reports" ? <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {activeArea === "users" && Boolean(row.is_deleted) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void handleUserRestore(row)}
                              >
                                <RotateCcw className="size-4" aria-hidden="true" />
                                <span>Visszaállítás</span>
                              </Button>
                            )}
                            {status !== "deleted" && !row.is_deleted && (
                              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedRow(row)}>
                                Adatok
                              </Button>
                            )}
                            {status !== "deleted" && !row.is_deleted && (
                              <Button type="button" variant="destructive" size="icon-sm" title="Soft törlés" onClick={() => setDeleteConfirmation(row)}>
                                <Trash2 className="size-4" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                <span>{matchCount} találat</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon-sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} aria-label="Előző oldal">
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span>{page} / {Math.max(1, Math.ceil(matchCount / PAGE_SIZE))}</span>
                  <Button type="button" variant="outline" size="icon-sm" disabled={page >= Math.ceil(matchCount / PAGE_SIZE) || loading} onClick={() => setPage((value) => value + 1)} aria-label="Következő oldal">
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
        </>

      <Dialog
        open={deleteConfirmation !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleteConfirmation(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elem törlése</DialogTitle>
            <DialogDescription>
              {activeArea === "users"
                ? "Biztosan törlöd ezt a felhasználót? A törléskor vele együtt törölt hajókat, hirdetéseket és eseményeket később a felhasználó visszaállításával lehet visszaállítani."
                : "Biztosan törlöd ezt az elemet? A művelet nem vonható vissza."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deletePending}
              onClick={() => setDeleteConfirmation(null)}
            >
              Mégse
            </Button>
            <Button type="button" variant="destructive" disabled={deletePending} onClick={() => void handleDelete()}>
              {deletePending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
              Törlés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedRow && activeArea !== "reports" && (
        <EditDialog
          category={activeArea}
          row={selectedRow}
          saving={saving}
          onClose={() => setSelectedRow(null)}
          onSave={handleSave}
          onEvaluateReport={handleReportEvaluation}
        />
      )}
    </div>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Igen" : "Nem"
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("hu-HU")
  }
  return Array.isArray(value) ? value.join(", ") : String(value)
}

function formatReportType(value: unknown): string {
  if (typeof value !== "string") return "Egyéb"
  const labels: Record<string, string> = {
    boat_report: "Hajó jelentése",
    user_report: "Felhasználó jelentése",
    tragar: "Trágár vagy sértő tartalom",
    spam: "Spam vagy reklám",
    csalas: "Csalás vagy megtévesztő hirdetés",
    valotlan: "Valótlan információ",
    egyeb: "Egyéb",
  }
  return labels[value] ?? value
}

function formatReportEvaluation(value: unknown): string {
  if (value === "valid") return "Jogos"
  if (value === "invalid") return "Nem megalapozott"
  return "Értékelésre vár"
}

function formatDeletionReason(value: unknown): string {
  if (value === "expired") return "Lejárt"
  if (value === "admin") return "Admin törölte"
  if (value === "owner") return "Felhasználó törölte"
  if (value === "not_deleted") return "Nincs törölve"
  if (value === "unknown") return "Ismeretlen ok"
  return "—"
}

function EditDialog({
  category,
  row,
  saving,
  onClose,
  onSave,
  onEvaluateReport,
}: {
  category: Exclude<PlatformArea, "reports">
  row: AdminRow
  saving: boolean
  onClose: () => void
  onSave: (fields: Record<string, unknown>) => Promise<void>
  onEvaluateReport: (reportId: string, evaluationStatus: "valid" | "invalid") => Promise<void>
}) {
  const fields = categoryFields[category]
  const reportDetails = category === "listings" && Array.isArray(row.report_details)
    ? row.report_details as Array<Record<string, unknown>>
    : []
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.map(({ key, type }) => {
      const value = row[key]
      if (type === "boolean") return [key, Boolean(value)]
      if (Array.isArray(value)) return [key, value.join(", ")]
      return [key, value === null || value === undefined ? "" : String(value)]
    })),
  )
  const [evaluatingReport, setEvaluatingReport] = useState<{
    id: string
    status: "valid" | "invalid"
  } | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)

  function updateValue(key: string, value: string | boolean) {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  async function evaluateReport(reportId: string, evaluationStatus: "valid" | "invalid") {
    setEvaluatingReport({ id: reportId, status: evaluationStatus })
    setReviewError(null)
    try {
      await onEvaluateReport(reportId, evaluationStatus)
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "A bejelentés értékelése nem sikerült.")
    } finally {
      setEvaluatingReport(null)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const updates: Record<string, unknown> = {}
    for (const field of fields) {
      const value = values[field.key]
      if (field.key === "email") continue
      if (field.type === "number") updates[field.key] = value === "" ? null : Number(value)
      else if (field.type === "boolean") updates[field.key] = Boolean(value)
      else if (field.type === "array") updates[field.key] = String(value).split(",").map((part) => part.trim()).filter(Boolean)
      else updates[field.key] = value === "" ? null : value
    }
    await onSave(updates)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-edit-title"
        className={`my-auto max-h-[90vh] w-full ${reportDetails.length > 0 ? "max-w-6xl" : "max-w-2xl"} overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-7`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="admin-edit-title" className="text-xl font-semibold">Adatok megtekintése és szerkesztése</h2>
            <p className="mt-1 text-sm text-muted-foreground">Azonosító: {row.id}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Bezárás">
            <X className="size-4" />
          </Button>
        </div>
        <div className={`mt-6 grid gap-6 ${reportDetails.length > 0 ? "lg:grid-cols-2" : ""}`}>
        <form className="min-w-0 space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(({ key, label, type }) => (
              <div key={key} className={type === "boolean" ? "flex items-center gap-3" : ""}>
                {type === "boolean" ? (
                  <>
                    <input
                      id={`admin-field-${key}`}
                      type="checkbox"
                      checked={Boolean(values[key])}
                      onChange={(event) => updateValue(key, event.target.checked)}
                      className="size-4 accent-primary"
                    />
                    <Label htmlFor={`admin-field-${key}`}>{label}</Label>
                  </>
                ) : (
                  <>
                    <Label htmlFor={`admin-field-${key}`}>{label}</Label>
                    {type === "array" || key === "notes" || key.endsWith("_note") ? (
                      <textarea
                        id={`admin-field-${key}`}
                        value={String(values[key] ?? "")}
                        onChange={(event) => updateValue(key, event.target.value)}
                        rows={3}
                        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    ) : (
                      <Input
                        id={`admin-field-${key}`}
                        type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                        value={String(values[key] ?? "")}
                        disabled={key === "email"}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => updateValue(key, event.target.value)}
                        className="mt-1.5"
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          {category === "users" && typeof row.email === "string" && (
            <p className="text-xs text-muted-foreground">Az email-cím a Supabase Authból származik, itt nem módosítható.</p>
          )}
          <details className="rounded-xl border border-border px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Teljes rekord megtekintése</summary>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries(row).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{key}</dt>
                  <dd className="break-words">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Mégse</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              Mentés
            </Button>
          </div>
        </form>
        {reportDetails.length > 0 ? (
          <section aria-labelledby="admin-listing-reports-title" className="min-w-0 space-y-3 lg:border-l lg:border-border lg:pl-6">
            <div>
              <h3 id="admin-listing-reports-title" className="text-lg font-semibold">Hirdetés bejelentései</h3>
              <p className="mt-1 text-sm text-muted-foreground">{reportDetails.length} bejelentés</p>
            </div>
            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {reportDetails.map((report, index) => (
                <article key={String(report.id ?? index)} className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    <p className="min-w-0">
                      <span className="text-muted-foreground">Bejelentő: </span>
                      <span className="font-medium text-foreground">{formatValue(report.reporter_name)}</span>
                    </p>
                    <p className="min-w-0">
                      <span className="text-muted-foreground">Oka: </span>
                      <span className="text-foreground">{formatReportType(report.report_type)}</span>
                    </p>
                    <p className="min-w-0">
                      <span className="text-muted-foreground">Értékelés: </span>
                      <span className="font-medium text-foreground">{formatReportEvaluation(report.evaluation_status)}</span>
                    </p>
                  </div>
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Leírás</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{formatValue(report.extra_text)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={evaluatingReport?.id === report.id || report.evaluation_status === "valid"}
                      onClick={() => void evaluateReport(String(report.id), "valid")}
                    >
                      {evaluatingReport?.id === report.id && evaluatingReport?.status === "valid"
                        ? <LoaderCircle className="size-4 animate-spin" />
                        : null}
                      Jóváhagyás
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={evaluatingReport?.id === report.id || report.evaluation_status === "invalid"}
                      onClick={() => void evaluateReport(String(report.id), "invalid")}
                    >
                      {evaluatingReport?.id === report.id && evaluatingReport?.status === "invalid"
                        ? <LoaderCircle className="size-4 animate-spin" />
                        : null}
                      Elutasítás
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            {reviewError ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{reviewError}</p> : null}
          </section>
        ) : null}
        </div>
      </section>
    </div>
  )
}
