"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Anchor, Mail, Lock, UserPlus, ArrowLeft, Camera, Sailboat, ImagePlus, CheckCircle2, KeyRound } from "lucide-react"
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

const levelOptions: Record<string, string> = {
  kezdo: "Kezdő",
  halado: "Haladó",
  profi: "Profi - Versenyző",
}

const postOptions: Record<string, string> = {
  mancsaft: "Mancsaft",
  kormanyos: "Kormányos",
  mindegy: "Mindegy / Súlynak jövök",
}

const listingPostOptions: { value: string; label: string }[] = [
  { value: "kormanyos", label: "Kormányos" },
  { value: "taktikus", label: "Taktikus" },
  { value: "main-trim", label: "Main Trim" },
  { value: "jib-trim", label: "Jib trim" },
  { value: "mast", label: "Mast" },
  { value: "fordeck", label: "Fordeck" },
]

const commitmentOptions: Record<string, string> = {
  "egy-verseny": "Csak egy konkrét versenyre / hétvégére",
  szezon: "Hosszú távra / Szezoncsapatba",
}

const crewTypeOptions: { value: string; label: string }[] = [
  { value: "verprofi", label: "Vérprofi versenyzés" },
  { value: "amator", label: "Amatőr versenyzés / Tanulás" },
  { value: "tura", label: "Túra / Hobbi vitorlázás" },
]

function buildResetPasswordRedirectUrl() {
  const runtimeOrigin = typeof window !== "undefined" ? window.location.origin : ""
  const runtimeHost = runtimeOrigin ? new URL(runtimeOrigin).hostname.toLowerCase() : ""

  if (runtimeOrigin && runtimeHost !== "localhost" && runtimeHost !== "127.0.0.1") {
    return `${runtimeOrigin}/reset-password`
  }

  const configuredBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (configuredBaseUrl) {
    try {
      const parsed = new URL(configuredBaseUrl)
      const host = parsed.hostname.toLowerCase()

      if (host !== "localhost" && host !== "127.0.0.1") {
        return new URL("/reset-password", parsed).toString()
      }
    } catch {
      // Hibás env esetén az utolsó fallback ágra megyünk.
    }
  }

  return `${window.location.origin}/reset-password`
}

type View = "login" | "register" | "boat" | "listing" | "forgot"
type Mode = "sailor" | "skipper"

export function AuthGateModal({
  open,
  onOpenChange,
  boatName,
  mode = "sailor",
  initialView,
  boatId,
  userId,
  onListingCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  boatName?: string
  mode?: Mode
  initialView?: View
  boatId?: string
  userId?: string
  onListingCreated?: () => void
}) {
  const router = useRouter()
  const [view, setView] = useState<View>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [level, setLevel] = useState<string>("kezdo")
  const [post, setPost] = useState<string>("mancsaft")
  const [boatNameValue, setBoatNameValue] = useState("")
  const [boatClassValue, setBoatClassValue] = useState("")
  const [boatHarbor, setBoatHarbor] = useState("")
  const [boatCrewSize, setBoatCrewSize] = useState("")
  const [crewType, setCrewType] = useState<string>("amator")
  const [listingCommitment, setListingCommitment] = useState<string>("egy-verseny")
  const [listingPosts, setListingPosts] = useState<string[]>([])
  const [listingLevel, setListingLevel] = useState<string>("kezdo")
  const [listingNote, setListingNote] = useState("")
  const [listingTitle, setListingTitle] = useState("")
  const [listingLocation, setListingLocation] = useState("")
  const [listingStartDate, setListingStartDate] = useState("")
  const [listingEndDate, setListingEndDate] = useState("")
  const [listingOneDay, setListingOneDay] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>("")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [isListingSaving, setIsListingSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [listingErrors, setListingErrors] = useState<{
    title?: string
    location?: string
    date?: string
    post?: string
    level?: string
    submit?: string
  }>({})

  function resetFormState() {
    setEmail("")
    setPassword("")
    setFullName("")
    setPhone("")
    setBirthdate("")
    setLevel("kezdo")
    setPost("mancsaft")
    setSubmitted(false)
    setSelectedFile(null)
    setPreviewUrl("")
    setForgotSent(false)
    setLoading(false)
    setFormError(null)
    setBoatNameValue("")
    setBoatClassValue("")
    setBoatHarbor("")
    setBoatCrewSize("")
    setCrewType("amator")
    setListingTitle("")
    setListingLocation("")
    setListingStartDate("")
    setListingEndDate("")
    setListingOneDay(false)
    setListingCommitment("egy-verseny")
    setListingPosts([])
    setListingLevel("kezdo")
    setListingNote("")
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

  // Megnyitáskor a kért nézetre ugrunk; skipper esetén alapból a regisztráció.
  useEffect(() => {
    if (open) {
      resetFormState()
      setView(initialView ?? (mode === "skipper" ? "register" : "login"))
    }
  }, [open, mode, initialView])

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
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildResetPasswordRedirectUrl(),
      })
      if (error) {
        setFormError(error.message)
        return
      }
      setForgotSent(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Ismeretlen hiba történt.")
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      })

      if (error) {
        console.error("Bejelentkezési hiba:", error)
        setFormError(error.message)
        return
      }

      if (!data?.user) {
        const errorMessage = "Bejelentkezés sikertelen."
        console.error(errorMessage)
        setFormError(errorMessage)
        return
      }

      handleOpenChange(false)
      if (mode === "skipper") {
        router.push("/kapitany-dashboard")
        return
      }

      router.refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Ismeretlen hiba történt.")
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setSelectedFile(null)
      setPreviewUrl("")
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
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
    if (mode === "skipper") {
      setLoading(true)
      try {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email,
          password: password,
        })

        if (signUpError) {
          console.error("Regisztrációs hiba:", signUpError)
          setFormError(signUpError.message)
          return
        }

        if (!data?.user) {
          const errorMessage = "Felhasználó létrehozása sikertelen."
          console.error(errorMessage)
          setFormError(errorMessage)
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
            setFormError(uploadError.message)
            return
          }

          const { data: publicUrlData } = supabase.storage
            .from("avatars")
            .getPublicUrl(filePath)

          avatarUrl = publicUrlData?.publicUrl ?? null
          if (!avatarUrl) {
            const errorMessage = "Nem sikerült lekérni az avatar nyilvános URL-jét."
            console.error(errorMessage, publicUrlData)
            setFormError(errorMessage)
            return
          }
        }

        const { error: insertError } = await supabase.from("users").insert([
          {
            id: userId,
            email: email,
            full_name: fullName,
            phone: phone,
            birthdate: birthdate || null,
            role: "kapitany",
            avatar_url: avatarUrl,
          },
        ])

        if (insertError) {
          console.error("Adatbázis beszúrási hiba:", insertError)
          setFormError(insertError.message)
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
            setFormError(signInError.message)
            return
          }

          if (!signInData?.user) {
            const errorMessage = "A bejelentkezés nem sikerült."
            console.error(errorMessage)
            setFormError(errorMessage)
            return
          }
        } else {
          // Ha a signup már létrehozta a sessiont, hagyjuk, hogy az auth állapot frissüljön.
          await supabase.auth.setSession(session)
        }

        await router.push("/kapitany-dashboard")
        handleOpenChange(false)
        return
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Ismeretlen hiba történt.")
      } finally {
        setLoading(false)
      }
    }

    setLoading(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: password,
      })

      if (signUpError) {
        console.error("Regisztrációs hiba:", signUpError)
        setFormError(signUpError.message)
        return
      }

      if (!data?.user) {
        const errorMessage = "Felhasználó létrehozása sikertelen."
        console.error(errorMessage)
        setFormError(errorMessage)
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
          setFormError(uploadError.message)
          return
        }

        const { data: publicUrlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath)

        avatarUrl = publicUrlData?.publicUrl ?? null
        if (!avatarUrl) {
          const errorMessage = "Nem sikerült lekérni az avatar nyilvános URL-jét."
          console.error(errorMessage, publicUrlData)
          setFormError(errorMessage)
          return
        }
      }

      const { error: insertError } = await supabase.from("users").insert([
        {
          id: userId,
          email: email,
          full_name: fullName,
          phone: phone || null,
          birthdate: birthdate || null,
          role: "mancsaft",
          avatar_url: avatarUrl,
        },
      ])

      if (insertError) {
        console.error("Adatbázis beszúrási hiba:", insertError)
        setFormError(insertError.message)
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
          setFormError(signInError.message)
          return
        }

        if (!signInData?.user) {
          const errorMessage = "A bejelentkezés nem sikerült."
          console.error(errorMessage)
          setFormError(errorMessage)
          return
        }
      } else {
        await supabase.auth.setSession(session)
      }

      handleOpenChange(false)
      await router.push("/bongeszes")
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Ismeretlen hiba történt.")
    } finally {
      setLoading(false)
    }
  }

  function handleBoatSubmit(e: React.FormEvent) {
    e.preventDefault()
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
      newErrors.date = listingCommitment === "szezon" ? "Szezon kezdő dátuma kötelező." : "Kezdő dátum megadása kötelező."
    }

    if (!listingOneDay && !listingEndDate) {
      newErrors.date =
        listingCommitment === "szezon"
          ? "Szezon záró dátuma megadása kötelező."
          : "Végdátum megadása kötelező, vagy jelöld be az 1 napos eseményt."
    }

    if (listingEndDate && listingStartDate && listingEndDate < listingStartDate) {
      newErrors.date = "A végdátumnak nem lehet korábbi a kezdő dátumnál."
    }

    if (listingPosts.length === 0) {
      newErrors.post = "Legalább egy keresett poszt kiválasztása kötelező."
    }

    if (!listingLevel) {
      newErrors.level = "Elvárt tapasztalati szint kiválasztása kötelező."
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
    setIsListingSaving(true)

    try {
      const positions = listingPosts
      const dateText = formatDateText(listingStartDate, listingEndDate, listingOneDay)
      const listingPayload = {
        boat_id: boatId,
        user_id: userId,
        title: listingTitle.trim(),
        date_text: dateText,
        start_date: listingStartDate || null,
        end_date: (!listingOneDay && listingEndDate) ? listingEndDate : null,
        commitment: listingCommitment,
        location: listingLocation.trim(),
        positions,
        experience_level: listingLevel,
        captain_note: listingNote.trim() || null,
        created_at: new Date().toISOString(),
      }

      const { error } = await supabase.from("ads").insert([listingPayload])

      if (error) {
        // Backward compatibility: if captain_note column is not deployed yet, save without it.
        const isUnknownColumn = String(error.code ?? "") === "42703"
          || /column/i.test(error.message ?? "")

        if (!isUnknownColumn) {
          setListingErrors({ submit: error.message })
          return
        }

        const { error: fallbackError } = await supabase.from("ads").insert([
          {
            ...listingPayload,
            captain_note: undefined,
          },
        ])

        if (fallbackError) {
          setListingErrors({ submit: fallbackError.message })
          return
        }
      }

      onListingCreated?.()

      setSubmitted(true)
      setTimeout(() => handleOpenChange(false), 1800)
    } finally {
      setIsListingSaving(false)
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] gap-0 overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] rounded-2xl p-0 sm:max-w-lg"
      >
        {submitted ? (
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

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
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
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 pl-9"
                    />
                  </div>
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
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pl-9"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
                >
                  {loading ? "Bejelentkezés..." : "Bejelentkezés"}
                </Button>

                {formError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {formError === "Invalid login credentials"
                      ? "Hibás e-mail cím vagy jelszó."
                      : formError}
                  </p>
                ) : null}

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setFormError(null); setView("forgot") }}
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
                onClick={() => setView("register")}
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

            {forgotSent ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                </div>
                <p className="font-semibold text-foreground">Link elküldve!</p>
                <p className="text-sm text-muted-foreground">
                  Ellenőrizd a postaládád (spam mappát is), és kattints a kapott linkre.
                </p>
                <button
                  type="button"
                  onClick={() => { setForgotSent(false); setView("login") }}
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Vissza a bejelentkezéshez
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                {formError ? (
                  <p className="text-sm text-destructive" role="alert">{formError}</p>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="forgot-email">E-mail cím</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="forgot-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="nev@example.hu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 pl-9"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
                >
                  {loading ? "Küldés..." : "Link leküldése"}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => { setFormError(null); setView("login") }}
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
                {mode === "skipper" ? "Kapitány profil létrehozása" : "Mancsaft profil létrehozása"}
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                {mode === "skipper"
                  ? "Add meg az alapadataidat, majd a következő lépésben regisztráld a hajódat és a szabad helyet."
                  : "Add meg a vitorlás profilod alapadatait, hogy a kapitányok láthassák a tapasztalatodat."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleRegister} className="flex flex-col gap-4">
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
                    accept="image/*"
                    className="sr-only"
                    onChange={handleAvatarChange}
                  />
                </label>
                <div>
                  <label htmlFor="reg-avatar" className="cursor-pointer font-semibold text-foreground">
                    Profilkép hozzáadása
                  </label>
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
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-11"
                  />
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
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-password">Jelszó</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-phone">Telefonszám</Label>
                  <Input
                    id="reg-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+36..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reg-birthdate">Születési dátum</Label>
                  <Input
                    id="reg-birthdate"
                    type="date"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                    className="h-11"
                  />
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

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reg-post">Preferált posztok</Label>
                      <Select value={post} onValueChange={(v) => setPost(v as string)}>
                        <SelectTrigger id="reg-post" className="h-11 w-full">
                          <SelectValue>{(v: string) => postOptions[v] ?? "Válassz"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(postOptions).map(([value, label]) => (
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

              <Button
                type="submit"
                size="lg"
                className="mt-1 h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
                disabled={loading}
              >
                {loading ? "Regisztráció folyamatban…" : mode === "skipper" ? "Profil mentése és Hajó regisztrációja" : "Profil mentése és Jelentkezés"}
              </Button>

              {formError ? (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              ) : null}

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setView("login")}
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

            <form onSubmit={handleBoatSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="boat-name">Hajó neve</Label>
                  <Input
                    id="boat-name"
                    type="text"
                    required
                    placeholder="Pl. Sirocco"
                    value={boatNameValue}
                    onChange={(e) => setBoatNameValue(e.target.value)}
                    className="h-11"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="boat-class">Hajó típusa / Hajóosztály</Label>
                  <Input
                    id="boat-class"
                    type="text"
                    required
                    placeholder='Pl. "75-ös cirkáló", "Bavaria 32"'
                    value={boatClassValue}
                    onChange={(e) => setBoatClassValue(e.target.value)}
                    className="h-11"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="boat-harbor">Bázis kikötő</Label>
                  <Input
                    id="boat-harbor"
                    type="text"
                    required
                    placeholder="Pl. Balatonfüred"
                    value={boatHarbor}
                    onChange={(e) => setBoatHarbor(e.target.value)}
                    className="h-11"
                  />
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
                    onChange={(e) => setBoatCrewSize(e.target.value)}
                    className="h-11"
                  />
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
        ) : (
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            <DialogHeader className="gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Anchor className="h-5 w-5" aria-hidden="true" />
              </div>
              <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Szabad hely hirdetése a fedélzeten
              </DialogTitle>
              <DialogDescription className="text-pretty leading-relaxed">
                Melyik eseményre vagy időszakra keresel legénységet?
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleListingSubmit} className="flex flex-col gap-4">
              {listingErrors.submit ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {listingErrors.submit}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label>Elköteleződés típusa</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Object.entries(commitmentOptions).map(([value, label]) => {
                      const active = listingCommitment === value
                      return (
                        <label
                          key={value}
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
                            name="listing-commitment"
                            value={value}
                            checked={active}
                            onChange={() => {
                              setListingCommitment(value)
                              if (value === "szezon") {
                                setListingOneDay(false)
                              }
                            }}
                            className="sr-only"
                          />
                          {label}
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="listing-title">Hirdetés címe</Label>
                  <Input
                    id="listing-title"
                    type="text"
                    value={listingTitle}
                    onChange={(e) => {
                      setListingTitle(e.target.value)
                      if (listingErrors.title) {
                        setListingErrors((prev) => ({ ...prev, title: undefined }))
                      }
                    }}
                    placeholder='Pl. "Kékszalag Erste Kör"'
                    className="h-11"
                    aria-invalid={!!listingErrors.title}
                  />
                  {listingErrors.title ? (
                    <p className="text-sm text-destructive" role="alert">
                      {listingErrors.title}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="listing-location">Helyszín</Label>
                  <Input
                    id="listing-location"
                    type="text"
                    value={listingLocation}
                    onChange={(e) => {
                      setListingLocation(e.target.value)
                      if (listingErrors.location) {
                        setListingErrors((prev) => ({ ...prev, location: undefined }))
                      }
                    }}
                    placeholder="Pl. Balatonfüred"
                    className="h-11"
                    aria-invalid={!!listingErrors.location}
                  />
                  {listingErrors.location ? (
                    <p className="text-sm text-destructive" role="alert">
                      {listingErrors.location}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="listing-start-date">
                      {listingCommitment === "szezon" ? "Szezon kezdete" : "Kezdő dátum"}
                    </Label>
                    <Input
                      id="listing-start-date"
                      type="date"
                      value={listingStartDate}
                      onChange={(e) => {
                        setListingStartDate(e.target.value)
                        if (listingErrors.date) {
                          setListingErrors((prev) => ({ ...prev, date: undefined }))
                        }
                      }}
                      className="h-11"
                      aria-invalid={!!listingErrors.date}
                    />
                  </div>

                  {listingOneDay ? null : (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="listing-end-date">
                        {listingCommitment === "szezon" ? "Szezon vége" : "Végdátum"}
                      </Label>
                      <Input
                        id="listing-end-date"
                        type="date"
                        value={listingEndDate}
                        onChange={(e) => {
                          setListingEndDate(e.target.value)
                          if (listingErrors.date) {
                            setListingErrors((prev) => ({ ...prev, date: undefined }))
                          }
                        }}
                        className="h-11"
                        aria-invalid={!!listingErrors.date}
                      />
                    </div>
                  )}
                </div>

                {listingErrors.date ? (
                  <p className="sm:col-span-2 text-sm text-destructive" role="alert">
                    {listingErrors.date}
                  </p>
                ) : null}

                {listingCommitment === "egy-verseny" ? (
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="listing-one-day"
                      className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground"
                    >
                      <input
                        id="listing-one-day"
                        type="checkbox"
                        checked={listingOneDay}
                        onChange={(e) => setListingOneDay(e.target.checked)}
                        className="h-4 w-4 rounded border-border text-accent accent-accent"
                      />
                      1 napos esemény
                    </label>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="listing-post">Keresett poszt(ok)</Label>
                  <div id="listing-post" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {listingPostOptions.map((option) => {
                      const checked = listingPosts.includes(option.value)
                      return (
                        <label
                          key={option.value}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:border-accent/50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleListingPost(option.value)}
                            className="h-4 w-4 rounded border-border text-accent accent-accent"
                          />
                          <span className="font-medium text-foreground">{option.label}</span>
                        </label>
                      )
                    })}
                  </div>
                  {listingPosts.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Kiválasztva: {listingPosts
                        .map((value) => listingPostOptions.find((option) => option.value === value)?.label ?? value)
                        .join(", ")}
                    </p>
                  ) : null}
                  {listingErrors.post ? (
                    <p className="text-sm text-destructive" role="alert">
                      {listingErrors.post}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="listing-note">Megjegyzés a hirdetéshez (opcionális)</Label>
                  <textarea
                    id="listing-note"
                    value={listingNote}
                    onChange={(e) => setListingNote(e.target.value.slice(0, 300))}
                    maxLength={300}
                    rows={3}
                    placeholder="Pl. összeszokott csapat vagyunk, versenytapasztalat előny, indulás péntek este..."
                    className="min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                  <p className="text-xs text-muted-foreground">{listingNote.length}/300 karakter</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="listing-level">Elvárt tapasztalati szint</Label>
                  <Select value={listingLevel} onValueChange={(v) => {
                    setListingLevel(v as string)
                    if (listingErrors.level) {
                      setListingErrors((prev) => ({ ...prev, level: undefined }))
                    }
                  }}>
                    <SelectTrigger id="listing-level" className="h-11 w-full">
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
                  {listingErrors.level ? (
                    <p className="text-sm text-destructive" role="alert">
                      {listingErrors.level}
                    </p>
                  ) : null}
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="mt-1 h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
                disabled={isListingSaving}
              >
                {isListingSaving ? "Hirdetés mentése..." : "Hirdetés közzététele"}
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
