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
  PencilLine,
  Megaphone,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { SiteFooter } from "@/components/site-footer"
import { isAdVisibleByDate } from "@/lib/ad-visibility"

type ApplicantStatus = "pending" | "accepted" | "rejected"

type Applicant = {
  id: string
  userId: string
  name: string
  age?: number
  level: "Kezdő" | "Haladó" | "Profi / Versenyző"
  position: string
  phone: string
  email: string
  avatar: string
  applicationMessage: string | null
}

type Listing = {
  id: string
  event: string
  location: string
  date: string
  isActive: boolean
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

type EventItem = {
  id: string
  title: string
  date: string
  location: string
  type: "Verseny" | "Edzés" | "Egyéb"
  details: string
  startDate: string
  endDate: string
  oneDay: boolean
  participants: {
    userId: string
    name: string
    avatar: string
    status: "confirmed" | "pending" | "declined"
    source?: "team" | "listing"
  }[]
}

function getEventTypeBadgeClass(type: EventItem["type"]) {
  switch (type) {
    case "Verseny":
      return "border-0 bg-cyan-500 text-white shadow-sm"
    case "Edzés":
      return "border-0 bg-emerald-500 text-white shadow-sm"
    case "Egyéb":
      return "border-0 bg-amber-500 text-white shadow-sm"
    default:
      return "border-0 bg-slate-500 text-white shadow-sm"
  }
}

type TeamMember = {
  id: string
  userId: string
  name: string
  email: string
  role: string
  avatar: string
  status: "active" | "invited"
}

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
  if (normalized === "taktikus") return "Taktikus"
  if (normalized === "main-trim" || normalized === "main trim") return "Main Trim"
  if (normalized === "jib-trim" || normalized === "jib trim") return "Jib trim"
  if (normalized === "mast") return "Mast"
  if (normalized === "fordeck" || normalized === "foredeck") return "Fordeck"
  if (normalized === "barmilyen" || normalized === "mindegy" || normalized === "egyeb") return "Bármilyen"
  if (normalized === "mancsaft" || normalized === "matroz" || normalized === "trimmer") return "Mancsaft"
  if (!normalized) return "Legénység"
  return String(positionRaw)
}

function normalizeMatchText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function isMatchingListingToEvent(listing: Listing | undefined, event: EventItem | undefined) {
  if (!listing || !event) {
    return false
  }

  const titleMatches = normalizeMatchText(listing.event) === normalizeMatchText(event.title)
  const locationMatches = normalizeMatchText(listing.location) === normalizeMatchText(event.location)
  const dateMatches =
    !listing.date || !event.date || normalizeMatchText(listing.date) === normalizeMatchText(event.date)

  return titleMatches && locationMatches && dateMatches
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
  { value: "verprofi", label: "Profi versenyzés" },
  { value: "amator", label: "Amatőr versenyzés / Tanulás" },
  { value: "tura", label: "Túra / Hobbi vitorlázás" },
]

function resolveCrewTypeLabel(value?: string | null) {
  if (!value) return "Nincs megadva"
  return crewTypeOptions.find((option) => option.value === value)?.label ?? value
}

function formatEventDate(dateValue: string | null | undefined) {
  if (!dateValue) return "—"

  const parsed = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateValue

  return `${parsed.getFullYear()}. ${String(parsed.getMonth() + 1).padStart(2, "0")}. ${String(parsed.getDate()).padStart(2, "0")}.`
}

const MAX_BOAT_IMAGE_DIMENSION = 1600
const TARGET_BOAT_IMAGE_SIZE_BYTES = 900 * 1024
const MAX_BOAT_IMAGE_UPLOAD_SIZE_BYTES = 12 * 1024 * 1024

async function loadImageElement(file: File): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  const objectUrl = URL.createObjectURL(file)

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("A kép betöltése sikertelen."))
    img.src = objectUrl
  })

  return {
    image,
    revoke: () => URL.revokeObjectURL(objectUrl),
  }
}

async function optimizeBoatImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file
  }

  const { image, revoke } = await loadImageElement(file)

  try {
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height

    if (!width || !height) {
      return file
    }

    const scale = Math.min(1, MAX_BOAT_IMAGE_DIMENSION / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return file
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

    const qualities = [0.82, 0.74, 0.66, 0.58]
    let bestBlob: Blob | null = null

    for (const quality of qualities) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/webp", quality)
      })

      if (!blob) {
        continue
      }

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob
      }

      if (blob.size <= TARGET_BOAT_IMAGE_SIZE_BYTES) {
        bestBlob = blob
        break
      }
    }

    if (!bestBlob || bestBlob.size >= file.size) {
      return file
    }

    const safeName = file.name.replace(/\.[^.]+$/, "") || "boat-photo"
    return new File([bestBlob], `${safeName}.webp`, { type: "image/webp" })
  } finally {
    revoke()
  }
}

export function SkipperDashboard() {
  const router = useRouter()
  const [listings, setListings] = useState<Listing[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [newTeamMemberEmail, setNewTeamMemberEmail] = useState("")
  const [events, setEvents] = useState<EventItem[]>([])
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false)
  const [isEditEventModalOpen, setIsEditEventModalOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [newEventForm, setNewEventForm] = useState({
    type: "Verseny" as EventItem["type"],
    title: "",
    startDate: "",
    endDate: "",
    oneDay: false,
    location: "",
    notes: "",
  })
  const [editEventForm, setEditEventForm] = useState({
    type: "Verseny" as EventItem["type"],
    title: "",
    startDate: "",
    endDate: "",
    oneDay: false,
    location: "",
    notes: "",
  })
  const [selectedId, setSelectedId] = useState<string>("")
  const [statuses, setStatuses] = useState<Record<string, ApplicantStatus>>({})
  const [statusSaving, setStatusSaving] = useState<Record<string, boolean>>({})
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [boat, setBoat] = useState<Boat | null>(null)
  const [hasBoat, setHasBoat] = useState(false)
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null)

  const [loadingListings, setLoadingListings] = useState(false)
  const [pendingCountsMap, setPendingCountsMap] = useState<Record<string, number>>({})
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [inviteSending, setInviteSending] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalView, setModalView] = useState<"boat" | "listing">("listing")
  const [listingPrefill, setListingPrefill] = useState<{
    title?: string
    location?: string
    startDate?: string
    endDate?: string
    oneDay?: boolean
  } | null>(null)
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
        router.replace("/")
        return
      }

      setUser((prev) => (prev?.id === currentUser.id ? prev : currentUser))
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
      setTeamMembers([])
      return
    }

    const fetchTeamMembers = async (boatId: string) => {
      setTeamLoading(true)
      setTeamError(null)

      const { data, error } = await supabase
        .from("boat_team_members")
        .select("*")
        .eq("boat_id", boatId)
        .in("status", ["active", "invited"])
        .order("invited_at", { ascending: false })

      if (error) {
        console.error("Csapat tagok lekérdezési hiba:", error)
        setTeamMembers([])
        setTeamLoading(false)
        return
      }

      const memberRows = data ?? []
      const userIds = Array.from(new Set(memberRows.map((member: any) => member.user_id).filter(Boolean)))
      let profilesByUserId = new Map<string, any>()

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("users")
          .select("id, full_name, avatar_url")
          .in("id", userIds)

        ;(profilesData ?? []).forEach((profile: any) => {
          profilesByUserId.set(profile.id, profile)
        })
      }

      const mapped = memberRows.map((member: any) => {
        const profile = member.user_id ? profilesByUserId.get(member.user_id) : null
        const resolvedName = member.display_name || profile?.full_name || member.email?.split("@")[0] || "Csapattag"
        const resolvedStatus: TeamMember["status"] = member.status === "active" ? "active" : "invited"
        const resolvedRole = member.status === "active" ? "Csapattag" : member.role === "Új tag" ? "Meghívott" : member.role || "Meghívott"

        return {
          id: String(member.id),
          userId: member.user_id ? String(member.user_id) : "",
          name: resolvedName,
          email: member.email || "",
          role: resolvedRole,
          avatar: profile?.avatar_url || "/placeholder.svg",
          status: resolvedStatus,
        }
      })

      setTeamMembers(mapped)
      setTeamLoading(false)
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
        await fetchTeamMembers(boatData.id)
        await fetchListings(boatData.id)
        await fetchBoatEvents(boatData.id)
      } else {
        setBoat(null)
        setHasBoat(false)
        setTeamMembers([])
        setListings([])
        setSelectedId("")
      }
    }

    const fetchBoatEvents = async (boatId: string) => {
      const { data: eventRows, error: eventError } = await supabase
        .from("boat_events")
        .select("*")
        .eq("boat_id", boatId)
        .order("start_date", { ascending: false })

      if (eventError) {
        console.error("Események lekérdezési hiba:", eventError)
        setEvents([])
        return
      }

      const mappedEvents: EventItem[] = (eventRows ?? []).map((row: any) => {
        const type = row.type === "Edzés" || row.type === "Verseny" || row.type === "Egyéb" ? row.type : "Egyéb"
        const startDate = row.start_date ? String(row.start_date) : ""
        const endDate = row.end_date ? String(row.end_date) : ""
        const oneDay = Boolean(row.is_one_day)
        const dateValue = oneDay ? formatEventDate(startDate) : `${formatEventDate(startDate)} – ${formatEventDate(endDate)}`

        return {
          id: String(row.id),
          title: row.title,
          date: dateValue,
          location: row.location,
          type,
          details: row.notes || "Nincs megjegyzés.",
          startDate,
          endDate,
          oneDay,
          participants: [],
        }
      })

      const eventIds = mappedEvents.map((event) => event.id)
      if (eventIds.length === 0) {
        setEvents([])
        return
      }

      const { data: attendeeRows, error: attendeeError } = await supabase
        .from("boat_event_attendees")
        .select("event_id, user_id, status")
        .in("event_id", eventIds)

      if (attendeeError) {
        console.error("Esemény résztvevők lekérdezési hiba:", attendeeError)
        setEvents(mappedEvents)
        return
      }

      const userIds = Array.from(new Set((attendeeRows ?? []).map((row: any) => row.user_id).filter(Boolean)))
      const profilesByUserId = new Map<string, any>()

      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("users")
          .select("id, full_name, avatar_url")
          .in("id", userIds)

        ;(profileRows ?? []).forEach((profile: any) => {
          if (profile?.id) {
            profilesByUserId.set(profile.id, profile)
          }
        })
      }

      const attendeesByEventId = new Map<string, { userId: string; name: string; avatar: string; status: "confirmed" | "pending" | "declined" }[]>()
      ;(attendeeRows ?? []).forEach((row: any) => {
        const profile = row.user_id ? profilesByUserId.get(row.user_id) : null
        const status = row.status === "pending" || row.status === "declined" || row.status === "confirmed" ? row.status : "confirmed"
        const attendee = {
          userId: row.user_id ? String(row.user_id) : "",
          name: profile?.full_name || "Résztvevő",
          avatar: resolveAvatarUrl(profile),
          status,
        }

        const current = attendeesByEventId.get(String(row.event_id)) ?? []
        attendeesByEventId.set(String(row.event_id), [...current, attendee])
      })

      const nextEvents = mappedEvents.map((event) => ({
        ...event,
        participants: attendeesByEventId.get(event.id) ?? [],
      }))

      setEvents(nextEvents)
    }

    const fetchListings = async (boatId: string) => {
      setLoadingListings(true)
      // Először próbáljunk egy egyszerűbb lekérdezést
      const { data: adsData, error: adsError } = await supabase
        .from("ads")
        .select("*")
        .eq("boat_id", boatId)
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

      const visibleAds = (adsData ?? []).filter((ad: any) => !ad.is_active || isAdVisibleByDate(ad))

      if (visibleAds.length > 0) {
        const mapped: Listing[] = visibleAds.map((ad: any) => ({
          id: ad.id,
          event: ad.title,
          location: ad.location,
          date: ad.date_text,
          isActive: ad.is_active !== false,
          positions: (ad.positions ?? []).map((p: unknown) => formatPositionLabel(p)),
          applicants: [],
        }))

        mapped.sort((a, b) => Number(b.isActive) - Number(a.isActive))

        setListings((prev) => {
          const previousById = new Map(prev.map((listing) => [listing.id, listing]))
          return mapped.map((listing) => ({
            ...listing,
            applicants: previousById.get(listing.id)?.applicants ?? [],
          }))
        })

        setSelectedId((prev) => {
          if (prev && mapped.some((listing) => listing.id === prev)) {
            return prev
          }
          const firstActive = mapped.find((listing) => listing.isActive)
          return firstActive?.id ?? mapped[0]?.id ?? ""
        })

        // Pending számok lekérése az összes hirdetéshez
        const adIds = visibleAds.map((ad: any) => ad.id)
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
      let data: any[] | null = null
      let error: any = null

      const withMessageQuery = await supabase
        .from("applications")
        .select("id, user_id, status, message")
        .eq("ad_id", activeListingId)
        .order("created_at", { ascending: false })

      if (withMessageQuery.error) {
        const messageColumnMissing =
          String(withMessageQuery.error.code ?? "") === "42703" ||
          /message/i.test(withMessageQuery.error.message ?? "")

        if (!messageColumnMissing) {
          error = withMessageQuery.error
        } else {
          const withoutMessageQuery = await supabase
            .from("applications")
            .select("id, user_id, status")
            .eq("ad_id", activeListingId)
            .order("created_at", { ascending: false })

          data = withoutMessageQuery.data ?? null
          error = withoutMessageQuery.error
        }
      } else {
        data = withMessageQuery.data ?? null
      }

      if (error) {
        console.error("Jelentkezők lekérdezési hiba:", error)
        return
      }

      if (cancelled) {
        return
      }

      const applications = (data ?? []) as Array<{
        id: string
        user_id: string
        status?: ApplicantStatus
        message?: string | null
      }>
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
          userId: String(application.user_id),
          name: userData?.full_name ?? "Ismeretlen jelentkező",
          age: birthdateValue ? calculateAge(String(birthdateValue)) : undefined,
          phone: userData?.phone ?? "Nincs megadva",
          email: userData?.email ?? "Nincs megadva",
          avatar: resolveAvatarUrl(userData),
          applicationMessage:
            typeof application.message === "string" && application.message.trim().length > 0
              ? application.message.trim()
              : null,
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
  const [boatModalMode, setBoatModalMode] = useState<"create" | "edit">("create")

  const selected = useMemo(
    () =>
      listings.find((l) => l.id === selectedId) ??
      listings[0] ??
      ({ id: "", event: "Nincs hirdetés", location: "", date: "", isActive: true, positions: [], applicants: [] } as Listing),
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

  function openListingModalFromEvent(event: EventItem) {
    setListingPrefill({
      title: event.title,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      oneDay: event.oneDay,
    })
    openModal("listing")
  }

  async function handleInviteTeamMember(inviteEmailOverride?: string) {
    const trimmed = (inviteEmailOverride ?? newTeamMemberEmail).trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return
    }

    if (!boat?.id || !user) {
      setTeamError("A meghíváshoz előbb a hajóadatoknak elkészülteknek kell lenniük.")
      return
    }

    const localPart = trimmed.split("@")[0] ?? "Csapattag"
    const fallbackName = localPart
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())

    setInviteSending(true)
    setTeamError(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("A meghívás elküldéséhez be kell jelentkezned.")
      }

      const response = await fetch("/api/boat-team/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          boatId: boat.id,
          email: trimmed,
          invitedName: fallbackName,
        }),
      })

      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        sent?: boolean
      }

      if (!response.ok || !payload.ok || !payload.sent) {
        throw new Error(payload.error || "A meghívás elküldése sikertelen.")
      }

      if (inviteEmailOverride) {
        setTeamMembers((prev) =>
          prev.map((member) =>
            member.email.toLowerCase() === trimmed.toLowerCase()
              ? {
                  ...member,
                  role: "Meghívott",
                  status: "invited",
                }
              : member,
          ),
        )
      } else {
        setTeamMembers((prev) => [
          {
            id: `pending-${Date.now()}`,
            name: fallbackName,
            email: trimmed,
            role: "Meghívott",
            avatar: "/placeholder.svg",
            status: "invited",
          },
          ...prev,
        ])
        setNewTeamMemberEmail("")
      }
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "A meghívás elküldése sikertelen.")
    } finally {
      setInviteSending(false)
    }
  }

  function handleRemoveTeamMember(id: string) {
    setConfirmRemoveMemberId(id)
  }

  async function confirmRemoveTeamMember() {
    const memberId = confirmRemoveMemberId
    if (!memberId || !boat?.id) return

    setTeamError(null)

    const member = teamMembers.find((item) => item.id === memberId)
    if (!member) {
      setConfirmRemoveMemberId(null)
      return
    }

    const memberEmail = member.email?.trim().toLowerCase()
    if (!memberEmail) {
      setConfirmRemoveMemberId(null)
      setTeamError("A csapattag eltávolítása nem sikerült.")
      return
    }

    const { data: memberRows, error: lookupError } = await supabase
      .from("boat_team_members")
      .select("id")
      .eq("boat_id", boat.id)
      .eq("email", memberEmail)
      .in("status", ["invited", "active"])
      .limit(20)

    if (lookupError) {
      console.error("Csapattag keresési hiba:", lookupError)
      setTeamError("A csapattag eltávolítása nem sikerült.")
      setConfirmRemoveMemberId(null)
      return
    }

    const matchedMemberId = memberRows?.[0]?.id ?? memberId

    const { error } = await supabase
      .from("boat_team_members")
      .update({ status: "removed" })
      .eq("id", matchedMemberId)
      .eq("boat_id", boat.id)
      .in("status", ["invited", "active"])

    if (error) {
      console.error("Csapattag törlési hiba:", error)
      setTeamError("A csapattag eltávolítása nem sikerült.")
      setConfirmRemoveMemberId(null)
      return
    }

    await supabase
      .from("boat_team_invitations")
      .update({ status: "cancelled" })
      .eq("boat_id", boat.id)
      .eq("invitee_email", memberEmail)
      .in("status", ["pending"])

    setTeamMembers((prev) => prev.filter((item) => item.email.toLowerCase() !== memberEmail && item.id !== memberId))
    setConfirmRemoveMemberId(null)
  }

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmEventDeleteId, setConfirmEventDeleteId] = useState<string | null>(null)
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function resetNewEventForm() {
    setNewEventForm({
      type: "Verseny",
      title: "",
      startDate: "",
      endDate: "",
      oneDay: false,
      location: "",
      notes: "",
    })
  }

  function openEditEventModal(event: EventItem) {
    setEditingEventId(event.id)
    setEditEventForm({
      type: event.type,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      oneDay: event.oneDay,
      location: event.location,
      notes: event.details === "Nincs megjegyzés." ? "" : event.details,
    })
    setIsEditEventModalOpen(true)
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!boat?.id) {
      setActionError("Előbb hozzá kell adni a hajót, mielőtt eseményt mentesz.")
      return
    }

    if (!newEventForm.title.trim()) {
      setActionError("Az esemény megnevezése kötelező.")
      return
    }

    if (!newEventForm.startDate) {
      setActionError("Az esemény kezdő időpontja kötelező.")
      return
    }

    if (!newEventForm.oneDay && !newEventForm.endDate) {
      setActionError("Az esemény végdátuma kötelező, ha nem egy napos esemény.")
      return
    }

    if (!newEventForm.oneDay && newEventForm.endDate && newEventForm.endDate < newEventForm.startDate) {
      setActionError("A végdátum nem lehet korábbi, mint a kezdő dátum.")
      return
    }

    if (!newEventForm.location.trim()) {
      setActionError("A helyszín megadása kötelező.")
      return
    }

    const payload = {
      boat_id: boat.id,
      title: newEventForm.title.trim(),
      type: newEventForm.type,
      start_date: newEventForm.startDate,
      end_date: newEventForm.oneDay ? null : newEventForm.endDate || null,
      is_one_day: newEventForm.oneDay,
      location: newEventForm.location.trim(),
      notes: newEventForm.notes.trim() || "Nincs megjegyzés.",
    }

    const { data, error } = await supabase.from("boat_events").insert(payload).select().single()

    if (error) {
      console.error("Esemény mentési hiba:", error)
      setActionError("Az esemény mentése nem sikerült.")
      return
    }

    const formattedDate = payload.is_one_day
      ? formatEventDate(payload.start_date)
      : `${formatEventDate(payload.start_date)} – ${formatEventDate(payload.end_date)}`

    const createdItem: EventItem = {
      id: String(data?.id ?? `event-${Date.now()}`),
      title: data?.title ?? payload.title,
      date: formattedDate,
      location: data?.location ?? payload.location,
      type: (data?.type === "Verseny" || data?.type === "Edzés" || data?.type === "Egyéb") ? data.type : payload.type,
      details: data?.notes || payload.notes,
      startDate: String(data?.start_date ?? payload.start_date),
      endDate: data?.end_date ? String(data.end_date) : (payload.end_date ? String(payload.end_date) : ""),
      oneDay: Boolean(data?.is_one_day ?? payload.is_one_day),
      participants: [],
    }

    setEvents((prev) => [createdItem, ...prev])
    setActionNotice("Az új esemény hozzáadva.")
    setIsNewEventModalOpen(false)
    resetNewEventForm()
  }

  async function handleUpdateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingEventId) {
      return
    }

    if (!editEventForm.title.trim()) {
      setActionError("Az esemény megnevezése kötelező.")
      return
    }

    if (!editEventForm.startDate) {
      setActionError("Az esemény kezdő időpontja kötelező.")
      return
    }

    if (!editEventForm.oneDay && !editEventForm.endDate) {
      setActionError("Az esemény végdátuma kötelező, ha nem egy napos esemény.")
      return
    }

    if (!editEventForm.oneDay && editEventForm.endDate && editEventForm.endDate < editEventForm.startDate) {
      setActionError("A végdátum nem lehet korábbi, mint a kezdő dátum.")
      return
    }

    if (!editEventForm.location.trim()) {
      setActionError("A helyszín megadása kötelező.")
      return
    }

    const payload = {
      title: editEventForm.title.trim(),
      type: editEventForm.type,
      start_date: editEventForm.startDate,
      end_date: editEventForm.oneDay ? null : editEventForm.endDate || null,
      is_one_day: editEventForm.oneDay,
      location: editEventForm.location.trim(),
      notes: editEventForm.notes.trim() || "Nincs megjegyzés.",
    }

    const { data, error } = await supabase
      .from("boat_events")
      .update(payload)
      .eq("id", editingEventId)
      .select()
      .single()

    if (error) {
      console.error("Esemény frissítési hiba:", error)
      setActionError("Az esemény frissítése nem sikerült.")
      return
    }

    const nextDate = payload.is_one_day
      ? formatEventDate(payload.start_date)
      : `${formatEventDate(payload.start_date)} – ${formatEventDate(payload.end_date)}`

    setEvents((prev) =>
      prev.map((item) =>
        item.id === editingEventId
          ? {
              ...item,
              title: payload.title,
              date: nextDate,
              location: payload.location,
              type: payload.type,
              details: payload.notes,
              startDate: String(payload.start_date),
              endDate: payload.end_date ? String(payload.end_date) : "",
              oneDay: payload.is_one_day,
            }
          : item,
      ),
    )

    setActionNotice("Az esemény frissítve.")
    setIsEditEventModalOpen(false)
    setEditingEventId(null)
    setEditEventForm({
      type: "Verseny",
      title: "",
      startDate: "",
      endDate: "",
      oneDay: false,
      location: "",
      notes: "",
    })
  }

  async function deleteEvent(id: string) {
    setActionError(null)
    setActionNotice(null)

    const { error } = await supabase.from("boat_events").delete().eq("id", id)

    if (error) {
      console.error("Esemény törlési hiba:", error)
      setActionError("Az esemény törlése nem sikerült.")
      return
    }

    setEvents((prev) => prev.filter((event) => event.id !== id))
    setActionNotice("Az esemény törölve.")
    setConfirmEventDeleteId(null)
    setIsEditEventModalOpen(false)
    setEditingEventId(null)
    setEditEventForm({
      type: "Verseny",
      title: "",
      startDate: "",
      endDate: "",
      oneDay: false,
      location: "",
      notes: "",
    })
  }

  async function toggleEventParticipant(eventId: string, userId: string) {
    if (!userId) {
      return
    }

    const event = events.find((item) => item.id === eventId)
    const currentParticipant = event?.participants.find((participant) => participant.userId === userId)
    const currentStatus = currentParticipant?.status ?? "confirmed"
    const nextStatusSequence: Array<"confirmed" | "pending" | "declined"> = ["confirmed", "pending", "declined"]
    const statusIndex = nextStatusSequence.indexOf(currentStatus)
    const nextStatus = statusIndex === -1 ? "confirmed" : nextStatusSequence[(statusIndex + 1) % nextStatusSequence.length]
    const matchingMember = teamMembers.find((member) => member.userId === userId)

    if (!currentParticipant) {
      const { error } = await supabase.from("boat_event_attendees").upsert(
        {
          event_id: eventId,
          user_id: userId,
          status: nextStatus,
        },
        { onConflict: "event_id,user_id" },
      )

      if (error) {
        console.error("Esemény résztvevő hozzáadási hiba:", error)
        setActionError("A résztvevő hozzáadása nem sikerült.")
        return
      }

      setEvents((prev) =>
        prev.map((item) => {
          if (item.id !== eventId) {
            return item
          }

          return {
            ...item,
            participants: [...item.participants, {
              userId,
              name: matchingMember?.name || "Résztvevő",
              avatar: matchingMember?.avatar || "/placeholder.svg",
              status: nextStatus,
              source: matchingMember ? "team" : "listing",
            }],
          }
        }),
      )
      setActionNotice("A résztvevő hozzáadva az eseményhez.")
      return
    }

    const { error } = await supabase
      .from("boat_event_attendees")
      .update({ status: nextStatus })
      .eq("event_id", eventId)
      .eq("user_id", userId)

    if (error) {
      console.error("Esemény résztvevő státusz frissítési hiba:", error)
      setActionError("A résztvevő státuszának frissítése nem sikerült.")
      return
    }

    setEvents((prev) =>
      prev.map((item) =>
        item.id === eventId
          ? {
              ...item,
              participants: item.participants.map((participant) =>
                participant.userId === userId ? { ...participant, status: nextStatus } : participant,
              ),
            }
          : item,
      ),
    )
    setActionNotice("A résztvevő státusza frissítve.")
  }

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

    setListings((prev) =>
      prev.map((listing) => (listing.id === id ? { ...listing, isActive: false } : listing)),
    )
    setActionNotice("A hirdetés lezárva. Már nem látható a böngészésben, de itt visszanézhető.")
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
      setStatusSaving((prev) => ({ ...prev, [id]: false }))
      return
    }

    setActionNotice(status === "accepted" ? "Jelentkezés elfogadva." : "Jelentkezés elutasítva.")
    setStatusSaving((prev) => ({ ...prev, [id]: false }))
  }

  async function addAcceptedApplicantToEvent(applicantId: string) {
    const applicant = selected.applicants.find((item) => item.id === applicantId)
    if (!applicant || !applicant.userId || !selected.id) {
      setActionError("A jelentkező adatainak hozzáadása nem lehetséges.")
      return
    }

    const matchingEvent = events.find((event) => isMatchingListingToEvent(selected, event))
    if (!matchingEvent) {
      setActionError("Ehhez a hirdetéshez nincs megfelelő esemény, ezért a jelentkező nem adható hozzá.")
      return
    }

    const { error: attendeeError } = await supabase
      .from("boat_event_attendees")
      .upsert(
        {
          event_id: matchingEvent.id,
          user_id: applicant.userId,
          status: "confirmed",
        },
        { onConflict: "event_id,user_id" },
      )

    if (attendeeError) {
      console.error("Elfogadott jelentkező eseményhez kötése hiba:", attendeeError)
      setActionError("A jelentkező hozzáadása az eseményhez nem sikerült.")
      return
    }

    setEvents((prev) =>
      prev.map((eventItem) => {
        if (eventItem.id !== matchingEvent.id) {
          return eventItem
        }

        const existing = eventItem.participants.find((participant) => participant.userId === applicant.userId)

        return {
          ...eventItem,
          participants: existing
            ? eventItem.participants.map((participant) =>
                participant.userId === applicant.userId
                  ? { ...participant, status: "confirmed", source: "listing" }
                  : participant,
              )
            : [
                ...eventItem.participants,
                {
                  userId: applicant.userId,
                  name: applicant.name,
                  avatar: applicant.avatar || "/placeholder.svg",
                  status: "confirmed",
                  source: "listing",
                },
              ],
        }
      }),
    )

    setActionNotice(`${applicant.name} hozzáadva az eseményhez.`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
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
                <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground">
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
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-accent" aria-hidden="true" />
                      Max létszám: {boat?.max_crew_size ?? "—"} fő
                    </span>
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-accent" aria-hidden="true" />
                      Csapat jellege: {resolveCrewTypeLabel(boat?.team_type)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    onClick={() => {
                      setBoatModalMode("edit")
                      setIsBoatModalOpen(true)
                    }}
                    className="h-11 bg-accent! text-accent-foreground! hover:bg-accent/90!"
                  >
                    <PencilLine className="h-4 w-4" aria-hidden="true" />
                    Hajó adatai szerkesztése
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-10" aria-labelledby="team-section">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="team-section" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Csapatom
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A hajóhoz rendelt alapcsapat tagjai és a meghívások.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                type="email"
                value={newTeamMemberEmail}
                onChange={(event) => setNewTeamMemberEmail(event.target.value)}
                placeholder="email@pelda.hu"
                className="h-11 flex-1 border-border bg-background"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleInviteTeamMember()}
                disabled={inviteSending}
                className="h-11 border-border bg-background text-foreground hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {inviteSending ? "Meghívás..." : "Meghívás"}
              </Button>
            </div>

            {teamError ? (
              <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {teamError}
              </div>
            ) : null}

            {teamLoading ? (
              <div className="mt-4 text-sm text-muted-foreground">Csapattagok betöltése...</div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {teamMembers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-4 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
                  Még nincs tag a csapatban.
                </div>
              ) : (
                teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-all ${
                      member.status === "active"
                        ? "border-accent/50 bg-accent/5 shadow-sm ring-1 ring-accent/20"
                        : "border-border bg-secondary/20"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-card">
                        <Image
                          src={member.avatar || "/placeholder.svg"}
                          alt={member.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{member.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        <p className="text-[11px] text-muted-foreground/90">{member.role}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {member.status === "invited" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-dashed border-border bg-background px-2 text-[11px] text-foreground hover:bg-secondary/70"
                          onClick={() => void handleInviteTeamMember(member.email)}
                        >
                          Újraküldés
                        </Button>
                      ) : null}

                      <button
                        type="button"
                        aria-label={`Eltávolítás: ${member.name}`}
                        title="Eltávolítás"
                        onClick={() => handleRemoveTeamMember(member.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mb-10" aria-labelledby="events">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="events" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Események
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Versenyek, edzések és egyéb hajóhoz kapcsolódó programok.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 border-dashed border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100/80"
              onClick={() => {
                resetNewEventForm()
                setIsNewEventModalOpen(true)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Új esemény hozzáadása
            </Button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {events.length === 0 ? (
              <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20">
                  <CalendarDays className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">Még nincsenek eseményeid</h3>
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                    Hozz létre versenyeket, edzéseket vagy egyéb hajózási programokat, majd itt nyomon követheted a csapattagok részvételét.
                  </p>
                </div>
                <Button
                  type="button"
                  className="h-10 bg-accent! text-accent-foreground! hover:bg-accent/90!"
                  onClick={() => {
                    resetNewEventForm()
                    setIsNewEventModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Új esemény hozzáadása
                </Button>
              </div>
            ) : (
              <>
                <div className="hidden border-b border-border bg-secondary/40 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[minmax(0,2.5fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_120px]">
                  <span>Esemény</span>
                  <span>Időpont</span>
                  <span>Helyszín</span>
                  <span>Résztvevők</span>
                  <span className="text-right">Műveletek</span>
                </div>

                {events.map((event) => {
              const isExpanded = expandedEventId === event.id
              const visibleParticipants = event.participants.filter((participant) => participant.status !== "declined")

              return (
                <div key={event.id} className="border-b border-border last:border-b-0">
                  <div
                    className={`grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,2.5fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_120px] md:items-center ${
                      isExpanded ? "bg-secondary/25" : "bg-transparent hover:bg-secondary/20"
                    }`}
                    onClick={() => setExpandedEventId((prev) => (prev === event.id ? null : event.id))}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault()
                        setExpandedEventId((prev) => (prev === event.id ? null : event.id))
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-400/20">
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-base font-semibold text-foreground">{event.title}</span>
                          <Badge className={getEventTypeBadgeClass(event.type)}>{event.type}</Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground md:hidden">
                          <span>{event.date}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground md:text-sm">{event.date}</div>
                    <div className="text-sm text-muted-foreground md:text-sm">{event.location}</div>
                    <div className="flex min-h-8 items-center gap-2">
                      {visibleParticipants.length === 0 ? (
                        <span className="text-xs text-muted-foreground/70">Nincs még résztvevő</span>
                      ) : (
                        <>
                          <div className="flex -space-x-2">
                            {visibleParticipants.slice(0, 3).map((participant) => (
                              <span
                                key={`${event.id}-${participant.name}-${participant.avatar}`}
                                className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-secondary shadow-sm"
                                title={participant.name}
                              >
                                <Image
                                  src={participant.avatar || "/placeholder.svg"}
                                  alt={participant.name}
                                  width={32}
                                  height={32}
                                  className="object-cover"
                                />
                              </span>
                            ))}
                          </div>
                          {visibleParticipants.length > 3 ? (
                            <span className="text-xs font-medium text-muted-foreground">+{visibleParticipants.length - 3}</span>
                          ) : null}
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        title="Szerkesztés"
                        aria-label={`Esemény szerkesztése: ${event.title}`}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          openEditEventModal(event)
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-secondary/80 text-foreground transition-colors hover:border-cyan-400 hover:text-cyan-600"
                      >
                        <PencilLine className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title="Hirdetés feladása"
                        aria-label={`Hirdetés feladása az ${event.title} eseményhez`}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          openListingModalFromEvent(event)
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300 bg-cyan-50 text-cyan-700 transition-colors hover:bg-cyan-500 hover:text-white"
                      >
                        <Megaphone className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={isExpanded ? "Esemény összecsukása" : "Esemény kinyitása"}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          setExpandedEventId((prev) => (prev === event.id ? null : event.id))
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-secondary/60 hover:text-foreground"
                      >
                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90 text-cyan-600" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-border/70 bg-transparent px-4 py-4">
                      <div className="mb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Esemény részletei
                        </p>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-foreground">{event.details}</p>

                        {(() => {
                          const relatedListing = listings.find((listing) => isMatchingListingToEvent(listing, event))

                          const hasActiveListing = Boolean(relatedListing && relatedListing.isActive)
                          const applicantCount = relatedListing?.applicants.length ?? 0
                          const acceptedCount = relatedListing?.applicants.filter((applicant) => (statuses[applicant.id] ?? "pending") === "accepted").length ?? 0
                          const pendingCount = relatedListing?.applicants.filter((applicant) => (statuses[applicant.id] ?? "pending") === "pending").length ?? 0
                          const rejectedCount = relatedListing?.applicants.filter((applicant) => (statuses[applicant.id] ?? "pending") === "rejected").length ?? 0

                          return (
                            <div className={`grid gap-2 ${hasActiveListing ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                              {hasActiveListing ? (
                                <div className="rounded-lg border border-border bg-background/80 p-2.5">
                                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Hirdetés</p>
                                  <div className="mt-1.5 flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-foreground">Aktív</span>
                                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-2.5 sm:col-span-2">
                                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Hirdetés</p>
                                  <div className="mt-1.5 flex items-center justify-between gap-3">
                                    <p className="text-xs text-muted-foreground">Még nincs aktív hirdetés ehhez az eseményhez.</p>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation()
                                        openListingModalFromEvent(event)
                                      }}
                                    >
                                      Hirdetés létrehozása
                                    </Button>
                                  </div>
                                </div>
                              )}

                              <div className="rounded-lg border border-border bg-background/80 p-2.5">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Jelentkezők</p>
                                <p className="mt-1.5 text-base font-bold text-foreground">{applicantCount}</p>
                              </div>

                              <div className="rounded-lg border border-border bg-background/80 p-2.5">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Elfogadva</p>
                                <p className="mt-1.5 text-base font-bold text-foreground">{acceptedCount}</p>
                              </div>
                            </div>
                          )
                        })()}

                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Csapattagok és részvétel
                          </p>

                          {(() => {
                            const rosterMembers = [
                              ...teamMembers
                                .filter((member) => member.userId)
                                .map((member) => ({
                                  id: member.userId,
                                  name: member.name,
                                  avatar: member.avatar,
                                  participant: visibleParticipants.find((item) => item.userId === member.userId),
                                  source: "team" as const,
                                })),
                              ...visibleParticipants
                                .filter(
                                  (participant) =>
                                    !teamMembers.some((member) => member.userId === participant.userId),
                                )
                                .map((participant) => ({
                                  id: participant.userId,
                                  name: participant.name,
                                  avatar: participant.avatar,
                                  participant,
                                  source: participant.source ?? ("listing" as const),
                                })),
                            ]

                            if (rosterMembers.length === 0) {
                              return <p className="text-sm text-muted-foreground">Még nincs csapattag a hajón.</p>
                            }

                            return (
                              <div className="flex flex-wrap gap-2">
                                {rosterMembers.map((person) => {
                                  const status = person.participant?.status ?? "declined"
                                  const chipClasses = {
                                    confirmed: "border-emerald-300 bg-emerald-50 text-emerald-700",
                                    pending: "border-amber-300 bg-amber-50 text-amber-700",
                                    declined: "border-border bg-secondary/40 text-muted-foreground",
                                  }
                                  const statusLabel = {
                                    confirmed: "Jelentkezett",
                                    pending: "Várakozik",
                                    declined: "Nincs megadva",
                                  }[status]
                                  const isListingOrigin = person.source === "listing" || person.participant?.source === "listing"

                                  return (
                                    <button
                                      key={`${event.id}-${person.id}`}
                                      type="button"
                                      onClick={(clickEvent) => {
                                        clickEvent.stopPropagation()
                                        if (person.id) {
                                          void toggleEventParticipant(event.id, person.id)
                                        }
                                      }}
                                      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${chipClasses[status]}`}
                                      title={`${person.name} — ${statusLabel}`}
                                    >
                                      <span className="relative flex h-6 w-6 shrink-0 overflow-hidden rounded-full border border-current/30 bg-white/70">
                                        <Image
                                          src={person.avatar || "/placeholder.svg"}
                                          alt={person.name}
                                          fill
                                          className="object-cover"
                                          sizes="24px"
                                        />
                                      </span>
                                      <span>{person.name}</span>
                                      <span className="rounded-full border border-current/20 bg-white/80 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]">
                                        {status === "confirmed" ? "✓" : status === "pending" ? "…" : "+"}
                                      </span>
                                      {isListingOrigin ? (
                                        <span className="rounded-full border border-current/20 bg-white/80 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]">
                                          Hirdetés
                                        </span>
                                      ) : null}
                                      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] opacity-80">
                                        {statusLabel}
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
              </>
            )}
          </div>
        </section>

        {/* SECTION B + C */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* SECTION B: Listings */}
          <section className="lg:col-span-2" aria-labelledby="active-listings">
            <h2 id="active-listings" className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Hirdetéseim
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
                        {!listing.isActive ? (
                          <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">
                            Archivált
                          </Badge>
                        ) : null}
                        {count > 0 && (
                          <Badge className="bg-accent text-accent-foreground hover:bg-accent">
                            {count} új jelentkező
                          </Badge>
                        )}
                        <button
                          type="button"
                          aria-label="Hirdetés lezárása"
                          title="Hirdetés lezárása"
                          disabled={archivingId === listing.id || !listing.isActive}
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmArchiveId(listing.id)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label="Hirdetés törlése"
                          title="Hirdetés törlése"
                          disabled={deletingId === listing.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteId(listing.id)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
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

                    <div className="rounded-lg border border-border/70 bg-secondary/35 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Jelentkező üzenete
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-foreground">
                        {applicant.applicationMessage ?? "Nem írt külön üzenetet a jelentkezéshez."}
                      </p>
                    </div>

                    {status === "accepted" && (
                      <div className="flex flex-col gap-3 rounded-lg border border-emerald-600/20 bg-emerald-50 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
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

                        <div className="flex items-center justify-end">
                          <Button
                            size="sm"
                            onClick={() => void addAcceptedApplicantToEvent(applicant.id)}
                            className="h-9 bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                            Jelentkező hozzáadása az eseményhez
                          </Button>
                        </div>
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
        mode={boatModalMode}
        existingBoat={boat}
        onOpenChange={(open) => {
          setIsBoatModalOpen(open)
          if (!open) {
            setBoatModalMode("create")
          }
        }}
        onBoatSaved={(savedBoat) => {
          setBoat(savedBoat)
          setHasBoat(true)
        }}
        user={user}
      />

      <Dialog open={!!confirmEventDeleteId} onOpenChange={(open) => { if (!open) setConfirmEventDeleteId(null) }}>
        <DialogContent className="max-w-sm gap-0 rounded-2xl p-0">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Esemény törlése
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                Biztosan törölni szeretnéd az eseményt? A törlés végleges, és a hozzá tartozó résztvevő adatok is eltűnnek.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmEventDeleteId(null)}
              >
                Mégse
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => confirmEventDeleteId && void deleteEvent(confirmEventDeleteId)}
              >
                Igen, törlöm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={!!confirmRemoveMemberId} onOpenChange={(open) => { if (!open) setConfirmRemoveMemberId(null) }}>
        <DialogContent className="max-w-sm gap-0 rounded-2xl p-0">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Tag eltávolítása
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                {(() => {
                  const member = teamMembers.find((item) => item.id === confirmRemoveMemberId)
                  return member
                    ? `Biztosan törölni akarod a csapatból ezt a személyt: ${member.name}?`
                    : "Biztosan törölni akarod ezt a személyt a csapatból?"
                })()}
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmRemoveMemberId(null)}
              >
                Mégse
              </Button>
              <Button
                className="flex-1 bg-destructive! text-white! hover:bg-destructive/90!"
                onClick={confirmRemoveTeamMember}
              >
                Igen, törlöm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewEventModalOpen} onOpenChange={(open) => {
        setIsNewEventModalOpen(open)
        if (!open) {
          resetNewEventForm()
        }
      }}>
        <DialogContent className="max-w-2xl rounded-2xl p-0">
          <form onSubmit={handleCreateEvent} className="flex flex-col gap-0">
            <div className="border-b border-border px-6 py-5">
              <DialogHeader className="gap-2">
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                  Új esemény hozzáadása
                </DialogTitle>
                <DialogDescription className="text-pretty leading-relaxed">
                  Add meg az esemény alapadatait, hogy később csapattagokat és hirdetéseket tudj kapcsolni hozzá.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="event-type">Esemény típusa</Label>
                <select
                  id="event-type"
                  value={newEventForm.type}
                  onChange={(event) => setNewEventForm((prev) => ({ ...prev, type: event.target.value as EventItem["type"] }))}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent"
                >
                  <option value="Verseny">Verseny</option>
                  <option value="Edzés">Edzés</option>
                  <option value="Egyéb">Egyéb</option>
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="event-title">Esemény megnevezése</Label>
                <Input
                  id="event-title"
                  value={newEventForm.title}
                  onChange={(event) => setNewEventForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Pl. Balaton-felvezető verseny"
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="event-start-date">Kezdő időpont</Label>
                <Input
                  id="event-start-date"
                  type="date"
                  value={newEventForm.startDate}
                  onChange={(event) => setNewEventForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="event-end-date">Végdátum</Label>
                <Input
                  id="event-end-date"
                  type="date"
                  value={newEventForm.endDate}
                  onChange={(event) => setNewEventForm((prev) => ({ ...prev, endDate: event.target.value }))}
                  className="h-11"
                  disabled={newEventForm.oneDay}
                />
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  id="event-one-day"
                  type="checkbox"
                  checked={newEventForm.oneDay}
                  onChange={(event) =>
                    setNewEventForm((prev) => ({
                      ...prev,
                      oneDay: event.target.checked,
                      endDate: event.target.checked ? "" : prev.endDate,
                    }))
                  }
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                />
                <Label htmlFor="event-one-day" className="cursor-pointer text-sm text-foreground">
                  Egy napos esemény
                </Label>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="event-location">Helyszín</Label>
                <Input
                  id="event-location"
                  value={newEventForm.location}
                  onChange={(event) => setNewEventForm((prev) => ({ ...prev, location: event.target.value }))}
                  placeholder="Pl. Balatonfüred, Déli kikötő"
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="event-notes">Megjegyzés</Label>
                <textarea
                  id="event-notes"
                  value={newEventForm.notes}
                  onChange={(event) => setNewEventForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Írj ide további részleteket, utasításokat vagy információkat..."
                  rows={6}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setIsNewEventModalOpen(false)}>
                Mégse
              </Button>
              <Button type="submit" className="bg-accent! text-accent-foreground! hover:bg-accent/90!">
                Esemény mentése
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditEventModalOpen} onOpenChange={(open) => {
        setIsEditEventModalOpen(open)
        if (!open) {
          setEditingEventId(null)
          setEditEventForm({
            type: "Verseny",
            title: "",
            startDate: "",
            endDate: "",
            oneDay: false,
            location: "",
            notes: "",
          })
        }
      }}>
        <DialogContent className="max-w-2xl rounded-2xl p-0">
          <form onSubmit={handleUpdateEvent} className="flex flex-col gap-0">
            <div className="border-b border-border px-6 py-5">
              <DialogHeader className="gap-2">
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                  Esemény szerkesztése
                </DialogTitle>
                <DialogDescription className="text-pretty leading-relaxed">
                  Módosítsd az esemény adatait és a részleteket.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="edit-event-type">Esemény típusa</Label>
                <select
                  id="edit-event-type"
                  value={editEventForm.type}
                  onChange={(event) => setEditEventForm((prev) => ({ ...prev, type: event.target.value as EventItem["type"] }))}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent"
                >
                  <option value="Verseny">Verseny</option>
                  <option value="Edzés">Edzés</option>
                  <option value="Egyéb">Egyéb</option>
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="edit-event-title">Esemény megnevezése</Label>
                <Input
                  id="edit-event-title"
                  value={editEventForm.title}
                  onChange={(event) => setEditEventForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-event-start-date">Kezdő időpont</Label>
                <Input
                  id="edit-event-start-date"
                  type="date"
                  value={editEventForm.startDate}
                  onChange={(event) => setEditEventForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-event-end-date">Végdátum</Label>
                <Input
                  id="edit-event-end-date"
                  type="date"
                  value={editEventForm.endDate}
                  onChange={(event) => setEditEventForm((prev) => ({ ...prev, endDate: event.target.value }))}
                  className="h-11"
                  disabled={editEventForm.oneDay}
                />
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  id="edit-event-one-day"
                  type="checkbox"
                  checked={editEventForm.oneDay}
                  onChange={(event) =>
                    setEditEventForm((prev) => ({
                      ...prev,
                      oneDay: event.target.checked,
                      endDate: event.target.checked ? "" : prev.endDate,
                    }))
                  }
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                />
                <Label htmlFor="edit-event-one-day" className="cursor-pointer text-sm text-foreground">
                  Egy napos esemény
                </Label>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="edit-event-location">Helyszín</Label>
                <Input
                  id="edit-event-location"
                  value={editEventForm.location}
                  onChange={(event) => setEditEventForm((prev) => ({ ...prev, location: event.target.value }))}
                  className="h-11"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="edit-event-notes">Megjegyzés</Label>
                <textarea
                  id="edit-event-notes"
                  value={editEventForm.notes}
                  onChange={(event) => setEditEventForm((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={6}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
              <Button
                type="button"
                variant="destructive"
                onClick={() => editingEventId && setConfirmEventDeleteId(editingEventId)}
                className="h-9"
              >
                Esemény törlése
              </Button>

              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => setIsEditEventModalOpen(false)}>
                  Mégse
                </Button>
                <Button type="submit" className="bg-accent! text-accent-foreground! hover:bg-accent/90!">
                  Mentés
                </Button>
              </div>
            </div>
          </form>
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
        prefill={listingPrefill}
        onListingCreated={() => {
          setListingPrefill(null)
          setListingsRefreshKey((prev) => prev + 1)
        }}
      />

      <SiteFooter />
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
  mode,
  existingBoat,
  onOpenChange,
  onBoatSaved,
  user,
}: {
  open: boolean
  mode: "create" | "edit"
  existingBoat: Boat | null
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
  const [isOptimizingImage, setIsOptimizingImage] = useState(false)
  const [errors, setErrors] = useState<{
    name?: string
    type?: string
    harbor?: string
    crewSize?: string
    crewType?: string
    boatPhoto?: string
    submit?: string
  }>({})

  useEffect(() => {
    if (!open) return

    if (mode === "edit" && existingBoat) {
      setName(existingBoat.name ?? "")
      setType(existingBoat.type ?? "")
      setHarbor(existingBoat.harbor ?? "")
      setCrewSize(existingBoat.max_crew_size ?? "")
      setCrewType(existingBoat.team_type ?? "")
      setBoatPhoto(null)
      setErrors({})
      return
    }

    setName("")
    setType("")
    setHarbor("")
    setCrewSize("")
    setCrewType("")
    setBoatPhoto(null)
    setErrors({})
  }, [open, mode, existingBoat])

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

    if (mode !== "edit" && !boatPhoto) {
      newErrors.boatPhoto = "Hajó fotó feltöltése kötelező."
    }

    if (boatPhoto && boatPhoto.size > MAX_BOAT_IMAGE_UPLOAD_SIZE_BYTES) {
      newErrors.boatPhoto = "A kép túl nagy. Maximum 12 MB méretű fájl tölthető fel."
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
      let imageUrl: string | null = existingBoat?.image_url ?? null
      if (boatPhoto) {
        setIsOptimizingImage(true)
        const uploadFile = await optimizeBoatImage(boatPhoto)
        setIsOptimizingImage(false)

        const fileExt = uploadFile.name.split(".").pop() ?? "webp"
        const fileName = `${user?.id}-${Date.now()}.${fileExt}`
        const filePath = `boats/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from("boats")
          .upload(filePath, uploadFile)

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

      if (mode === "edit" && existingBoat) {
        const { data: updatedBoat, error: updateError } = await supabase
          .from("boats")
          .update({
            name: name.trim(),
            type: type.trim(),
            harbor: harbor.trim(),
            max_crew_size: parseInt(String(crewSizeValue), 10),
            team_type: crewType,
            image_url: imageUrl,
          })
          .eq("id", existingBoat.id)
          .select()
          .single()

        if (updateError || !updatedBoat) {
          setErrors({ submit: updateError?.message ?? "Hiba történt a hajó mentése közben." })
          return
        }

        onBoatSaved(updatedBoat)
        onOpenChange(false)
        router.push("/kapitany-dashboard")
        return
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ismeretlen hiba történt a mentés közben."
      setErrors({ submit: message })
    } finally {
      setIsOptimizingImage(false)
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
              {mode === "edit" ? "Hajó adatok szerkesztése" : "Hajó regisztrációja"}
            </DialogTitle>
            <DialogDescription className="text-pretty leading-relaxed">
              {mode === "edit"
                ? "Frissítsd a hajó adatait a meglévő profilhoz igazítva."
                : "Add meg a hajód profilját, és folytasd egy szabad hely hirdetésével."}
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
                <span className="text-xs text-muted-foreground">
                  A feltöltött kép automatikusan optimalizálva lesz a gyors betöltéshez.
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

            <Button
              type="submit"
              size="lg"
              disabled={isSaving || isOptimizingImage}
              className="mt-2 h-11 bg-accent! text-accent-foreground! hover:bg-accent/90! disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isOptimizingImage
                ? "Kép optimalizálása..."
                : isSaving
                  ? "Mentés folyamatban..."
                  : mode === "edit"
                    ? "Hajó adatok mentése"
                    : "Hajó mentése és Tovább a hirdetéshez"}
            </Button>
          </form>
        </div>
      </DialogContent>
      </Dialog>
  )
    }
