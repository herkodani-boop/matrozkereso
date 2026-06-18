"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Anchor, CheckCircle2, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"

function extractHashParams(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash
  return new URLSearchParams(raw)
}

export default function ResetPasswordClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loadingSession, setLoadingSession] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const [success, setSuccess] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const passwordsMatch = password.length > 0 && password === confirmPassword

  const code = useMemo(() => searchParams.get("code"), [searchParams])
  const tokenHash = useMemo(() => searchParams.get("token_hash") ?? searchParams.get("token"), [searchParams])
  const type = useMemo(() => searchParams.get("type"), [searchParams])

  useEffect(() => {
    let active = true

    async function prepareRecoverySession() {
      setLoadingSession(true)
      setError(null)

      try {
        const hashParams = extractHashParams(window.location.hash)
        const accessToken = hashParams.get("access_token")
        const refreshToken = hashParams.get("refresh_token")

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (sessionError) throw sessionError
          if (active) setReady(true)
          return
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
          if (active) setReady(true)
          return
        }

        if (tokenHash && type === "recovery") {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          })
          if (otpError) throw otpError
          if (active) setReady(true)
          return
        }

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session) {
          if (active) setReady(true)
          return
        }

        if (active) {
          setError("A jelszó-visszaállító link érvénytelen vagy lejárt. Kérj új linket.")
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message ?? "Nem sikerült ellenőrizni a visszaállító linket.")
        }
      } finally {
        if (active) setLoadingSession(false)
      }
    }

    void prepareRecoverySession()

    return () => {
      active = false
    }
  }, [code, tokenHash, type])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!password || password.length < 8) {
      setError("A jelszónak legalább 8 karakter hosszúnak kell lennie.")
      return
    }

    if (password !== confirmPassword) {
      setError("A két jelszó nem egyezik.")
      return
    }

    setSaving(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        console.error("Kijelentkeztetési hiba reset után:", signOutError)
      }

      setSuccess(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-secondary/40 px-4 py-10 sm:px-6 sm:py-16">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Anchor className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Új jelszó beállítása</h1>
            <p className="text-sm text-muted-foreground">Matrózkereső fiók helyreállítása</p>
          </div>
        </div>

        {loadingSession ? (
          <p className="text-sm text-muted-foreground">Link ellenőrzése...</p>
        ) : success ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm text-accent-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-accent" aria-hidden="true" />
                <p>A jelszavad sikeresen frissült. Biztonságból kijelentkeztettünk, most jelentkezz be az új jelszóval.</p>
              </div>
            </div>
            <Button className="h-11" onClick={() => router.push("/")}>Bejelentkezés</Button>
          </div>
        ) : ready ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">Új jelszó</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Legalább 8 karakter"
                className="h-11"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">Új jelszó megerősítése</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Írd be újra a jelszót"
                className="h-11"
              />
            </div>

            {confirmPassword.length > 0 && !passwordsMatch ? (
              <p className="text-sm text-destructive">A két jelszó nem egyezik.</p>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-11 bg-accent! text-accent-foreground! hover:bg-accent/90!"
              disabled={saving || !passwordsMatch || password.length < 8}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {saving ? "Mentés..." : "Jelszó frissítése"}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <Button variant="outline" className="h-11" onClick={() => router.push("/")}>Vissza a bejelentkezéshez</Button>
          </div>
        )}
      </section>
    </main>
  )
}
