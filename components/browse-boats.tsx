"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import Image from "next/image"
import { Anchor, CalendarDays, MapPin, Users, Award, Sailboat, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { supabase } from "@/lib/supabase"
import type { Commitment, Level } from "@/lib/mock-data"
import { isAdVisibleByDate } from "@/lib/ad-visibility"

type ListingPost = "kormanyos" | "taktikus" | "main-trim" | "jib-trim" | "mast" | "fordeck" | "barmilyen"

type ListingRow = {
  id: string
  boatName: string
  image: string
  commitment: Commitment
  event: string
  location: string
  date: string
  roles: ListingPost[]
  level: Level
  applied: boolean
  applicationId: string | null
  applicationCount: number
  captainName: string
  captainAvatar: string | null
  captainNote: string | null
}

const commitmentLabels: Record<Commitment, string> = {
  "egy-verseny": "Csak egy verseny",
  szezon: "Szezonra",
}

const roleLabels: Record<ListingPost, string> = {
  kormanyos: "Kormányos",
  taktikus: "Taktikus",
  "main-trim": "Main Trim",
  "jib-trim": "Jib trim",
  mast: "Mast",
  fordeck: "Fordeck",
  barmilyen: "Bármilyen",
}

const levelLabels: Record<Level, string> = {
  kezdo: "Kezdő",
  halado: "Haladó",
  profi: "Profi / Versenyző",
}

const ALL = "osszes"

const commitmentFilterLabels: Record<string, string> = {
  [ALL]: "Összes",
  "egy-verseny": "Csak egy verseny",
  szezon: "Hosszútávú / Szezoncsapat",
}

const postFilterLabels: Record<string, string> = {
  [ALL]: "Összes",
  kormanyos: "Kormányos",
  taktikus: "Taktikus",
  "main-trim": "Main Trim",
  "jib-trim": "Jib trim",
  mast: "Mast",
  fordeck: "Fordeck",
}

const levelFilterLabels: Record<string, string> = {
  [ALL]: "Mindegy",
  ...levelLabels,
}

function normalizePost(positionRaw: unknown): ListingPost {
  const normalized = String(positionRaw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  if (normalized === "kormanyos") return "kormanyos"
  if (normalized === "taktikus") return "taktikus"
  if (normalized === "main-trim" || normalized === "main trim") return "main-trim"
  if (normalized === "jib-trim" || normalized === "jib trim") return "jib-trim"
  if (normalized === "mast") return "mast"
  if (normalized === "fordeck" || normalized === "foredeck") return "fordeck"
  if (normalized === "barmilyen" || normalized === "mindegy" || normalized === "egyeb") return "barmilyen"
  return "barmilyen"
}

export function BrowseBoats() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const initialPosts = (searchParams.get("post") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is ListingPost => value in roleLabels)

  const [commitment, setCommitmentState] = useState<string>(() => searchParams.get("commitment") ?? ALL)
  const [posts, setPostsState] = useState<ListingPost[]>(() => Array.from(new Set(initialPosts)))
  const [level, setLevelState] = useState<string>(() => searchParams.get("level") ?? ALL)
  const [postDropdownOpen, setPostDropdownOpen] = useState(false)
  const postDropdownRef = useRef<HTMLDivElement | null>(null)

  function setCommitment(v: string) {
    setCommitmentState(v)
    updateUrl({ commitment: v, posts, level })
  }

  function togglePost(v: ListingPost) {
    const nextPosts = posts.includes(v)
      ? posts.filter((item) => item !== v)
      : [...posts, v]

    setPostsState(nextPosts)
    updateUrl({ commitment, posts: nextPosts, level })
  }

  function setLevel(v: string) {
    setLevelState(v)
    updateUrl({ commitment, posts, level: v })
  }

  function updateUrl(filters: { commitment: string; posts: ListingPost[]; level: string }) {
    const params = new URLSearchParams()
    if (filters.commitment !== ALL) params.set("commitment", filters.commitment)
    if (filters.posts.length > 0) params.set("post", filters.posts.join(","))
    if (filters.level !== ALL) params.set("level", filters.level)
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : ".", { scroll: false })
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!postDropdownRef.current?.contains(event.target as Node)) {
        setPostDropdownOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPostDropdownOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [])
  const [listingsData, setListingsData] = useState<ListingRow[]>([])
  const [authOpen, setAuthOpen] = useState(false)
  const [selectedBoat, setSelectedBoat] = useState<string | undefined>(undefined)
  const [user, setUser] = useState<User | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingAds, setLoadingAds] = useState(true)
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null)

  function handleApply(listing: ListingRow) {
    if (!user) {
      setSelectedBoat(listing.boatName)
      setAuthOpen(true)
      return
    }

    if (listing.applied) {
      return
    }

    void submitApplication(listing.id)
  }

  async function cancelApplication(adId: string, applicationId: string) {
    setApplyError(null)
    setActionNotice(null)
    setCancelingId(adId)

    try {
      const { error } = await supabase
        .from("applications")
        .delete()
        .eq("id", applicationId)

      if (error) {
        console.error("Jelentkezés visszavonási hiba:", error)
        setApplyError(error.message)
        return
      }

      setListingsData((prev) =>
        prev.map((listing) =>
          listing.id === adId
            ? { ...listing, applied: false, applicationId: null, applicationCount: Math.max(0, listing.applicationCount - 1) }
            : listing,
        ),
      )
      setActionNotice("Jelentkezés sikeresen visszavonva.")
    } finally {
      setCancelingId(null)
    }
  }

  async function submitApplication(adId: string) {
    setApplyError(null)
    setActionNotice(null)
    setApplyingId(adId)

    try {
      const { error } = await supabase.from("applications").insert([
        {
          ad_id: adId,
          user_id: user?.id,
        },
      ])

      if (error) {
        console.error("Jelentkezési hiba:", error)
        setApplyError(error.message)
        return
      }

      setListingsData((prev) =>
        prev.map((listing) =>
          listing.id === adId
            ? { ...listing, applied: true, applicationCount: listing.applicationCount + 1 }
            : listing,
        ),
      )
      setActionNotice("Sikeres jelentkezés.")
    } finally {
      setApplyingId(null)
    }
  }

  useEffect(() => {
    async function fetchUser() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      setUser(currentUser)
    }

    fetchUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function fetchAds() {
      setLoadingAds(true)
      setLoadError(null)
      const adsBaseSelect = "id, user_id, title, date_text, location, positions, commitment, experience_level, start_date, end_date, boat:boats(id, name, image_url), applications(id, user_id)"

      let data: any[] | null = null
      const { data: adsWithNote, error: adsWithNoteError } = await supabase
        .from("ads")
        .select(`${adsBaseSelect}, captain_note`)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (adsWithNoteError) {
        const noteColumnMissing = String(adsWithNoteError.code ?? "") === "42703" || /captain_note/i.test(adsWithNoteError.message ?? "")

        if (!noteColumnMissing) {
          console.error("Hirdetések lekérdezési hiba:", adsWithNoteError)
          setLoadError("A hirdetések betöltése nem sikerült. Próbáld újra később.")
          setLoadingAds(false)
          return
        }

        const { data: adsWithoutNote, error: adsWithoutNoteError } = await supabase
          .from("ads")
          .select(adsBaseSelect)
          .eq("is_active", true)
          .order("created_at", { ascending: false })

        if (adsWithoutNoteError) {
          console.error("Hirdetések lekérdezési hiba:", adsWithoutNoteError)
          setLoadError("A hirdetések betöltése nem sikerült. Próbáld újra később.")
          setLoadingAds(false)
          return
        }

        data = adsWithoutNote ?? []
      } else {
        data = adsWithNote ?? []
      }

      const userIds = Array.from(new Set((data ?? []).map((ad: any) => ad.user_id).filter(Boolean)))
      const usersById = new Map<string, { full_name?: string; avatar_url?: string | null }>()

      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from("users")
          .select("id, full_name, avatar_url")
          .in("id", userIds)

        if (usersError) {
          console.error("Kapitány adatok lekérdezési hiba:", usersError)
        } else {
          ;(usersData ?? []).forEach((row: any) => {
            if (row?.id) {
              usersById.set(row.id, row)
            }
          })
        }
      }

      const appliedAdIdMap = new Map<string, string>()
      if (user) {
        const { data: applications, error: applicationsError } = await supabase
          .from("applications")
          .select("id, ad_id")
          .eq("user_id", user.id)

        if (applicationsError) {
          console.error("Felhasználói jelentkezések lekérdezési hiba:", applicationsError)
        } else {
          applications?.forEach((application: any) => {
            appliedAdIdMap.set(application.ad_id, application.id)
          })
        }
      }

      const visibleAds = (data ?? []).filter((ad: any) => isAdVisibleByDate(ad))

      const mapped: ListingRow[] = visibleAds.map((ad: any) => {
        const rawPositions = Array.isArray(ad.positions) ? ad.positions : []
        const roles = Array.from(new Set(rawPositions.map((position: unknown) => normalizePost(position)))) as ListingPost[]
        const normalizedRoles: ListingPost[] = roles.length > 0 ? roles : ["barmilyen"]
        const captainData = usersById.get(ad.user_id)

        return {
          id: ad.id,
          boatName: ad.boat?.name ?? "Névtelen hajó",
          image: ad.boat?.image_url ?? "/placeholder.svg",
          commitment: (ad.commitment === "szezon" ? "szezon" : "egy-verseny") as Commitment,
          event: ad.title ?? "",
          location: ad.location ?? "",
          date: ad.date_text ?? "",
          roles: normalizedRoles,
          level: (ad.experience_level ?? "halado") as Level,
          applied: appliedAdIdMap.has(ad.id),
          applicationId: appliedAdIdMap.get(ad.id) ?? null,
          applicationCount: ad.applications?.length ?? 0,
          captainName: captainData?.full_name?.trim() || "Ismeretlen kapitány",
          captainAvatar: captainData?.avatar_url ?? null,
          captainNote: typeof ad.captain_note === "string" && ad.captain_note.trim() ? ad.captain_note.trim() : null,
        }
      })

      setListingsData(mapped)
      setOpenDetailsId((prev) => (prev && mapped.some((listing) => listing.id === prev) ? prev : null))
      setLoadingAds(false)
    }

    void fetchAds()
  }, [user])

  const filtered = useMemo(() => {
    return listingsData.filter((l) => {
      if (commitment !== ALL && l.commitment !== commitment) return false
      if (posts.length > 0 && !l.roles.some((role) => posts.includes(role))) return false
      if (level !== ALL && l.level !== level) return false
      return true
    })
  }, [commitment, posts, level, listingsData])

  const selectedPostsLabel = useMemo(() => {
    if (posts.length === 0) return postFilterLabels[ALL]
    if (posts.length === 1) return roleLabels[posts[0]]
    return `${posts.length} kiválasztva`
  }, [posts])

  const filterTriggerClass = "h-8 w-full sm:w-56"

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Szabad helyek a fedélzeten
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          Böngéssz a hajók szabad helyei között, szűrj elköteleződés, szerepkör és tapasztalat szerint, majd jelentkezz
          egyetlen kattintással.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <FilterField label="Elköteleződés típusa">
          <Select value={commitment} onValueChange={(v) => setCommitment(v as string)}>
            <SelectTrigger className={filterTriggerClass}>
              <SelectValue>{(v: string) => commitmentFilterLabels[v] ?? "Összes"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Összes</SelectItem>
              <SelectItem value="egy-verseny">Csak egy verseny</SelectItem>
              <SelectItem value="szezon">Hosszútávú / Szezoncsapat</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Keresett pozíció">
          <div className="relative" ref={postDropdownRef}>
            <button
              type="button"
              onClick={() => setPostDropdownOpen((prev) => !prev)}
              className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-56"
              aria-haspopup="listbox"
              aria-expanded={postDropdownOpen}
            >
              <span className="block flex-1 truncate text-left">{selectedPostsLabel}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${postDropdownOpen ? "rotate-180" : "rotate-0"}`}
                aria-hidden="true"
              />
            </button>

            {postDropdownOpen ? (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-md sm:w-56">
                <button
                  type="button"
                  onClick={() => {
                    setPostsState([])
                    updateUrl({ commitment, posts: [], level })
                  }}
                  className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent/10"
                >
                  <span>Összes</span>
                  {posts.length === 0 ? <span className="text-accent">✓</span> : null}
                </button>

                {(Object.keys(roleLabels) as ListingPost[])
                  .filter((value) => value !== "barmilyen")
                  .map((value) => {
                    const selected = posts.includes(value)
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => togglePost(value)}
                        className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent/10"
                        role="option"
                        aria-selected={selected}
                      >
                        <span>{roleLabels[value]}</span>
                        {selected ? <span className="text-accent">✓</span> : null}
                      </button>
                    )
                  })}
              </div>
            ) : null}
          </div>
        </FilterField>

        <FilterField label="Tapasztalati szint">
          <Select value={level} onValueChange={(v) => setLevel(v as string)}>
            <SelectTrigger className={filterTriggerClass}>
              <SelectValue>{(v: string) => levelFilterLabels[v] ?? "Mindegy"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mindegy</SelectItem>
              <SelectItem value="kezdo">Kezdő</SelectItem>
              <SelectItem value="halado">Haladó</SelectItem>
              <SelectItem value="profi">Profi / Versenyző</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <p className="text-sm text-muted-foreground sm:ml-auto sm:pb-2.5">
          {loadingAds ? "…" : `${filtered.length} szabad hely`}
        </p>
      </div>

      {loadError ? (
        <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      {actionNotice ? (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground">
          {actionNotice}
        </div>
      ) : null}

      {loadingAds ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
              <Skeleton className="aspect-[4/3] w-full rounded-none" />
              <div className="flex flex-col gap-3 p-5">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-11 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((listing) => (
            <BoatCard
              key={listing.id}
              listing={listing}
              onApply={handleApply}
              applyingId={applyingId}
              onCancel={cancelApplication}
              cancelingId={cancelingId}
              detailsOpen={openDetailsId === listing.id}
              onToggleDetails={() =>
                setOpenDetailsId((prev) => (prev === listing.id ? null : listing.id))
              }
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Sailboat className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 font-medium text-foreground">Nincs a szűrőknek megfelelő szabad hely</p>
          <p className="mt-1 text-sm text-muted-foreground">Próbálj lazítani a szűrési feltételeken.</p>
        </div>
      )}

      {applyError ? (
        <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {applyError}
        </div>
      ) : null}

      <AuthGateModal open={authOpen} onOpenChange={setAuthOpen} boatName={selectedBoat} />
    </section>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function BoatCard({
  listing,
  onApply,
  applyingId,
  onCancel,
  cancelingId,
  detailsOpen,
  onToggleDetails,
}: {
  listing: ListingRow
  onApply: (listing: ListingRow) => void
  applyingId: string | null
  onCancel: (adId: string, applicationId: string) => void
  cancelingId: string | null
  detailsOpen: boolean
  onToggleDetails: () => void
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-accent">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={listing.image || "/placeholder.svg"}
          alt={`${listing.boatName} vitorlás hajó a vízen`}
          fill
          loading="eager"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3">
          <Badge
            className={
              listing.commitment === "szezon"
                ? "border-transparent bg-accent text-accent-foreground"
                : "border-transparent bg-primary text-primary-foreground"
            }
          >
            {commitmentLabels[listing.commitment]}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl font-semibold tracking-tight text-card-foreground">{listing.boatName}</h3>

        <dl className="mt-4 flex flex-1 flex-col gap-3 text-sm">
          <DetailRow icon={Anchor} label="Esemény">
            {listing.event}
          </DetailRow>
          <DetailRow icon={MapPin} label="Helyszín">
            {listing.location}
          </DetailRow>
          <DetailRow icon={CalendarDays} label="Dátum">
            {listing.date}
          </DetailRow>
          <DetailRow icon={Users} label="Szükséges poszt">
            {listing.roles.map((role) => roleLabels[role]).join(", ")}
          </DetailRow>
          <DetailRow icon={Award} label="Elvárt tapasztalat">
            {levelLabels[listing.level]}
          </DetailRow>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {listing.applicationCount > 0 ? (
            <Badge className="bg-secondary text-secondary-foreground">
              {listing.applicationCount} jelentkezés
            </Badge>
          ) : null}
          {listing.applied ? (
            <Badge className="bg-accent text-accent-foreground">Már jelentkeztem</Badge>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onToggleDetails}
          className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent/80"
          aria-expanded={detailsOpen}
        >
          {detailsOpen ? "Részletek elrejtése" : "További részletek"}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${detailsOpen ? "rotate-180" : "rotate-0"}`}
            aria-hidden="true"
          />
        </button>

        {detailsOpen ? (
          <div className="mt-3 rounded-xl border border-border/70 bg-secondary/40 p-3">
            <div className="flex items-center gap-3">
              <span className="relative h-10 w-10 overflow-hidden rounded-full ring-1 ring-border">
                <Image
                  src={listing.captainAvatar || "/placeholder.svg"}
                  alt={`${listing.captainName} profilképe`}
                  fill
                  className="object-cover"
                  sizes="40px"
                />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Kapitány</p>
                <p className="text-sm font-semibold text-foreground">{listing.captainName}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Megjegyzés</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {listing.captainNote ?? "Nem adott meg külön megjegyzést."}
              </p>
            </div>
          </div>
        ) : null}

        {listing.applied && listing.applicationId ? (
          <Button
            size="lg"
            variant="outline"
            onClick={() => onCancel(listing.id, listing.applicationId!)}
            disabled={cancelingId === listing.id}
            className="mt-6 h-11 w-full text-base text-destructive! hover:bg-destructive/10! hover:text-destructive!"
          >
            {cancelingId === listing.id ? "Visszavonás..." : "Jelentkezés visszavonása"}
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={() => onApply(listing)}
            disabled={listing.applied || applyingId === listing.id}
            className="mt-6 h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90! disabled:cursor-not-allowed disabled:bg-muted"
          >
            {applyingId === listing.id ? "Jelentkezés..." : "Jelentkezem a hajóra"}
          </Button>
        )}
      </div>
    </article>
  )
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Anchor
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <div className="flex flex-col">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="text-card-foreground">{children}</dd>
      </div>
    </div>
  )
}
