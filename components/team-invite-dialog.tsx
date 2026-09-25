"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, LogIn, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"

export function TeamInviteDialog({
  open,
  onOpenChange,
  token,
  onRequestLogin,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  onRequestLogin: () => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "signed-out" | "error">("idle")
  const [message, setMessage] = useState("A meghívás feldolgozása folyamatban...")

  useEffect(() => {
    if (!open || !token) {
      return
    }

    async function acceptInvite() {
      setStatus("loading")
      setMessage("A meghívás feldolgozása folyamatban...")

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        setStatus("signed-out")
        setMessage("A csapathoz való csatlakozáshoz jelentkezz be, vagy regisztrálj.")
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
  }, [open, token])

  const handleClose = () => {
    onOpenChange(false)
    if (status === "success") {
      router.push("/kapitany-dashboard")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5 p-5 sm:max-w-md">
        <DialogHeader className="text-center">
          <DialogTitle className="text-xl font-bold">Csapat meghívás</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {status === "success"
              ? "A meghívás elfogadva."
              : status === "signed-out"
                ? "Jelentkezz be a csatlakozáshoz."
                : "A meghívás feldolgozása folyamatban."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-muted/40 px-4 py-5 text-center">
          {status === "success" ? (
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          ) : status === "error" ? (
            <XCircle className="h-10 w-10 text-destructive" />
          ) : null}

          <p className="text-sm text-foreground">{message}</p>

          {status === "signed-out" ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={onRequestLogin} className="w-full sm:w-auto">
                <LogIn className="mr-2 h-4 w-4" />
                Bejelentkezés
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Később
              </Button>
            </div>
          ) : null}

          {status === "success" ? (
            <Button onClick={handleClose} className="w-full">
              Vissza a dashboardra
            </Button>
          ) : null}

          {status === "error" ? (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
              Bezárás
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
