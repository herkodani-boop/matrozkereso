"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Anchor, Mail, Lock, UserPlus, ArrowLeft, Camera, Sailboat, ImagePlus, CheckCircle2, KeyRound, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"

import { BoatCard, type ListingRow } from "@/components/browse-boats"
import { ListingImageFocusPicker } from "@/components/listing-image-focus-picker"

import { ImageUploadErrorDialog } from "@/components/image-upload-error-dialog"
import { optimizeAvatarImage } from "@/lib/avatar-image-optimization"
import { clearHungarianValidationMessage, setHungarianValidationMessage } from "@/lib/hungarian-form-validation"
import { CREW_ROLES, MAX_CUSTOM_ROLE_LENGTH, crewRoleLabel } from "@/lib/crew-roles"


const levelOptions: Record<string, string> = {
  kezdo: "Kezdő",
  halado: "Haladó",
  profi: "Profi - Versenyző",
}

function getTodayDateInputValue() {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${today.getFullYear()}-${month}-${day}`
}

function getTomorrowDateInputValue() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0")
  const day = String(tomorrow.getDate()).padStart(2, "0")
  return `${tomorrow.getFullYear()}-${month}-${day}`
}

function isValidPhoneNumber(value: string) {
  const phone = value.trim()
  const digitCount = phone.replace(/\D/g, "").length
  return /^\+?[0-9\s().-]+$/.test(phone) && digitCount >= 7 && digitCount <= 15
}

type ListingMode = "segito" | "posztok"

const listingModeOptions: { value: ListingMode; title: string; description: string }[] = [
  { value: "segito", title: "Segítő kezeket", description: "Bárkit szívesen látsz, a fedélzeten megtanítod." },
  { value: "posztok", title: "Konkrét posztokra", description: "Pl. kormányost vagy orrembert keresel." },
]

const MIN_CREW_NEEDED = 1
const MAX_CREW_NEEDED = 30

async function triggerWelcomeEmail() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) return

    await fetch("/api/auth/welcome", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    })
  } catch (error) {
    console.error("Üdvözlő email kiváltása nem sikerült:", error)
  }
}

const listingCommitmentOptions: { value: string; label: string }[] = [
  { value: "egy-verseny", label: "Egy eseményre" },
  { value: "szezon", label: "Egész szezonra" },
]

const listingMaxApplicantOptions: { value: string; label: string; pro: boolean }[] = [
  { value: "10", label: "10", pro: false },
  { value: "25", label: "25", pro: false },
  { value: "50", label: "50", pro: true },
  { value: "unlimited", label: "Korlátlan", pro: true },
]

const HU_SHORT_MONTHS = ["jan", "febr", "márc", "ápr", "máj", "jún", "júl", "aug", "szept", "okt", "nov", "dec"]

function formatShortMonth(dateValue: string) {
  const month = Number(dateValue.slice(5, 7))
  return HU_SHORT_MONTHS[month - 1] ?? ""
}

function formatDayOfMonth(dateValue: string) {
  const day = Number(dateValue.slice(8, 10))
  return day > 0 ? String(day) : ""
}

const crewTypeOptions: { value: string; label: string }[] = [
  { value: "verprofi", label: "Profi versenyzés" },
  { value: "amator", label: "Amatőr versenyzés / Tanulás" },
  { value: "tura", label: "Túra / Hobbi vitorlázás" },
]

type View = "login" | "register" | "boat" | "listing" | "preview" | "forgot"
type Mode = "sailor" | "skipper"
type AuthFieldErrors = Partial<Record<
  "email" | "password" | "fullName" | "phone" | "birthdate" | "terms" |
  "boatName" | "boatClass" | "boatHarbor" | "boatCrewSize" | "submit",
  string
>>

export function AuthGateModal({
  open,
  onOpenChange,
  boatName,
  mode = "sailor",
  teamInvite = false,
  inviteEmail = null,
  initialView,
  returnTo,
  boatId,
  boatImageUrl,
  boatDisplayName,
  userId,
  onListingCreated,
  prefill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  boatName?: string
  mode?: Mode
  teamInvite?: boolean
  inviteEmail?: string | null
  initialView?: View
  returnTo?: string
  boatId?: string
  boatImageUrl?: string | null
  boatDisplayName?: string | null
  userId?: string
  onListingCreated?: () => void
  prefill?: {
    eventId?: string
    title?: string
    location?: string
    startDate?: string
    endDate?: string
    oneDay?: boolean
  } | null
}) {
  const router = useRouter()
  const [view, setView] = useState<View>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [level, setLevel] = useState<string>("kezdo")
  const [boatNameValue, setBoatNameValue] = useState("")
  const [boatClassValue, setBoatClassValue] = useState("")
  const [boatHarbor, setBoatHarbor] = useState("")
  const [boatCrewSize, setBoatCrewSize] = useState("")
  const [crewType, setCrewType] = useState<string>("amator")
  const [listingCommitment, setListingCommitment] = useState<string>("egy-verseny")
  const [listingEventId, setListingEventId] = useState<string | null>(null)
  const [isEventPrefilledListing, setIsEventPrefilledListing] = useState(false)
  const [listingEventDetailsOpen, setListingEventDetailsOpen] = useState(false)
  const [listingMode, setListingMode] = useState<ListingMode>("segito")
  const [listingPosts, setListingPosts] = useState<string[]>([])
  const [listingCustomPost, setListingCustomPost] = useState("")
  const [listingCrewNeeded, setListingCrewNeeded] = useState(2)
  const [listingBeginnerFriendly, setListingBeginnerFriendly] = useState(true)
  const [listingFocus, setListingFocus] = useState({ x: 50, y: 50 })
  const [listingNote, setListingNote] = useState("")
  const [listingMaxApplicants, setListingMaxApplicants] = useState<string>("25")
  const [listingTitle, setListingTitle] = useState("")
  const [listingLocation, setListingLocation] = useState("")
  const [listingStartDate, setListingStartDate] = useState("")
  const [listingEndDate, setListingEndDate] = useState("")
  const [listingOneDay, setListingOneDay] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>("")
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarProcessing, setAvatarProcessing] = useState(false)
  const avatarSelectionId = useRef(0)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resetEmailSent, setResetEmailSent] = useState(false)
  const [confirmationRequired, setConfirmationRequired] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState("")
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)
  const [isListingSaving, setIsListingSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [authErrors, setAuthErrors] = useState<AuthFieldErrors>({})
  const [listingErrors, setListingErrors] = useState<{
    title?: string
    location?: string
    startDate?: string
    endDate?: string
    post?: string
    level?: string
    submit?: string
  }>({})

  function getConfirmationRedirectUrl() {
    const url = new URL("/auth/confirm", window.location.origin)
    if (returnTo) url.searchParams.set("next", returnTo)
    return url.toString()
  }

  function clearAuthError(field: keyof AuthFieldErrors) {
    setAuthErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  function resetFormState() {
    avatarSelectionId.current += 1
    setEmail("")
    setPassword("")
    setFullName("")
    setPhone("")
    setBirthdate("")
    setTermsAccepted(false)
    setLevel("kezdo")
    setSubmitted(false)
    setSelectedFile(null)
    setPreviewUrl("")
    setAvatarError(null)
    setAvatarProcessing(false)
    setResetEmailSent(false)
    setConfirmationRequired(false)
    setConfirmationEmail("")
    setResendLoading(false)
    setResendSent(false)
    setResendError(null)
    setLoading(false)
    setFormError(null)
    setAuthErrors({})
    setBoatNameValue("")
    setBoatClassValue("")
    setBoatHarbor("")
    setBoatCrewSize("")
    setCrewType("amator")
    setListingTitle("")
    setListingEventId(null)
    setListingLocation("")
    setListingStartDate("")
    setListingEndDate("")
    setListingOneDay(false)
    setListingCommitment("egy-verseny")
    setListingMode("segito")
    setListingPosts([])
    setListingCustomPost("")
    setListingCrewNeeded(2)
    setListingBeginnerFriendly(true)
    setListingFocus({ x: 50, y: 50 })
    setListingNote("")
    setListingMaxApplicants("25")
    setListingErrors({})
    setIsListingSaving(false)
  }

  function toggleListingPost(value: string) {
    setListingPosts((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value)
      }
      return [...prev, value]
    })

    if (listingErrors.post) {
      setListingErrors((prev) => ({ ...prev, post: undefined }))
    }
  }

  function addCustomListingPost() {
    const value = listingCustomPost.trim().slice(0, MAX_CUSTOM_ROLE_LENGTH)
    if (!value) return
    const exists = listingPosts.some((post) => crewRoleLabel(post).toLowerCase() === value.toLowerCase())
    if (!exists) toggleListingPost(value)
    setListingCustomPost("")
  }

  // A kezdőbarát jelölés a meglévő experience_level mezőbe kerül.
  const listingLevel = listingBeginnerFriendly ? "kezdo" : "halado"
  const listingPositions = listingMode === "segito" ? ["mancsaft"] : listingPosts
  const listingCustomPosts = listingPosts.filter((post) => !CREW_ROLES.some((role) => role.value === post))
  const isListingFlow = view === "listing" || view === "preview"
  // Eseményből indítva az eseményadatok összecsukva látszanak; hibánál vagy kérésre kinyílnak.
  const hasListingEventErrors = Boolean(listingErrors.title || listingErrors.location || listingErrors.startDate || listingErrors.endDate)
  const showListingEventSummary =
    isEventPrefilledListing && !listingEventDetailsOpen && !hasListingEventErrors && Boolean(listingTitle && listingStartDate)

  // Megnyitáskor a kért nézetre ugrunk; skipper esetén alapból a regisztráció.
  useEffect(() => {
    if (!open) {
      return
    }

    resetFormState()
    setView(initialView ?? (mode === "skipper" ? "register" : "login"))

    if (inviteEmail) {
      setEmail(inviteEmail)
    }

    if (prefill) {
      setListingEventId(prefill.eventId ?? null)
      setListingTitle(prefill.title ?? "")
      setListingLocation(prefill.location ?? "")
      setListingStartDate(prefill.startDate ?? "")
      setListingEndDate(prefill.endDate ?? "")
      setListingOneDay(Boolean(prefill.oneDay))
      setListingCommitment("egy-verseny")
      setIsEventPrefilledListing(true)
      setListingEventDetailsOpen(false)
    } else {
      setIsEventPrefilledListing(false)
    }
  }, [open, mode, initialView, prefill])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!email.trim()) {
      setFormError("Az e-mail cím megadása kötelező.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Adj meg egy érvényes e-mail címet.")
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        const waitSeconds = error.message.match(/for security purposes, you can only request this after (\d+) seconds?/i)?.[1]
        setFormError(
          waitSeconds
            ? `Biztonsági okokból csak ${waitSeconds} másodperc múlva kérhetsz új jelszó-visszaállító emailt.`
            : error.message,
        )
        return
      }
      setResetEmailSent(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Ismeretlen hiba történt.")
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setAuthErrors({})

    const errors: AuthFieldErrors = {}
    if (!email.trim()) errors.email = "Az e-mail cím megadása kötelező."
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Adj meg egy érvényes e-mail címet."
    if (!password) errors.password = "A jelszó megadása kötelező."
    if (Object.keys(errors).length > 0) {
      setAuthErrors(errors)
      return
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })

      if (error) {
        console.error("Bejelentkezési hiba:", error)
        if (error.code === "email_not_confirmed" || error.message.toLowerCase().includes("email not confirmed")) {
          setConfirmationEmail(email.trim())
          setConfirmationRequired(true)
          return
        }
        setAuthErrors({
          password: error.message === "Invalid login credentials"
            ? "Hibás e-mail cím vagy jelszó."
            : error.message,
        })
        return
      }

      if (!data?.user) {
        const errorMessage = "Bejelentkezés sikertelen."
        console.error(errorMessage)
        setAuthErrors({ password: errorMessage })
        return
      }

      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut({ scope: "local" })
        setConfirmationEmail(data.user.email ?? email.trim())
        setConfirmationRequired(true)
        return
      }

      handleOpenChange(false)
      if (mode === "skipper") {
        router.push("/kapitany-dashboard")
        return
      }

      if (returnTo) {
        router.replace(returnTo)
        return
      }

      router.refresh()
    } catch (err) {
      setAuthErrors({ submit: err instanceof Error ? err.message : "Ismeretlen hiba történt." })
    }
  }

  async function handleResendConfirmation() {
    if (!confirmationEmail) return
    setResendLoading(true)
    setResendError(null)
    setResendSent(false)

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: confirmationEmail,
        options: { emailRedirectTo: getConfirmationRedirectUrl() },
      })

      if (error) {
        const waitSeconds = error.message.match(/for security purposes, you can only request this after (\d+) seconds?/i)?.[1]
        setResendError(
          waitSeconds
            ? `Biztonsági okokból csak ${waitSeconds} másodperc múlva kérheted újra a hitelesítő emailt.`
            : error.message,
        )
        return
      }

      setResendSent(true)
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Az email újraküldése nem sikerült.")
    } finally {
      setResendLoading(false)
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setSelectedFile(null)
      setPreviewUrl("")
      return
    }

    const input = e.currentTarget
    input.value = ""
    const selectionId = ++avatarSelectionId.current
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(null)
    setPreviewUrl("")
    setAvatarError(null)
    setAvatarProcessing(true)

    try {
      const optimizedFile = await optimizeAvatarImage(file)
      if (selectionId !== avatarSelectionId.current) return
      setSelectedFile(optimizedFile)
      setPreviewUrl(URL.createObjectURL(optimizedFile))
    } catch (error) {
      if (selectionId !== avatarSelectionId.current) return
      setAvatarError(error instanceof Error ? error.message : "A profilkép feldolgozása nem sikerült.")
    } finally {
      if (selectionId === avatarSelectionId.current) setAvatarProcessing(false)
    }
  }

  function discardSelectedAvatar() {
    avatarSelectionId.current += 1
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(null)
    setPreviewUrl("")
    setAvatarProcessing(false)
  }

  function formatDateText(startDate: string, endDate: string, oneDay: boolean) {
    const format = (date: string) => {
      const parsed = new Date(date)
      if (Number.isNaN(parsed.getTime())) return date
      return `${parsed.getFullYear()}. ${String(parsed.getMonth() + 1).padStart(2, "0")}. ${String(parsed.getDate()).padStart(2, "0")}.`
    }

    if (oneDay || !endDate) {
      return format(startDate)
    }

    return `${format(startDate)} – ${format(endDate)}`
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setAuthErrors({})
    const errors: AuthFieldErrors = {}
    if (!fullName.trim()) errors.fullName = "A teljes név megadása kötelező."
    if (!email.trim()) errors.email = "Az e-mail cím megadása kötelező."
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Adj meg egy érvényes e-mail címet."
    if (password.length < 8) errors.password = "A jelszónak legalább 8 karakter hosszúnak kell lennie."
    if (!phone.trim()) errors.phone = "A telefonszám megadása kötelező."
    else if (!isValidPhoneNumber(phone)) errors.phone = "Adj meg egy érvényes telefonszámot (7–15 számjegy)."
    if (!birthdate) errors.birthdate = "A születési dátum megadása kötelező."
    else if (birthdate > getTodayDateInputValue()) errors.birthdate = "A születési dátum nem lehet a jövőben."
    if (!termsAccepted) errors.terms = "A regisztrációhoz el kell fogadnod az ÁSZF-et."
    if (Object.keys(errors).length > 0) {
      setAuthErrors(errors)
      return
    }

    if (mode === "skipper") {
      setLoading(true)
      try {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
            data: {
              full_name: fullName || null,
              phone: phone || null,
              birthdate: birthdate || null,
              role: "skipper",
              level: level || null,
            },
          },
        })

        if (signUpError) {
          console.error("Regisztrációs hiba:", signUpError)
          setAuthErrors({ email: signUpError.message })
          return
        }

        if (!data?.user) {
          const errorMessage = "Felhasználó létrehozása sikertelen."
          console.error(errorMessage)
          setAuthErrors({ submit: errorMessage })
          return
        }

        if (!data.user.email_confirmed_at) {
          if (data.session) await supabase.auth.signOut({ scope: "local" })
          setConfirmationEmail(email.trim())
          setConfirmationRequired(true)
          return
        }

        const userId = data.user.id
        let avatarUrl: string | null = null
        if (selectedFile) {
          const fileExt = selectedFile.name.split(".").pop() ?? "jpg"
          const fileName = `${userId}-${Math.random().toString(36).slice(2)}.${fileExt}`
          const filePath = `avatars/${fileName}`

          const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(filePath, selectedFile)

          if (uploadError) {
            console.error("Avatar feltöltési hiba:", uploadError)
            discardSelectedAvatar()
            setAvatarError(uploadError.message)
            return
          }

          const { data: publicUrlData } = supabase.storage
            .from("avatars")
            .getPublicUrl(filePath)

          avatarUrl = publicUrlData?.publicUrl ?? null
          if (!avatarUrl) {
            const errorMessage = "Nem sikerült lekérni az avatar nyilvános URL-jét."
            console.error(errorMessage, publicUrlData)
            discardSelectedAvatar()
            setAvatarError(errorMessage)
            return
          }
        }

        const { error: insertError } = await supabase.from("users").upsert(
          {
            id: userId,
            email: email,
            full_name: fullName,
            phone: phone,
            birthdate: birthdate || null,
            role: "skipper",
            avatar_url: avatarUrl,
          },
          { onConflict: "id" }
        )

        if (insertError) {
          console.error("Adatbázis hiba:", insertError)
          setAuthErrors({ submit: "Profil mentése sikertelen. Próbáld újra." })
          return
        }

        const session = data.session
        const signInPayload = {
          email,
          password,
        }

        if (!session) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword(signInPayload)

          if (signInError) {
            console.error("Automatikus bejelentkezés sikertelen:", signInError)
            setAuthErrors({ password: signInError.message })
            return
          }

          if (!signInData?.user) {
            const errorMessage = "A bejelentkezés nem sikerült."
            console.error(errorMessage)
            setAuthErrors({ password: errorMessage })
            return
          }
        } else {
          await supabase.auth.setSession(session)
        }

        void triggerWelcomeEmail()
        await router.push("/kapitany-dashboard")
        handleOpenChange(false)
        return
      } catch (err) {
        setAuthErrors({ submit: err instanceof Error ? err.message : "Ismeretlen hiba történt." })
      } finally {
        setLoading(false)
      }
    }

    setLoading(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: getConfirmationRedirectUrl(),
          data: {
            full_name: fullName || null,
            phone: phone || null,
            birthdate: birthdate || null,
            role: "mancsaft",
            level: level || null,
          },
        },
      })

      if (signUpError) {
        console.error("Regisztrációs hiba:", signUpError)
        setAuthErrors({ email: signUpError.message })
        return
      }

      if (!data?.user) {
        const errorMessage = "Felhasználó létrehozása sikertelen."
        console.error(errorMessage)
        setAuthErrors({ submit: errorMessage })
        return
      }

      if (!data.user.email_confirmed_at) {
        if (data.session) await supabase.auth.signOut({ scope: "local" })
        setConfirmationEmail(email.trim())
        setConfirmationRequired(true)
        return
      }

      const userId = data.user.id
      let avatarUrl: string | null = null
      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop() ?? "jpg"
        const fileName = `${userId}-${Math.random().toString(36).slice(2)}.${fileExt}`
        const filePath = `avatars/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, selectedFile)

        if (uploadError) {
          console.error("Avatar feltöltési hiba:", uploadError)
          discardSelectedAvatar()
          setAvatarError(uploadError.message)
          return
        }

        const { data: publicUrlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath)

        avatarUrl = publicUrlData?.publicUrl ?? null
        if (!avatarUrl) {
          const errorMessage = "Nem sikerült lekérni az avatar nyilvános URL-jét."
          console.error(errorMessage, publicUrlData)
          discardSelectedAvatar()
          setAvatarError(errorMessage)
          return
        }
      }

      const { error: insertError } = await supabase.from("users").upsert(
        {
          id: userId,
          email: email,
          full_name: fullName,
          phone: phone || null,
          birthdate: birthdate || null,
          role: "mancsaft",
          level: level || null,
          avatar_url: avatarUrl,
        },
        { onConflict: "id" }
      )

      if (insertError) {
        console.error("Adatbázis hiba:", insertError)
        setAuthErrors({ submit: "Profil mentése sikertelen. Próbáld újra." })
        return
      }

      const session = data.session
      const signInPayload = {
        email,
        password,
      }

      if (!session) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword(signInPayload)

        if (signInError) {
          console.error("Automatikus bejelentkezés sikertelen:", signInError)
          setAuthErrors({ password: signInError.message })
          return
        }

        if (!signInData?.user) {
          const errorMessage = "A bejelentkezés nem sikerült."
          console.error(errorMessage)
          setAuthErrors({ password: errorMessage })
          return
        }
      } else {
        await supabase.auth.setSession(session)
      }

      void triggerWelcomeEmail()
      handleOpenChange(false)
      if (returnTo) router.replace(returnTo)
    } catch (err) {
      setAuthErrors({ submit: err instanceof Error ? err.message : "Ismeretlen hiba történt." })
    } finally {
      setLoading(false)
    }
  }

  function handleBoatSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errors: AuthFieldErrors = {}
    if (!boatNameValue.trim()) errors.boatName = "A hajó neve kötelező."
    if (!boatClassValue.trim()) errors.boatClass = "A hajó típusa kötelező."
    if (!boatHarbor.trim()) errors.boatHarbor = "A bázis kikötő megadása kötelező."
    if (!boatCrewSize || !Number.isInteger(Number(boatCrewSize)) || Number(boatCrewSize) < 1 || Number(boatCrewSize) > 30) {
      errors.boatCrewSize = "1 és 30 közötti egész legénységi létszámot adj meg."
    }
    if (Object.keys(errors).length > 0) {
      setAuthErrors(errors)
      return
    }
    setAuthErrors({})
    // A hajó adatainak mentése után a szabad hely hirdetése következik be.
    setView("listing")
  }

  async function handleListingSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const newErrors: typeof listingErrors = {}

    if (!listingTitle.trim()) {
      newErrors.title = "Hirdetés címe megadása kötelező."
    }

    if (!listingLocation.trim()) {
      newErrors.location = "Helyszín megadása kötelező."
    }

    if (!listingStartDate) {
      newErrors.startDate = listingCommitment === "szezon" ? "Szezon kezdő dátuma kötelező." : "Kezdő dátum megadása kötelező."
    } else if (listingStartDate < getTomorrowDateInputValue()) {
      newErrors.startDate = "A kezdő dátum nem lehet mai vagy múltbeli."
    }

    if (!listingOneDay && !listingEndDate) {
      newErrors.endDate =
        listingCommitment === "szezon"
          ? "Szezon záró dátuma megadása kötelező."
          : "Végdátum megadása kötelező, vagy jelöld be az 1 napos eseményt."
    }

    if (listingEndDate && listingStartDate && listingEndDate < listingStartDate) {
      newErrors.endDate = "A végdátumnak nem lehet korábbi a kezdő dátumnál."
    }

    if (listingEndDate && listingEndDate < getTomorrowDateInputValue()) {
      newErrors.endDate = "A végdátum nem lehet mai vagy múltbeli."
    }

    if (listingPositions.length === 0) {
      newErrors.post = "Jelölj be legalább egy posztot, vagy válaszd a segítő kezeket."
    }

    if (!boatId) {
      newErrors.submit = "A hajó azonosítója nem található."
    }

    if (!userId) {
      newErrors.submit = "Be kell jelentkezned a hirdetés közzétételéhez."
    }

    if (Object.keys(newErrors).length > 0) {
      setListingErrors(newErrors)
      return
    }

    setListingErrors({})

    if (view === "listing") {
      setView("preview")
      return
    }

    setIsListingSaving(true)

    try {
      const positions = listingPositions
      const dateText = formatDateText(listingStartDate, listingEndDate, listingOneDay)
      const listingPayload = {
        boat_id: boatId,
        event_id: listingEventId,
        user_id: userId,
        title: listingTitle.trim(),
        date_text: dateText,
        start_date: listingStartDate || null,
        end_date: (!listingOneDay && listingEndDate) ? listingEndDate : null,
        commitment: listingCommitment,
        location: listingLocation.trim(),
        positions,
        experience_level: listingLevel,
        crew_needed: listingCrewNeeded,
        captain_note: listingNote.trim() || null,
        max_applicants: listingMaxApplicants === "unlimited" ? null : Number(listingMaxApplicants),
        image_focus_x: Math.round(listingFocus.x),
        image_focus_y: Math.round(listingFocus.y),
        created_at: new Date().toISOString(),
      }

      const { error } = await supabase.from("ads").insert([listingPayload])

      if (error) {
        setListingErrors({ submit: error.message })
        return
      }

      onListingCreated?.()

      setSubmitted(true)
      setTimeout(() => handleOpenChange(false), 1800)
    } finally {
      setIsListingSaving(false)
    }
  }

  function buildPreviewListing(): ListingRow {
    return {
      id: "preview",
      isOwnListing: false,
      boatName: boatDisplayName || "Hajó",
      image: boatImageUrl || "/placeholder.svg",
      imageFocusX: listingFocus.x,
      imageFocusY: listingFocus.y,
      commitment: (listingCommitment === "szezon" ? "szezon" : "egy-verseny") as ListingRow["commitment"],
      event: listingTitle.trim(),
      location: listingLocation.trim(),
      date: formatDateText(listingStartDate, listingEndDate, listingOneDay),
      roles: listingPositions,
      crewNeeded: listingCrewNeeded,
      level: listingLevel,
      applied: false,
      applicationId: null,
      applicationCount: 0,
      captainName: "",
      captainAvatar: null,
      captainNote: listingNote.trim() || null,
      maxApplicants: null,
      activeApplicationCount: 0,
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      resetFormState()
      // Visszaállítjuk az alapnézetre, amikor bezárul.
      setTimeout(() => {
        setView(mode === "skipper" ? "register" : "login")
        setSubmitted(false)
      }, 200)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isListingFlow}
        className={`max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] gap-0 overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] rounded-2xl p-0 ${
          isListingFlow ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        {confirmationRequired ? (
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <DialogHeader className="gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Mail className="h-5 w-5" aria-hidden="true" />
              </div>
              <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Erősítsd meg az email címed
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                A folytatáshoz kattints a(z) <span className="font-medium text-foreground">{confirmationEmail}</span> címre küldött hitelesítő linkre. Addig nem tudsz bejelentkezni.
              </DialogDescription>
            </DialogHeader>

            {resendSent ? <output className="text-sm text-emerald-700">A hitelesítő emailt újraküldtük.</output> : null}
            {resendError ? <p className="text-sm text-destructive" role="alert">{resendError}</p> : null}

            <Button type="button" size="lg" disabled={resendLoading} onClick={handleResendConfirmation} className="h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!">
              {resendLoading ? "Küldés..." : "Hitelesítő email újraküldése"}
            </Button>
          </div>
        ) : submitted ? (
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center sm:px-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </div>
            <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Hirdetés sikeresen közzétéve!
            </DialogTitle>
            <DialogDescription className="max-w-sm text-pretty leading-relaxed">
              A szabad helyed mostantól látható a vitorlázók számára. Hamarosan értesítünk a jelentkezésekről.
            </DialogDescription>
          </div>
        ) : view === "login" ? (
          <>
            <div className="flex flex-col gap-6 p-6 sm:p-8">
              <DialogHeader className="gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Anchor className="h-5 w-5" aria-hidden="true" />
                </div>
                <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  A jelentkezéshez bejelentkezés szükséges
                </DialogTitle>
                <DialogDescription className="text-pretty leading-relaxed">
                  Hogy ne kelljen minden alkalommal megadnod a vitorlás tapasztalatodat és a súlyodat, hozz létre egy
                  ingyenes profilt, vagy lépj be.
                  {boatName ? (
                    <span className="mt-1 block font-medium text-foreground">Kiválasztott hajó: {boatName}</span>
                  ) : null}
                </DialogDescription>
              </DialogHeader>

              <form noValidate onSubmit={handleLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="auth-email">Email cím</Label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="auth-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="nev@example.hu"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        clearAuthError("email")
                      }}
                      readOnly={teamInvite && Boolean(inviteEmail)}
                      className={`h-11 pl-9 ${teamInvite && inviteEmail ? "bg-secondary/60" : ""}`}
                      aria-invalid={!!authErrors.email}
                    />
                  </div>
                  {authErrors.email ? <p className="text-sm text-destructive" role="alert">{authErrors.email}</p> : null}
                  {teamInvite && inviteEmail ? (
                    <p className="text-xs text-muted-foreground">Ezt az e-mail címet a meghívó alapján töltöttük ki, nem módosítható.</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="auth-password">Jelszó</Label>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="auth-password"
                      type="password"
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        clearAuthError("password")
                      }}
                      className="h-11 pl-9"
                      aria-invalid={!!authErrors.password}
                    />
                  </div>
                  {authErrors.password ? <p className="text-sm text-destructive" role="alert">{authErrors.password}</p> : null}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
                >
                  {loading ? "Bejelentkezés..." : "Bejelentkezés"}
                </Button>

                {authErrors.submit ? <p className="text-sm text-destructive" role="alert">{authErrors.submit}</p> : null}

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setFormError(null); setAuthErrors({}); setView("forgot") }}
                    className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    Elfelejtettem a jelszavam
                  </button>
                </div>
              </form>
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-secondary/60 p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-accent ring-1 ring-border">
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Új vagy még?</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    Regisztrálj mancsaftként 1 perc alatt!
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11 w-full text-base"
                onClick={() => {
                  setFormError(null)
                  setAuthErrors({})
                  setEmail("")
                  setPassword("")
                  setView("register")
                }}
              >
                Profil létrehozása
              </Button>
            </div>
          </>
        ) : view === "forgot" ? (
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <DialogHeader className="gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Jelszó visszaigénylése
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                Add meg a regisztrációhoz használt e-mail címet, és küldünk egy visszaigénylő linket.
              </DialogDescription>
            </DialogHeader>

            {resetEmailSent ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                </div>
                <p className="font-semibold text-foreground">Belépési link elküldve!</p>
                <p className="text-sm text-muted-foreground">
                  Ellenőrizd a postaládád (a spam mappát is), és kattints a kapott linkre a belépéshez.
                </p>
                <button
                  type="button"
                  onClick={() => { setResetEmailSent(false); setView("login") }}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Vissza a bejelentkezéshez
                </button>
              </div>
            ) : (
              <form noValidate onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="magic-link-email">E-mail cím</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="magic-link-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="nev@example.hu"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setFormError(null)
                      }}
                      className="h-11 pl-9"
                      aria-invalid={!!formError}
                    />
                  </div>
                  {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
                >
                  {loading ? "Küldés..." : "Link elküldése"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setFormError(null); setAuthErrors({}); setView("login") }}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Vissza a bejelentkezéshez
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : view === "register" ? (
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <DialogHeader className="gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              </div>
              <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {mode === "skipper" ? "Kapitány profil létrehozása" : "Matrózkereső profil létrehozása"}
              </DialogTitle>
              {mode === "skipper" ? (
                <DialogDescription className="text-pretty leading-relaxed">
                  Add meg az alapadataidat, majd a következő lépésben regisztráld a hajódat és a szabad helyet.
                </DialogDescription>
              ) : null}
            </DialogHeader>

            <form noValidate onSubmit={handleRegister} className="flex flex-col gap-4">
              <div className="flex items-center gap-4 rounded-xl border border-border bg-secondary/40 p-4">
                <label
                  htmlFor="reg-avatar"
                  className="group relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-card text-muted-foreground ring-1 ring-border transition-colors hover:text-accent hover:ring-accent"
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Profilkép előnézet"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <Camera className="h-6 w-6" aria-hidden="true" />
                  )}
                  <input
                    id="reg-avatar"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleAvatarChange}
                  />
                </label>
                <div>
                  <label htmlFor="reg-avatar" className="cursor-pointer font-semibold text-foreground">
                    Profilkép hozzáadása
                  </label>
                  {avatarProcessing ? (
                    <p className="mt-0.5 text-sm text-muted-foreground" role="status">Profilkép feldolgozása...</p>
                  ) : null}
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    Nem kötelező, de erősen ajánlott a jobb esélyekért!
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="reg-name">Teljes név</Label>
                  <Input
                    id="reg-name"
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Pl. Kovács Anna"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value)
                      clearAuthError("fullName")
                    }}
                    className="h-11"
                    aria-invalid={!!authErrors.fullName}
                  />
                  {authErrors.fullName ? <p className="text-sm text-destructive" role="alert">{authErrors.fullName}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-email">E-mail cím</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="nev@example.hu"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      clearAuthError("email")
                    }}
                    readOnly={teamInvite && Boolean(inviteEmail)}
                    className={`h-11 ${teamInvite && inviteEmail ? "bg-secondary/60" : ""}`}
                    aria-invalid={!!authErrors.email}
                  />
                  {authErrors.email ? <p className="text-sm text-destructive" role="alert">{authErrors.email}</p> : null}
                  {teamInvite && inviteEmail ? (
                    <p className="text-xs text-muted-foreground">Ezt az e-mail címet a meghívó alapján töltöttük ki, nem módosítható.</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-password">Jelszó</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      clearAuthError("password")
                    }}
                    className="h-11"
                    aria-invalid={!!authErrors.password}
                  />
                  {authErrors.password ? <p className="text-sm text-destructive" role="alert">{authErrors.password}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-phone">Telefonszám</Label>
                  <Input
                    id="reg-phone"
                    type="tel"
                    required
                    pattern={"\\+?[0-9\\s().-]{7,25}"}
                    title="Adj meg egy érvényes telefonszámot (7–15 számjegy)."
                    autoComplete="tel"
                    placeholder="+36..."
                    value={phone}
                    onChange={(e) => {
                      const value = e.target.value
                      setPhone(value)
                      e.currentTarget.setCustomValidity(
                        value.trim() && !isValidPhoneNumber(value)
                          ? "Adj meg egy érvényes telefonszámot (7–15 számjegy)."
                          : ""
                      )
                      clearAuthError("phone")
                    }}
                    className="h-11"
                    aria-invalid={!!authErrors.phone}
                  />
                  {authErrors.phone ? <p className="text-sm text-destructive" role="alert">{authErrors.phone}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-birthdate">Születési dátum</Label>
                  <DatePicker
                    id="reg-birthdate"
                    required
                    max={getTodayDateInputValue()}
                    yearSelect
                    value={birthdate}
                    onChange={(value) => {
                      setBirthdate(value)
                      clearAuthError("birthdate")
                    }}
                    aria-invalid={!!authErrors.birthdate}
                  />
                  {authErrors.birthdate ? <p className="text-sm text-destructive" role="alert">{authErrors.birthdate}</p> : null}
                </div>

                {mode === "skipper" ? null : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reg-level">Tapasztalati szint</Label>
                      <Select value={level} onValueChange={(v) => setLevel(v as string)}>
                        <SelectTrigger id="reg-level" className="h-11 w-full">
                          <SelectValue>{(v: string) => levelOptions[v] ?? "Válassz"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(levelOptions).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                  </>
                )}
              </div>

              <div className="flex items-start gap-2 text-sm">
                <input
                  id="reg-terms"
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked)
                    clearAuthError("terms")
                  }}
                  aria-label="Kijelentem, hogy az Általános Szerződési Feltételeket elolvastam, megértettem és elfogadom."
                  aria-invalid={!!authErrors.terms}
                  className={`mt-1 h-4 w-4 shrink-0 accent-accent ${authErrors.terms ? "outline outline-2 outline-destructive" : ""}`}
                />
                <p className="leading-relaxed">
                  <label htmlFor="reg-terms" className="inline cursor-pointer font-normal">
                    Kijelentem, hogy az{" "}
                  </label>
                  <a
                    href="/aszf"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Általános Szerződési Feltételeket
                  </a>{" "}
                  <label htmlFor="reg-terms" className="inline cursor-pointer font-normal">
                    elolvastam, megértettem és elfogadom.
                  </label>
                </p>
              </div>
              {authErrors.terms ? <p className="-mt-3 text-sm text-destructive" role="alert">{authErrors.terms}</p> : null}

              <Button
                type="submit"
                size="lg"
                className="mt-1 h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
                disabled={loading || avatarProcessing}
              >
                {loading
                  ? "Regisztráció folyamatban…"
                  : teamInvite
                    ? "Regisztráció"
                    : mode === "skipper"
                      ? "Profil mentése és Hajó regisztrációja"
                      : "Profil létrehozása"}
              </Button>

              {authErrors.submit ? <p className="text-sm text-destructive" role="alert">{authErrors.submit}</p> : null}

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setPassword("")
                    setFormError(null)
                    setAuthErrors({})
                    setView("login")
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  {mode === "skipper" ? "Már van fiókod? Bejelentkezés" : "Vissza a bejelentkezéshez"}
                </button>
              </div>
            </form>
          </div>
        ) : view === "boat" ? (
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <DialogHeader className="gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Sailboat className="h-5 w-5" aria-hidden="true" />
              </div>
              <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Hajó regisztrációja
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                Add meg a hajód fix adatait. Ezt csak egyszer kell kitöltened!
              </DialogDescription>
            </DialogHeader>

            <form noValidate onSubmit={handleBoatSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="boat-name">Hajó neve</Label>
                  <Input
                    id="boat-name"
                    type="text"
                    required
                    placeholder="Pl. Sirocco"
                    value={boatNameValue}
                    onChange={(e) => {
                      setBoatNameValue(e.target.value)
                      clearAuthError("boatName")
                    }}
                    className="h-11"
                    aria-invalid={!!authErrors.boatName}
                  />
                  {authErrors.boatName ? <p className="text-sm text-destructive" role="alert">{authErrors.boatName}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="boat-class">Hajó típusa / Hajóosztály</Label>
                  <Input
                    id="boat-class"
                    type="text"
                    required
                    placeholder='Pl. "75-ös cirkáló", "Bavaria 32"'
                    value={boatClassValue}
                    onChange={(e) => {
                      setBoatClassValue(e.target.value)
                      clearAuthError("boatClass")
                    }}
                    className="h-11"
                    aria-invalid={!!authErrors.boatClass}
                  />
                  {authErrors.boatClass ? <p className="text-sm text-destructive" role="alert">{authErrors.boatClass}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="boat-harbor">Bázis kikötő</Label>
                  <Input
                    id="boat-harbor"
                    type="text"
                    required
                    placeholder="Pl. Balatonfüred"
                    value={boatHarbor}
                    onChange={(e) => {
                      setBoatHarbor(e.target.value)
                      clearAuthError("boatHarbor")
                    }}
                    className="h-11"
                    aria-invalid={!!authErrors.boatHarbor}
                  />
                  {authErrors.boatHarbor ? <p className="text-sm text-destructive" role="alert">{authErrors.boatHarbor}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="boat-crew-size">Max legénységi létszám</Label>
                  <Input
                    id="boat-crew-size"
                    type="number"
                    min={1}
                    max={30}
                    placeholder="Pl. 8"
                    value={boatCrewSize}
                    onChange={(e) => {
                      setBoatCrewSize(e.target.value)
                      clearAuthError("boatCrewSize")
                    }}
                    className="h-11"
                    aria-invalid={!!authErrors.boatCrewSize}
                  />
                  {authErrors.boatCrewSize ? <p className="text-sm text-destructive" role="alert">{authErrors.boatCrewSize}</p> : null}
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="boat-photo">Hajó fotó</Label>
                  <label
                    htmlFor="boat-photo"
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-6 text-center text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                  >
                    <ImagePlus className="h-6 w-6" aria-hidden="true" />
                    <span className="text-sm font-medium">Kép feltöltése a hajóról</span>
                    <input id="boat-photo" type="file" accept="image/*" className="sr-only" />
                  </label>
                </div>

                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label>Csapat jellege</Label>
                  <div className="flex flex-col gap-2">
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
                            onChange={() => setCrewType(option.value)}
                            className="sr-only"
                          />
                          {option.label}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="mt-1 h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
              >
                Hajó mentése és Tovább a hirdetéshez
              </Button>
            </form>
          </div>
        ) : view === "preview" ? (
          <form onSubmit={handleListingSubmit} className="flex flex-col">
            <ListingDialogHeader boatName={boatDisplayName ?? ""} step={2} onClose={() => handleOpenChange(false)} />

            <div className="flex flex-col gap-5 px-5 py-6 sm:px-6">
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                Így fog kinézni a hirdetésed. Állítsd be, melyik képrész látszódjon a kártyán.
              </p>
              <div className="mx-auto w-full max-w-[280px]" aria-hidden="true" inert>
                <BoatCard
                  listing={buildPreviewListing()}
                  userId={null}
                  onRequestApply={() => false}
                  onApply={() => {}}
                  applyingId={null}
                  onCancel={() => {}}
                  cancelingId={null}
                />
              </div>

              {boatImageUrl ? (
                <div className="flex flex-col gap-2">
                  <Label>Kiemelt képrész</Label>
                  <ListingImageFocusPicker src={boatImageUrl} focus={listingFocus} onChange={setListingFocus} />
                  <p className="text-xs text-muted-foreground">
                    Kattints vagy húzd a képen arra, amit a kártyán mindenképp látni kell. A részletek ablakban a teljes kép látszik.
                  </p>
                </div>
              ) : null}
              {listingErrors.submit ? <p className="text-sm text-destructive" role="alert">{listingErrors.submit}</p> : null}
            </div>

            <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-border bg-popover px-5 py-3 sm:flex-row sm:justify-between sm:px-6">
              <Button type="button" variant="outline" className="h-11" onClick={() => setView("listing")}>
                Vissza a szerkesztéshez
              </Button>
              <Button type="submit" className="h-11 bg-brand px-5 text-base text-white hover:bg-brand/90" disabled={isListingSaving}>
                {isListingSaving ? "Hirdetés mentése..." : "Hirdetés közzététele"}
              </Button>
            </div>
          </form>
        ) : (
          <form noValidate onSubmit={handleListingSubmit} className="flex flex-col">
            <ListingDialogHeader boatName={boatDisplayName ?? ""} step={1} onClose={() => handleOpenChange(false)} />

            <div className="flex flex-col gap-8 px-5 py-6 sm:px-6">
              <section aria-labelledby="listing-section-when" className="flex flex-col gap-3.5">
                <ListingSectionTitle id="listing-section-when" number={1}>
                  Mire keresel?
                </ListingSectionTitle>

                {showListingEventSummary ? (
                  <>
                    <div className="flex flex-wrap items-center gap-3.5 rounded-xl bg-secondary/60 p-3.5">
                      <div className="flex h-13 w-13 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-card leading-tight">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          {formatShortMonth(listingStartDate)}
                        </span>
                        <span className="text-xl font-bold text-brand">{formatDayOfMonth(listingStartDate)}</span>
                      </div>
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="truncate text-base font-bold text-foreground">{listingTitle}</p>
                        <p className="text-sm text-muted-foreground">
                          {[formatDateText(listingStartDate, listingEndDate, listingOneDay), listingLocation].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Button type="button" variant="outline" className="h-11" onClick={() => setListingEventDetailsOpen(true)}>
                        Módosítás
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">Az esemény adatait átvettük, csak azt kell megadnod, kit keresel.</p>
                  </>
                ) : (
                  <>
                    <div className="flex gap-1 rounded-xl bg-secondary p-1" role="radiogroup" aria-label="Időtartam">
                      {listingCommitmentOptions.map((option) => {
                        const active = listingCommitment === option.value
                        const disabled = isEventPrefilledListing && option.value === "szezon"
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={disabled}
                            onClick={() => {
                              setListingCommitment(option.value)
                              if (option.value === "szezon") setListingOneDay(false)
                            }}
                            className={`h-10 min-w-0 flex-1 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:text-[15px] ${
                              active ? "bg-card text-brand shadow-sm" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="listing-title">Cím</Label>
                      <Input
                        id="listing-title"
                        type="text"
                        value={listingTitle}
                        onChange={(e) => {
                          setListingTitle(e.target.value)
                          if (listingErrors.title) setListingErrors((prev) => ({ ...prev, title: undefined }))
                        }}
                        placeholder="Pl. Kékszalag 2027"
                        className="h-11"
                        aria-invalid={!!listingErrors.title}
                      />
                      {listingErrors.title ? <p className="text-sm text-destructive" role="alert">{listingErrors.title}</p> : null}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="listing-location">Helyszín</Label>
                      <Input
                        id="listing-location"
                        type="text"
                        value={listingLocation}
                        onChange={(e) => {
                          setListingLocation(e.target.value)
                          if (listingErrors.location) setListingErrors((prev) => ({ ...prev, location: undefined }))
                        }}
                        placeholder="Pl. Balatonfüred"
                        className="h-11"
                        aria-invalid={!!listingErrors.location}
                      />
                      {listingErrors.location ? <p className="text-sm text-destructive" role="alert">{listingErrors.location}</p> : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="listing-start-date">{listingCommitment === "szezon" ? "Szezon kezdete" : "Kezdete"}</Label>
                        <DatePicker
                          id="listing-start-date"
                          min={getTomorrowDateInputValue()}
                          value={listingStartDate}
                          onChange={(value) => {
                            setListingStartDate(value)
                            if (listingErrors.startDate) setListingErrors((prev) => ({ ...prev, startDate: undefined }))
                          }}
                          aria-invalid={!!listingErrors.startDate}
                        />
                        {listingErrors.startDate ? <p className="text-sm text-destructive" role="alert">{listingErrors.startDate}</p> : null}
                      </div>

                      {listingOneDay ? null : (
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="listing-end-date">{listingCommitment === "szezon" ? "Szezon vége" : "Vége"}</Label>
                          <DatePicker
                            id="listing-end-date"
                            min={listingStartDate > getTomorrowDateInputValue() ? listingStartDate : getTomorrowDateInputValue()}
                            value={listingEndDate}
                            onChange={(value) => {
                              setListingEndDate(value)
                              if (listingErrors.endDate) setListingErrors((prev) => ({ ...prev, endDate: undefined }))
                            }}
                            aria-invalid={!!listingErrors.endDate}
                          />
                          {listingErrors.endDate ? <p className="text-sm text-destructive" role="alert">{listingErrors.endDate}</p> : null}
                        </div>
                      )}
                    </div>

                    {listingCommitment === "egy-verseny" ? (
                      <label htmlFor="listing-one-day" className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground">
                        <input
                          id="listing-one-day"
                          type="checkbox"
                          checked={listingOneDay}
                          onChange={(e) => setListingOneDay(e.target.checked)}
                          className="h-4 w-4 rounded border-border accent-accent"
                        />
                        Egynapos esemény
                      </label>
                    ) : null}
                  </>
                )}
              </section>

              <section aria-labelledby="listing-section-who" className="flex flex-col gap-3.5">
                <ListingSectionTitle id="listing-section-who" number={2}>
                  Kit keresel?
                </ListingSectionTitle>

                <div className="flex gap-1 rounded-xl bg-secondary p-1" role="radiogroup" aria-label="Kit keresel?">
                  {listingModeOptions.map((option) => {
                    const active = listingMode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setListingMode(option.value)
                          if (listingErrors.post) setListingErrors((prev) => ({ ...prev, post: undefined }))
                        }}
                        className={`h-10 min-w-0 flex-1 rounded-lg text-sm font-semibold transition-colors sm:text-[15px] ${
                          active ? "bg-card text-brand shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {option.title}
                      </button>
                    )
                  })}
                </div>

                {listingMode === "segito" ? (
                  <p className="text-sm text-muted-foreground">
                    Bárkit szívesen látsz, a fedélzeten megtanítod. A hirdetésen „Segítő legénység” szerepel.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div
                      id="listing-post"
                      role="group"
                      aria-label="Keresett posztok"
                      className={`flex flex-wrap gap-2 rounded-lg ${listingErrors.post ? "outline outline-1 outline-offset-4 outline-destructive" : ""}`}
                    >
                      {CREW_ROLES.map((role) => {
                        const selected = listingPosts.includes(role.value)
                        return (
                          <button
                            key={role.value}
                            type="button"
                            aria-pressed={selected}
                            title={role.help}
                            onClick={() => toggleListingPost(role.value)}
                            className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                              selected ? "border-brand bg-brand text-white" : "border-border bg-card text-foreground hover:border-brand/50"
                            }`}
                          >
                            {role.label}
                            <span className={`text-xs font-normal ${selected ? "text-white/75" : "text-muted-foreground"}`}>{role.term}</span>
                          </button>
                        )
                      })}
                      {listingCustomPosts.map((post) => (
                        <button
                          key={post}
                          type="button"
                          aria-label={`${post} törlése`}
                          onClick={() => toggleListingPost(post)}
                          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-brand bg-brand px-3.5 text-sm font-medium text-white"
                        >
                          {post}
                          <span aria-hidden="true" className="text-white/75">×</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Input
                        aria-label="Egyéb poszt neve"
                        value={listingCustomPost}
                        maxLength={MAX_CUSTOM_ROLE_LENGTH}
                        onChange={(e) => setListingCustomPost(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            addCustomListingPost()
                          }
                        }}
                        placeholder="Egyéb poszt, pl. fotós, szerelő"
                        className="h-11"
                      />
                      <Button type="button" variant="outline" className="h-11" onClick={addCustomListingPost} disabled={!listingCustomPost.trim()}>
                        Hozzáadás
                      </Button>
                    </div>
                  </div>
                )}

                {listingErrors.post ? (
                  <p className="text-sm text-destructive" role="alert">
                    {listingErrors.post}
                  </p>
                ) : null}

                <div className="flex flex-col divide-y divide-border rounded-xl bg-secondary/60">
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                    <p className="text-sm font-semibold text-foreground">Hány főt keresel?</p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-11 text-lg"
                        aria-label="Eggyel kevesebb"
                        disabled={listingCrewNeeded <= MIN_CREW_NEEDED}
                        onClick={() => setListingCrewNeeded((n) => Math.max(MIN_CREW_NEEDED, n - 1))}
                      >
                        −
                      </Button>
                      <span className="w-8 text-center text-lg font-bold text-foreground" aria-live="polite">
                        {listingCrewNeeded}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-11 text-lg"
                        aria-label="Eggyel több"
                        disabled={listingCrewNeeded >= MAX_CREW_NEEDED}
                        onClick={() => setListingCrewNeeded((n) => Math.min(MAX_CREW_NEEDED, n + 1))}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3.5 py-2">
                    <input
                      type="checkbox"
                      checked={listingBeginnerFriendly}
                      onChange={(e) => setListingBeginnerFriendly(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-accent"
                    />
                    <span className="text-sm text-foreground">
                      <span className="font-medium">Kezdőket is szívesen látok</span>
                      <span className="text-muted-foreground"> · „Kezdőbarát” jelölést kap</span>
                    </span>
                  </label>
                </div>
              </section>

              <section aria-labelledby="listing-section-details" className="flex flex-col gap-3.5">
                <ListingSectionTitle id="listing-section-details" number={3} hint="nem kötelező">
                  Részletek
                </ListingSectionTitle>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="listing-note">Üzenet a jelentkezőknek</Label>
                  <textarea
                    id="listing-note"
                    value={listingNote}
                    onChange={(e) => setListingNote(e.target.value.slice(0, 300))}
                    maxLength={300}
                    rows={2}
                    placeholder="Pl. összeszokott csapat vagyunk, indulás péntek este."
                    className="min-h-[68px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                  <p className="text-right text-xs text-muted-foreground">{listingNote.length} / 300</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span id="listing-max-applicants" className="text-sm font-medium text-foreground">
                    Legfeljebb ennyi jelentkezőt fogadsz
                  </span>
                  <div role="radiogroup" aria-labelledby="listing-max-applicants" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {listingMaxApplicantOptions.map((option) => {
                      const active = listingMaxApplicants === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setListingMaxApplicants(option.value)}
                          className={`flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors ${
                            active ? "border-2 border-brand bg-brand/5 text-brand" : "border-border bg-card text-foreground hover:border-brand/50"
                          }`}
                        >
                          {option.label}
                          {option.pro ? (
                            <span className="rounded-md bg-brand-orange px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-orange-foreground">
                              Pro
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Az elutasítottak nem számítanak bele. A Pro opciók egyelőre ingyen kipróbálhatók.
                  </p>
                </div>
              </section>
              {listingErrors.submit ? <p className="text-sm text-destructive" role="alert">{listingErrors.submit}</p> : null}
            </div>

            <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-border bg-popover px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="min-w-0 text-sm text-muted-foreground">
                <span className="font-bold text-foreground">{listingCrewNeeded} fő</span>
                {listingPositions.length > 0 ? ` · ${listingPositions.map((post) => crewRoleLabel(post).toLowerCase()).join(", ")}` : ""}
                {listingBeginnerFriendly ? " · kezdőbarát" : ""}
              </p>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => handleOpenChange(false)}>
                  Mégse
                </Button>
                <Button type="submit" className="h-11 flex-[2] bg-brand px-5 text-base text-white hover:bg-brand/90 sm:flex-none" disabled={isListingSaving}>
                  Tovább az előnézethez
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
    <ImageUploadErrorDialog message={avatarError} onClose={() => setAvatarError(null)} />
    </>
  )
}

function ListingDialogHeader({ boatName, step, onClose }: { boatName: string; step: 1 | 2; onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-popover px-5 py-4 sm:px-6">
      <DialogHeader className="min-w-0 gap-0.5">
        <DialogTitle className="text-xl font-bold tracking-tight text-foreground">Hirdetés feladása</DialogTitle>
        <DialogDescription className="text-sm">
          {boatName ? `${boatName} · ` : ""}
          <span className={step === 1 ? "font-semibold text-brand" : undefined}>1. Adatok</span>
          <span aria-hidden="true"> → </span>
          <span className={step === 2 ? "font-semibold text-brand" : undefined}>2. Előnézet</span>
        </DialogDescription>
      </DialogHeader>
      <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Bezárás" onClick={onClose}>
        <X className="h-5 w-5" aria-hidden="true" />
      </Button>
    </div>
  )
}

function ListingSectionTitle({
  id,
  number,
  hint,
  children,
}: {
  id: string
  number: number
  hint?: string
  children: React.ReactNode
}) {
  return (
    <h3 id={id} className="flex items-center gap-2.5 text-base font-bold text-foreground">
      <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-ink">
        {number}
      </span>
      {children}
      {hint ? <span className="text-sm font-medium text-muted-foreground">{hint}</span> : null}
    </h3>
  )
}
