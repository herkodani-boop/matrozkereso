"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ArrowLeft, Save, RotateCcw, Trash2, UserRound, Camera, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RequireAuth } from "@/components/require-auth"
import { useAuth } from "@/components/auth-provider"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { ImageUploadErrorDialog } from "@/components/image-upload-error-dialog"
import { optimizeAvatarImage } from "@/lib/avatar-image-optimization"

type ProfileRow = {
  full_name: string
  phone: string | null
  birthdate: string | null
  role: string
  level: string | null
  avatar_url: string | null
}

const experienceLevelLabels: Record<string, string> = {
  kezdo: "Kezdő",
  halado: "Haladó",
  profi: "Profi / Versenyző",
}

function toDateInputValue(value?: string | null) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

function getTodayDateInputValue() {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${today.getFullYear()}-${month}-${day}`
}

function isValidPhoneNumber(value: string) {
  const phone = value.trim()
  const digitCount = phone.replace(/\D/g, "").length
  return /^\+?[0-9\s().-]+$/.test(phone) && digitCount >= 7 && digitCount <= 15
}

export default function ProfilPage() {
  const router = useRouter()
  const { status: authStatus, user: authUser } = useAuth()

  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [role, setRole] = useState("mancsaft")
  const [level, setLevel] = useState("kezdo")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [initial, setInitial] = useState<ProfileRow | null>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarProcessing, setAvatarProcessing] = useState(false)
  const avatarSelectionId = useRef(0)

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [profileErrors, setProfileErrors] = useState<{
    fullName?: string
    phone?: string
    birthdate?: string
    submit?: string
  }>({})

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteText, setDeleteText] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordErrors, setPasswordErrors] = useState<{
    newPassword?: string
    confirmPassword?: string
    submit?: string
  }>({})
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  useEffect(() => {
    if (authStatus === "loading") return
    if (!authUser) {
      router.push("/")
      return
    }

    let active = true

    async function loadProfile(user: User) {
      setLoading(true)
      setError(null)
      setProfileErrors({})

      const { data, error: profileError } = await supabase
        .from("users")
        .select("full_name, phone, birthdate, role, level, avatar_url")
        .eq("id", user.id)
        .maybeSingle()

      if (!active) return

      if (profileError) {
        setError("A profil betöltése nem sikerült.")
        setLoading(false)
        return
      }

      const row: ProfileRow = {
        full_name: data?.full_name ?? "",
        phone: data?.phone ?? "",
        birthdate: data?.birthdate ?? "",
        role: data?.role ?? "mancsaft",
        level: data?.level ?? user.user_metadata?.level ?? "kezdo",
        avatar_url: data?.avatar_url ?? null,
      }

      setUserId(user.id)
      setEmail(user.email ?? "")
      setFullName(row.full_name)
      setPhone(row.phone ?? "")
      setBirthdate(toDateInputValue(row.birthdate))
      setRole(row.role)
      setLevel(row.level ?? "kezdo")
      setAvatarUrl(row.avatar_url)
      setInitial(row)
      setLoading(false)
    }

    void loadProfile(authUser)

    return () => {
      active = false
    }
  }, [authStatus, authUser, router])

  const isDirty = useMemo(() => {
    if (!initial) return false
    const initialDate = toDateInputValue(initial.birthdate)
    return (
      fullName !== (initial.full_name ?? "") ||
      phone !== (initial.phone ?? "") ||
      birthdate !== initialDate ||
      level !== (initial.level ?? "kezdo") ||
      (avatarUrl ?? "") !== (initial.avatar_url ?? "") ||
      selectedFile !== null ||
      avatarProcessing
    )
  }, [initial, fullName, phone, birthdate, level, avatarUrl, selectedFile, avatarProcessing])

  function handleDiscard() {
    if (!initial) return
    avatarSelectionId.current += 1
    setAvatarProcessing(false)
    setFullName(initial.full_name ?? "")
    setPhone(initial.phone ?? "")
    setBirthdate(toDateInputValue(initial.birthdate))
    setLevel(initial.level ?? "kezdo")
    setAvatarUrl(initial.avatar_url)
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setError(null)
    setProfileErrors({})
    setAvatarError(null)
    setNotice("A módosításaid elvetve.")
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const input = e.currentTarget
    input.value = ""
    const selectionId = ++avatarSelectionId.current
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(null)
    setPreviewUrl(null)
    setAvatarUrl(initial?.avatar_url ?? null)
    setAvatarError(null)
    setAvatarProcessing(true)

    try {
      const optimizedFile = await optimizeAvatarImage(file)
      if (selectionId !== avatarSelectionId.current) return
      const localUrl = URL.createObjectURL(optimizedFile)
      setSelectedFile(optimizedFile)
      setPreviewUrl(localUrl)
      setAvatarUrl(localUrl)
    } catch (error) {
      if (selectionId !== avatarSelectionId.current) return
      setAvatarError(error instanceof Error ? error.message : "A profilkép feldolgozása nem sikerült.")
    } finally {
      if (selectionId === avatarSelectionId.current) setAvatarProcessing(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || avatarProcessing) return

    setError(null)
    setProfileErrors({})
    setNotice(null)

    const errors: typeof profileErrors = {}
    if (!fullName.trim()) errors.fullName = "A teljes név megadása kötelező."
    if (!phone.trim()) errors.phone = "A telefonszám megadása kötelező."
    else if (!isValidPhoneNumber(phone)) errors.phone = "Adj meg egy érvényes telefonszámot (7–15 számjegy)."
    if (!birthdate) {
      errors.birthdate = "A születési dátum megadása kötelező."
    } else if (birthdate > getTodayDateInputValue()) {
      errors.birthdate = "A születési dátum nem lehet a jövőben."
    }
    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors)
      return
    }

    setSaving(true)
    try {
      let nextAvatarUrl = initial?.avatar_url ?? null

      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop() ?? "jpg"
        const fileName = `${userId}-${Date.now()}.${fileExt}`
        const filePath = `avatars/${fileName}`

        const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, selectedFile)
        if (uploadError) {
          avatarSelectionId.current += 1
          setSelectedFile(null)
          if (previewUrl) URL.revokeObjectURL(previewUrl)
          setPreviewUrl(null)
          setAvatarUrl(initial?.avatar_url ?? null)
          setAvatarError(uploadError.message)
          return
        }

        const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath)
        nextAvatarUrl = publicUrlData?.publicUrl ?? null
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          birthdate: birthdate || null,
          level,
          avatar_url: nextAvatarUrl,
        })
        .eq("id", userId)

      if (updateError) {
        setProfileErrors({ submit: updateError.message })
        return
      }

      const updated: ProfileRow = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        birthdate: birthdate || null,
        role,
        level,
        avatar_url: nextAvatarUrl,
      }

      setInitial(updated)
      setAvatarUrl(nextAvatarUrl)
      window.dispatchEvent(new Event("profile-updated"))
      setSelectedFile(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
      }
      setNotice("Profil sikeresen frissítve.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAccount() {
    if (!deleteConfirmOpen || deleteText !== "TORLES") return

    setDeleting(true)
    setError(null)
    setNotice(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setError("Nincs aktív bejelentkezés. Lépj be újra, majd próbáld meg ismét.")
        return
      }

      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(payload?.error ?? "A fiók törlése nem sikerült.")
        return
      }

      await supabase.auth.signOut()
      router.push("/")
    } finally {
      setDeleting(false)
    }
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault()
    setPasswordErrors({})
    setPasswordNotice(null)

    if (!newPassword || newPassword.length < 8) {
      setPasswordErrors({ newPassword: "Az új jelszónak legalább 8 karakter hosszúnak kell lennie." })
    }

    if (newPassword && newPassword.length >= 8 && newPassword !== confirmNewPassword) {
      setPasswordErrors({ confirmPassword: "A két új jelszó nem egyezik." })
    }

    if (!newPassword || newPassword.length < 8 || newPassword !== confirmNewPassword) {
      return
    }

    setPasswordSaving(true)
    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (passwordError) {
        setPasswordErrors({ submit: passwordError.message })
        return
      }

      setNewPassword("")
      setConfirmNewPassword("")
      setPasswordNotice("Jelszó sikeresen módosítva.")
    } finally {
      setPasswordSaving(false)
    }
  }

  if (loading) {
    return (
      <RequireAuth>
        <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center px-4 py-10 sm:px-6">
          <p className="text-sm text-muted-foreground">Profil betöltése...</p>
        </main>
      </RequireAuth>
    )
  }

  return (
    <RequireAuth>
      <ImageUploadErrorDialog message={avatarError} onClose={() => setAvatarError(null)} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <Button variant="ghost" className="mb-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Vissza
        </Button>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Profil szerkesztése</h1>
          <p className="mt-1 text-sm text-muted-foreground">Itt módosíthatod az adataidat, vagy törölheted a fiókodat.</p>
        </header>

        {error ? (
          <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <form noValidate onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border border-border bg-secondary">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="Profilkép" fill className="object-cover" sizes="80px" unoptimized={Boolean(previewUrl)} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <UserRound className="h-6 w-6" aria-hidden="true" />
                </div>
              )}
            </div>

            <Label htmlFor="profile-avatar" className="w-fit cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-secondary">
              <span className="inline-flex items-center gap-2">
                <Camera className="h-4 w-4" aria-hidden="true" />
                Profilkép csere
              </span>
            </Label>
            <Input id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
            {avatarProcessing ? <p className="text-sm text-muted-foreground" role="status">Profilkép feldolgozása...</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={email} disabled className="h-11" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-full-name">Teljes név</Label>
              <Input
                id="profile-full-name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value)
                  setProfileErrors((previous) => ({ ...previous, fullName: undefined }))
                }}
                className="h-11"
                required
                aria-invalid={!!profileErrors.fullName}
              />
              {profileErrors.fullName ? <p className="text-sm text-destructive" role="alert">{profileErrors.fullName}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-phone">Telefonszám</Label>
              <Input
                id="profile-phone"
                type="tel"
                required
                pattern={"\\+?[0-9\\s().-]{7,25}"}
                title="Adj meg egy érvényes telefonszámot (7–15 számjegy)."
                value={phone}
                onChange={(e) => {
                  const value = e.target.value
                  setPhone(value)
                  setProfileErrors((previous) => ({ ...previous, phone: undefined }))
                  e.currentTarget.setCustomValidity(
                    value.trim() && !isValidPhoneNumber(value)
                      ? "Adj meg egy érvényes telefonszámot (7–15 számjegy)."
                      : ""
                  )
                }}
                className="h-11"
                placeholder="+36 ..."
                aria-invalid={!!profileErrors.phone}
              />
              {profileErrors.phone ? <p className="text-sm text-destructive" role="alert">{profileErrors.phone}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-birthdate">Születési dátum</Label>
              <DatePicker
                id="profile-birthdate"
                required
                max={getTodayDateInputValue()}
                yearSelect
                value={birthdate}
                onChange={(value) => {
                  setBirthdate(value)
                  setProfileErrors((previous) => ({ ...previous, birthdate: undefined }))
                }}
                aria-invalid={!!profileErrors.birthdate}
              />
              {profileErrors.birthdate ? <p className="text-sm text-destructive" role="alert">{profileErrors.birthdate}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-level">Tapasztalati szint</Label>
              <Select value={level} onValueChange={(value) => setLevel(value as string)}>
                <SelectTrigger id="profile-level" className="h-11 min-h-11 w-full">
                  <SelectValue>{(value: string) => experienceLevelLabels[value] ?? "Válassz szintet"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(experienceLevelLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {notice ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
              {notice}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={saving || avatarProcessing || !isDirty} className="h-11 bg-accent! text-accent-foreground! hover:bg-accent/90!">
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? "Mentés..." : "Módosítások mentése"}
            </Button>
            <Button type="button" variant="outline" disabled={!isDirty || saving} className="h-11" onClick={handleDiscard}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Módosítások elvetése
            </Button>
          </div>
          {profileErrors.submit ? <p className="text-sm text-destructive" role="alert">{profileErrors.submit}</p> : null}
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Jelszó módosítása</h2>
          <p className="mt-1 text-sm text-muted-foreground">Állíts be új jelszót a fiókodhoz.</p>
        </header>

        <form noValidate onSubmit={handlePasswordUpdate} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-new-password">Új jelszó</Label>
              <Input
                id="profile-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setPasswordErrors((previous) => ({ ...previous, newPassword: undefined, submit: undefined }))
                }}
                placeholder="Legalább 8 karakter"
                className="h-11"
                aria-invalid={!!passwordErrors.newPassword}
              />
              {passwordErrors.newPassword ? <p className="text-sm text-destructive" role="alert">{passwordErrors.newPassword}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-confirm-new-password">Új jelszó megerősítése</Label>
              <Input
                id="profile-confirm-new-password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => {
                  setConfirmNewPassword(e.target.value)
                  setPasswordErrors((previous) => ({ ...previous, confirmPassword: undefined, submit: undefined }))
                }}
                placeholder="Írd be újra az új jelszót"
                className="h-11"
                aria-invalid={!!passwordErrors.confirmPassword}
              />
              {passwordErrors.confirmPassword ? <p className="text-sm text-destructive" role="alert">{passwordErrors.confirmPassword}</p> : null}
            </div>
          </div>

          {passwordNotice ? (
            <div
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100"
              role="status"
            >
              {passwordNotice}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={passwordSaving || !newPassword || !confirmNewPassword}
            className="h-11 w-full bg-accent! text-accent-foreground! hover:bg-accent/90! sm:w-fit"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {passwordSaving ? "Jelszó mentése..." : "Jelszó frissítése"}
          </Button>
          {passwordErrors.submit ? <p className="text-sm text-destructive" role="alert">{passwordErrors.submit}</p> : null}
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold text-foreground">Fiók törlése</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ez végleges művelet. A fiók törlése után nem tudsz belépni, és az adataid eltávolításra kerülnek.
        </p>

        {!deleteConfirmOpen ? (
          <Button type="button" variant="outline" className="mt-4 h-11 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Fiók törlése
          </Button>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <Label htmlFor="delete-confirm">Írd be, hogy TORLES</Label>
            <Input
              id="delete-confirm"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              className="h-11 bg-background"
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                disabled={deleting || deleteText !== "TORLES"}
                className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void handleDeleteAccount()}
              >
                {deleting ? "Törlés..." : "Végleges törlés"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                className="h-11"
                onClick={() => {
                  setDeleteConfirmOpen(false)
                  setDeleteText("")
                }}
              >
                Megsem
              </Button>
            </div>
          </div>
        )}
        </section>
      </main>
    </RequireAuth>
  )
}
