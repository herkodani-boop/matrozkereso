"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Mail } from "lucide-react"
import { supabase } from "@/lib/supabase"

export default function ConfirmEmailPage() {
  const router = useRouter()
  const [message, setMessage] = useState("Az email címed ellenőrzése folyamatban...")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function finishConfirmation() {
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user || !user.email_confirmed_at) {
        if (active) {
          setError("A hitelesítés nem sikerült vagy a link lejárt. Kérj új hitelesítő emailt.")
        }
        return
      }

      const metadata = user.user_metadata ?? {}
      const role = metadata.role === "skipper" ? "skipper" : "mancsaft"
      const { error: profileError } = await supabase.from("users").upsert(
        {
          id: user.id,
          email: user.email,
          full_name: typeof metadata.full_name === "string" ? metadata.full_name : "",
          phone: typeof metadata.phone === "string" ? metadata.phone : null,
          birthdate: typeof metadata.birthdate === "string" ? metadata.birthdate : null,
          role,
          level: typeof metadata.level === "string" ? metadata.level : null,
        },
        { onConflict: "id" },
      )

      if (profileError) {
        if (active) setError("Az email címed hitelesítése sikerült, de a profil mentése nem. Jelentkezz be, és próbáld újra.")
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        void fetch("/api/auth/welcome", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        })
      }

      if (!active) return
      setMessage("Az email címed hitelesítve. Átirányítás...")
      router.replace(role === "skipper" ? "/kapitany-dashboard" : "/")
    }

    void finishConfirmation().catch((confirmationError: unknown) => {
      if (active) {
        setError(confirmationError instanceof Error ? confirmationError.message : "A hitelesítés nem sikerült.")
      }
    })

    return () => {
      active = false
    }
  }, [router])

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        {error ? <Mail className="h-9 w-9 text-destructive" aria-hidden="true" /> : <CheckCircle2 className="h-9 w-9 text-accent" aria-hidden="true" />}
        <h1 className="text-xl font-bold">{error ? "Email hitelesítése" : "Email hitelesítése"}</h1>
        <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={error ? "alert" : "status"}>
          {error ?? message}
        </p>
      </div>
    </main>
  )
}