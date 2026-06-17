"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import {
  Anchor,
  Plus,
  Ship,
  MapPin,
  CalendarDays,
  Users,
  Check,
  X,
  ChevronRight,
  Phone,
  Mail,
  ImagePlus,
  Trash2,
  Archive,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { AuthGateModal } from "@/components/auth-gate-modal"

type ApplicantStatus = "pending" | "accepted" | "rejected"

type Applicant = {
  id: string
  name: string
  age?: number
  level: "Kezdő" | "Haladó" | "Profi / Versenyző"
  position: string
  phone: string
  email: string
  avatar: string
}

type Listing = {
  id: string
  event: string
  location: string
  date: string
  positions: string[]
  applicants: Applicant[]
}

type UserProfile = {
  full_name: string
  role: string
  avatar_url: string | null
}

type Boat = {
  id: string
  name: string
  type: string
  harbor: string
  max_crew_size: number
  team_type: string
  image_url: string | null
  user_id: string
}

const PRIMARY_BOAT = {
  name: "Sirocco",
  type: "X-35 — Versenycirkáló",
  harbor: "Balatonfüred",
  image: "/boats/sirocco.png",
}

const INITIAL_LISTINGS: Listing[] = [
  {
    id: "kekszalag",
    event: "Kékszalag Erste Kör",
    location: "Balatonfüred",
    date: "2026. 06. 12.",
    positions: ["Trimmer", "Mancsaft"],
    applicants: [
      {
        id: "a1",
        name: "Kovács Bálint",
        age: 34,
        level: "Haladó",
        position: "Trimmer",
        phone: "+36 30 123 4567",
        email: "kovacs.balint@example.hu",
        avatar: "/avatars/applicant-1.png",
      },
      {
        id: "a2",
        name: "Tóth Eszter",
        age: 27,
        level: "Profi / Versenyző",
        position: "Mancsaft",
        phone: "+36 20 987 6543",
        email: "toth.eszter@example.hu",
        avatar: "/avatars/applicant-2.png",
      },
      {
        id: "a3",
        name: "Nagy Gergő",
        age: 31,
        level: "Haladó",
        position: "Mancsaft",
        phone: "+36 70 456 7890",
        email: "nagy.gergo@example.hu",
        avatar: "/avatars/applicant-3.png",
      },
    ],
  },
  {
    id: "bajnoksag",
    event: "Balatoni Bajnokság 4. forduló",
    location: "Balatonföldvár",
    date: "2026. 05. 09.",
    positions: ["Kormányos"],
    applicants: [
      {
        id: "b1",
        name: "Szabó Anna",
        age: 29,
        level: "Profi / Versenyző",
        position: "Kormányos",
        phone: "+36 30 555 1212",
        email: "szabo.anna@example.hu",
        avatar: "/avatars/applicant-4.png",
      },
    ],
  },
  {
    id: "szezon",
    event: "Hosszútávú szezoncsapat",
    location: "Balatonfüred",
    date: "2026-os szezon",
    positions: ["Mancsaft", "Navigátor"],
    applicants: [
      {
        id: "c1",
        name: "Kovács Bálint",
        age: 34,
        level: "Haladó",
        position: "Navigátor",
        phone: "+36 30 123 4567",
        email: "kovacs.balint@example.hu",
        avatar: "/avatars/applicant-1.png",
      },
      {
        id: "c2",
        name: "Nagy Gergő",
        age: 31,
        level: "Kezdő",
        position: "Mancsaft",
        phone: "+36 70 456 7890",
        email: "nagy.gergo@example.hu",
        avatar: "/avatars/applicant-3.png",
      },
    ],
  },
]

const levelStyles: Record<Applicant["level"], string> = {
  Kezdő: "bg-secondary text-secondary-foreground",
  Haladó: "bg-accent/15 text-accent-foreground",
  "Profi / Versenyző": "bg-primary text-primary-foreground",
}

function calculateAge(birthdate: string) {
  const birth = new Date(birthdate)
  if (Number.isNaN(birth.getTime())) return undefined
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  const dayDiff = today.getDate() - birth.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }
  return age
}

function experienceLevelLabel(level?: string) {
  switch (level) {
    case "kezdo":
      return "Kezdő"
    case "halado":
      return "Haladó"
    case "profi":
      return "Profi / Versenyző"
    default:
      return "Kezdő"
  }
}

function formatPositionLabel(positionRaw: unknown) {
  const normalized = String(positionRaw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  if (normalized === "kormanyos") return "Kormányos"
  if (normalized === "barmilyen" || normalized === "mindegy" || normalized === "egyeb") return "Bármilyen"
  if (normalized === "mancsaft" || normalized === "matroz" || normalized === "trimmer") return "Mancsaft"
  if (!normalized) return "Legénység"
  return String(positionRaw)
}

function resolveAvatarUrl(userData: any): string {
  const directAvatar =
    userData?.avatar_url ??
    userData?.avatar ??
    userData?.profile_image ??
    userData?.profile_image_url ??
    userData?.image_url

  if (typeof directAvatar === "string" && directAvatar.trim()) {
    return directAvatar
  }

  return "/placeholder.svg"
}

const crewTypeOptions = [
  { value: "verprofi", label: "Vérprofi versenyzés" },
  { value: "amator", label: "Amatőr versenyzés / Tanulás" },
  { value: "tura", label: "Túra / Hobbi vitorlázás" },
]

export function SkipperDashboard() {
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [statuses, setStatuses] = useState<Record<string, ApplicantStatus>>({})
  const [statusSaving, setStatusSaving] = useState<Record<string, boolean>>({})
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [boat, setBoat] = useState<Boat | null>(null)
  const [hasBoat, setHasBoat] = useState(false)

  const [loadingListings, setLoadingListings] = useState(false)
  const [pendingCountsMap, setPendingCountsMap] = useState<Record<string, number>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [modalView, setModalView] = useState<"boat" | "listing">("listing")
  const [nonce, setNonce] = useState(0)
  const [listingsRefreshKey, setListingsRefreshKey] = useState(0)

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) {
        setUser(null)
        setProfile(null)
        return
      }

      setUser(currentUser)
      const { data: profileData, error: profileError } = await supabase
        .from("users")
        .select("full_name, role, avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle()

      if (profileError) {
        console.error("Profil lekérdezési hiba:", profileError)
        setProfile(null)
        return
      }

      if (!profileData) {
        // A felhasználó sorainak létrehozása még zajlik.
        return
      }

      setProfile(profileData)
    }

    fetchUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchUser()
      } else {
        setUser(null)
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setBoat(null)
      setHasBoat(false)
      return
    }

    const fetchBoat = async () => {
      const { data: boatData, error } = await supabase
        .from("boats")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle()

      if (error) {
        console.error("Hajó lekérdezési hiba:", error)
        setBoat(null)
        setHasBoat(false)
        return
      }

      if (boatData) {
        setBoat(boatData)
        setHasBoat(true)
        await fetchListings(boatData.id)
      } else {
        setBoat(null)
        setHasBoat(false)
        setListings([])
        setSelectedId("")
      }
    }

    const fetchListings = async (boatId: string) => {
      setLoadingListings(true)
      // Először próbáljunk egy egyszerűbb lekérdezést
      const { data: adsData, error: adsError } = await supabase
        .from("ads")
        .select("*")
        .eq("boat_id", boatId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (adsError) {
        console.error("Hirdetések lekérdezési hiba:", adsError)
        console.error("Error details:", {
          message: adsError?.message,
          code: adsError?.code,
          details: adsError?.details,
          hint: adsError?.hint,
        })
        setListings([])
        setSelectedId("")
        setLoadingListings(false)
        return
      }

      if (adsData && Array.isArray(adsData) && adsData.length > 0) {
        const mapped: Listing[] = adsData.map((ad: any) => ({
          id: ad.id,
          event: ad.title,
          location: ad.location,
          date: ad.date_text,
          positions: (ad.positions ?? []).map((p: unknown) => formatPositionLabel(p)),
          applicants: [],
        }))

        setListings(mapped)
        if (mapped.length > 0 && mapped[0]?.id) {
          setSelectedId(mapped[0].id)
        } else {
          setSelectedId("")
        }

        // Pending számok lekérése az összes hirdetéshez
        const adIds = adsData.map((ad: any) => ad.id)
        const { data: pendingApps } = await supabase
          .from("applications")
          .select("ad_id")
          .in("ad_id", adIds)
          .eq("status", "pending")

        const countsMap: Record<string, number> = {}
        pendingApps?.forEach((app: any) => {
          countsMap[app.ad_id] = (countsMap[app.ad_id] ?? 0) + 1
        })
        setPendingCountsMap(countsMap)
      } else {
        setListings([])
        setSelectedId("")
        setPendingCountsMap({})
      }
      setLoadingListings(false)
    }

    void fetchBoat()
  }, [user, listingsRefreshKey])

  const totalPending = useMemo(
    () => Object.values(pendingCountsMap).reduce((sum, n) => sum + n, 0),
    [pendingCountsMap],
  )

  const activeListingId = useMemo(() => selectedId || listings[0]?.id || "", [selectedId, listings])

  useEffect(() => {
    if (!activeListingId) {
      return
    }

    let cancelled = false

    const fetchApplicants = async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("id, user_id, status")
        .eq("ad_id", activeListingId)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Jelentkezők lekérdezési hiba:", error)
        return
      }

      if (cancelled) {
        return
      }

      const applications = (data ?? []) as Array<{ id: string; user_id: string; status?: ApplicantStatus }>
      const userIds = Array.from(new Set(applications.map((application) => application.user_id).filter(Boolean)))

      const profilesByUserId = new Map<string, any>()

      if (userIds.length > 0) {
        const { data: usersById, error: usersByIdError } = await supabase
          .from("users")
          .select("*")
          .in("id", userIds)

        if (usersByIdError) {
          console.error("Felhasználók lekérdezési hiba:", usersByIdError)
        } else {
          ;(usersById ?? []).forEach((userRow: any) => {
            if (userRow?.id) {
              profilesByUserId.set(userRow.id, userRow)
            }
          })
        }
      }

      const nextStatuses: Record<string, ApplicantStatus> = {}
      const rawApplicants = applications.map((application) => {
        const userData = profilesByUserId.get(application.user_id)
        const status: ApplicantStatus =
          application.status === "accepted" || application.status === "rejected" ? application.status : "pending"
        nextStatuses[String(application.id)] = status

        const birthdateValue =
          userData?.birthdate ??
          userData?.birth_date ??
          userData?.date_of_birth

        return {
          id: String(application.id),
          name: userData?.full_name ?? "Ismeretlen jelentkező",
          age: birthdateValue ? calculateAge(String(birthdateValue)) : undefined,
          phone: userData?.phone ?? "Nincs megadva",
          email: userData?.email ?? "Nincs megadva",
          avatar: resolveAvatarUrl(userData),
        }
      })

      setListings((prev) =>
        prev.map((listing) => {
          if (listing.id !== activeListingId) {
            return listing
          }

          const defaultPosition = listing.positions[0] ?? "Legénység"
          return {
            ...listing,
            applicants: rawApplicants.map((applicant) => ({
              ...applicant,
              level: "Kezdő" as const,
              position: defaultPosition,
            })),
          }
        }),
      )

      setStatuses((prev) => ({ ...prev, ...nextStatuses }))
    }

    void fetchApplicants()

    return () => {
      cancelled = true
    }
  }, [activeListingId])

  const [isBoatModalOpen, setIsBoatModalOpen] = useState(false)

  const selected = useMemo(
    () =>
      listings.find((l) => l.id === selectedId) ??
      listings[0] ??
      ({ id: "", event: "Nincs aktív hirdetés", location: "", date: "", positions: [], applicants: [] } as Listing),
    [listings, selectedId],
  )

  function pendingCount(listing: Listing) {
    return listing.applicants.filter((a) => (statuses[a.id] ?? "pending") === "pending").length
  }

  function openModal(view: "boat" | "listing") {
    setModalView(view)
    setNonce((n) => n + 1)
    setModalOpen(true)
  }

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function deleteListing(id: string) {
    setActionError(null)
    setActionNotice(null)
    setDeletingId(id)

    const { error } = await supabase.from("ads").delete().eq("id", id)

    if (error) {
      console.error("Hirdetés törlési hiba:", error)
      setActionError("A hirdetés törlése nem sikerült.")
      setDeletingId(null)
      return
    }

    setListings((prev) => prev.filter((l) => l.id !== id))
    setSelectedId((prev) => (prev === id ? "" : prev))
    setActionNotice("A hirdetés törölve lett.")
    setDeletingId(null)
    setConfirmDeleteId(null)
  }

  async function archiveListing(id: string) {
    setActionError(null)
    setActionNotice(null)
    setArchivingId(id)

    const { error } = await supabase.from("ads").update({ is_active: false }).eq("id", id)

    if (error) {
      console.error("Hirdetés lezárási hiba:", error)
      setActionError("A hirdetés lezárása nem sikerült.")
      setArchivingId(null)
      return
    }

    setListings((prev) => prev.filter((l) => l.id !== id))
    setSelectedId((prev) => (prev === id ? "" : prev))
    setActionNotice("A hirdetés lezárva. Már nem látható a böngészésben.")
    setArchivingId(null)
    setConfirmArchiveId(null)
  }

  async function decide(id: string, status: ApplicantStatus) {
    setActionError(null)
    setActionNotice(null)
    const previousStatus = statuses[id] ?? "pending"

    setStatuses((prev) => ({ ...prev, [id]: status }))
    setStatusSaving((prev) => ({ ...prev, [id]: true }))

    const { error } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", id)

    if (error) {
      console.error("Jelentkezés státusz mentési hiba:", error)
      setStatuses((prev) => ({ ...prev, [id]: previousStatus }))
      setActionError("A döntés mentése nem sikerült.")
    } else {
      setActionNotice(status === "accepted" ? "Jelentkezés elfogadva." : "Jelentkezés elutasítva.")
    }

    setStatusSaving((prev) => ({ ...prev, [id]: false }))
  }

  return (
    <div className="min-h-screen bg-secondary/40">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {hasBoat ? (
          <>
            <div className="mb-8">
              <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Kapitányi Vezérlőpult
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Kezeld a hajóidat, hirdetéseidet és a beérkező jelentkezőket egy helyen.
              </p>
              {actionError ? (
                <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {actionError}
                </div>
              ) : null}
              {actionNotice ? (
                <div className="mt-4 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent-foreground">
                  {actionNotice}
                </div>
              ) : null}
            </div>

        {/* SECTION A: Boat management */}
        <section className="mb-10" aria-labelledby="boat-management">
          <h2 id="boat-management" className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Hajó kezelése
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-col md:flex-row">
              <div className="relative h-48 w-full shrink-0 md:h-auto md:w-72">
                        <Image
                    src={(boat?.image_url ?? PRIMARY_BOAT.image) || "/placeholder.svg"}
                    alt={`${(boat?.name ?? PRIMARY_BOAT.name)} vitorlás`}
                    fill
                    priority
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 288px"
                  />
                <Badge className="absolute left-3 top-3 bg-accent text-accent-foreground hover:bg-accent">
                  Elsődleges hajó
                </Badge>
              </div>
              <div className="flex flex-1 flex-col justify-between gap-6 p-6">
                <div>
                  <h3 className="text-xl font-bold text-foreground">{boat?.name ?? PRIMARY_BOAT.name}</h3>
                  <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Ship className="h-4 w-4 text-accent" aria-hidden="true" />
                      {boat?.type ?? PRIMARY_BOAT.type}
                    </span>
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-accent" aria-hidden="true" />
                      Bázis kikötő: {boat?.harbor ?? PRIMARY_BOAT.harbor}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    onClick={() => openModal("listing")}
                    className="h-11 bg-accent! text-accent-foreground! hover:bg-accent/90!"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Új hirdetés feladása
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION B + C */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* SECTION B: Active listings */}
          <section className="lg:col-span-2" aria-labelledby="active-listings">
            <h2 id="active-listings" className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Aktív hirdetéseid
            </h2>
            <div className="flex flex-col gap-3">
              {loadingListings ? (
                <>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-xl border border-border bg-card p-4">
                      <Skeleton className="h-5 w-3/4" />
                      <div className="mt-3 flex gap-4">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3.5 w-20" />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Skeleton className="h-5 w-16 rounded-md" />
                        <Skeleton className="h-5 w-16 rounded-md" />
                      </div>
                    </div>
                  ))}
                </>
              ) : listings.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
                  <Anchor className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">Még nincs hirdetésed</p>
                    <p className="mt-1 text-sm text-muted-foreground">Add fel első szabad helyed, hogy elérhetlő legyen a vitorlázók számára.</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => openModal("listing")}
                    className="bg-accent! text-accent-foreground! hover:bg-accent/90!"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Hirdetés feladása
                  </Button>
                </div>
              ) : (
                listings.map((listing) => {
                const isActive = listing.id === selected.id
                const count = pendingCountsMap[listing.id] ?? pendingCount(listing)
                return (
                  <div
                    key={listing.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(listing.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedId(listing.id) }}
                    className={`group relative cursor-pointer rounded-xl border bg-card p-4 text-left transition-all ${
                      isActive
                        ? "border-accent ring-1 ring-accent"
                        : "border-border hover:border-accent/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-foreground">{listing.event}</h3>
                      <div className="flex shrink-0 items-center gap-2">
                        {count > 0 && (
                          <Badge className="bg-accent text-accent-foreground hover:bg-accent">
                            {count} új jelentkező
                          </Badge>
                        )}
                        <button
                          type="button"
                          aria-label="Hirdetés lezárása"
                          disabled={archivingId === listing.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmArchiveId(listing.id)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label="Hirdetés törlése"
                          disabled={deletingId === listing.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteId(listing.id)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                        {listing.date}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {listing.location}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {listing.positions.map((p) => (
                          <span
                            key={p}
                            className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 transition-colors ${isActive ? "text-accent" : "text-muted-foreground"}`}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                )
              })
              )}
            </div>
          </section>

          {/* SECTION C: Applicants */}
          <section className="lg:col-span-3" aria-labelledby="applicants">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="applicants" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Jelentkezők
              </h2>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {selected.event}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {selected.applicants.map((applicant) => {
                const status = statuses[applicant.id] ?? "pending"
                const isSaving = statusSaving[applicant.id] ?? false
                return (
                  <div
                    key={applicant.id}
                    className={`flex flex-col gap-4 rounded-xl border bg-card p-4 ${
                      status === "rejected" ? "border-border opacity-60" : "border-border"
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-4">
                      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
                        <Image
                          src={applicant.avatar || "/placeholder.svg"}
                          alt={applicant.name}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-foreground">{applicant.name}</h3>
                          <span className="text-sm text-muted-foreground">
                            {applicant.age ? `${applicant.age} éves` : "Kor ismeretlen"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Badge className={`${levelStyles[applicant.level]} border-0`}>{applicant.level}</Badge>
                          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                            {applicant.position}
                          </span>
                        </div>
                      </div>
                    </div>

                    {status === "pending" ? (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          onClick={() => void decide(applicant.id, "accepted")}
                          disabled={isSaving}
                          className="h-9 bg-emerald-600! text-white! hover:bg-emerald-700!"
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                          Elfogadás
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void decide(applicant.id, "rejected")}
                          disabled={isSaving}
                          className="h-9 text-muted-foreground"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                          Elutasítás
                        </Button>
                      </div>
                    ) : (
                      <div className="shrink-0">
                        <Badge
                          className={
                            status === "accepted"
                              ? "border-0 bg-emerald-600 text-white hover:bg-emerald-600"
                              : "border-0 bg-secondary text-muted-foreground hover:bg-secondary"
                          }
                        >
                          {status === "accepted" ? (
                            <>
                              <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                              Elfogadva
                            </>
                          ) : (
                            <>
                              <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                              Elutasítva
                            </>
                          )}
                        </Badge>
                      </div>
                    )}
                    </div>

                    {status === "accepted" && (
                      <div className="flex flex-col gap-2 rounded-lg border border-emerald-600/20 bg-emerald-50 p-3 sm:flex-row sm:items-center sm:gap-6">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Elérhetőségek
                        </p>
                        <a
                          href={`tel:${applicant.phone.replace(/\s/g, "")}`}
                          className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-emerald-700"
                        >
                          <Phone className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          {applicant.phone}
                        </a>
                        <a
                          href={`mailto:${applicant.email}`}
                          className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-emerald-700"
                        >
                          <Mail className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                          {applicant.email}
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}

              {selected.applicants.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <p className="text-sm text-muted-foreground">Erre a hirdetésre még nincs jelentkező.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </>
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
            <div className="flex flex-col items-center gap-6">
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                <Ship className="h-10 w-10" aria-hidden="true" />
              </span>
              <div className="space-y-3">
                <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground">
                  Üdvözlünk a fedélzeten, Kapitány!
                </h1>
                <p className="max-w-xl text-sm leading-7 text-muted-foreground">
                  A legénység toborzásához először add meg a hajód alapvető adatait.
                </p>
              </div>
              <Button
                size="lg"
                className="h-14 bg-accent! text-accent-foreground! hover:bg-accent/90!"
                onClick={() => setIsBoatModalOpen(true)}
              >
                + Új hajó hozzáadása
              </Button>
            </div>
          </div>
        )}
      </main>

      <BoatRegistrationModal
        open={isBoatModalOpen}
        onOpenChange={setIsBoatModalOpen}
        onBoatSaved={(savedBoat) => {
          setBoat(savedBoat)
          setHasBoat(true)
        }}
        user={user}
      />

      <Dialog open={!!confirmArchiveId} onOpenChange={(open) => { if (!open) setConfirmArchiveId(null) }}>
        <DialogContent className="max-w-sm gap-0 rounded-2xl p-0">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Hirdetés lezárása
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                Biztosan lezárod ezt a hirdetést? Nem jelenik meg többé a böngészésben és a kezdőlapon.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmArchiveId(null)}
                disabled={!!archivingId}
              >
                Mégse
              </Button>
              <Button
                className="flex-1 bg-accent! text-accent-foreground! hover:bg-accent/90!"
                disabled={!!archivingId}
                onClick={() => confirmArchiveId && void archiveListing(confirmArchiveId)}
              >
                {archivingId ? "Lezárás..." : "Igen, lezárom"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}>
        <DialogContent className="max-w-sm gap-0 rounded-2xl p-0">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Hirdetés visszavonása
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                Biztosan visszavonod ezt a hirdetést? A jelentkezők adatai is törlődnek.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmDeleteId(null)}
                disabled={!!deletingId}
              >
                Mégse
              </Button>
              <Button
                className="flex-1 bg-destructive! text-white! hover:bg-destructive/90!"
                disabled={!!deletingId}
                onClick={() => confirmDeleteId && void deleteListing(confirmDeleteId)}
              >
                {deletingId ? "Törlés..." : "Igen, visszavonom"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AuthGateModal
        key={nonce}
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode="skipper"
        initialView={modalView}
        boatId={boat?.id}
        userId={user?.id}
        onListingCreated={() => setListingsRefreshKey((prev) => prev + 1)}
      />
    </div>
  )
}

/*
CREATE TABLE boats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  harbor text NOT NULL,
  max_crew_size integer NOT NULL,
  team_type text NOT NULL,
  image_url text,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamp with time zone DEFAULT now()
);
*/

function BoatRegistrationModal({
  open,
  onOpenChange,
  onBoatSaved,
  user,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBoatSaved: (boat: Boat) => void
  user: User | null
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [type, setType] = useState("")
  const [harbor, setHarbor] = useState("")
  const [crewSize, setCrewSize] = useState<string | number>("")
  const [crewType, setCrewType] = useState("")
  const [boatPhoto, setBoatPhoto] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<{
    name?: string
    type?: string
    harbor?: string
    crewSize?: string
    crewType?: string
    boatPhoto?: string
    submit?: string
  }>({})

  async function handleBoatSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const crewSizeValue = typeof crewSize === "string" ? Number(crewSize) : crewSize
    const newErrors: typeof errors = {}

    if (!name.trim()) {
      newErrors.name = "Hajó neve megadása kötelező."
    }

    if (!type.trim()) {
      newErrors.type = "Hajó típusa megadása kötelező."
    }

    if (!harbor.trim()) {
      newErrors.harbor = "Bázis kikötő megadása kötelező."
    }

    if (!crewSizeValue || Number.isNaN(crewSizeValue) || crewSizeValue <= 0) {
      newErrors.crewSize = "Érvényes legénységi létszám megadása kötelező."
    }

    if (!crewType) {
      newErrors.crewType = "Csapat jellegének kiválasztása kötelező."
    }

    if (!boatPhoto) {
      newErrors.boatPhoto = "Hajó fotó feltöltése kötelező."
    }

    if (!user) {
      newErrors.submit = "Be kell jelentkezned, hogy el tudd menteni a hajót."
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setIsSaving(true)

    try {
      let imageUrl: string | null = null
      if (boatPhoto) {
        const fileExt = boatPhoto.name.split(".").pop() ?? "jpg"
        const fileName = `${user?.id}-${Date.now()}.${fileExt}`
        const filePath = `boats/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from("boats")
          .upload(filePath, boatPhoto)

        if (uploadError) {
          setErrors({ submit: uploadError.message })
          return
        }

        const { data: publicUrlData } = await supabase.storage
          .from("boats")
          .getPublicUrl(filePath)

        if (!publicUrlData?.publicUrl) {
          setErrors({ submit: "Nem sikerült lekérni a kép nyilvános URL-jét." })
          return
        }

        imageUrl = publicUrlData.publicUrl
      }

      const { data: insertedBoat, error: insertError } = await supabase
        .from("boats")
        .insert([
          {
            name: name.trim(),
            type: type.trim(),
            harbor: harbor.trim(),
            max_crew_size: parseInt(String(crewSizeValue), 10),
            team_type: crewType,
            image_url: imageUrl,
            user_id: user!.id,
          },
        ])
        .select()
        .single()

      if (insertError || !insertedBoat) {
        setErrors({ submit: insertError?.message ?? "Hiba történt a hajó mentése közben." })
        return
      }

      onBoatSaved(insertedBoat)
      onOpenChange(false)
      router.push("/kapitany-dashboard")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="max-w-lg gap-0 rounded-2xl p-0 sm:max-w-xl">
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <DialogHeader className="gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Ship className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Hajó regisztrációja
            </DialogTitle>
            <DialogDescription className="text-pretty leading-relaxed">
              Add meg a hajód profilját, és folytasd egy szabad hely hirdetésével.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBoatSubmit} className="flex flex-col gap-4">
            {errors.submit ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errors.submit}
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="boat-name">Hajó neve</Label>
                <Input
                  id="boat-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (errors.name) {
                      setErrors((prev) => ({ ...prev, name: undefined }))
                    }
                  }}
                  placeholder="Pl. Sirocco"
                  className="h-11"
                  aria-invalid={!!errors.name}
                />
                {errors.name ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.name}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="boat-type">Hajó típusa / Hajóosztály</Label>
                <Input
                  id="boat-type"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value)
                    if (errors.type) {
                      setErrors((prev) => ({ ...prev, type: undefined }))
                    }
                  }}
                  placeholder="Pl. X-35 — Versenycirkáló"
                  className="h-11"
                  aria-invalid={!!errors.type}
                />
                {errors.type ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.type}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="boat-harbor">Bázis kikötő</Label>
                <Input
                  id="boat-harbor"
                  value={harbor}
                  onChange={(e) => {
                    setHarbor(e.target.value)
                    if (errors.harbor) {
                      setErrors((prev) => ({ ...prev, harbor: undefined }))
                    }
                  }}
                  placeholder="Pl. Balatonfüred"
                  className="h-11"
                  aria-invalid={!!errors.harbor}
                />
                {errors.harbor ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.harbor}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="crew-size">Max legénységi létszám</Label>
                <Input
                  id="crew-size"
                  type="number"
                  min={1}
                  value={crewSize}
                  onChange={(e) => {
                    const value = e.target.value === "" ? "" : Number(e.target.value)
                    setCrewSize(value)
                    if (errors.crewSize) {
                      setErrors((prev) => ({ ...prev, crewSize: undefined }))
                    }
                  }}
                  placeholder="Pl. 8"
                  className="h-11"
                  aria-invalid={!!errors.crewSize}
                />
                {errors.crewSize ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.crewSize}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="boat-photo">Hajó fotó</Label>
              <label
                htmlFor="boat-photo"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-secondary/40 px-4 py-6 text-center text-muted-foreground transition-colors hover:border-accent hover:text-accent"
              >
                <ImagePlus className="h-6 w-6" aria-hidden="true" />
                <span className="text-sm font-medium">
                  {boatPhoto ? boatPhoto.name : "Kép feltöltése a hajóról"}
                </span>
                <input
                  id="boat-photo"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    setBoatPhoto(e.target.files?.[0] ?? null)
                    if (errors.boatPhoto) {
                      setErrors((prev) => ({ ...prev, boatPhoto: undefined }))
                    }
                  }}
                />
              </label>
              {errors.boatPhoto ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.boatPhoto}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Csapat jellege</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {crewTypeOptions.map((option) => {
                  const active = crewType === option.value
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                        active
                          ? "border-accent bg-accent/10 text-foreground"
                          : "border-border bg-card text-foreground hover:border-accent/60"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          active ? "border-accent" : "border-muted-foreground"
                        }`}
                      >
                        {active ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                      </span>
                      <input
                        type="radio"
                        name="crew-type"
                        value={option.value}
                        checked={active}
                        onChange={() => {
                          setCrewType(option.value)
                          if (errors.crewType) {
                            setErrors((prev) => ({ ...prev, crewType: undefined }))
                          }
                        }}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  )
                })}
              </div>
              {errors.crewType ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.crewType}
                </p>
              ) : null}
            </div>

            <Button type="submit" size="lg" disabled={isSaving} className="mt-2 h-11 bg-accent! text-accent-foreground! hover:bg-accent/90! disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? "Mentés folyamatban..." : "Hajó mentése és Tovább a hirdetéshez"}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
