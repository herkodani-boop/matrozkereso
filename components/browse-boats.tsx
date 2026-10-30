"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import Image from "next/image"
import { Flag, CalendarDays, MapPin, Users, Award, Sailboat, ChevronDown, TriangleAlert, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { supabase } from "@/lib/supabase"
import { type Commitment, type Level } from "@/lib/mock-data"
import { isAdVisibleByDate } from "@/lib/ad-visibility"

type ListingPost = "kormanyos" | "taktikus" | "main-trim" | "jib-trim" | "mast" | "fordeck" | "barmilyen"

export type ListingRow = {
  id: string
  isOwnListing: boolean
  boatName: string
  image: string
  imageFocusX: number
  imageFocusY: number
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
  maxApplicants: number | null
  activeApplicationCount: number
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

const levelBadgeClasses: Record<Level, string> = {
  kezdo: "bg-emerald-100 text-emerald-800",
  halado: "bg-amber-100 text-amber-800",
  profi: "bg-brand-tint text-brand",
}

const ALL = "osszes"
const PAGE_SIZE = 24

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

type SortMode = "soon" | "newest"

const sortLabels: Record<SortMode, string> = {
  soon: "Legközelebbi esemény",
  newest: "Legújabb hirdetés",
}

// Server-side mirror of isAdVisibleByDate, so pages and the total count only include ads that can be shown.
function onlyVisibleByDate<T>(query: T): T {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  return (query as any).or(
    [
      `and(commitment.eq.egy-verseny,or(start_date.is.null,start_date.gte.${today}))`,
      `and(commitment.eq.szezon,or(end_date.is.null,end_date.gte.${today}))`,
      "commitment.is.null",
      "commitment.not.in.(egy-verseny,szezon)",
    ].join(","),
  ) as T
}

// Soonest first; ads without a start date and ties fall back to the newest listing.
function applySort<T>(query: T, sort: SortMode): T {
  const q: any = query
  return (
    sort === "soon"
      ? q.order("start_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })
      : q.order("created_at", { ascending: false })
  ) as T
}

const levelFilterLabels: Record<string, string> = {
  [ALL]: "Mindegy",
  ...levelLabels,
}

function toIlikeValue(term: string) {
  const escaped = term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/"/g, '\\"')
  return `"%${escaped}%"`
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
  const pathname = usePathname()

  const initialPosts = (searchParams.get("post") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is ListingPost => value in roleLabels)

  const [commitment, setCommitmentState] = useState<string>(() => searchParams.get("commitment") ?? ALL)
  const [posts, setPostsState] = useState<ListingPost[]>(() => Array.from(new Set(initialPosts)))
  const [level, setLevelState] = useState<string>(() => searchParams.get("level") ?? ALL)
  // Főoldali ?ad=<id> belépésnél a legújabb hirdetések vannak elöl, így a keresett tétel biztosan az első oldalon van.
  const [sort, setSortState] = useState<SortMode>(() =>
    searchParams.get("sort") === "newest" || searchParams.get("ad") ? "newest" : "soon",
  )
  const sortRef = useRef<SortMode>(sort)
  const [searchInput, setSearchInput] = useState<string>(() => searchParams.get("q") ?? "")
  const [search, setSearch] = useState<string>(() => searchParams.get("q") ?? "")
  const [postDropdownOpen, setPostDropdownOpen] = useState(false)
  const postDropdownRef = useRef<HTMLDivElement | null>(null)

  function setCommitment(v: string) {
    setCommitmentState(v)
    updateUrl({ commitment: v, posts, level, q: search })
  }

  function togglePost(v: ListingPost) {
    const nextPosts = posts.includes(v)
      ? posts.filter((item) => item !== v)
      : [...posts, v]

    setPostsState(nextPosts)
    updateUrl({ commitment, posts: nextPosts, level, q: search })
  }

  function setLevel(v: string) {
    setLevelState(v)
    updateUrl({ commitment, posts, level: v, q: search })
  }

  function setSort(v: SortMode) {
    sortRef.current = v
    setSortState(v)
    updateUrl({ commitment, posts, level, q: search })
  }

  function updateUrl(filters: { commitment: string; posts: ListingPost[]; level: string; q: string }) {
    const params = new URLSearchParams()
    if (filters.commitment !== ALL) params.set("commitment", filters.commitment)
    if (filters.posts.length > 0) params.set("post", filters.posts.join(","))
    if (filters.level !== ALL) params.set("level", filters.level)
    if (filters.q.trim()) params.set("q", filters.q.trim())
    if (sortRef.current !== "soon") params.set("sort", sortRef.current)
    const focusedAdId = new URLSearchParams(window.location.search).get("ad")
    if (focusedAdId) params.set("ad", focusedAdId)

    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput)
      updateUrl({ commitment, posts, level, q: searchInput })
    }, 300)

    return () => window.clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

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
  const [authReturnTo, setAuthReturnTo] = useState<string | undefined>(undefined)
  const [user, setUser] = useState<User | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingAds, setLoadingAds] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [nextPage, setNextPage] = useState(0)

  function canStartApplication(listing: ListingRow) {
    if (listing.isOwnListing) {
      setApplyError("A saját hirdetésedre nem jelentkezhetsz.")
      return false
    }

    if (!user) {
      setSelectedBoat(listing.boatName)
      setAuthReturnTo(`/bongeszes?ad=${encodeURIComponent(listing.id)}`)
      setAuthOpen(true)
      return false
    }

    if (listing.applied) {
      return false
    }

    return true
  }

  function handleApplySubmit(listing: ListingRow, applicationMessage?: string) {
    void submitApplication(listing.id, applicationMessage)
  }

  async function cancelApplication(adId: string, applicationId: string | null) {
    setApplyError(null)
    setActionNotice(null)
    setCancelingId(adId)

    try {
      let resolvedApplicationId = applicationId

      if (!resolvedApplicationId && user) {
        const { data: existingApplication, error: lookupError } = await supabase
          .from("applications")
          .select("id")
          .eq("ad_id", adId)
          .eq("user_id", user.id)
          .maybeSingle()

        if (lookupError) {
          console.error("Jelentkezés azonosító lekérdezési hiba:", lookupError)
          setApplyError(lookupError.message)
          return
        }

        resolvedApplicationId = existingApplication?.id ?? null
      }

      if (!resolvedApplicationId) {
        setApplyError("A jelentkezés nem található, kérlek frissítsd az oldalt és próbáld újra.")
        return
      }

      const { error } = await supabase
        .from("applications")
        .delete()
        .eq("id", resolvedApplicationId)

      if (error) {
        console.error("Jelentkezés visszavonási hiba:", error)
        setApplyError(error.message)
        return
      }

      setListingsData((prev) =>
        prev.map((listing) =>
          listing.id === adId
            ? { ...listing, applied: false, applicationId: null, applicationCount: Math.max(0, listing.applicationCount - 1), activeApplicationCount: Math.max(0, listing.activeApplicationCount - 1) }
            : listing,
        ),
      )
      setActionNotice("Jelentkezés sikeresen visszavonva.")
    } finally {
      setCancelingId(null)
    }
  }

  async function submitApplication(adId: string, applicationMessage?: string) {
    setApplyError(null)
    setActionNotice(null)
    setApplyingId(adId)

    const normalizedMessage = applicationMessage?.trim() ?? ""

    try {
      const { data: insertedApplication, error } = await supabase
        .from("applications")
        .insert([
          {
            ad_id: adId,
            user_id: user?.id,
            message: normalizedMessage.length > 0 ? normalizedMessage : null,
          },
        ])
        .select("id")
        .single()

      if (error) {
        console.error("Jelentkezési hiba:", error)
        setApplyError(error.message)
        return
      }

      setListingsData((prev) =>
        prev.map((listing) =>
          listing.id === adId
            ? {
                ...listing,
                applied: true,
                applicationId: insertedApplication?.id ?? listing.applicationId,
                applicationCount: listing.applicationCount + 1,
                activeApplicationCount: listing.activeApplicationCount + 1,
              }
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

  const loadAdsPage = useCallback(
    async (pageIndex: number, options: { append: boolean }) => {
      if (options.append) {
        setLoadingMore(true)
      } else {
        setLoadingAds(true)
      }
      setLoadError(null)

      const adsSelect = "id, user_id, title, date_text, location, positions, commitment, experience_level, start_date, end_date, boat:boats(id, name, image_url, original_image_url)"
      const from = pageIndex * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const trimmedSearch = search.trim()
      let matchingBoatIds: string[] = []

      if (trimmedSearch) {
        const { data: matchingBoats, error: boatSearchError } = await supabase
          .from("boats")
          .select("id")
          .ilike("name", `%${trimmedSearch}%`)

        if (boatSearchError) {
          console.error("Hajónév keresési hiba:", boatSearchError)
        } else {
          matchingBoatIds = (matchingBoats ?? []).map((boat: any) => String(boat.id))
        }
      }

      function applyFilters<T>(query: T): T {
        let next = onlyVisibleByDate((query as any).eq("is_active", true))

        if (commitment !== ALL) {
          next = next.eq("commitment", commitment)
        }

        if (level !== ALL) {
          next = next.eq("experience_level", level)
        }

        if (posts.length > 0) {
          next = next.overlaps("positions", posts)
        }

        if (trimmedSearch) {
          const ilikeValue = toIlikeValue(trimmedSearch)
          const orParts = [`title.ilike.${ilikeValue}`, `location.ilike.${ilikeValue}`, `captain_note.ilike.${ilikeValue}`]
          if (matchingBoatIds.length > 0) {
            orParts.push(`boat_id.in.(${matchingBoatIds.join(",")})`)
          }
          next = next.or(orParts.join(","))
        }

        return applySort(next, sort).range(from, to)
      }

      const { data: adsData, count: adsCount, error: adsError } = await applyFilters(
        supabase.from("ads").select(`${adsSelect}, captain_note, max_applicants, image_focus_x, image_focus_y`, { count: "exact" }),
      )

      if (adsError) {
        console.error("Hirdetések lekérdezési hiba:", adsError)
        setLoadError("A hirdetések betöltése nem sikerült. Próbáld újra később.")
        setLoadingAds(false)
        setLoadingMore(false)
        return
      }

      const data: any[] = adsData ?? []
      const count: number | null = adsCount ?? null

      const applicationCountsByAdId = new Map<string, { applicationCount: number; activeApplicationCount: number }>()
      const adIds = (data ?? []).map((ad: any) => String(ad.id))
      if (adIds.length > 0) {
        const { data: applicationCounts, error: applicationCountsError } = await supabase
          .from("public_application_counts")
          .select("ad_id, application_count, active_application_count")
          .in("ad_id", adIds)

        if (applicationCountsError) {
          console.error("Jelentkezési darabszámok lekérdezési hiba:", applicationCountsError)
          setLoadError("A hirdetések jelentkezési adatait nem sikerült betölteni. Próbáld újra később.")
          setLoadingAds(false)
          setLoadingMore(false)
          return
        }

        ;(applicationCounts ?? []).forEach((row) => {
          applicationCountsByAdId.set(String(row.ad_id), {
            applicationCount: row.application_count,
            activeApplicationCount: row.active_application_count,
          })
        })
      }

      const userIds = Array.from(new Set((data ?? []).map((ad: any) => ad.user_id).filter(Boolean)))
      const usersById = new Map<string, { full_name?: string; avatar_url?: string | null }>()

      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from("public_profiles")
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
        const applicationCounts = applicationCountsByAdId.get(String(ad.id))

        return {
          id: ad.id,
          isOwnListing: Boolean(user?.id && ad.user_id === user.id),
          boatName: ad.boat?.name ?? "Névtelen hajó",
          image: ad.boat?.original_image_url ?? ad.boat?.image_url ?? "/placeholder.svg",
          imageFocusX: typeof ad.image_focus_x === "number" ? ad.image_focus_x : 50,
          imageFocusY: typeof ad.image_focus_y === "number" ? ad.image_focus_y : 50,
          commitment: (ad.commitment === "szezon" ? "szezon" : "egy-verseny") as Commitment,
          event: ad.title ?? "",
          location: ad.location ?? "",
          date: ad.date_text ?? "",
          roles: normalizedRoles,
          level: (ad.experience_level ?? "halado") as Level,
          applied: appliedAdIdMap.has(ad.id),
          applicationId: appliedAdIdMap.get(ad.id) ?? null,
          applicationCount: applicationCounts?.applicationCount ?? 0,
          captainName: captainData?.full_name?.trim() || "Ismeretlen kapitány",
          captainAvatar: captainData?.avatar_url ?? null,
          captainNote: typeof ad.captain_note === "string" && ad.captain_note.trim() ? ad.captain_note.trim() : null,
          maxApplicants: typeof ad.max_applicants === "number" ? ad.max_applicants : null,
          activeApplicationCount: applicationCounts?.activeApplicationCount ?? 0,
        }
      })

      setListingsData((prev) => (options.append ? [...prev, ...mapped] : mapped))
      setTotalCount(count)
      setHasMore(count !== null ? from + data!.length < count : data!.length === PAGE_SIZE)
      setNextPage(pageIndex + 1)
      setLoadingAds(false)
      setLoadingMore(false)
    },
    [user, commitment, posts, level, search, sort],
  )

  useEffect(() => {
    setNextPage(0)
    setHasMore(true)
    void loadAdsPage(0, { append: false })
  }, [loadAdsPage])

  // A főoldali kártyák ?ad=<id> paraméterrel nyitják meg egy hirdetés részleteit.
  const [focusAdId, setFocusAdId] = useState<string | null>(() => searchParams.get("ad"))
  const focusAdFound = focusAdId ? listingsData.some((listing) => listing.id === focusAdId) : false

  useEffect(() => {
    setFocusAdId(searchParams.get("ad"))
  }, [searchParams])

  useEffect(() => {
    if (!focusAdId || focusAdFound || loadingAds || loadingMore) return
    if (hasMore) {
      void loadAdsPage(nextPage, { append: true })
    } else {
      setFocusAdId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAdId, focusAdFound, loadingAds, loadingMore, hasMore, nextPage])

  function consumeFocusAd() {
    setFocusAdId(null)
    const params = new URLSearchParams(window.location.search)
    if (!params.has("ad")) return
    params.delete("ad")
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
  }

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
        <FilterField label="Keresés">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Hajónév, esemény vagy helyszín..."
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-56"
            aria-label="Keresés hajónév, esemény vagy helyszín alapján"
          />
        </FilterField>

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
                    updateUrl({ commitment, posts: [], level, q: search })
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

        <FilterField label="Rendezés">
          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger className={filterTriggerClass}>
              <SelectValue>{(v: string) => sortLabels[v as SortMode] ?? sortLabels.soon}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="soon">{sortLabels.soon}</SelectItem>
              <SelectItem value="newest">{sortLabels.newest}</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <p className="text-sm text-muted-foreground sm:ml-auto sm:pb-2.5">
          {loadingAds
            ? "…"
            : totalCount !== null && totalCount > listingsData.length
              ? `${totalCount} szabad hely (${listingsData.length} betöltve)`
              : `${listingsData.length} szabad hely`}
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
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
              <Skeleton className="aspect-[3/1] w-full rounded-none" />
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="mt-2 h-10 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : listingsData.length > 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listingsData.map((listing) => (
            <BoatCard
              key={listing.id}
              listing={listing}
              userId={user?.id ?? null}
              onRequestApply={canStartApplication}
              onApply={handleApplySubmit}
              applyingId={applyingId}
              onCancel={cancelApplication}
              cancelingId={cancelingId}
              autoOpenDetails={listing.id === focusAdId}
              onAutoOpened={consumeFocusAd}
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

      {!loadingAds && hasMore ? (
        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={loadingMore}
            onClick={() => void loadAdsPage(nextPage, { append: true })}
          >
            {loadingMore ? "Betöltés..." : "További hirdetések betöltése"}
          </Button>
        </div>
      ) : null}

      {applyError ? (
        <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {applyError}
        </div>
      ) : null}

      <AuthGateModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        boatName={selectedBoat}
        returnTo={authReturnTo}
      />
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

export function BoatCard({
  listing,
  userId,
  onRequestApply,
  onApply,
  applyingId,
  onCancel,
  cancelingId,
  autoOpenDetails = false,
  onAutoOpened,
}: {
  listing: ListingRow
  userId: string | null
  onRequestApply: (listing: ListingRow) => boolean
  onApply: (listing: ListingRow, applicationMessage?: string) => void
  applyingId: string | null
  onCancel: (adId: string, applicationId: string | null) => void
  cancelingId: string | null
  autoOpenDetails?: boolean
  onAutoOpened?: () => void
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [hasReported, setHasReported] = useState<boolean | null>(null)

  useEffect(() => {
    if (!autoOpenDetails) return
    setDetailsOpen(true)
    onAutoOpened?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenDetails])

  useEffect(() => {
    let active = true
    setHasReported(null)

    if (!userId) return

    void supabase
      .from("ad_reports")
      .select("id")
      .eq("ad_id", listing.id)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error("Saját hirdetésbejelentés lekérdezési hiba:", error)
          setHasReported(false)
          return
        }
        setHasReported(Boolean(data))
      })

    return () => {
      active = false
    }
  }, [listing.id, userId])

  const isFull = listing.maxApplicants !== null && listing.activeApplicationCount >= listing.maxApplicants


  const startApplyFlow = () => {
    if (onRequestApply(listing)) setApplyOpen(true)
  }

  const startApplyFlowFromDetails = () => {
    if (onRequestApply(listing)) {
      setDetailsOpen(false)
      setApplyOpen(true)
    }
  }

  const startReportFlowFromDetails = () => {
    if (hasReported) return
    setDetailsOpen(false)
    setReportOpen(true)
  }

  return (
    <article
      onClick={(event) => {
        const target = event.target as HTMLElement
        // Portaled dialogs bubble React events here, so only react to clicks that are really inside the card.
        if (!event.currentTarget.contains(target) || target.closest("button, a")) return
        setDetailsOpen(true)
      }}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg"
    >
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        aria-label={`${listing.boatName} hirdetés részletei`}
        className="relative block h-44 w-full shrink-0 overflow-hidden bg-brand-tint text-left"
      >
        <Image
          src={listing.image || "/placeholder.svg"}
          alt={`${listing.boatName} vitorlás hajó`}
          fill
          loading="eager"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          style={{ objectPosition: `${listing.imageFocusX}% ${listing.imageFocusY}%` }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
          aria-hidden="true"
        />

        <div className="absolute left-3 top-3">
          <Badge
            className={
              listing.commitment === "szezon"
                ? "border-0 bg-brand-teal text-white shadow-sm"
                : "border-0 bg-brand text-white shadow-sm"
            }
          >
            {commitmentLabels[listing.commitment]}
          </Badge>
        </div>

        {isFull ? (
          <Badge className="absolute right-3 top-3 border-0 bg-destructive text-destructive-foreground shadow-sm">
            Betelt
          </Badge>
        ) : null}

        <span className="absolute inset-x-3 bottom-2 truncate text-base font-semibold text-white [text-shadow:0_1px_4px_rgb(0_0_0_/_0.55)]">
          {listing.boatName}
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1 text-sm">
          <span
            className="flex items-center gap-1.5 font-medium text-card-foreground"
            aria-label={`Esemény: ${listing.event}`}
          >
            <Flag className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
            <span className="truncate" aria-hidden="true">
              {listing.event}
            </span>
          </span>
          <span
            className="flex min-w-0 items-center gap-1.5 text-muted-foreground"
            aria-label={`Dátum: ${listing.date}`}
          >
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
            <span className="shrink-0" aria-hidden="true">
              {listing.date}
            </span>
          </span>
          {listing.location ? (
            <span
              className="flex min-w-0 items-center gap-1.5 text-muted-foreground"
              aria-label={`Helyszín: ${listing.location}`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
              <span className="truncate" aria-hidden="true">
                {listing.location}
              </span>
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge
            className="max-w-full gap-1 border-0 bg-secondary font-normal text-secondary-foreground"
            aria-label={`Szükséges poszt: ${listing.roles.map((role) => roleLabels[role]).join(", ")}`}
            title={listing.roles.map((role) => roleLabels[role]).join(", ")}
          >
            <Users className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate" aria-hidden="true">
              {listing.roles.slice(0, 2).map((role) => roleLabels[role]).join(", ")}
              {listing.roles.length > 2 ? ` +${listing.roles.length - 2}` : ""}
            </span>
          </Badge>
          <Badge
            className={`gap-1 border-0 font-normal ${levelBadgeClasses[listing.level]}`}
            aria-label={`Elvárt tapasztalat: ${levelLabels[listing.level]}`}
          >
            <Award className="h-3 w-3" aria-hidden="true" />
            <span aria-hidden="true">{levelLabels[listing.level]}</span>
          </Badge>
        </div>

        {listing.applied ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="border-0 bg-emerald-100 text-emerald-800">Már jelentkeztem</Badge>
          </div>
        ) : null}

        {listing.isOwnListing ? (
          <p className="mt-auto flex h-10 items-center justify-center gap-1.5 pt-1 text-sm font-medium text-brand">
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            Saját hirdetés
          </p>
        ) : (
          <div className="mt-auto flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="shrink-0 text-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              Részletek
            </button>
            <PrimaryApplyAction
              listing={listing}
              isFull={isFull}
              applyingId={applyingId}
              cancelingId={cancelingId}
              onCancel={onCancel}
              onRequestApply={startApplyFlow}
              className="flex-1"
            />
          </div>
        )}
      </div>

      <ListingDetailsDialog
        listing={listing}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        isFull={isFull}
        applyingId={applyingId}
        cancelingId={cancelingId}
        onCancel={onCancel}
        onRequestApply={startApplyFlowFromDetails}
        onRequestReport={startReportFlowFromDetails}
        userIsLoggedIn={Boolean(userId && hasReported !== null)}
        hasReported={hasReported === true}
      />

      <ListingReportDialog
        listing={listing}
        userId={userId}
        open={reportOpen}
        onOpenChange={setReportOpen}
        onSubmitted={() => setHasReported(true)}
      />

      <ApplyDialog
        listing={listing}
        open={applyOpen}
        onOpenChange={setApplyOpen}
        isSubmitting={applyingId === listing.id}
        onSubmit={(message) => onApply(listing, message)}
      />
    </article>
  )
}

function PrimaryApplyAction({
  listing,
  isFull,
  applyingId,
  cancelingId,
  onCancel,
  onRequestApply,
  className = "",
}: {
  listing: ListingRow
  isFull: boolean
  applyingId: string | null
  cancelingId: string | null
  onCancel: (adId: string, applicationId: string | null) => void
  onRequestApply: () => void
  className?: string
}) {
  if (listing.applied) {
    return (
      <Button
        variant="outline"
        onClick={() => onCancel(listing.id, listing.applicationId)}
        disabled={cancelingId === listing.id}
        title="Jelentkezés visszavonása"
        className={`h-10 min-w-0 truncate text-sm text-destructive! hover:bg-destructive/10! hover:text-destructive! ${className}`}
      >
        {cancelingId === listing.id ? "Visszavonás..." : "Visszavonás"}
      </Button>
    )
  }

  if (listing.isOwnListing) return null

  return (
    <Button
      onClick={onRequestApply}
      disabled={applyingId === listing.id || isFull}
      className={`h-10 min-w-0 truncate bg-brand! text-sm text-white! hover:bg-brand/90! disabled:cursor-not-allowed disabled:bg-muted ${className}`}
    >
      {applyingId === listing.id ? "Jelentkezés..." : isFull ? "Betelt" : "Jelentkezés"}
    </Button>
  )
}

function DetailLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Flag
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-sm text-foreground">{value}</span>
      </div>
    </div>
  )
}

function ListingDetailsDialog({
  listing,
  open,
  onOpenChange,
  isFull,
  applyingId,
  cancelingId,
  onCancel,
  onRequestApply,
  onRequestReport,
  userIsLoggedIn,
  hasReported,
}: {
  listing: ListingRow
  open: boolean
  onOpenChange: (open: boolean) => void
  isFull: boolean
  applyingId: string | null
  cancelingId: string | null
  onCancel: (adId: string, applicationId: string | null) => void
  onRequestApply: () => void
  onRequestReport: () => void
  userIsLoggedIn: boolean
  hasReported: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogTitle className="sr-only">{listing.boatName} hirdetés részletei</DialogTitle>
        <DialogDescription className="sr-only">A hirdetés teljes részletei és jelentkezési lehetőség.</DialogDescription>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The photo spans the full modal width at its natural height, so the whole image is always visible. */}
        <div className="relative w-full overflow-visible bg-brand-tint">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={listing.image || "/placeholder.svg"}
            alt={`${listing.boatName} vitorlás hajó`}
            className="block h-auto w-full"
          />
          <div
            className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
            aria-hidden="true"
          />
          <div className="absolute left-4 top-4">
            <Badge
              className={
                listing.commitment === "szezon"
                  ? "border-0 bg-brand-teal text-white shadow-sm"
                  : "border-0 bg-brand text-white shadow-sm"
              }
            >
              {commitmentLabels[listing.commitment]}
            </Badge>
          </div>
          {!listing.isOwnListing && userIsLoggedIn ? (
            <div className="group/report absolute right-10 top-2 z-20">
              <button
                type="button"
                onClick={onRequestReport}
                aria-label={hasReported ? "Ezt a hirdetést már bejelentetted" : "Hirdetés jelentése"}
                className={`group inline-flex h-7 w-7 items-center justify-start overflow-hidden rounded-lg border-0 bg-transparent p-0 text-black shadow-none transition-[width,background-color,color] duration-200 hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                  hasReported
                    ? "hover:w-[10rem] focus-visible:w-[10rem]"
                    : "hover:w-[6.5rem] focus-visible:w-[6.5rem]"
                }`}
              >
                <TriangleAlert className="ml-1.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className={`ml-1.5 overflow-hidden whitespace-nowrap text-xs font-medium ${
                  hasReported
                    ? "max-w-0 opacity-0 transition-all duration-200 group-hover:max-w-36 group-hover:opacity-100 group-focus-visible:max-w-36 group-focus-visible:opacity-100"
                    : "max-w-0 opacity-0 transition-all duration-200 group-hover:max-w-20 group-hover:opacity-100 group-focus-visible:max-w-20 group-focus-visible:opacity-100"
                }`}>
                  {hasReported ? "Már bejelentetted" : "Jelentés"}
                </span>
              </button>
            </div>
          ) : null}
          <p className="absolute inset-x-4 bottom-3 truncate text-xl font-bold text-white [text-shadow:0_1px_4px_rgb(0_0_0_/_0.55)]">
            {listing.boatName}
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="flex flex-col gap-3">
            <DetailLine icon={Flag} label="Esemény" value={listing.event} />
            {listing.location ? <DetailLine icon={MapPin} label="Helyszín" value={listing.location} /> : null}
            <DetailLine icon={CalendarDays} label="Dátum" value={listing.date} />
            <DetailLine icon={Users} label="Szükséges poszt" value={listing.roles.map((role) => roleLabels[role]).join(", ")} />
            <DetailLine icon={Award} label="Elvárt tapasztalat" value={levelLabels[listing.level]} />
          </div>

          {isFull || listing.applied || listing.isOwnListing ? (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {listing.isOwnListing ? (
                <Badge className="gap-1 border-0 bg-brand-tint text-brand">
                  <UserCheck className="h-3 w-3" aria-hidden="true" />
                  Saját hirdetés
                </Badge>
              ) : null}
              {isFull ? (
                <Badge className="border-0 bg-destructive text-destructive-foreground">Betelt</Badge>
              ) : null}
              {listing.applied ? (
                <Badge className="border-0 bg-emerald-100 text-emerald-800">Már jelentkeztem</Badge>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 rounded-xl border border-brand-tint-strong bg-brand-tint p-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-sm font-semibold text-white ring-1 ring-border">
                {listing.captainAvatar ? (
                  <Image
                    src={listing.captainAvatar}
                    alt={`${listing.captainName} profilképe`}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                ) : (
                  <span aria-hidden="true">
                    {listing.captainName
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase())
                      .join("")}
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Kapitány</p>
                <p className="truncate text-sm font-semibold text-foreground">{listing.captainName}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Megjegyzés</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {listing.captainNote ?? "Nem adott meg külön megjegyzést."}
              </p>
            </div>
          </div>
        </div>
        </div>

        {listing.isOwnListing ? null : (
        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-2xl bg-card px-6 py-4">
          <PrimaryApplyAction
            listing={listing}
            isFull={isFull}
            applyingId={applyingId}
            cancelingId={cancelingId}
            onCancel={onCancel}
            onRequestApply={onRequestApply}
            className="w-full sm:flex-1"
          />
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

const reportTypes = [
  { value: "boat_report", label: "Hajó jelentése" },
  { value: "user_report", label: "Felhasználó jelentése" },
  { value: "tragar", label: "Trágár vagy sértő tartalom" },
  { value: "spam", label: "Spam vagy reklám" },
  { value: "csalas", label: "Csalás vagy megtévesztő hirdetés" },
  { value: "valotlan", label: "Valótlan információ" },
  { value: "egyeb", label: "Egyéb" },
] as const

function ListingReportDialog({
  listing,
  userId,
  open,
  onOpenChange,
  onSubmitted,
}: {
  listing: ListingRow
  userId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: () => void
}) {
  const [reportReason, setReportReason] = useState("")
  const [extraText, setExtraText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (open) {
      setReportReason("")
      setExtraText("")
      setErrorMessage(null)
      setSubmitted(false)
    }
  }, [open, listing.id])

  async function submitReport() {
    if (!reportReason) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const {
        data: { user: authenticatedUser },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !authenticatedUser || authenticatedUser.id !== userId) {
        setErrorMessage("Hirdetés bejelentéséhez be kell jelentkezned.")
        return
      }

      const { error } = await supabase.from("ad_reports").insert({
        ad_id: listing.id,
        user_id: authenticatedUser.id,
        report_type: reportReason,
        extra_text: extraText.trim() || null,
      })

      if (error) {
        if (error.code === "23505") {
          setErrorMessage("Ezt a hirdetést már bejelentetted.")
          return
        }

        console.error("Hirdetésbejelentési hiba:", error)
        setErrorMessage("A bejelentést nem sikerült elküldeni. Próbáld újra később.")
        return
      }

      setSubmitted(true)
      onSubmitted()
    } catch (error) {
      console.error("Hirdetésbejelentési hálózati hiba:", error)
      setErrorMessage("A bejelentést nem sikerült elküldeni. Ellenőrizd az internetkapcsolatot, majd próbáld újra.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="gap-1 border-b border-brand-tint-strong bg-brand-tint px-6 py-5">
          <DialogTitle className="text-lg font-bold text-brand">Hirdetés bejelentése</DialogTitle>
          <DialogDescription>{listing.boatName} · {listing.event}</DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="px-6 py-5">
            <p role="status" className="text-sm text-foreground">Köszönjük, a bejelentésedet rögzítettük.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`report-reason-${listing.id}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Bejelentés oka
              </Label>
              <Select
                value={reportReason}
                onValueChange={(value) => setReportReason(value ?? "")}
                itemToStringLabel={(value) => reportTypes.find((type) => type.value === value)?.label ?? ""}
              >
                <SelectTrigger id={`report-reason-${listing.id}`} className="w-full">
                  <SelectValue placeholder="Válassz egy okot" />
                </SelectTrigger>
                <SelectContent>
                  {reportTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`report-extra-${listing.id}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                További részletek (nem kötelező)
              </Label>
              <textarea
                id={`report-extra-${listing.id}`}
                rows={4}
                maxLength={1000}
                value={extraText}
                onChange={(event) => setExtraText(event.target.value)}
                placeholder="Írd le röviden, miért jelentetted be a hirdetést."
                className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">Maximum 1000 karakter.</p>
            </div>

            {errorMessage ? <p role="alert" className="text-sm text-destructive">{errorMessage}</p> : null}
          </div>
        )}

        <DialogFooter className="mx-0 mb-0 rounded-b-2xl bg-card px-6 py-4">
          {submitted ? (
            <Button type="button" onClick={() => onOpenChange(false)}>Bezárás</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Mégse
              </Button>
              <Button
                type="button"
                onClick={() => void submitReport()}
                disabled={!reportReason || !userId || isSubmitting}
                className="bg-brand! text-white! hover:bg-brand/90!"
              >
                {isSubmitting ? "Küldés..." : "Bejelentés elküldése"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ApplyDialog({
  listing,
  open,
  onOpenChange,
  isSubmitting,
  onSubmit,
}: {
  listing: ListingRow
  open: boolean
  onOpenChange: (open: boolean) => void
  isSubmitting: boolean
  onSubmit: (applicationMessage?: string) => void
}) {
  const selectableRoles = useMemo(() => listing.roles.filter((role) => role !== "barmilyen"), [listing.roles])
  const [selectedRole, setSelectedRole] = useState<ListingPost | "">(selectableRoles[0] ?? "")
  const [message, setMessage] = useState("")
  const wasSubmittingRef = useRef(false)

  useEffect(() => {
    if (open) {
      setSelectedRole(selectableRoles[0] ?? "")
      setMessage("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, listing.id])

  useEffect(() => {
    if (open && wasSubmittingRef.current && !isSubmitting) {
      onOpenChange(false)
    }
    wasSubmittingRef.current = isSubmitting
  }, [isSubmitting, open, onOpenChange])

  const handleSubmit = () => {
    const parts: string[] = []
    if (selectableRoles.length > 1 && selectedRole) {
      parts.push(`Jelentkezett pozíció: ${roleLabels[selectedRole]}`)
    }
    const trimmedMessage = message.trim()
    if (trimmedMessage) parts.push(trimmedMessage)
    onSubmit(parts.length > 0 ? parts.join("\n\n") : undefined)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md gap-0 rounded-2xl p-0">
        <DialogHeader className="gap-1 border-b border-brand-tint-strong bg-brand-tint px-6 py-5">
          <DialogTitle className="text-lg font-bold text-brand">Jelentkezés – {listing.boatName}</DialogTitle>
          <DialogDescription>
            {listing.event} · {listing.date}
            {listing.location ? ` · ${listing.location}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-5">
          {selectableRoles.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apply-role" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Melyik pozícióra jelentkezel?
              </Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as ListingPost)}>
                <SelectTrigger id="apply-role" className="w-full">
                  <SelectValue>{(v: string) => roleLabels[v as ListingPost] ?? "Válassz pozíciót"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <Badge className="gap-1 border-0 bg-secondary font-normal text-secondary-foreground">
                <Users className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {listing.roles.map((role) => roleLabels[role]).join(", ")}
              </Badge>
              <Badge className="gap-1 border-0 bg-secondary font-normal text-secondary-foreground">
                <Award className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {levelLabels[listing.level]}
              </Badge>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apply-message" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Üzenet a kapitánynak (opcionális)
            </Label>
            <textarea
              id="apply-message"
              name="applicationMessage"
              rows={4}
              maxLength={500}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Pl.: Szia! Van tapasztalatom túra- és pályaversenyeken is, szívesen csatlakoznék a csapathoz."
              className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <p className="text-xs text-muted-foreground">Maximum 500 karakter.</p>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-2xl bg-card px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Mégse
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-brand! text-white! hover:bg-brand/90!"
          >
            {isSubmitting ? "Küldés..." : "Jelentkezés elküldése"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
