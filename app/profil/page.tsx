"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { ArrowLeft, Save, RotateCcw, Trash2, UserRound, Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"

type UserRole = "mancsaft" | "sailor" | "kapitany" | "skipper" | string

type ProfileRow = {
  full_name: string
  phone: string | null
  birthdate: string | null
  role: UserRole
  avatar_url: string | null
}

function roleLabel(role?: string | null) {
  if (role === "kapitany" || role === "skipper") return "Kapitány"
  return "Mancsaft"
}

function toDateInputValue(value?: string | null) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

export default function ProfilPage() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [role, setRole] = useState<UserRole>("mancsaft")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [initial, setInitial] = useState<ProfileRow | null>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteText, setDeleteText] = useState("")

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  useEffect(() => {
    let active = true

    async function loadProfile() {
      setLoading(true)
      setError(null)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        if (active) {
          router.push("/")
        }
        return
      }

      const { data, error: profileError } = await supabase
        .from("users")
        .select("full_name, phone, birthdate, role, avatar_url")
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
        avatar_url: data?.avatar_url ?? null,
      }

      setUserId(user.id)
      setEmail(user.email ?? "")
      setFullName(row.full_name)
      setPhone(row.phone ?? "")
      setBirthdate(toDateInputValue(row.birthdate))
      setRole(row.role)
      setAvatarUrl(row.avatar_url)
      setInitial(row)
      setLoading(false)
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [router])

  const isDirty = useMemo(() => {
    if (!initial) return false
    const initialDate = toDateInputValue(initial.birthdate)
    return (
      fullName !== (initial.full_name ?? "") ||
      phone !== (initial.phone ?? "") ||
      birthdate !== initialDate ||
      (avatarUrl ?? "") !== (initial.avatar_url ?? "") ||
      selectedFile !== null
    )
  }, [initial, fullName, phone, birthdate, avatarUrl, selectedFile])

  function handleDiscard() {
    if (!initial) return
    setFullName(initial.full_name ?? "")
    setPhone(initial.phone ?? "")
    setBirthdate(toDateInputValue(initial.birthdate))
    setRole(initial.role)
    setAvatarUrl(initial.avatar_url)
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    setError(null)
    setNotice("A módosításaid elvetve.")
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedFile(file)
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)
    setAvatarUrl(localUrl)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return

    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      let nextAvatarUrl = initial?.avatar_url ?? null

      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop() ?? "jpg"
        const fileName = `${userId}-${Date.now()}.${fileExt}`
        const filePath = `avatars/${fileName}`

        const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, selectedFile)
        if (uploadError) {
          setError(uploadError.message)
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
          avatar_url: nextAvatarUrl,
        })
        .eq("id", userId)

      if (updateError) {
        setError(updateError.message)
        return
      }

      const updated: ProfileRow = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        birthdate: birthdate || null,
        role,
        avatar_url: nextAvatarUrl,
      }

      setInitial(updated)
      setAvatarUrl(nextAvatarUrl)
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

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center px-4 py-10 sm:px-6">
        <p className="text-sm text-muted-foreground">Profil betöltése...</p>
      </main>
    )
  }

  return (
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

        {notice ? (
          <div className="mb-4 rounded-xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent-foreground">
            {notice}
          </div>
        ) : null}

        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border border-border bg-secondary">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="Profilkép" fill className="object-cover" sizes="80px" />
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
            <Input id="profile-avatar" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
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
                onChange={(e) => setFullName(e.target.value)}
                className="h-11"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-phone">Telefonszám</Label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11"
                placeholder="+36 ..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-birthdate">Születési dátum</Label>
              <Input
                id="profile-birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                className="h-11"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-role">Szerep</Label>
              <Input id="profile-role" value={roleLabel(role)} disabled className="h-11" />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={saving || !isDirty} className="h-11 bg-accent! text-accent-foreground! hover:bg-accent/90!">
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? "Mentés..." : "Módosítások mentése"}
            </Button>
            <Button type="button" variant="outline" disabled={!isDirty || saving} className="h-11" onClick={handleDiscard}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Módosítások elvetése
            </Button>
          </div>
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
  )
}
