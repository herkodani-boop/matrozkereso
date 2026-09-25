"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

function AcceptTeamInviteContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "signed-out" | "success" | "error">("loading")
  const [message, setMessage] = useState("A meghívás feldolgozása folyamatban...")

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      setStatus("error")
      setMessage("Hiányzó meghívási token.")
      return
    }

    async function acceptInvite() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setStatus("signed-out")
        setMessage("A csoporthoz való csatlakozáshoz be kell jelentkezned vagy regisztrálnod kell.")
        return
      }

      try {
        const response = await fetch("/api/boat-team/accept", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ token }),
        })

        const payload = (await response.json()) as { ok?: boolean; error?: string }

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "A meghívás elfogadása nem sikerült.")
        }

        setStatus("success")
        setMessage("Sikeresen csatlakoztál a csapathoz.")
      } catch (error) {
        setStatus("error")
        setMessage(error instanceof Error ? error.message : "A meghívás elfogadása nem sikerült.")
      }
    }

    void acceptInvite()
  }, [searchParams])

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">Csapat meghívás</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>

        {status === "signed-out" ? (
          <button
            type="button"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90"
            onClick={() => window.location.href = "/"}
          >
            Vissza a főoldalra
          </button>
        ) : null}

        {status === "success" ? (
          <button
            type="button"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => window.location.href = "/kapitany-dashboard"}
          >
            Vissza a dashboardra
          </button>
        ) : null}
      </div>
    </main>
  )
}

export default function AcceptTeamInvitePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-12"><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm text-sm text-muted-foreground">Meghívás betöltése...</div></main>}>
      <AcceptTeamInviteContent />
    </Suspense>
  )
}
