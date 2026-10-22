"use client"

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react"
import {
  BarChart3,
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  LoaderCircle,
  Megaphone,
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

type AdminSection = "statistics" | "platform"
type PlatformArea = "users" | "boats" | "listings" | "events" | "reports"
type ListStatus = "active" | "deleted" | "reported"
type AdminRow = Record<string, unknown> & { id: string }
type FieldDefinition = { key: string; label: string; type?: "text" | "date" | "number" | "boolean" | "array" }

const PAGE_SIZE = 25

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
    { key: "role", label: "Szerep" },
    { key: "created_at", label: "Regisztráció" },
  ],
  boats: [
    { key: "name", label: "Hajó" },
    { key: "type", label: "Típus" },
    { key: "harbor", label: "Kikötő" },
    { key: "created_at", label: "Létrehozva" },
  ],
  listings: [
    { key: "title", label: "Hirdetés" },
    { key: "location", label: "Helyszín" },
    { key: "positions", label: "Pozíciók" },
    { key: "start_date", label: "Kezdés" },
  ],
  events: [
    { key: "title", label: "Esemény" },
    { key: "type", label: "Típus" },
    { key: "location", label: "Helyszín" },
    { key: "start_date", label: "Kezdés" },
  ],
}

type Counts = { total: number; active: number; reported: number; deleted: number }

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
  const [status, setStatus] = useState<ListStatus>("active")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("created_at")
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
  }, [activeArea, direction, page, search, sort, status])

  useEffect(() => {
    if (activeArea !== "reports") void loadRows()
    else {
      setRows([])
      setCounts({ total: 0, active: 0, reported: 0, deleted: 0 })
      setMatchCount(0)
    }
  }, [activeArea, loadRows])

  function changeCategory(area: PlatformArea) {
    setNotice(null)
    setError(null)
    setSearchInput("")
    setSearch("")
    setSort("created_at")
    setStatus("active")
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

  async function handleDelete(row: AdminRow) {
    if (!window.confirm(`Biztosan törlöd ezt az elemet? A törlés visszavonása nem érhető el innen.`)) return
    try {
      await mutate({ category: activeArea, id: row.id, action: "delete" }, "Az elem törölve lett.")
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "A törlés nem sikerült.")
    }
  }

  async function handleUserBan(row: AdminRow) {
    const isBanned = Boolean(row.is_banned)
    if (!isBanned && !window.confirm("Letiltod ezt a felhasználót? A tiltás a bejelentkezést is megakadályozza.")) return
    try {
      await mutate(
        { category: activeArea, id: row.id, action: isBanned ? "unban" : "ban" },
        isBanned ? "A felhasználó tiltása feloldva." : "A felhasználó letiltva.",
      )
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "A felhasználói művelet nem sikerült.")
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

  const categoryLabel = platformAreas.find((area) => area.id === activeArea)?.label ?? ""
  const sortOptions = activeArea === "reports"
    ? []
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

      {activeArea === "reports" ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-sm sm:p-12">
          <Flag className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">A bejelentések kezelése később készül el</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Még nincs bejelentési rendszer, ezért egyelőre nem áll rendelkezésre bejelentett elem.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CountCard label="Összes" value={counts.total} />
            <CountCard label="Aktív" value={counts.active} />
            <CountCard label="Jelentett" value={counts.reported} />
            <CountCard label="Törölt" value={counts.deleted} />
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm xl:flex-row xl:items-end">
            <div className="min-w-0 flex-1">
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
            <div className="grid gap-3 sm:grid-cols-3 xl:w-auto">
              <label className="text-sm font-medium">
                Szűrés
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as ListStatus)
                    setPage(1)
                  }}
                  className="mt-1.5 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="active">Aktív elemek</option>
                  <option value="deleted">Törölt elemek</option>
                  <option value="reported">Jelentett elemek</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Rendezés
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="mt-1.5 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {sortOptions.map(({ key, label }) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Irány
                <select
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as "asc" | "desc")}
                  className="mt-1.5 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="desc">Csökkenő</option>
                  <option value="asc">Növekvő</option>
                </select>
              </label>
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-foreground">{notice}</p>}

          {status === "reported" ? (
            <p className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              A bejelentési funkció még nincs bekötve, ezért nincs megjeleníthető bejelentés.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {columns[activeArea].map(({ key, label }) => (
                        <th key={key} scope="col" className="px-4 py-3 font-semibold">{label}</th>
                      ))}
                      {activeArea === "users" && <th scope="col" className="px-4 py-3 font-semibold">Állapot</th>}
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Művelet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr><td colSpan={columns[activeArea].length + 2} className="px-4 py-12 text-center text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Betöltés...</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={columns[activeArea].length + 2} className="px-4 py-12 text-center text-muted-foreground">{error ? "Az adatok nem tölthetők be." : "Nincs megjeleníthető elem."}</td></tr>
                    ) : rows.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/40">
                        {columns[activeArea].map(({ key }) => (
                          <td key={key} className="max-w-64 truncate px-4 py-3">
                            {key === "positions" && Array.isArray(row[key])
                              ? row[key].join(", ")
                              : formatValue(row[key])}
                          </td>
                        ))}
                        {activeArea === "users" && (
                          <td className="px-4 py-3">
                            {row.is_banned ? <span className="text-destructive">Letiltva</span> : "Aktív"}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {activeArea === "users" && status === "active" && (
                              <Button
                                type="button"
                                variant={row.is_banned ? "outline" : "destructive"}
                                size="sm"
                                title={row.is_banned ? "Tiltás feloldása" : "Felhasználó letiltása"}
                                onClick={() => void handleUserBan(row)}
                              >
                                <Ban className="size-4" aria-hidden="true" />
                                <span className="hidden sm:inline">{row.is_banned ? "Feloldás" : "Tiltás"}</span>
                              </Button>
                            )}
                            {status === "active" && (
                              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedRow(row)}>
                                Adatok
                              </Button>
                            )}
                            {status === "active" && (
                              <Button type="button" variant="destructive" size="icon-sm" title="Soft törlés" onClick={() => void handleDelete(row)}>
                                <Trash2 className="size-4" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </td>
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
          )}
        </>
      )}

      {selectedRow && activeArea !== "reports" && (
        <EditDialog
          category={activeArea}
          row={selectedRow}
          saving={saving}
          onClose={() => setSelectedRow(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value.toLocaleString("hu-HU")}</p>
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

function EditDialog({
  category,
  row,
  saving,
  onClose,
  onSave,
}: {
  category: Exclude<PlatformArea, "reports">
  row: AdminRow
  saving: boolean
  onClose: () => void
  onSave: (fields: Record<string, unknown>) => Promise<void>
}) {
  const fields = categoryFields[category]
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.map(({ key, type }) => {
      const value = row[key]
      if (type === "boolean") return [key, Boolean(value)]
      if (Array.isArray(value)) return [key, value.join(", ")]
      return [key, value === null || value === undefined ? "" : String(value)]
    })),
  )

  function updateValue(key: string, value: string | boolean) {
    setValues((previous) => ({ ...previous, [key]: value }))
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
      <section role="dialog" aria-modal="true" aria-labelledby="admin-edit-title" className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="admin-edit-title" className="text-xl font-semibold">Adatok megtekintése és szerkesztése</h2>
            <p className="mt-1 text-sm text-muted-foreground">Azonosító: {row.id}</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Bezárás">
            <X className="size-4" />
          </Button>
        </div>
        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
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
      </section>
    </div>
  )
}
