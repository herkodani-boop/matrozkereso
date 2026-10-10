"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import {
  Anchor,
  Plus,
  ShipWheel,
  MapPin,
  CalendarDays,
  Users,
  Check,
  X,
  Share2,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  UserPlus,
  Trash2,
  Archive,
  PencilLine,
  RotateCcw,
  ChevronDown,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { SiteFooter } from "@/components/site-footer"
import { isAdVisibleByDate } from "@/lib/ad-visibility"
import {
  type ApplicantStatus,
  type Applicant,
  type Listing,
  type UserProfile,
  type Boat,
  PRIMARY_BOAT,
  type EventItem,
  type TeamMember,
  levelStyles,
} from "@/components/skipper-dashboard/types"
import {
  getEventTypeBadgeClass,
  calculateAge,
  experienceLevelLabel,
  formatPositionLabel,
  normalizeMatchText,
  isMatchingListingToEvent,
  resolveAvatarUrl,
  resolveCrewTypeLabel,
  formatEventDate,
  formatListingExpiryDate,
} from "@/components/skipper-dashboard/format-utils"
import { BoatRegistrationModal } from "@/components/skipper-dashboard/boat-registration-modal"

const PAST_EVENTS_PAGE_SIZE = 10

function getTodayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

function getEventRelativeLabel(event: EventItem, todayKey: string) {
  const endKey = event.endDate || event.startDate
  if (!event.startDate || endKey < todayKey) return null
  if (event.startDate <= todayKey) return event.oneDay || event.startDate === endKey ? "Ma" : "Folyamatban"
  const dayMs = 24 * 60 * 60 * 1000
  const diff = Math.round(
    (new Date(`${event.startDate}T00:00:00`).getTime() - new Date(`${todayKey}T00:00:00`).getTime()) / dayMs,
  )
  if (diff === 1) return "Holnap"
  return diff <= 30 ? `${diff} nap múlva` : null
}

function buildEventRoster(event: EventItem, teamMembers: TeamMember[], captainId?: string) {
  const statusOrder = { confirmed: 0, pending: 1, unset: 2, declined: 3 }
  const roster = [
    ...teamMembers
      .filter((member) => member.userId)
      .map((member) => ({
        id: member.userId,
        name: member.name,
        avatar: member.avatar,
        participant: event.participants.find((item) => item.userId === member.userId),
        source: "team" as "team" | "listing" | "captain",
      })),
    ...event.participants
      .filter((participant) => !teamMembers.some((member) => member.userId === participant.userId))
      .map((participant) => ({
        id: participant.userId,
        name: participant.name,
        avatar: participant.avatar,
        participant: participant as EventItem["participants"][number] | undefined,
        source: (participant.source ?? "listing") as "team" | "listing" | "captain",
      })),
  ]

  const rank = (person: (typeof roster)[number]) =>
    person.id === captainId ? -1 : statusOrder[person.participant?.status ?? "unset"]

  return roster.sort((first, second) => rank(first) - rank(second))
}

const APPLICANT_PAGE_SIZE = 15

export function SkipperDashboard() {
  const router = useRouter()
  const [activeDashboardTab, setActiveDashboardTab] = useState<"team" | "events" | "listings">("events")
  const [listings, setListings] = useState<Listing[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [newTeamMemberEmail, setNewTeamMemberEmail] = useState("")
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [formerMembers, setFormerMembers] = useState<TeamMember[]>([])
  const currentMemberEmails = new Set(teamMembers.map((member) => member.email.toLowerCase()))
  const visibleFormerMembers = formerMembers.filter((member) => !currentMemberEmails.has(member.email.toLowerCase()))
  const [showFormerMembers, setShowFormerMembers] = useState(false)
  const [reactivatingMemberId, setReactivatingMemberId] = useState<string | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [showPastEvents, setShowPastEvents] = useState(false)
  const [pastEventsTotal, setPastEventsTotal] = useState(0)
  const [pastEventsFetched, setPastEventsFetched] = useState(0)
  const [pastEventsLoading, setPastEventsLoading] = useState(false)
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false)
  const [isEditEventModalOpen, setIsEditEventModalOpen] = useState(false)
  const [eventSaveMode, setEventSaveMode] = useState<"create" | "edit" | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
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
  const [showPreviousListings, setShowPreviousListings] = useState(false)
  const [applicantFilter, setApplicantFilter] = useState<ApplicantStatus | null>(null)
  const [applicantLimit, setApplicantLimit] = useState(APPLICANT_PAGE_SIZE)
  const [applicantSearch, setApplicantSearch] = useState("")
  const [pinnedApplicantIds, setPinnedApplicantIds] = useState<string[]>([])
  const [statuses, setStatuses] = useState<Record<string, ApplicantStatus>>({})
  const [statusSaving, setStatusSaving] = useState<Record<string, boolean>>({})
  const [participantSaving, setParticipantSaving] = useState<Record<string, boolean>>({})
  const participantMutationRef = useRef(new Set<string>())
  const applicantMutationRef = useRef(new Set<string>())
  const listingMutationRef = useRef<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [boat, setBoat] = useState<Boat | null>(null)
  const [hasBoat, setHasBoat] = useState(false)
  const [boatLoading, setBoatLoading] = useState(true)
  const [boatLoadError, setBoatLoadError] = useState<string | null>(null)
  const [eventsLoadError, setEventsLoadError] = useState<string | null>(null)
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null)
  const [removingTeamMemberId, setRemovingTeamMemberId] = useState<string | null>(null)
  const [eventApplicantToRemove, setEventApplicantToRemove] = useState<{
    eventId: string
    userId: string
    name: string
  } | null>(null)
  const [confirmRevokeApplicantId, setConfirmRevokeApplicantId] = useState<string | null>(null)

  const [loadingListings, setLoadingListings] = useState(false)
  const [listingsLoadError, setListingsLoadError] = useState<string | null>(null)
  const [pendingCountsError, setPendingCountsError] = useState<string | null>(null)
  const [applicantsLoading, setApplicantsLoading] = useState(false)
  const [applicantsLoadError, setApplicantsLoadError] = useState<string | null>(null)
  const [addingTeamMemberApplicantId, setAddingTeamMemberApplicantId] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<{ src: string; name: string } | null>(null)
  const [profileTarget, setProfileTarget] = useState<{ userId: string; name: string; avatar: string } | null>(null)
  const [profileDetails, setProfileDetails] = useState<{
    loading: boolean
    row: Record<string, any> | null
    applicationId: string | null
    applicationStatus: ApplicantStatus | null
  }>({ loading: false, row: null, applicationId: null, applicationStatus: null })
  const [listingMutatingId, setListingMutatingId] = useState<string | null>(null)
  const [pendingCountsMap, setPendingCountsMap] = useState<Record<string, number>>({})
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [teamLoadError, setTeamLoadError] = useState<string | null>(null)
  const [inviteSending, setInviteSending] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalView, setModalView] = useState<"boat" | "listing">("listing")
  const [listingPrefill, setListingPrefill] = useState<{
    eventId?: string
    title?: string
    location?: string
    startDate?: string
    endDate?: string
    oneDay?: boolean
  } | null>(null)
  const [nonce, setNonce] = useState(0)
  const [listingsRefreshKey, setListingsRefreshKey] = useState(0)

  const selectListingForApplicants = (listingId: string) => {
    setApplicantFilter(null)
    setApplicantLimit(APPLICANT_PAGE_SIZE)
    setApplicantSearch("")
    setPinnedApplicantIds([])
    setSelectedId(listingId)
  }

  const toggleListing = (listingId: string) => {
    setApplicantFilter(null)
    setApplicantLimit(APPLICANT_PAGE_SIZE)
    setApplicantSearch("")
    setPinnedApplicantIds([])
    setSelectedId((previous) => (previous === listingId ? "" : listingId))
  }

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
      setTeamLoadError(null)

      const { data, error } = await supabase
        .from("boat_team_members")
        .select("*")
        .eq("boat_id", boatId)
        .in("status", ["active", "invited"])
        .order("invited_at", { ascending: false })

      if (error) {
        console.error("Csapat tagok lekérdezési hiba:", error)
        setTeamMembers([])
        setTeamLoadError("A csapattagok betöltése nem sikerült. Próbáld újra később.")
        setTeamLoading(false)
        return
      }

      const memberRows = data ?? []
      const userIds = Array.from(new Set(memberRows.map((member: any) => member.user_id).filter(Boolean)))
      let profilesByUserId = new Map<string, any>()

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("users")
          .select("id, full_name, avatar_url, phone")
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
          phone: profile?.phone || null,
          status: resolvedStatus,
        }
      })

      setTeamMembers(mapped)

      const { data: removedRows } = await supabase
        .from("boat_team_members")
        .select("*")
        .eq("boat_id", boatId)
        .eq("status", "removed")
        .not("user_id", "is", null)
        .order("invited_at", { ascending: false })

      const currentEmails = new Set(mapped.map((member: TeamMember) => member.email.toLowerCase()))
      const removedUserIds = Array.from(new Set((removedRows ?? []).map((row: any) => row.user_id).filter(Boolean)))
      const removedProfiles = new Map<string, any>()
      if (removedUserIds.length > 0) {
        const { data: removedProfileRows } = await supabase
          .from("users")
          .select("id, full_name, avatar_url, phone")
          .in("id", removedUserIds)
        ;(removedProfileRows ?? []).forEach((profile: any) => removedProfiles.set(profile.id, profile))
      }

      const seenEmails = new Set<string>()
      const former: TeamMember[] = []
      ;(removedRows ?? []).forEach((row: any) => {
        const email = String(row.email || "").toLowerCase()
        if (!email || currentEmails.has(email) || seenEmails.has(email)) return
        seenEmails.add(email)
        const profile = row.user_id ? removedProfiles.get(row.user_id) : null
        former.push({
          id: String(row.id),
          userId: String(row.user_id),
          name: row.display_name || profile?.full_name || email.split("@")[0] || "Csapattag",
          email: row.email || "",
          role: "Korábbi tag",
          avatar: profile?.avatar_url || "/placeholder.svg",
          phone: profile?.phone || null,
          status: "invited",
        })
      })
      setFormerMembers(former)
      setTeamLoading(false)
    }

    const fetchBoat = async () => {
      setBoatLoading(true)
      setBoatLoadError(null)

      try {
        const { data: boatData, error } = await supabase
          .from("boats")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle()

        if (error) {
          throw error
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
      } catch (error) {
        console.error("Hajó lekérdezési hiba:", error)
        setBoat(null)
        setHasBoat(false)
        setBoatLoadError("A hajó adatait nem sikerült betölteni. Ellenőrizd a kapcsolatot, majd próbáld újra.")
      } finally {
        setBoatLoading(false)
      }
    }

    const fetchBoatEvents = async (boatId: string) => {
      setEventsLoadError(null)
      setShowPastEvents(false)
      setPastEventsFetched(0)
      const todayKey = getTodayKey()

      const [upcomingResult, pastCountResult] = await Promise.all([
        supabase
          .from("boat_events")
          .select("*")
          .eq("boat_id", boatId)
          .or(`end_date.gte.${todayKey},and(end_date.is.null,start_date.gte.${todayKey})`)
          .order("start_date", { ascending: true }),
        supabase
          .from("boat_events")
          .select("id", { count: "exact", head: true })
          .eq("boat_id", boatId)
          .or(`end_date.lt.${todayKey},and(end_date.is.null,start_date.lt.${todayKey})`),
      ])

      if (upcomingResult.error) {
        console.error("Események lekérdezési hiba:", upcomingResult.error)
        setEvents([])
        setPastEventsTotal(0)
        setEventsLoadError("Az eseményeket nem sikerült betölteni. Ellenőrizd a kapcsolatot, majd próbáld újra.")
        return
      }

      setPastEventsTotal(pastCountResult.count ?? 0)
      const { items, participantsFailed } = await buildEventItems(upcomingResult.data ?? [], user.id)
      setEvents(items)
      if (participantsFailed) {
        setEventsLoadError("Az események betöltődtek, de a résztvevőket nem sikerült lekérni. Próbáld újra.")
      }
    }
    const fetchListings = async (boatId: string) => {
      setLoadingListings(true)
      setListingsLoadError(null)
      setPendingCountsError(null)
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
        setListingsLoadError("A hirdetéseket nem sikerült betölteni. Ellenőrizd a kapcsolatot, majd próbáld újra.")
        setLoadingListings(false)
        return
      }

      const allAds = adsData ?? []

      if (allAds.length > 0) {
        const mapped: Listing[] = allAds.map((ad: any) => ({
          id: ad.id,
          eventId: ad.event_id ? String(ad.event_id) : null,
          commitment: ad.commitment === "szezon" ? "szezon" : "egy-verseny",
          event: ad.title,
          location: ad.location,
          date: ad.date_text,
          expiryDate: ad.commitment === "egy-verseny" ? ad.start_date ?? null : ad.commitment === "szezon" ? ad.end_date ?? null : null,
          isActive: ad.is_active !== false,
          isDeleted: ad.is_deleted === true,
          isHistorical: ad.is_deleted === true || ad.is_active === false || !isAdVisibleByDate(ad),
          positions: (ad.positions ?? []).map((p: unknown) => formatPositionLabel(p)),
          applicants: [],
        }))

        mapped.sort((a, b) => Number(a.isHistorical) - Number(b.isHistorical))

        setListings((prev) => {
          const previousById = new Map(prev.map((listing) => [listing.id, listing]))
          return mapped.map((listing) => ({
            ...listing,
            applicants: previousById.get(listing.id)?.applicants ?? [],
          }))
        })

        setSelectedId((prev) => (prev && mapped.some((listing) => listing.id === prev) ? prev : ""))

        // Pending számok lekérése az összes hirdetéshez
        const adIds = allAds.map((ad: any) => ad.id)
        const { data: pendingApps, error: pendingAppsError } = await supabase
          .from("applications")
          .select("ad_id")
          .in("ad_id", adIds)
          .eq("status", "pending")

        if (pendingAppsError) {
          console.error("Függő jelentkezések számolási hiba:", pendingAppsError)
          setPendingCountsMap({})
          setPendingCountsError("A függő jelentkezések száma nem tölthető be.")
        } else {
        const countsMap: Record<string, number> = {}
        pendingApps?.forEach((app: any) => {
          countsMap[app.ad_id] = (countsMap[app.ad_id] ?? 0) + 1
        })
        setPendingCountsMap(countsMap)
        }
      } else {
        setListings([])
        setSelectedId("")
        setPendingCountsMap({})
        setPendingCountsError(null)
      }
      setLoadingListings(false)
    }

    void fetchBoat()
  }, [user, listingsRefreshKey])

  const activeListingId = selectedId

  useEffect(() => {
    if (!activeListingId) {
      setApplicantsLoading(false)
      setApplicantsLoadError(null)
      return
    }

    let cancelled = false

    const fetchApplicants = async () => {
      setApplicantsLoading(true)
      setApplicantsLoadError(null)
      let data: any[] | null = null
      let error: any = null

      const withMessageQuery = await supabase
        .from("applications")
        .select("id, user_id, status, message, captain_contact_shared_at")
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
        if (!cancelled) {
          setApplicantsLoadError("A jelentkezőket nem sikerült betölteni. Ellenőrizd a kapcsolatot, majd próbáld újra.")
          setApplicantsLoading(false)
        }
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
        captain_contact_shared_at?: string | null
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
            level: experienceLevelLabel(userData?.level),
          contactShared: Boolean(application.captain_contact_shared_at),
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

          return {
            ...listing,
            applicants: rawApplicants.map((applicant) => ({
              ...applicant,
            })),
          }
        }),
      )

      setStatuses((prev) => ({ ...prev, ...nextStatuses }))
      setApplicantsLoading(false)
    }

    void fetchApplicants()

    return () => {
      cancelled = true
    }
  }, [activeListingId, listingsRefreshKey])

  const [isBoatModalOpen, setIsBoatModalOpen] = useState(false)
  const [boatModalMode, setBoatModalMode] = useState<"create" | "edit">("create")

  const selected = useMemo(
    () =>
      listings.find((l) => l.id === selectedId) ??
      ({ id: "", eventId: null, commitment: "egy-verseny", event: "Válassz hirdetést", location: "", date: "", expiryDate: null, isActive: true, isDeleted: false, isHistorical: false, positions: [], applicants: [] } as Listing),
    [listings, selectedId],
  )
  const applicantCounts = { pending: 0, accepted: 0, rejected: 0 }
  for (const item of selected.applicants) {
    applicantCounts[statuses[item.id] ?? "pending"] += 1
  }
  const activeApplicantFilter: ApplicantStatus =
    applicantFilter ??
    (applicantCounts.pending > 0
      ? "pending"
      : applicantCounts.accepted > 0
        ? "accepted"
        : applicantCounts.rejected > 0
          ? "rejected"
          : "pending")
  const normalizedApplicantSearch = applicantSearch.trim().toLowerCase()
  const filteredApplicants = selected.applicants.filter(
    (item) =>
      ((statuses[item.id] ?? "pending") === activeApplicantFilter || pinnedApplicantIds.includes(item.id)) &&
      (!normalizedApplicantSearch || item.name.toLowerCase().includes(normalizedApplicantSearch)),
  )
  const visibleApplicants = filteredApplicants.slice(0, applicantLimit)
  const previousListingsCount = listings.filter((listing) => listing.isHistorical).length
  const displayedListings = showPreviousListings
    ? listings
    : listings.filter((listing) => !listing.isHistorical)

  function pendingCount(listing: Listing) {
    return listing.applicants.filter((a) => (statuses[a.id] ?? "pending") === "pending").length
  }

  function openModal(
    view: "boat" | "listing",
    prefill: {
      eventId?: string
      title?: string
      location?: string
      startDate?: string
      endDate?: string
      oneDay?: boolean
    } | null = null,
  ) {
    setListingPrefill(view === "listing" ? prefill : null)
    setModalView(view)
    setNonce((n) => n + 1)
    setModalOpen(true)
  }

  function openListingModalFromEvent(event: EventItem) {
    openModal("listing", {
      eventId: event.id,
      title: event.title,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      oneDay: event.oneDay,
    })
  }

  async function handleInviteTeamMember(inviteEmailOverride?: string) {
    const trimmed = (inviteEmailOverride ?? newTeamMemberEmail).trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return
    }

    if (
      !inviteEmailOverride &&
      teamMembers.some((member) => member.status === "active" && member.email.trim().toLowerCase() === trimmed.toLowerCase())
    ) {
      setTeamError("Ez a felhasználó már aktív csapattag.")
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

      let payload: { ok?: boolean; error?: string; sent?: boolean }
      try {
        payload = (await response.json()) as { ok?: boolean; error?: string; sent?: boolean }
      } catch {
        throw new Error(
          response.status === 504
            ? "A meghívás küldése túl sokáig tartott. Próbáld újra néhány másodperc múlva."
            : "A szerver váratlan hibát adott vissza. Próbáld újra néhány másodperc múlva.",
        )
      }

      if (!response.ok || !payload.ok || !payload.sent) {
        throw new Error(payload.error || "A meghívás elküldése sikertelen.")
      }

      setFormerMembers((prev) => prev.filter((member) => member.email.toLowerCase() !== trimmed.toLowerCase()))
      if (inviteEmailOverride && teamMembers.some((member) => member.email.toLowerCase() === trimmed.toLowerCase())) {
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
            userId: "",
            name: formerMembers.find((member) => member.email.toLowerCase() === trimmed.toLowerCase())?.name ?? fallbackName,
            email: trimmed,
            role: "Meghívott",
            avatar: "/placeholder.svg",
            status: "invited",
          },
          ...prev,
        ])
        if (!inviteEmailOverride) setNewTeamMemberEmail("")
        setIsInviteModalOpen(false)
      }
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "A meghívás elküldése sikertelen.")
    } finally {
      setInviteSending(false)
    }
  }

  async function reactivateFormerMember(memberId: string) {
    const former = formerMembers.find((item) => item.id === memberId)
    if (!former || reactivatingMemberId) return

    setReactivatingMemberId(memberId)
    setTeamError(null)
    setActionNotice(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error("A csapattag hozzáadásához be kell jelentkezned.")
      }

      const response = await fetch("/api/boat-team/reactivate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ memberId }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        emailSent?: boolean
        error?: string
        member?: { id: string; user_id: string; email: string; display_name: string | null; avatar_url?: string | null; phone?: string | null }
      }

      if (!response.ok || !payload.ok || !payload.member) {
        throw new Error(payload.error || "A csapattagot nem sikerült visszaadni a csapatba.")
      }

      const restored: TeamMember = {
        ...former,
        id: payload.member.id,
        name: payload.member.display_name || former.name,
        email: payload.member.email || former.email,
        role: "Csapattag",
        avatar: payload.member.avatar_url || former.avatar,
        phone: payload.member.phone ?? former.phone ?? null,
        status: "active",
      }

      setFormerMembers((prev) => prev.filter((item) => item.id !== memberId))
      setTeamMembers((prev) => [restored, ...prev.filter((item) => item.email.toLowerCase() !== restored.email.toLowerCase())])
      setActionNotice(payload.emailSent === false
        ? `${restored.name} visszakerült a csapatba, de az értesítő email küldése nem sikerült.`
        : `${restored.name} visszakerült a csapatba.`)
    } catch (error) {
      console.error("Korábbi csapattag visszaadási hiba:", error)
      setTeamError(error instanceof Error ? error.message : "A csapattagot nem sikerült visszaadni a csapatba.")
    } finally {
      setReactivatingMemberId(null)
    }
  }

  function handleRemoveTeamMember(id: string) {
    setConfirmRemoveMemberId(id)
  }

  async function confirmRemoveTeamMember() {
    const memberId = confirmRemoveMemberId
    if (!memberId || !boat?.id || removingTeamMemberId) return

    setRemovingTeamMemberId(memberId)
    setTeamError(null)

    try {
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

      const { error: invitationCancelError } = await supabase
        .from("boat_team_invitations")
        .update({ status: "cancelled" })
        .eq("boat_id", boat.id)
        .eq("invitee_email", memberEmail)
        .in("status", ["pending"])

      setTeamMembers((prev) => prev.filter((item) => item.email.toLowerCase() !== memberEmail && item.id !== memberId))
      if (member.status === "active" && member.userId) {
        setFormerMembers((prev) => [
          { ...member, role: "Korábbi tag", status: "invited" },
          ...prev.filter((item) => item.email.toLowerCase() !== memberEmail),
        ])
      }
      setConfirmRemoveMemberId(null)

      if (invitationCancelError) {
        console.error("Csapatmeghívás visszavonási hiba:", invitationCancelError)
        setTeamError("A tag eltávolítva, de a függő meghívót nem sikerült lezárni. Frissítsd a listát, és ellenőrizd az állapotát.")
        setListingsRefreshKey((key) => key + 1)
      }
    } catch (error) {
      console.error("Csapattag eltávolítási hiba:", error)
      setTeamError("A csapattag eltávolítása nem sikerült. Ellenőrizd a kapcsolatot, majd próbáld újra.")
      setConfirmRemoveMemberId(null)
    } finally {
      setRemovingTeamMemberId(null)
    }
  }

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmEventDeleteId, setConfirmEventDeleteId] = useState<string | null>(null)
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [contactSharingId, setContactSharingId] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!actionNotice && !actionError) return

    const timeoutId = window.setTimeout(() => {
      setActionNotice(null)
      setActionError(null)
    }, actionError ? 10000 : 3000)

    return () => window.clearTimeout(timeoutId)
  }, [actionNotice, actionError])

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
    setActionError(null)

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

    if (newEventForm.startDate < getTodayKey()) {
      setActionError("Múltbeli esemény nem hozható létre.")
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

    if (eventSaveMode) return
    setEventSaveMode("create")
    try {
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
        participants: user ? [{
          userId: user.id,
          name: profile?.full_name || user.user_metadata?.full_name || user.email || "Kapitány",
          avatar: profile?.avatar_url || "/placeholder.svg",
          status: "confirmed",
          source: "captain",
        }] : [],
      }

      const todayKey = getTodayKey()
      const isUpcoming = (item: EventItem) => (item.endDate || item.startDate) >= todayKey
      setEvents((prev) => [createdItem, ...prev].sort((first, second) => {
        if (isUpcoming(first) !== isUpcoming(second)) return isUpcoming(first) ? -1 : 1
        return isUpcoming(first)
          ? first.startDate.localeCompare(second.startDate)
          : second.startDate.localeCompare(first.startDate)
      }))
      setExpandedEventId(createdItem.id)
      if (!isUpcoming(createdItem)) {
        setPastEventsTotal((total) => total + 1)
        setShowPastEvents(true)
      }
      setActiveDashboardTab("events")
      setActionNotice("Az új esemény hozzáadva.")
      setIsNewEventModalOpen(false)
      resetNewEventForm()
    } catch (error) {
      console.error("Esemény mentési hiba:", error)
      setActionError("Az esemény mentése nem sikerült. Ellenőrizd a kapcsolatot, majd próbáld újra.")
    } finally {
      setEventSaveMode(null)
    }
  }

  async function handleUpdateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)

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

    if (eventSaveMode) return
    setEventSaveMode("edit")
    try {
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

      if ((payload.end_date || payload.start_date) < getTodayKey()) {
        setPastEventsTotal((total) => total + 1)
      }
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
    } catch (error) {
      console.error("Esemény frissítési hiba:", error)
      setActionError("Az esemény frissítése nem sikerült. Ellenőrizd a kapcsolatot, majd próbáld újra.")
    } finally {
      setEventSaveMode(null)
    }
  }

  async function deleteEvent(id: string) {
    if (deletingEventId) return
    setDeletingEventId(id)
    setActionError(null)
    setActionNotice(null)

    try {
      const { error } = await supabase.from("boat_events").delete().eq("id", id)

      if (error) {
        console.error("Esemény törlési hiba:", error)
        setActionError("Az esemény törlése nem sikerült.")
        return
      }

      const deletedEvent = events.find((event) => event.id === id)
      if (deletedEvent && (deletedEvent.endDate || deletedEvent.startDate) < getTodayKey()) {
        setPastEventsTotal((total) => Math.max(0, total - 1))
        setPastEventsFetched((count) => Math.max(0, count - 1))
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
    } catch (error) {
      console.error("Esemény törlési hiba:", error)
      setActionError("Az esemény törlése nem sikerült. Ellenőrizd a kapcsolatot, majd próbáld újra.")
    } finally {
      setDeletingEventId(null)
    }
  }

  async function setEventParticipantStatus(
    eventId: string,
    userId: string,
    nextStatus: "confirmed" | "pending" | "declined" | "unset" | null,
  ): Promise<boolean> {
    if (!userId) return false

    const event = events.find((item) => item.id === eventId)
    const currentParticipant = event?.participants.find((participant) => participant.userId === userId)
    const mutationKey = `${eventId}:${userId}`

    if (!event || participantMutationRef.current.has(mutationKey)) return false
    if ((nextStatus === null && !currentParticipant) || currentParticipant?.status === nextStatus) return false

    participantMutationRef.current.add(mutationKey)
    setParticipantSaving((prev) => ({ ...prev, [mutationKey]: true }))
    setActionError(null)
    setActionNotice(null)

    try {
      const result = nextStatus === null
        ? await supabase
            .from("boat_event_attendees")
            .delete()
            .eq("event_id", eventId)
            .eq("user_id", userId)
            .select("id")
            .maybeSingle()
        : currentParticipant
        ? await supabase
            .from("boat_event_attendees")
            .update({ status: nextStatus })
            .eq("event_id", eventId)
            .eq("user_id", userId)
            .select("id")
            .maybeSingle()
        : await supabase.from("boat_event_attendees").upsert(
              {
                event_id: eventId,
                user_id: userId,
                status: nextStatus,
              },
              { onConflict: "event_id,user_id" },
            )
              .select("id")
              .maybeSingle()

      if (result.error || !result.data) {
        console.error("Esemény résztvevő státusz mentési hiba:", result.error)
        setActionError(result.error
          ? nextStatus === null
            ? "A jelentkező eltávolítása nem sikerült. Próbáld újra."
            : "A résztvevő státuszának mentése nem sikerült. Próbáld újra."
          : "A résztvevő állapota időközben megváltozott. Töltsd újra az eseményt.")
        return false
      }

      const matchingMember = teamMembers.find((member) => member.userId === userId)
      setEvents((prev) =>
        prev.map((item) => {
          if (item.id !== eventId) return item

          return {
            ...item,
            participants: nextStatus === null
              ? item.participants.filter((participant) => participant.userId !== userId)
              : currentParticipant
                ? item.participants.map((participant) =>
                    participant.userId === userId ? { ...participant, status: nextStatus } : participant,
                  )
                : [
                  ...item.participants,
                  {
                    userId,
                    name: matchingMember?.name || "Résztvevő",
                    avatar: matchingMember?.avatar || "/placeholder.svg",
                    status: nextStatus,
                    source: matchingMember ? "team" : "listing",
                  },
                ],
          }
        }),
      )
      setActionNotice(nextStatus === null ? "A jelentkező eltávolítva az eseményről." : "A részvételi státusz frissítve.")
      return true
    } catch (error) {
      console.error("Esemény résztvevő státusz mentési hiba:", error)
      setActionError(nextStatus === null
        ? "A jelentkező eltávolítása nem sikerült. Ellenőrizd a kapcsolatot, majd próbáld újra."
        : "A résztvevő státuszának mentése nem sikerült. Ellenőrizd a kapcsolatot, majd próbáld újra.")
      return false
    } finally {
      participantMutationRef.current.delete(mutationKey)
      setParticipantSaving((prev) => ({ ...prev, [mutationKey]: false }))
    }
  }

  async function deleteListing(id: string) {
    if (listingMutationRef.current || applicantMutationRef.current.size > 0) return
    listingMutationRef.current = id
    setListingMutatingId(id)
    setActionError(null)
    setActionNotice(null)
    setDeletingId(id)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("A hirdetés visszavonásához be kell jelentkezned.")
      }

      const response = await fetch("/api/listings/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ listingId: id, isDeleted: true }),
      })
      const result = (await response.json()) as { id?: string; error?: string }

      if (!response.ok || !result.id) {
        throw new Error(result.error || "A hirdetés visszavonása nem sikerült.")
      }

      setListings((prev) =>
        prev.map((listing) =>
          listing.id === id
            ? { ...listing, isActive: false, isDeleted: true, isHistorical: true }
            : listing,
        ),
      )
      setActionNotice("A hirdetés visszavonva. A hozzá tartozó jelentkezések megmaradtak.")
      setConfirmDeleteId(null)
    } catch (error) {
      console.error("Hirdetés visszavonási hiba:", error)
      setActionError(error instanceof Error ? error.message : "A hirdetés visszavonása nem sikerült.")
    } finally {
      setDeletingId(null)
      listingMutationRef.current = null
      setListingMutatingId(null)
    }
  }

  async function archiveListing(id: string) {
    if (listingMutationRef.current || applicantMutationRef.current.size > 0) return
    listingMutationRef.current = id
    setListingMutatingId(id)
    setActionError(null)
    setActionNotice(null)
    setArchivingId(id)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("A lezáráshoz be kell jelentkezned.")
      }

      const response = await fetch("/api/listings/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ listingId: id }),
      })
      const result = (await response.json()) as { id?: string; error?: string }

      if (!response.ok || !result.id) {
        throw new Error(result.error || "A hirdetés lezárása nem sikerült.")
      }

      setListings((prev) =>
        prev.map((listing) =>
          listing.id === id ? { ...listing, isActive: false, isHistorical: true } : listing,
        ),
      )
      setActionNotice("A hirdetés lezárva. Már nem látható a böngészésben, de itt visszanézhető.")
      setConfirmArchiveId(null)
    } catch (error) {
      console.error("Hirdetés lezárási hiba:", error)
      setActionError(
        error instanceof Error
          ? error.message
          : "A hirdetés lezárása nem sikerült. Ellenőrizd a kapcsolatot, majd próbáld újra.",
      )
    } finally {
      setArchivingId(null)
      listingMutationRef.current = null
      setListingMutatingId(null)
    }
  }

  async function decide(id: string, status: ApplicantStatus) {
    if (selected.isHistorical || listingMutationRef.current === selected.id || applicantMutationRef.current.has(id)) return
    applicantMutationRef.current.add(id)
    setApplicantFilter(activeApplicantFilter)
    setPinnedApplicantIds((previous) => (previous.includes(id) ? previous : [...previous, id]))
    setActionError(null)
    setActionNotice(null)
    const previousStatus = statuses[id] ?? "pending"
    const isRevokingAcceptedContact = status === "pending" && previousStatus === "accepted"
    const isReopeningRejectedApplication = status === "pending" && previousStatus === "rejected"
    const expectedStatus = status === "pending" ? previousStatus : "pending"

    if (status === "pending"
      ? !isRevokingAcceptedContact && !isReopeningRejectedApplication
      : previousStatus !== expectedStatus) {
      applicantMutationRef.current.delete(id)
      setActionError("A jelentkezés állapota időközben megváltozott. Frissítsd az oldalt.")
      return
    }

    setStatuses((prev) => ({ ...prev, [id]: status }))
    setStatusSaving((prev) => ({ ...prev, [id]: true }))

    try {
      const matchingEvent = isRevokingAcceptedContact
        ? events.find((event) => isMatchingListingToEvent(selected, event))
        : undefined
      let mutationError: string | null = null
      let mutationSucceeded = false

      if (status === "accepted") {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          throw new Error("A jelentkezés elfogadásához be kell jelentkezned.")
        }

        const response = await fetch("/api/applications/accept", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ applicationId: id }),
        })
        const payload = (await response.json()) as { ok?: boolean; error?: string }
        if (!response.ok || !payload.ok) {
          mutationError = payload.error || "A jelentkezést nem sikerült elfogadni."
        } else {
          mutationSucceeded = true
        }
      } else {
        const result = isRevokingAcceptedContact
          ? await supabase.rpc("revoke_application_contact", {
              p_application_id: id,
              p_event_id: matchingEvent?.id ?? null,
            })
          : await supabase
            .from("applications")
            .update(status === "pending"
              ? {
                  status,
                  captain_contact_shared_at: null,
                  captain_contact_name: null,
                  captain_contact_email: null,
                  captain_contact_phone: null,
                }
              : { status })
            .eq("id", id)
            .eq("status", expectedStatus)
            .select("id")
            .maybeSingle()
        if (result.error) {
          mutationError = result.error.message
        } else {
          mutationSucceeded = Boolean(result.data)
        }
      }

      if (mutationError || !mutationSucceeded) {
        if (mutationError) console.error("Jelentkezés státusz mentési hiba:", mutationError)
        setStatuses((prev) => ({ ...prev, [id]: previousStatus }))
        setActionError(mutationError ?? "A jelentkezés állapota időközben megváltozott. Frissítsd az oldalt.")
        return
      }

      if (status === "pending") {
        setListings((prev) =>
          prev.map((listing) => listing.id === selected.id
            ? {
                ...listing,
                applicants: listing.applicants.map((applicant) =>
                  applicant.id === id ? { ...applicant, contactShared: false } : applicant,
                ),
              }
            : listing,
          ),
        )
        if (matchingEvent) {
          const applicant = selected.applicants.find((item) => item.id === id)
          setEvents((prev) =>
            prev.map((event) => event.id === matchingEvent.id
              ? {
                  ...event,
                  participants: event.participants.filter((participant) => participant.userId !== applicant?.userId),
                }
              : event,
            ),
          )
        }
      }

      setActionNotice(status === "accepted"
        ? "A kapcsolatfelvétel kezdeményezhető. Ez még nem jelenti azt, hogy a jelentkező biztosan részt vesz az eseményen."
        : status === "pending"
          ? isReopeningRejectedApplication
            ? "Az elutasítást visszavontad. A jelentkezés újra elbírálás alatt van."
            : "A kapcsolatfelvétel visszavonva. A jelentkezés visszakerült elbírálás alá."
          : "Jelentkezés elutasítva.")
    } catch (error) {
      console.error("Jelentkezés státusz mentési hiba:", error)
      setStatuses((prev) => ({ ...prev, [id]: previousStatus }))
      setActionError("A döntés mentése nem sikerült. Ellenőrizd a kapcsolatot, majd próbáld újra.")
    } finally {
      applicantMutationRef.current.delete(id)
      setStatusSaving((prev) => ({ ...prev, [id]: false }))
    }
  }

  async function shareCaptainContact(applicantId: string) {
    const applicant = selected.applicants.find((item) => item.id === applicantId)
    if (!applicant || applicant.contactShared) {
      return
    }

    setActionError(null)
    setActionNotice(null)
    setContactSharingId(applicantId)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("Az elérhetőségek megosztásához be kell jelentkezned.")
      }

      const response = await fetch("/api/applications/share-contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ applicationId: applicant.id }),
      })
      const result = (await response.json()) as { ok?: boolean; error?: string }

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Az elérhetőségek megosztása nem sikerült.")
      }

      setListings((prev) =>
        prev.map((listing) =>
          listing.id === selected.id
            ? {
                ...listing,
                applicants: listing.applicants.map((item) =>
                  item.id === applicantId ? { ...item, contactShared: true } : item,
                ),
              }
            : listing,
        ),
      )
      setActionNotice(`Az elérhetőségeid megjelentek ${applicant.name} jelentkezésénél. Külön értesítő e-mailt nem küldünk.`)
    } catch (error) {
      console.error("Kapitányi elérhetőségek megosztási hiba:", error)
      setActionError(error instanceof Error ? error.message : "Az elérhetőségek megosztása nem sikerült.")
    } finally {
      setContactSharingId(null)
    }
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

  async function buildEventItems(rows: any[], userId: string) {
    const mappedEvents: EventItem[] = rows.map((row: any) => {
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
    if (eventIds.length === 0) return { items: mappedEvents, participantsFailed: false }

    const { data: attendeeRows, error: attendeeError } = await supabase
      .from("boat_event_attendees")
      .select("event_id, user_id, status")
      .in("event_id", eventIds)

    if (attendeeError) {
      console.error("Esemény résztvevők lekérdezési hiba:", attendeeError)
      return { items: mappedEvents, participantsFailed: true }
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

    const attendeesByEventId = new Map<string, EventItem["participants"]>()
    ;(attendeeRows ?? []).forEach((row: any) => {
      const profile = row.user_id ? profilesByUserId.get(row.user_id) : null
      const status = row.status === "pending" || row.status === "declined" || row.status === "confirmed" || row.status === "unset"
        ? row.status
        : "unset"
      const attendee = {
        userId: row.user_id ? String(row.user_id) : "",
        name: profile?.full_name || "Résztvevő",
        avatar: resolveAvatarUrl(profile),
        status,
        source: row.user_id && String(row.user_id) === userId ? "captain" as const : undefined,
      }

      const current = attendeesByEventId.get(String(row.event_id)) ?? []
      attendeesByEventId.set(String(row.event_id), [...current, attendee])
    })

    return {
      items: mappedEvents.map((event) => ({ ...event, participants: attendeesByEventId.get(event.id) ?? [] })),
      participantsFailed: false,
    }
  }

  async function loadPastEvents() {
    if (!boat?.id || !user || pastEventsLoading) return
    setPastEventsLoading(true)
    try {
      const todayKey = getTodayKey()
      const { data, error } = await supabase
        .from("boat_events")
        .select("*")
        .eq("boat_id", boat.id)
        .or(`end_date.lt.${todayKey},and(end_date.is.null,start_date.lt.${todayKey})`)
        .order("start_date", { ascending: false })
        .range(pastEventsFetched, pastEventsFetched + PAST_EVENTS_PAGE_SIZE - 1)

      if (error) throw error

      const rows = data ?? []
      const { items, participantsFailed } = await buildEventItems(rows, user.id)
      setPastEventsFetched((count) => count + rows.length)
      setEvents((previous) => {
        const knownIds = new Set(previous.map((item) => item.id))
        return [...previous, ...items.filter((item) => !knownIds.has(item.id))]
      })
      if (participantsFailed) {
        setEventsLoadError("A korábbi események betöltődtek, de a résztvevőket nem sikerült lekérni.")
      }
    } catch (error) {
      console.error("Korábbi események lekérdezési hiba:", error)
      setEventsLoadError("A korábbi eseményeket nem sikerült betölteni. Próbáld újra.")
    } finally {
      setPastEventsLoading(false)
    }
  }

  useEffect(() => {
    if (!profileTarget) return
    let cancelled = false
    setProfileDetails({ loading: true, row: null, applicationId: null, applicationStatus: null })

    const loadProfile = async () => {
      const listingIds = listings.map((listing) => listing.id)
      const [userResult, applicationResult] = await Promise.all([
        supabase.from("users").select("*").eq("id", profileTarget.userId).maybeSingle(),
        listingIds.length > 0
          ? supabase.from("applications").select("id, status").eq("user_id", profileTarget.userId).in("ad_id", listingIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ])
      if (cancelled) return
      if (userResult.error) console.error("Felhasználói profil lekérdezési hiba:", userResult.error)
      const applications = (applicationResult.data ?? []) as Array<{ id: string; status?: string }>
      const accepted = applications.find((application) => application.status === "accepted")
      const chosen = accepted ?? applications[0] ?? null
      setProfileDetails({
        loading: false,
        row: (userResult.data as Record<string, any> | null) ?? null,
        applicationId: accepted ? String(accepted.id) : null,
        applicationStatus: chosen
          ? chosen.status === "accepted" || chosen.status === "rejected" ? chosen.status : "pending"
          : null,
      })
    }

    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [profileTarget, listings])

  async function addAcceptedApplicantToTeam(
    applicantId: string,
    override?: { userId: string; name: string; email: string; avatar: string },
  ) {
    const applicant = override
      ? { id: applicantId, ...override }
      : selected.applicants.find((item) => item.id === applicantId)
    if (!applicant || !applicant.userId || !boat?.id || !user) {
      setActionError("A jelentkezőt nem sikerült csapattaggá tenni.")
      return
    }

    if (teamMembers.some((member) => member.userId === applicant.userId && member.status === "active")) {
      setActionNotice(`${applicant.name} már csapattag.`)
      return
    }

    setAddingTeamMemberApplicantId(applicantId)
    setActionError(null)
    setActionNotice(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error("A csapattag hozzáadásához be kell jelentkezned.")
      }

      const response = await fetch("/api/boat-team/add-applicant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ applicationId: applicant.id }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        alreadyMember?: boolean
        emailSent?: boolean
        error?: string
        member?: {
          id: string
          user_id: string
          email: string
          display_name: string | null
          role: string
          status: string
          phone?: string | null
          avatar_url?: string | null
        }
      }

      if (!response.ok || !payload.ok || !payload.member) {
        throw new Error(payload.error || "A jelentkezőt nem sikerült csapattaggá tenni.")
      }

      const member: TeamMember = {
        id: payload.member.id,
        userId: payload.member.user_id,
        name: payload.member.display_name || applicant.name,
        email: payload.member.email || applicant.email,
        role: payload.member.role || "Csapattag",
        avatar: payload.member.avatar_url || applicant.avatar || "/placeholder.svg",
        phone: payload.member.phone ?? null,
        status: "active",
      }

      setTeamMembers((previous) => [
        member,
        ...previous.filter((item) => item.userId !== member.userId && item.email.toLowerCase() !== member.email.toLowerCase()),
      ])
      setActionNotice(payload.alreadyMember
        ? `${applicant.name} már csapattag.`
        : payload.emailSent === false
          ? `${applicant.name} hozzáadva a csapathoz, de az értesítő email küldése nem sikerült.`
          : `${applicant.name} hozzáadva a csapathoz, értesítő email elküldve.`)
    } catch (error) {
      console.error("Jelentkező csapathoz adási hiba:", error)
      setActionError(error instanceof Error ? error.message : "A jelentkezőt nem sikerült csapattaggá tenni.")
    } finally {
      setAddingTeamMemberApplicantId(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-secondary/40">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {boatLoading ? (
          <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
            Hajóadatok betöltése...
          </div>
        ) : boatLoadError ? (
          <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 text-center">
            <p role="alert" className="text-sm text-destructive">{boatLoadError}</p>
            <Button type="button" variant="outline" onClick={() => setListingsRefreshKey((key) => key + 1)}>
              Újrapróbálás
            </Button>
          </div>
        ) : hasBoat ? (
          <>
            <div className="mb-5">
              <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Kapitányi Vezérlőpult
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Kezeld a hajóidat, hirdetéseidet és a beérkező jelentkezőket egy helyen.
              </p>
            </div>

        {/* SECTION A: Boat management */}
        <section className="mb-6" aria-label="Hajó kezelése">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="relative aspect-[3/1] min-h-44 w-full overflow-hidden bg-brand-tint">
             <Image
                src={(boat?.image_url ?? PRIMARY_BOAT.image) || "/placeholder.svg"}
                alt={`${(boat?.name ?? PRIMARY_BOAT.name)} vitorlás`}
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 896px"
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/65 to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-5">
                <h3 className="text-2xl font-bold text-white drop-shadow">{boat?.name ?? PRIMARY_BOAT.name}</h3>
                <Badge className="border-0 bg-white/90 text-brand hover:bg-white/90">Elsődleges hajó</Badge>
              </div>
              <button
                type="button"
                aria-label="Hajó adatainak szerkesztése"
                title="Hajó adatainak szerkesztése"
                onClick={() => {
                  setBoatModalMode("edit")
                  setIsBoatModalOpen(true)
                }}
                className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-brand shadow-sm transition-colors hover:bg-white"
              >
                <PencilLine className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 py-4 text-sm text-foreground">
              <span className="flex items-center gap-1.5">
                <ShipWheel className="h-4 w-4 text-brand" aria-hidden="true" />
                {boat?.type ?? PRIMARY_BOAT.type}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-brand" aria-hidden="true" />
                {boat?.harbor ?? PRIMARY_BOAT.harbor}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-brand" aria-hidden="true" />
                Max {boat?.max_crew_size ?? "—"} fő
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                Csapat: {resolveCrewTypeLabel(boat?.team_type)}
              </span>
            </div>
          </div>
        </section>

        <div
          role="tablist"
          aria-label="Kapitányi dashboard"
          onKeyDown={(event) => {
            const tabs = ["team", "events", "listings"] as const
            const currentIndex = tabs.indexOf(activeDashboardTab)
            const nextIndex = event.key === "ArrowRight"
              ? (currentIndex + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (currentIndex - 1 + tabs.length) % tabs.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : -1

            if (nextIndex < 0) return

            event.preventDefault()
            const nextTab = tabs[nextIndex]
            setActiveDashboardTab(nextTab)
            document.getElementById(`dashboard-tab-${nextTab}`)?.focus()
          }}
          className="mb-6 grid grid-cols-3 gap-1 rounded-xl border border-border bg-secondary/70 p-1"
        >
          <button
            id="dashboard-tab-team"
            type="button"
            role="tab"
            aria-selected={activeDashboardTab === "team"}
            aria-controls="dashboard-panel-team"
            tabIndex={activeDashboardTab === "team" ? 0 : -1}
            onClick={() => setActiveDashboardTab("team")}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${activeDashboardTab === "team" ? "bg-card font-semibold text-brand shadow-[0_1px_3px_rgba(14,63,87,0.15),inset_0_-4px_0_0_var(--color-brand)]" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}
          >
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">Csapat</span>
          </button>
          <button
            id="dashboard-tab-events"
            type="button"
            role="tab"
            aria-selected={activeDashboardTab === "events"}
            aria-controls="dashboard-panel-events"
            tabIndex={activeDashboardTab === "events" ? 0 : -1}
            onClick={() => setActiveDashboardTab("events")}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${activeDashboardTab === "events" ? "bg-card font-semibold text-brand shadow-[0_1px_3px_rgba(14,63,87,0.15),inset_0_-4px_0_0_var(--color-brand)]" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}
          >
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">Események</span>
          </button>
          <button
            id="dashboard-tab-listings"
            type="button"
            role="tab"
            aria-selected={activeDashboardTab === "listings"}
            aria-controls="dashboard-panel-listings"
            tabIndex={activeDashboardTab === "listings" ? 0 : -1}
            onClick={() => setActiveDashboardTab("listings")}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${activeDashboardTab === "listings" ? "bg-card font-semibold text-brand shadow-[0_1px_3px_rgba(14,63,87,0.15),inset_0_-4px_0_0_var(--color-brand)]" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}
          >
            <Anchor className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">Hirdetések</span>
          </button>
        </div>

        <div
          id="dashboard-panel-team"
          role="tabpanel"
          aria-labelledby="dashboard-tab-team"
          hidden={activeDashboardTab !== "team"}
        >
        <section className="mb-10" aria-labelledby="team-section">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-brand-tint-strong bg-brand-tint px-5 py-3">
              <h2 id="team-section" className="text-base font-semibold text-brand">
                Csapat <span className="font-normal text-muted-foreground">· {teamMembers.filter((member) => member.status === "active").length + 1}</span>
              </h2>
              <Button
                type="button"
                className="h-10 bg-brand-orange! font-semibold text-brand! hover:bg-brand-orange/90!"
                onClick={() => {
                  setTeamError(null)
                  setIsInviteModalOpen(true)
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Meghívás
              </Button>
            </div>

            {teamError && !isInviteModalOpen ? (
              <div role="alert" className="border-b border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive">
                {teamError}
              </div>
            ) : null}

            {teamLoading ? (
              <div role="status" className="px-5 py-6 text-sm text-muted-foreground">
                Csapattagok betöltése...
              </div>
            ) : teamLoadError ? (
              <div role="alert" className="px-5 py-6 text-sm text-destructive">
                <p>{teamLoadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setListingsRefreshKey((key) => key + 1)}
                >
                  Újrapróbálás
                </Button>
              </div>
            ) : (
              <>
                {[
                  {
                    key: "active",
                    label: null,
                    members: [
                      {
                        id: "captain",
                        userId: user?.id ?? "",
                        name: profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Kapitány",
                        email: user?.email ?? "",
                        role: "Kapitány",
                        avatar: profile?.avatar_url || "/placeholder.svg",
                        phone: null,
                        status: "active",
                      } as TeamMember,
                      ...teamMembers.filter((member) => member.status === "active"),
                    ],
                  },
                  { key: "invited", label: "Meghívva", members: teamMembers.filter((member) => member.status !== "active") },
                ].map((group) =>
                  group.members.length === 0 ? null : (
                    <div key={group.key}>
                      {group.label ? (
                        <p className="border-t border-border bg-secondary/30 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.label} · {group.members.length}
                        </p>
                      ) : null}
                      {group.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-4 border-b border-border/70 px-5 py-3.5 last:border-b-0"
                        >
                          <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-secondary">
                            <Image
                              src={member.avatar || "/placeholder.svg"}
                              alt={member.name}
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {member.userId ? (
                                <button
                                  type="button"
                                  title="Felhasználó részletei"
                                  onClick={() => {
                                    setActionError(null)
                                    setProfileTarget({ userId: member.userId, name: member.name, avatar: member.avatar })
                                  }}
                                  className="truncate rounded text-left text-base font-semibold text-foreground underline-offset-2 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-brand"
                                >
                                  {member.name}
                                </button>
                              ) : (
                                <p className="truncate text-base font-semibold text-foreground">{member.name}</p>
                              )}
                              {member.status !== "active" ? (
                                <Badge className="border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">Meghívó elküldve</Badge>
                              ) : member.id === "captain" ? (
                                <Badge className="border-0 bg-brand text-white hover:bg-brand">Kapitány</Badge>
                              ) : member.role && member.role !== "Csapattag" ? (
                                <Badge className="border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{member.role}</Badge>
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                              <span className="truncate" title={member.email}>{member.email}</span>
                              {member.status === "active" && member.phone ? (
                                <a
                                  href={`tel:${member.phone.replace(/\s/g, "")}`}
                                  className="inline-flex items-center gap-1 transition-colors hover:text-brand"
                                  aria-label={`${member.name} telefonszáma: ${member.phone}`}
                                >
                                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{member.phone}</span>
                                </a>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {member.status === "invited" ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 border-brand/40 px-3 text-sm font-medium text-brand hover:bg-brand-tint hover:text-brand"
                                disabled={inviteSending}
                                onClick={() => void handleInviteTeamMember(member.email)}
                              >
                                {inviteSending ? "Küldés..." : "Újraküldés"}
                              </Button>
                            ) : null}
                            {member.id !== "captain" ? (
                            <button
                              type="button"
                              aria-label={`Eltávolítás: ${member.name}`}
                              title="Tag eltávolítása"
                              onClick={() => handleRemoveTeamMember(member.id)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive"
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ),
                )}
                {teamMembers.length === 0 ? (
                  <p className="border-t border-border/70 px-5 py-4 text-sm text-muted-foreground">
                    Még nincs más csapattag. Küldj meghívót e-mailben, hogy összeálljon a legénység.
                  </p>
                ) : null}
              </>
            )}

            {visibleFormerMembers.length > 0 ? (
              <>
                <button
                  type="button"
                  aria-expanded={showFormerMembers}
                  onClick={() => setShowFormerMembers((prev) => !prev)}
                  className="flex w-full items-center justify-between border-t border-border bg-secondary/30 px-5 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary/50"
                >
                  <span>Korábbi tagok ({visibleFormerMembers.length})</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showFormerMembers ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {showFormerMembers
                  ? visibleFormerMembers.map((member) => (
                      <div key={member.id} className="flex items-center gap-4 border-t border-border/70 px-5 py-3 opacity-80">
                        <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-secondary">
                          <Image src={member.avatar || "/placeholder.svg"} alt={member.name} fill className="object-cover" sizes="36px" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            title="Felhasználó részletei"
                            onClick={() => {
                              setActionError(null)
                              setProfileTarget({ userId: member.userId, name: member.name, avatar: member.avatar })
                            }}
                            className="block max-w-full truncate rounded text-left text-sm font-medium text-foreground underline-offset-2 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {member.name}
                          </button>
                          <p className="truncate text-xs text-muted-foreground" title={member.email}>{member.email}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 shrink-0 border-brand/40 px-3 text-sm font-medium text-brand hover:bg-brand-tint hover:text-brand"
                          disabled={reactivatingMemberId !== null}
                          onClick={() => void reactivateFormerMember(member.id)}
                        >
                          {reactivatingMemberId === member.id ? "Hozzáadás..." : "Hozzáadás a csapathoz"}
                        </Button>
                      </div>
                    ))
                  : null}
              </>
            ) : null}
          </div>
        </section>
        </div>

        <div
          id="dashboard-panel-events"
          role="tabpanel"
          aria-labelledby="dashboard-tab-events"
          hidden={activeDashboardTab !== "events"}
        >
        <section className="mb-10" aria-labelledby="events">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-brand-tint-strong bg-brand-tint px-5 py-3">
              <h2 id="events" className="text-base font-semibold text-brand">
                Események <span className="font-normal text-muted-foreground">· {events.filter((event) => (event.endDate || event.startDate) >= getTodayKey()).length}</span>
              </h2>
            <Button
              type="button"
              className="h-10 bg-brand-orange! font-semibold text-brand! hover:bg-brand-orange/90!"
              onClick={() => {
                resetNewEventForm()
                setIsNewEventModalOpen(true)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Új esemény
            </Button>
            </div>
            {eventsLoadError ? (
              <div role="alert" className="border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>{eventsLoadError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setListingsRefreshKey((key) => key + 1)}
                  >
                    Újrapróbálás
                  </Button>
                </div>
              </div>
            ) : null}
            {events.length === 0 && pastEventsTotal === 0 && !eventsLoadError ? (
              <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand ring-1 ring-brand-tint-strong">
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
                  className="h-10 bg-brand-orange! font-semibold text-brand! hover:bg-brand-orange/90!"
                  onClick={() => {
                    resetNewEventForm()
                    setIsNewEventModalOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Új esemény
                </Button>
              </div>
            ) : events.length > 0 || pastEventsTotal > 0 ? (
              <>
                {(() => {
                  const todayKey = getTodayKey()
                  const isPastEvent = (event: EventItem) => (event.endDate || event.startDate) < todayKey
                  const upcomingEvents = events.filter((event) => !isPastEvent(event))
                  const pastEvents = events.filter(isPastEvent)

                  const renderEvent = (event: EventItem, past: boolean) => {
                    const isExpanded = expandedEventId === event.id
                    const roster = buildEventRoster(event, teamMembers, user?.id)
                    const counts = { confirmed: 0, pending: 0, declined: 0, unset: 0 }
                    roster.forEach((person) => {
                      counts[person.participant?.status ?? "unset"] += 1
                    })
                    const relativeLabel = getEventRelativeLabel(event, todayKey)
                    const relatedListings = listings.filter((listing) => isMatchingListingToEvent(listing, event))
                    const relatedListing = relatedListings.find((listing) => listing.isActive && !listing.isHistorical)
                      ?? relatedListings[0]
                    const hasActiveListing = Boolean(relatedListing && relatedListing.isActive && !relatedListing.isHistorical)
                    const applicantCount = relatedListing?.applicants.length ?? 0
                    const hasNotes = Boolean(event.details) && event.details !== "Nincs megjegyzés."

                    return (
                      <div
                        key={event.id}
                        className={`border-b border-border/70 border-l-4 last:border-b-0 ${past ? "opacity-70" : ""} ${
                          isExpanded ? "border-l-brand bg-brand-tint dark:bg-brand/20" : "border-l-transparent"
                        }`}
                      >
                        <div className={`flex items-center pr-3 transition-colors ${isExpanded ? "bg-white dark:bg-card" : "hover:bg-secondary/40"}`}>
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedEventId((prev) => (prev === event.id ? null : event.id))}
                          className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-base font-semibold text-foreground">{event.title}</span>
                              <Badge className={getEventTypeBadgeClass(event.type)}>{event.type}</Badge>
                              {hasActiveListing ? (
                                <Badge className="gap-1.5 border-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100" title="Aktív hirdetés fut az eseményre">
                                  <span className="relative flex h-2 w-2" aria-hidden="true">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                                  </span>
                                  Hirdetés
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {event.date} · {event.location}
                              {relativeLabel ? <span className="ml-2 font-semibold text-[#2c7089]">{relativeLabel}</span> : null}
                            </p>
                          </div>
                          <span className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-foreground/70 sm:inline-flex">
                            <Users className="h-4 w-4" aria-hidden="true" />
                            {roster.length > 0 ? `${counts.confirmed} / ${roster.length}` : counts.confirmed} részt vesz
                          </span>
                          <ChevronDown
                            className={`h-6 w-6 shrink-0 text-foreground/70 transition-transform ${isExpanded ? "rotate-180 text-brand" : ""}`}
                            aria-hidden="true"
                          />
                        </button>
                          {!past ? (
                          <button
                            type="button"
                            title="Esemény szerkesztése"
                            aria-label={`Esemény szerkesztése: ${event.title}`}
                            onClick={() => openEditEventModal(event)}
                            className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand text-foreground/80 transition-colors hover:bg-brand-tint hover:text-brand"
                          >
                            <PencilLine className="h-4 w-4" aria-hidden="true" />
                          </button>
                          ) : null}
                        </div>

                        {isExpanded ? (
                          <div className="border-t border-brand-tint-strong px-5 pb-5 pt-5">
                            {hasNotes ? (
                              <div className="mb-6 max-w-2xl">
                                <p className="mb-1 text-sm font-semibold text-foreground">Megjegyzés</p>
                                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">
                                  {event.details}
                                </p>
                              </div>
                            ) : null}

                            <p className="mb-1 text-sm font-semibold text-foreground">
                              Résztvevők <span className="font-normal text-muted-foreground">· {roster.length}</span>
                            </p>
                            {roster.length === 0 ? (
                              <p className="py-3 text-sm text-muted-foreground">Még nincs csapattag a hajón.</p>
                            ) : (
                              <div className="max-w-3xl divide-y divide-border/70">
                                {roster.map((person) => {
                                  const status = person.participant?.status ?? null
                                  const mutationKey = `${event.id}:${person.id}`
                                  const isSavingParticipant = participantSaving[mutationKey] ?? false
                                  const isCaptainParticipant = person.id === user?.id
                                  const isListingOrigin = !isCaptainParticipant && person.source === "listing"
                                  const options = [
                                    { value: "confirmed", label: "Részt vesz", active: "border-emerald-600 bg-emerald-600 text-white", hover: "hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-800" },
                                    { value: "unset", label: "Nem döntött", active: "border-slate-500 bg-slate-500 text-white", hover: "hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800" },
                                    { value: "declined", label: "Nem vesz részt", active: "border-rose-600 bg-rose-600 text-white", hover: "hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800" },
                                  ] as const

                                  return (
                                    <div
                                      key={`${event.id}-${person.id}`}
                                      className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                      <div className="flex min-w-0 items-center gap-3">
                                        <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                                          <Image
                                            src={person.avatar || "/placeholder.svg"}
                                            alt={person.name}
                                            fill
                                            className="object-cover"
                                            sizes="36px"
                                          />
                                        </span>
                                        <div className="min-w-0">
                                          <button
                                            type="button"
                                            title="Felhasználó részletei"
                                            onClick={() => {
                                              setActionError(null)
                                              setProfileTarget({ userId: person.id, name: person.name, avatar: person.avatar })
                                            }}
                                            className="block max-w-full truncate rounded text-left text-sm font-medium text-foreground underline-offset-2 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-brand"
                                          >
                                            {person.name}
                                          </button>
                                          <p className="text-xs text-muted-foreground">
                                            {isCaptainParticipant ? "Kapitány" : isListingOrigin ? "Jelentkező" : "Csapattag"}
                                          </p>
                                        </div>
                                        {isListingOrigin ? (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            title="Jelentkező eltávolítása az eseményről"
                                            aria-label={`Jelentkező eltávolítása az eseményről: ${person.name}`}
                                            disabled={past || isSavingParticipant}
                                            onClick={() => setEventApplicantToRemove({
                                              eventId: event.id,
                                              userId: person.id,
                                              name: person.name,
                                            })}
                                            className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                          >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                          </Button>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div
                                          role="group"
                                          aria-label={`Részvételi státusz: ${person.name}`}
                                          className="inline-flex flex-1 gap-1.5 sm:flex-none"
                                        >
                                          {options.map((option) => {
                                            const isActive = option.value === "unset" ? !status || status === "unset" || status === "pending" : status === option.value
                                            return (
                                              <button
                                                key={option.value}
                                                type="button"
                                                aria-pressed={isActive}
                                                disabled={past || isSavingParticipant || !person.id}
                                                onClick={() => {
                                                  if (isActive) return
                                                  void setEventParticipantStatus(event.id, person.id, option.value)
                                                }}
                                                className={`inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60 sm:flex-none ${past ? "cursor-not-allowed" : ""} ${
                                                  isActive
                                                    ? option.active
                                                    : `border-border bg-card text-foreground/80 ${option.hover}`
                                                }`}
                                              >
                                                {option.label}
                                              </button>
                                            )
                                          })}
                                        </div>
                                        <span role="status" className="w-12 shrink-0 text-xs text-muted-foreground">
                                          {isSavingParticipant ? "Mentés..." : ""}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            <div className="mt-4 flex max-w-3xl flex-wrap items-center gap-3 border-t border-border/70 pt-4">
                              {hasActiveListing && relatedListing ? (
                                <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-10 border-brand/40 font-semibold text-brand hover:bg-brand-tint hover:text-brand"
                                  onClick={() => {
                                    selectListingForApplicants(relatedListing.id)
                                    setActiveDashboardTab("listings")
                                  }}
                                >
                                  Jelentkezők megtekintése ({applicantCount})
                                </Button>
                                <span className="text-sm text-muted-foreground">Aktív hirdetés fut.</span>
                                </>                              ) : !past ? (
                                <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-10 border-brand/40 font-semibold text-brand hover:bg-brand-tint hover:text-brand"
                                  onClick={() => openListingModalFromEvent(event)}
                                >
                                  Hirdetés feladása
                                </Button>
                                <span className="text-sm text-muted-foreground">Keress csapattagot erre az eseményre.</span>
                                </>
                              ) : null}

                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  }

                  return (
                    <>
                      {upcomingEvents.length > 0 ? (
                        upcomingEvents.map((event) => renderEvent(event, false))
                      ) : (
                        <p className="px-5 py-6 text-center text-sm text-muted-foreground">Nincs közelgő esemény.</p>
                      )}
                      {pastEventsTotal > 0 || pastEvents.length > 0 ? (
                        <>
                          <button
                            type="button"
                            aria-expanded={showPastEvents}
                            onClick={() => {
                              const next = !showPastEvents
                              setShowPastEvents(next)
                              if (next && pastEventsFetched === 0 && pastEventsTotal > 0) void loadPastEvents()
                            }}
                            className="flex w-full items-center justify-between border-t border-border bg-secondary/30 px-5 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary/50"
                          >
                            <span>Korábbi események ({Math.max(pastEventsTotal, pastEvents.length)})</span>
                            <ChevronDown className={`h-4 w-4 transition-transform ${showPastEvents ? "rotate-180" : ""}`} aria-hidden="true" />
                          </button>
                          {showPastEvents ? (
                            <>
                              {[...pastEvents]
                                .sort((first, second) => second.startDate.localeCompare(first.startDate))
                                .map((event) => renderEvent(event, true))}
                              {pastEventsLoading && pastEvents.length === 0 ? (
                                <p className="px-5 py-4 text-center text-sm text-muted-foreground">Betöltés...</p>
                              ) : null}
                              {pastEvents.length < pastEventsTotal ? (
                                <div className="border-t border-border/70 px-5 py-3 text-center">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 border-brand/40 font-medium text-brand hover:bg-brand-tint hover:text-brand"
                                    disabled={pastEventsLoading}
                                    onClick={() => void loadPastEvents()}
                                  >
                                    {pastEventsLoading
                                      ? "Betöltés..."
                                      : `Továbbiak betöltése (${pastEventsTotal - pastEvents.length} hátra)`}
                                  </Button>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </>
                      ) : null}                    </>
                  )
                })()}
              </>
            ) : null}
          </div>
        </section>
        </div>

        <div
          id="dashboard-panel-listings"
          role="tabpanel"
          aria-labelledby="dashboard-tab-listings"
          hidden={activeDashboardTab !== "listings"}
        >
          <section className="mb-10" aria-labelledby="active-listings">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-brand-tint-strong bg-brand-tint px-5 py-3">
              <h2 id="active-listings" className="text-base font-semibold text-brand">
                Hirdetéseim <span className="font-normal text-muted-foreground">· {listings.filter((listing) => listing.isActive && !listing.isHistorical).length}</span>
              </h2>
              <Button
                type="button"
                className="h-10 bg-brand-orange! font-semibold text-brand! hover:bg-brand-orange/90!"
                onClick={() => openModal("listing")}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Hirdetés feladása
              </Button>
            </div>
            <div>
            {pendingCountsError ? (
              <div role="alert" className="m-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <span>{pendingCountsError}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setListingsRefreshKey((key) => key + 1)}
                >
                  Újrapróbálás
                </Button>
              </div>
            ) : null}
            <div>
              <div className={loadingListings || listingsLoadError || displayedListings.length === 0 ? "flex flex-col gap-3 p-3" : "flex flex-col"}>
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
              ) : listingsLoadError ? (
                <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                  <p>{listingsLoadError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setListingsRefreshKey((key) => key + 1)}
                  >
                    Újrapróbálás
                  </Button>
                </div>
              ) : listings.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
                  <Anchor className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">Még nincs hirdetésed</p>
                    <p className="mt-1 text-sm text-muted-foreground">Add fel első szabad helyed, hogy elérhető legyen a vitorlázók számára.</p>
                  </div>
                </div>
              ) : displayedListings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                  Nincs aktuális hirdetésed. A korábbi hirdetéseidet az alábbi gombbal töltheted be.
                </div>
              ) : (
                displayedListings.map((listing) => {
                const isActive = listing.id === selected.id
                const count = pendingCountsMap[listing.id] ?? pendingCount(listing)
                const expiryDate = formatListingExpiryDate(listing.expiryDate)
                const expiryLabel = !listing.isActive
                  ? "Eredeti lejárat:"
                  : listing.isHistorical
                    ? "Lejárt:"
                    : "Lejár:"
                return (
                  <div
                    key={listing.id}
                    className={`border-b border-border/70 border-l-4 last:border-b-0 ${
                      isActive ? "border-l-brand bg-brand-tint" : "border-l-transparent"
                    } ${listing.isHistorical || !listing.isActive ? "opacity-80" : ""}`}
                  >
                  <div className={`flex items-center pr-3 transition-colors ${isActive ? "bg-white" : "hover:bg-secondary/40"}`}>
                    <button
                      type="button"
                      aria-expanded={isActive}
                      onClick={() => toggleListing(listing.id)}
                      className="flex min-w-0 flex-1 items-center gap-4 py-4 pl-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                    >
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 transition-transform ${isActive ? "text-brand" : "-rotate-90 text-foreground/60"}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-base font-semibold text-foreground">{listing.event}</span>
                          {listing.isDeleted ? (
                            <Badge className="border-0 bg-muted text-muted-foreground hover:bg-muted">Visszavonva</Badge>
                          ) : !listing.isActive ? (
                            <Badge className="border-0 bg-secondary text-secondary-foreground hover:bg-secondary">Archivált</Badge>
                          ) : listing.isHistorical ? (
                            <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">Lejárt</Badge>
                          ) : null}
                          {listing.positions.map((position) => (
                            <Badge key={position} className="border-0 bg-secondary text-secondary-foreground hover:bg-secondary">{position}</Badge>
                          ))}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {listing.date} · {listing.location}
                          {expiryDate ? <span className="ml-2">· {expiryLabel} {expiryDate}</span> : null}
                        </p>
                      </div>
                      {count > 0 && !isActive ? (
                        <Badge className="hidden shrink-0 border-0 bg-brand-orange text-brand hover:bg-brand-orange sm:inline-flex">
                          {count} új jelentkező
                        </Badge>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      aria-label={`Hirdetés lezárása: ${listing.event}`}
                      title="Hirdetés lezárása"
                      disabled={listingMutatingId !== null || applicantMutationRef.current.size > 0 || !listing.isActive}
                      onClick={() => setConfirmArchiveId(listing.id)}
                      className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground/80 outline-none transition-colors hover:bg-brand-tint hover:text-brand focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Archive className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Hirdetés visszavonása: ${listing.event}`}
                      title="Hirdetés visszavonása"
                      disabled={listingMutatingId !== null || applicantMutationRef.current.size > 0 || listing.isDeleted}
                      onClick={() => setConfirmDeleteId(listing.id)}
                      className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground/80 outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  {isActive ? (
                    <div className="border-t border-brand-tint-strong px-5 py-3">
                      {selected.isHistorical ? (
                        <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          Ez a hirdetés lezárt vagy lejárt. A jelentkezések megmaradnak megtekintésre, de új döntést már nem lehet rögzíteni.
                        </p>
                      ) : null}
                      {!applicantsLoading && !applicantsLoadError && selected.applicants.length > 0 ? (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                          <div role="tablist" aria-label="Jelentkezők szűrése" className="flex flex-wrap gap-1.5">
                            {([
                              ["pending", "Új"],
                              ["accepted", "Elfogadott"],
                              ["rejected", "Elutasított"],
                            ] as const).map(([key, label]) => (
                              <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={activeApplicantFilter === key}
                                onClick={() => {
                                  setPinnedApplicantIds([])
                                  setApplicantFilter(key)
                                  setApplicantLimit(APPLICANT_PAGE_SIZE)
                                }}
                                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
                                  activeApplicantFilter === key
                                    ? "bg-brand text-white"
                                    : "bg-white text-foreground/80 hover:bg-white/70"
                                }`}
                              >
                                {label} ·{" "}
                                <span className={key === "pending" && applicantCounts.pending > 0 && activeApplicantFilter !== key ? "font-bold text-brand-orange" : ""}>
                                  {applicantCounts[key]}
                                </span>
                              </button>
                            ))}
                          </div>
                          {selected.applicants.length > 10 ? (
                            <input
                              type="search"
                              value={applicantSearch}
                              onChange={(event) => {
                                setApplicantSearch(event.target.value)
                                setApplicantLimit(APPLICANT_PAGE_SIZE)
                              }}
                              placeholder="Keresés névre"
                              aria-label="Jelentkező keresése névre"
                              className="ml-auto h-9 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-56"
                            />
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex flex-col">
                        {applicantsLoading ? (
                  <div role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                    Jelentkezők betöltése...
                  </div>
                ) : applicantsLoadError ? (
                  <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                    <p>{applicantsLoadError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setListingsRefreshKey((key) => key + 1)}
                    >
                      Újrapróbálás
                    </Button>
                  </div>
                ) : visibleApplicants.map((applicant) => {
                  const status = statuses[applicant.id] ?? "pending"
                  const isSaving = statusSaving[applicant.id] ?? false
                  const matchingEvent = events.find((event) => isMatchingListingToEvent(selected, event))
                  const isSeasonListing = selected.commitment === "szezon"
                  const isAlreadyInEvent = Boolean(
                    matchingEvent?.participants.some((participant) => participant.userId === applicant.userId),
                  )
                  const isAlreadyTeamMember = teamMembers.some(
                    (member) => member.userId === applicant.userId && member.status === "active",
                  )
                  const isAddingToTeam = addingTeamMemberApplicantId === applicant.id
                  return (
                    <div
                      key={applicant.id}
                      className="border-b border-border/70 py-3 last:border-b-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                        <button
                          type="button"
                          onClick={() => setPhotoPreview({ src: applicant.avatar || "/placeholder.svg", name: applicant.name })}
                          aria-label={`Profilkép megnyitása: ${applicant.name}`}
                          title="Profilkép megnyitása"
                          className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-border transition-shadow hover:ring-2 hover:ring-brand focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          <Image
                            src={applicant.avatar || "/placeholder.svg"}
                            alt={applicant.name}
                            fill
                            className="object-cover"
                            sizes="56px"
                          />
                        </button>
                        <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="truncate text-sm font-semibold text-foreground">{applicant.name}</h3>
                            {applicant.age ? (
                              <span className="text-xs text-muted-foreground">{applicant.age} éves</span>
                            ) : null}
                            <Badge className={`${levelStyles[applicant.level]} border-0`}>{applicant.level}</Badge>
                        </div>
                        </div>
                      </div>
  
                      {status === "pending" && !selected.isHistorical ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void decide(applicant.id, "accepted")}
                            disabled={isSaving || listingMutatingId === selected.id}
                            aria-label={`Kapcsolatfelvétel indítása: ${applicant.name}`}
                            title="Kapcsolatfelvétel indítása"
                            className="bg-emerald-600! text-white! hover:bg-emerald-700!"
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Kapcsolatfelvétel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void decide(applicant.id, "rejected")}
                            disabled={isSaving || listingMutatingId === selected.id}
                            aria-label={`Jelentkező elutasítása: ${applicant.name}`}
                            title="Elutasítás"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                            Elutasítás
                          </Button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            className={
                              status === "accepted"
                                ? "border-0 bg-emerald-600 text-white hover:bg-emerald-600"
                                : status === "pending"
                                  ? "border-0 bg-amber-100 text-amber-900 hover:bg-amber-100"
                                  : "border-0 bg-rose-100 text-rose-800 hover:bg-rose-100"
                            }
                          >
                            {status === "pending" ? (
                              "Függőben"
                            ) : status === "accepted" ? (
                              "Kapcsolatfelvétel"
                            ) : (
                              <>
                                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                Elutasítva
                              </>
                            )}
                          </Badge>
                          {status === "accepted" && !selected.isHistorical ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={isSaving}
                              onClick={() => setConfirmRevokeApplicantId(applicant.id)}
                              aria-label={`Kapcsolatfelvétel visszavonása: ${applicant.name}`}
                              title="Kapcsolatfelvétel visszavonása"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              Visszavonás
                            </Button>
                          ) : null}
                          {status === "rejected" && !selected.isHistorical ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isSaving || listingMutatingId === selected.id}
                              onClick={() => void decide(applicant.id, "pending")}
                              aria-label={`Elutasítás visszavonása: ${applicant.name}`}
                              title="Jelentkezés újra elbírálása"
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                              Újra elbírálom
                            </Button>
                          ) : null}
                        </div>
                      )}
                      </div>
                      {applicant.applicationMessage ? (
                        <p className="mt-2 whitespace-pre-line pl-[66px] text-sm leading-relaxed text-foreground/80">
                          {applicant.applicationMessage}
                        </p>
                      ) : null}
                      <div className="mt-3 pl-[66px]">
                      {status === "accepted" && (
                      <div className="overflow-hidden rounded-lg bg-white/70">
                        <div className="p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={`tel:${applicant.phone.replace(/\s/g, "")}`}
                              className="inline-flex min-w-0 items-center gap-2 text-sm text-foreground underline-offset-2 transition-colors hover:text-emerald-800 hover:underline"
                            >
                              <Phone className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                              <span className="truncate">{applicant.phone}</span>
                            </a>
                            <a
                              href={`mailto:${applicant.email}`}
                              className="inline-flex min-w-0 items-center gap-2 text-sm text-foreground underline-offset-2 transition-colors hover:text-emerald-800 hover:underline"
                            >
                              <Mail className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                              <span className="truncate">{applicant.email}</span>
                            </a>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 pt-3">
                            {applicant.contactShared ? (
                              <span className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-emerald-800">
                                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                                Elérhetőségeid megosztva
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => void shareCaptainContact(applicant.id)}
                                disabled={contactSharingId === applicant.id}
                                className="h-9 bg-brand! px-3 text-white! hover:bg-brand/90!"
                              >
                                <Share2 className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                                {contactSharingId === applicant.id ? "Megosztás..." : "Elérhetőségeim megosztása"}
                              </Button>
                            )}
                            <span className="min-w-0 flex-1 text-xs text-foreground/70">
                              {applicant.contactShared
                                ? "A jelentkező látja a telefonszámodat és az e-mail címedet."
                                : "A jelentkező megkapja a telefonszámodat és az e-mail címedet."}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={applicant.contactShared && !isAlreadyTeamMember ? "default" : "outline"}
                              disabled={isAddingToTeam || isAlreadyTeamMember}
                              onClick={() => void addAcceptedApplicantToTeam(applicant.id)}
                              className={`h-9 px-3 disabled:opacity-100 ${
                                applicant.contactShared && !isAlreadyTeamMember ? "bg-brand! text-white! hover:bg-brand/90!" : ""
                              }`}
                            >
                              {isAlreadyTeamMember ? (
                                <Check className="mr-2 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                              ) : (
                                <Users className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                              )}
                              {isAddingToTeam
                                ? "Hozzáadás..."
                                : isAlreadyTeamMember
                                  ? "Már csapattag"
                                  : "Felvétel a csapatba"}
                            </Button>
                            {matchingEvent ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isAlreadyInEvent}
                                onClick={() => void addAcceptedApplicantToEvent(applicant.id)}
                                className="h-9 px-3 disabled:opacity-100"
                              >
                                {isAlreadyInEvent ? (
                                  <Check className="mr-2 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                                ) : (
                                  <CalendarDays className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                                )}
                                {isAlreadyInEvent ? "Már az eseményen" : "Hozzáadás az eseményhez"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>                      )}
                      </div>
                    </div>
                  )
                })}
                      {!applicantsLoading && !applicantsLoadError && filteredApplicants.length > visibleApplicants.length ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 w-full bg-white"
                          onClick={() => setApplicantLimit((limit) => limit + APPLICANT_PAGE_SIZE)}
                        >
                          További jelentkezők ({filteredApplicants.length - visibleApplicants.length})
                        </Button>
                      ) : null}
                      {!applicantsLoading && !applicantsLoadError && selected.applicants.length > 0 && filteredApplicants.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          {normalizedApplicantSearch ? "Nincs találat." : "Ebben a kategóriában nincs jelentkező."}
                        </p>
                      ) : null}
                                      {!applicantsLoading && !applicantsLoadError && selected.applicants.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <p className="text-sm text-muted-foreground">Erre a hirdetésre még nincs jelentkező.</p>
                </div>
              )}
                      </div>
                    </div>
                  ) : null}
                  </div>
                )
              })
              )}
              </div>
              {previousListingsCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 w-full"
                  onClick={() => {
                    if (showPreviousListings && selected.isHistorical) {
                      setSelectedId("")
                    }
                    setShowPreviousListings((previous) => !previous)
                  }}
                >
                  {showPreviousListings
                    ? "Korábbi hirdetések elrejtése"
                    : `Korábbi hirdetések betöltése (${previousListingsCount})`}
                </Button>
              ) : null}
            </div>
            </div>
            </div>
          </section>
        </div>
      </>
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
            <div className="flex flex-col items-center gap-6">
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                <ShipWheel className="h-10 w-10" aria-hidden="true" />
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
                className="h-14 bg-brand! text-white! hover:bg-brand/90!"
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

      <Dialog open={!!photoPreview} onOpenChange={(open) => { if (!open) setPhotoPreview(null) }}>
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl p-0">
          {photoPreview ? (
            <>
              <DialogTitle className="sr-only">{photoPreview.name}</DialogTitle>
              <div className="relative aspect-square w-full bg-muted">
                <Image src={photoPreview.src} alt={photoPreview.name} fill className="object-cover" sizes="448px" />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={!!profileTarget} onOpenChange={(open) => { if (!open) setProfileTarget(null) }}>
        <DialogContent className="max-w-md gap-0 rounded-2xl p-0">
          {profileTarget ? (() => {
            const row = profileDetails.row
            const teamMember = teamMembers.find((member) => member.userId === profileTarget.userId)
            const isCaptainProfile = profileTarget.userId === user?.id
            const isActiveTeamMember = teamMember?.status === "active"
            const name = row?.full_name || profileTarget.name
            const email = row?.email || teamMember?.email || ""
            const phone = row?.phone || teamMember?.phone || ""
            const birthdateValue = row?.birthdate ?? row?.birth_date ?? row?.date_of_birth
            const age = birthdateValue ? calculateAge(String(birthdateValue)) : undefined
            const level = row?.level ? experienceLevelLabel(row.level) : null
            const bio = [row?.bio, row?.about, row?.description].find((value) => typeof value === "string" && value.trim())
            const isAdding = addingTeamMemberApplicantId === profileDetails.applicationId
            const todayKey = getTodayKey()
            const statusOf = (event: EventItem) => event.participants.find((item) => item.userId === profileTarget.userId)?.status
            const upcomingParticipation = events
              .filter((event) => (event.endDate || event.startDate) >= todayKey && statusOf(event))
              .sort((first, second) => first.startDate.localeCompare(second.startDate))
            const pastParticipation = events
              .filter((event) => (event.endDate || event.startDate) < todayKey && statusOf(event) === "confirmed")
              .sort((first, second) => second.startDate.localeCompare(first.startDate))
              .slice(0, 5)
            const statusLabels = {
              confirmed: { label: "Részt vesz", className: "text-emerald-700" },
              pending: { label: "Nem döntött", className: "text-muted-foreground" },
              declined: { label: "Nem vesz részt", className: "text-rose-700" },
              unset: { label: "Nem döntött", className: "text-muted-foreground" },
            } as const
            const renderParticipation = (event: EventItem, showStatus: boolean) => {
              const status = statusLabels[statusOf(event) ?? "unset"]
              return (
                <li key={event.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{event.date} · {event.location}</p>
                  </div>
                  {showStatus ? (
                    <span className={`shrink-0 text-xs font-medium ${status.className}`}>{status.label}</span>
                  ) : null}
                </li>
              )
            }
            return (
              <div>
                <div className="flex items-center gap-4 border-b border-brand-tint-strong bg-brand-tint px-6 py-5">
                  <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white">
                    <Image
                      src={resolveAvatarUrl(row) !== "/placeholder.svg" ? resolveAvatarUrl(row) : profileTarget.avatar || "/placeholder.svg"}
                      alt={name}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </span>
                  <DialogHeader className="min-w-0 gap-1">
                    <DialogTitle className="truncate text-xl font-bold tracking-tight text-brand">{name}</DialogTitle>
                    <DialogDescription className="sr-only">Felhasználói profil és kapcsolattartási adatok</DialogDescription>
                    <div className="flex flex-wrap items-center gap-2">
                        {isCaptainProfile ? (
                          <Badge className="border-0 bg-brand text-white">Kapitány</Badge>
                        ) : isActiveTeamMember ? (
                          <Badge className="border-0 bg-emerald-600 text-white">{teamMember?.role || "Csapattag"}</Badge>
                        ) : teamMember ? (
                          <Badge className="border-0 bg-amber-100 text-amber-900">Meghívva</Badge>
                        ) : (
                          <Badge variant="outline">Nem csapattag</Badge>
                        )}
                        {level ? <Badge className="border-0 bg-white text-brand">{level}</Badge> : null}
                        {age ? <span className="text-xs text-muted-foreground">{age} éves</span> : null}
                    </div>
                  </DialogHeader>
                </div>

                <div className="space-y-6 px-6 py-5">
                  {profileDetails.loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="mb-2 text-sm font-semibold text-foreground">Kapcsolat</p>
                        <div className="space-y-1.5 text-sm">
                          {email ? (
                            <a href={`mailto:${email}`} className="flex items-center gap-2 text-foreground/80 hover:text-brand hover:underline">
                              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span className="truncate">{email}</span>
                            </a>
                          ) : null}
                          {phone ? (
                            <a href={`tel:${phone}`} className="flex items-center gap-2 text-foreground/80 hover:text-brand hover:underline">
                              <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                              {phone}
                            </a>
                          ) : null}
                          {!email && !phone ? <p className="text-muted-foreground">Nincs megadott elérhetőség.</p> : null}
                        </div>
                      </div>

                      {bio ? (
                        <div>
                          <p className="mb-1 text-sm font-semibold text-foreground">Bemutatkozás</p>
                          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{String(bio)}</p>
                        </div>
                      ) : null}

                      <div>
                        <p className="mb-1 text-sm font-semibold text-foreground">Közelgő események</p>
                        {upcomingParticipation.length > 0 ? (
                          <ul className="divide-y divide-border/70">
                            {upcomingParticipation.map((event) => renderParticipation(event, true))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">Nincs közelgő esemény.</p>
                        )}
                      </div>

                      <div className="border-t border-border/70 pt-5">
                        <p className="mb-1 text-sm font-semibold text-foreground">Legutóbbi részvételek</p>
                        {pastParticipation.length > 0 ? (
                          <ul className="divide-y divide-border/70">
                            {pastParticipation.map((event) => renderParticipation(event, false))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">Még nem vett részt eseményen.</p>
                        )}
                      </div>

                      {!isCaptainProfile && !isActiveTeamMember ? (
                        <div className="rounded-xl border border-border bg-secondary/40 p-4">
                          {profileDetails.applicationId ? (
                            <>
                              <p className="mb-3 text-sm text-foreground/80">Ez a felhasználó nem tagja a csapatnak.</p>
                              <Button
                                type="button"
                                className="h-10 w-full bg-brand! font-semibold text-white! hover:bg-brand/90!"
                                disabled={isAdding}
                                onClick={() => void addAcceptedApplicantToTeam(profileDetails.applicationId as string, {
                                  userId: profileTarget.userId,
                                  name,
                                  email,
                                  avatar: profileTarget.avatar,
                                })}
                              >
                                <UserPlus className="h-4 w-4" aria-hidden="true" />
                                {isAdding ? "Hozzáadás..." : "Hozzáadás a csapathoz"}
                              </Button>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Csapathoz adáshoz előbb fogadd el a jelentkezését a Hirdetések fülön.
                            </p>
                          )}
                        </div>
                      ) : null}
                      {actionError ? <p role="alert" className="text-sm text-destructive">{actionError}</p> : null}
                    </>
                  )}
                </div>
              </div>
            )
          })() : (
            <DialogHeader className="sr-only">
              <DialogTitle>Felhasználó részletei</DialogTitle>
              <DialogDescription>Felhasználói profil</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={isInviteModalOpen} onOpenChange={(open) => {
        setIsInviteModalOpen(open)
        if (!open) {
          setTeamError(null)
          setNewTeamMemberEmail("")
        }
      }}>
        <DialogContent className="max-w-md gap-0 rounded-2xl p-0">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleInviteTeamMember()
            }}
          >
            <div className="border-b border-border px-6 py-5">
              <DialogHeader className="gap-2">
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground">Csapattag meghívása</DialogTitle>
                <DialogDescription className="text-pretty leading-relaxed">
                  E-mailben küldött meghívó, 7 napos érvényességgel.
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="space-y-3 px-6 py-5">
              {teamError ? (
                <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  {teamError}
                </div>
              ) : null}
              <Label htmlFor="team-invite-email">E-mail-cím</Label>
              <Input
                id="team-invite-email"
                type="email"
                required
                autoFocus
                maxLength={254}
                value={newTeamMemberEmail}
                onChange={(event) => setNewTeamMemberEmail(event.target.value)}
                placeholder="nev@pelda.hu"
                className="h-11"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsInviteModalOpen(false)
                  setTeamError(null)
                  setNewTeamMemberEmail("")
                }}
              >
                Mégse
              </Button>
              <Button
                type="submit"
                disabled={inviteSending}
                className="bg-brand! font-semibold text-white! hover:bg-brand/90!"
              >
                {inviteSending ? "Meghívás..." : "Meghívó küldése"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!confirmEventDeleteId} onOpenChange={(open) => { if (!open) setConfirmEventDeleteId(null) }}>
        <DialogContent className="max-w-sm gap-0 rounded-2xl p-0">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Esemény törlése
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                Biztosan törölni szeretnéd az eseményt? A törlés végleges, a résztvevői rekordok törlődnek, a kapcsolt hirdetés pedig megmarad, de leválik erről az eseményről.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={deletingEventId !== null}
                onClick={() => setConfirmEventDeleteId(null)}
              >
                Mégse
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={deletingEventId !== null}
                onClick={() => confirmEventDeleteId && void deleteEvent(confirmEventDeleteId)}
              >
                {deletingEventId ? "Törlés..." : "Igen, törlöm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!eventApplicantToRemove}
        onOpenChange={(open) => {
          const mutationKey = eventApplicantToRemove
            ? `${eventApplicantToRemove.eventId}:${eventApplicantToRemove.userId}`
            : ""
          if (!open && !participantSaving[mutationKey]) setEventApplicantToRemove(null)
        }}
      >
        <DialogContent className="max-w-sm gap-0 rounded-2xl p-0">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Jelentkező eltávolítása az eseményről
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                {eventApplicantToRemove
                  ? `${eventApplicantToRemove.name} lekerül erről az eseményről. A hirdetésre beadott jelentkezése ettől még megmarad.`
                  : "A jelentkező lekerül az eseményről, de a hirdetésre beadott jelentkezése megmarad."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={Boolean(eventApplicantToRemove && participantSaving[`${eventApplicantToRemove.eventId}:${eventApplicantToRemove.userId}`])}
                onClick={() => setEventApplicantToRemove(null)}
              >
                Mégse
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                disabled={Boolean(eventApplicantToRemove && participantSaving[`${eventApplicantToRemove.eventId}:${eventApplicantToRemove.userId}`])}
                onClick={async () => {
                  if (!eventApplicantToRemove) return
                  const removed = await setEventParticipantStatus(
                    eventApplicantToRemove.eventId,
                    eventApplicantToRemove.userId,
                    null,
                  )
                  if (removed) setEventApplicantToRemove(null)
                }}
              >
                {eventApplicantToRemove && participantSaving[`${eventApplicantToRemove.eventId}:${eventApplicantToRemove.userId}`]
                  ? "Eltávolítás..."
                  : "Eltávolítás"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmRevokeApplicantId}
        onOpenChange={(open) => { if (!open && !statusSaving[confirmRevokeApplicantId ?? ""]) setConfirmRevokeApplicantId(null) }}
      >
        <DialogContent className="max-w-sm gap-0 rounded-2xl p-0">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Kapcsolatfelvétel visszavonása
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                {(() => {
                  const applicant = selected.applicants.find((item) => item.id === confirmRevokeApplicantId)
                  return applicant
                    ? `Visszavonod a kapcsolatfelvétel kezdeményezését ${applicant.name} jelentkezőnél? A jelentkezés visszakerül elbírálás alá. Ez nem vonja vissza a már megosztott elérhetőségeket, és az eseményrésztvevők közül sem távolítja el.`
                    : "A jelentkezés visszakerül elbírálás alá. A már megosztott elérhetőségek és az eseményrészvétel nem változik."
                })()}
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={!!statusSaving[confirmRevokeApplicantId ?? ""]}
                onClick={() => setConfirmRevokeApplicantId(null)}
              >
                Mégse
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                disabled={!!statusSaving[confirmRevokeApplicantId ?? ""]}
                onClick={async () => {
                  if (!confirmRevokeApplicantId) return
                  await decide(confirmRevokeApplicantId, "pending")
                  setConfirmRevokeApplicantId(null)
                }}
              >
                {statusSaving[confirmRevokeApplicantId ?? ""] ? "Visszavonás..." : "Visszavonom"}
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
                A hirdetés azonnal eltűnik a böngészésből. A hirdetés és a meglévő jelentkezések megmaradnak a dashboardon, de a jelentkezésekről ezután már nem lehet dönteni. A lejárat ezzel szemben automatikusan történik a megadott dátum után.
              </DialogDescription>
            </DialogHeader>
            {actionError ? (
              <p role="alert" className="text-sm text-destructive">{actionError}</p>
            ) : null}
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
                type="button"
                className="flex-1 bg-brand! text-white! hover:bg-brand/90!"
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
                A hirdetés azonnal eltűnik a böngészésből. A hirdetés és a meglévő jelentkezések megmaradnak a dashboardon megtekintésre, de a jelentkezésekről ezután már nem lehet dönteni.
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
                disabled={removingTeamMemberId !== null}
                onClick={() => setConfirmRemoveMemberId(null)}
              >
                Mégse
              </Button>
              <Button
                className="flex-1 bg-destructive! text-white! hover:bg-destructive/90!"
                disabled={removingTeamMemberId !== null}
                onClick={confirmRemoveTeamMember}
              >
                {removingTeamMemberId ? "Eltávolítás..." : "Igen, törlöm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewEventModalOpen} disablePointerDismissal onOpenChange={(open) => {
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
              {actionError ? (
                <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive md:col-span-2">
                  {actionError}
                </div>
              ) : null}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="event-type">Esemény típusa</Label>
                <select
                  id="event-type"
                  value={newEventForm.type}
                  onChange={(event) => setNewEventForm((prev) => ({ ...prev, type: event.target.value as EventItem["type"] }))}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand"
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
                <DatePicker
                  id="event-start-date"
                  min={getTodayKey()}
                  value={newEventForm.startDate}
                  onChange={(value) => setNewEventForm((prev) => ({ ...prev, startDate: value }))}
                />
              </div>

              {!newEventForm.oneDay ? (
                <div className="space-y-1.5">
                  <Label htmlFor="event-end-date">Végdátum</Label>
                  <DatePicker
                    id="event-end-date"
                    value={newEventForm.endDate}
                    onChange={(value) => setNewEventForm((prev) => ({ ...prev, endDate: value }))}
                    initialMonth={newEventForm.startDate || undefined}
                    min={newEventForm.startDate || getTodayKey()}
                  />
                </div>
              ) : null}
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
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
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
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <Button type="button" variant="outline" disabled={eventSaveMode !== null} onClick={() => setIsNewEventModalOpen(false)}>
                Mégse
              </Button>
              <Button type="submit" disabled={eventSaveMode !== null} className="bg-brand! font-semibold text-white! hover:bg-brand/90!">
                {eventSaveMode === "create" ? "Mentés..." : "Esemény mentése"}
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
              {actionError ? (
                <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive md:col-span-2">
                  {actionError}
                </div>
              ) : null}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="edit-event-type">Esemény típusa</Label>
                <select
                  id="edit-event-type"
                  value={editEventForm.type}
                  onChange={(event) => setEditEventForm((prev) => ({ ...prev, type: event.target.value as EventItem["type"] }))}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-brand"
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
                <DatePicker
                  id="edit-event-start-date"
                  value={editEventForm.startDate}
                  onChange={(value) => setEditEventForm((prev) => ({ ...prev, startDate: value }))}
                />
              </div>

              {!editEventForm.oneDay ? (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-event-end-date">Végdátum</Label>
                  <DatePicker
                    id="edit-event-end-date"
                    value={editEventForm.endDate}
                    onChange={(value) => setEditEventForm((prev) => ({ ...prev, endDate: value }))}
                    initialMonth={editEventForm.startDate || undefined}
                    min={editEventForm.startDate || undefined}
                  />
                </div>
              ) : null}
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
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
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
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
              <Button
                type="button"
                variant="destructive"
                disabled={eventSaveMode !== null || deletingEventId !== null}
                onClick={() => editingEventId && setConfirmEventDeleteId(editingEventId)}
                className="h-9"
              >
                Esemény törlése
              </Button>

              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" disabled={eventSaveMode !== null} onClick={() => setIsEditEventModalOpen(false)}>
                  Mégse
                </Button>
                <Button type="submit" disabled={eventSaveMode !== null} className="bg-brand! font-semibold text-white! hover:bg-brand/90!">
                  {eventSaveMode === "edit" ? "Mentés..." : "Mentés"}
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
      {actionNotice || actionError ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 sm:bottom-6">
          <div
            role={actionError ? "alert" : "status"}
            aria-live={actionError ? "assertive" : "polite"}
            aria-atomic="true"
            className={`pointer-events-auto flex w-full max-w-lg items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              actionError
                ? "border-destructive/30 bg-card text-destructive"
                : "border-brand/30 bg-card text-foreground"
            }`}
          >
            <span>{actionError ?? actionNotice}</span>
            <button
              type="button"
              aria-label="Értesítés bezárása"
              onClick={() => {
                setActionNotice(null)
                setActionError(null)
              }}
              className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
