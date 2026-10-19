"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Anchor, CheckCircle2, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { clearHungarianValidationMessage, setHungarianValidationMessage } from "@/lib/hungarian-form-validation"

function extractHashParams(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash
  return new URLSearchParams(raw)
}

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loadingSession, setLoadingSession] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const [success, setSuccess] = useState(false)
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const code = useMemo(() => searchParams.get("code"), [searchParams])
  const tokenHash = useMemo(() => searchParams.get("token_hash") ?? searchParams.get("token"), [searchParams])
  const type = useMemo(() => searchParams.get("type"), [searchParams])
  const confirmationUrl = useMemo(() => searchParams.get("confirmation_url"), [searchParams])

  useEffect(() => {
    let active = true

    async function prepareRecoverySession() {
      setLoadingSession(true)
      setError(null)

      try {
        if (confirmationUrl) {
          const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
          if (!configuredSupabaseUrl) {
            throw new Error("A jelszó-visszaállító link ellenőrzése nem sikerült.")
          }

          const confirmation = new URL(confirmationUrl)
          const supabaseOrigin = new URL(configuredSupabaseUrl).origin
          if (confirmation.origin !== supabaseOrigin || confirmation.pathname !== "/auth/v1/verify") {
            throw new Error("A jelszó-visszaállító link érvénytelen.")
          }

          const token = confirmation.searchParams.get("token") ?? tokenHash
          if (!token) {
            throw new Error("A jelszó-visszaállító link érvénytelen.")
          }

          confirmation.searchParams.set("token", token)
          confirmation.searchParams.set("type", "recovery")
          confirmation.searchParams.set("redirect_to", `${window.location.origin}/reset-password`)
          window.location.replace(confirmation.toString())
          return
        }

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
  }, [code, confirmationUrl, tokenHash, type])

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

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "A jelszó frissítése nem sikerült.")
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
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-accent" aria-hidden="true" />
                <p>A jelszavad sikeresen frissült. A fiókodba bejelentkezve maradsz.</p>
              </div>
            </div>
            <Button className="h-11" onClick={() => setSuccessDialogOpen(true)}>Bejelentkezés</Button>
            <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Sikeres jelszóváltoztatás</DialogTitle>
                  <DialogDescription>
                    Az új jelszavadat elmentettük. Továbbra is be vagy jelentkezve a fiókodba.
                  </DialogDescription>
                </DialogHeader>
                <Button className="h-11" onClick={() => setSuccessDialogOpen(false)}>Rendben</Button>
              </DialogContent>
            </Dialog>
          </div>
        ) : ready ? (
          <form onSubmit={handleSubmit} onInvalidCapture={setHungarianValidationMessage} onInputCapture={clearHungarianValidationMessage} className="flex flex-col gap-4">
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

            {error ? (
              <div
                className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              className="h-11 bg-accent! text-accent-foreground! hover:bg-accent/90!"
              disabled={saving || !password || !confirmPassword}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {saving ? "Mentés..." : "Jelszó frissítése"}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {error ? (
              <div
                className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-secondary/40 px-4 py-10 sm:px-6 sm:py-16">
          <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="text-sm text-muted-foreground">Link ellenőrzése...</p>
          </section>
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
