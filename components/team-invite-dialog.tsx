"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, LogIn, UserPlus, XCircle } from "lucide-react"
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
  invitedEmail = null,
  onRequestAuth,
  onAccepted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  invitedEmail?: string | null
  onRequestAuth: (view: "login" | "register") => void
  onAccepted?: () => void
}) {
  const router = useRouter()
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "signed-out" | "email-mismatch" | "error">("idle")
  const [message, setMessage] = useState("A meghívás feldolgozása folyamatban...")

  useEffect(() => {
    if (!open || !token) {
      return
    }

    async function acceptInvite() {
      setStatus("loading")
      setMessage("A meghívás feldolgozása folyamatban...")

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.access_token) {
          setStatus("signed-out")
          setMessage(
            invitedEmail
              ? `A csapathoz való csatlakozáshoz jelentkezz be, vagy regisztrálj a(z) ${invitedEmail} e-mail-címmel.`
              : "A csapathoz való csatlakozáshoz jelentkezz be, vagy regisztrálj.",
          )
          return
        }

        const sendAcceptance = async (accessToken: string) => {
          const response = await fetch("/api/boat-team/accept", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ token }),
          })
          const payload = (await response.json()) as { ok?: boolean; error?: string; code?: string; emailSent?: boolean | null }
          return { response, payload }
        }

        let result = await sendAcceptance(session.access_token)

        if (result.response.status === 401 && result.payload.code === "SESSION_INVALID") {
          const { data, error: refreshError } = await supabase.auth.refreshSession()

          if (refreshError || !data.session?.access_token) {
            await supabase.auth.signOut({ scope: "local" })
            setStatus("signed-out")
            setMessage("A bejelentkezés lejárt, és nem sikerült megújítani. Jelentkezz be vagy regisztrálj a meghívott e-mail-címmel.")
            return
          }

          result = await sendAcceptance(data.session.access_token)
        }

        const { response, payload } = result

        if (response.status === 403 && payload.code === "INVITATION_EMAIL_MISMATCH") {
          setStatus("email-mismatch")
          setMessage(
            invitedEmail
              ? `Ez a meghívó a(z) ${invitedEmail} e-mail-címre szól. Jelentkezz be vagy regisztrálj ezzel a címmel a folytatáshoz.`
              : payload.error || "Ez a meghívó másik e-mail-címre szól.",
          )
          return
        }

        if (response.status === 401 && payload.code === "SESSION_INVALID") {
          await supabase.auth.signOut({ scope: "local" })
          setStatus("signed-out")
          setMessage("A munkamenetet nem sikerült megújítani. Jelentkezz be újra a meghívott e-mail-címmel.")
          return
        }

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "A meghívás elfogadása nem sikerült.")
        }

        setStatus("success")
        setMessage(payload.emailSent === false
          ? "Sikeresen csatlakoztál a csapathoz, de az értesítő email küldése nem sikerült."
          : "Sikeresen csatlakoztál a csapathoz. Értesítő emailt küldtünk neked.")
      } catch (error) {
        setStatus("error")
        setMessage(error instanceof Error ? error.message : "A meghívás elfogadása nem sikerült.")
      }
    }

    void acceptInvite()
  }, [open, token])

  const handleClose = () => {
    if (status === "success") {
      if (onAccepted) {
        onAccepted()
      } else {
        onOpenChange(false)
      }
      return
    }

    onOpenChange(false)
  }

  async function switchAccount(view: "login" | "register") {
    const { error } = await supabase.auth.signOut({ scope: "local" })
    if (error) {
      setStatus("error")
      setMessage("A kijelentkezés nem sikerült. Próbáld újra, majd válts a meghívott e-mail-címre.")
      return
    }

    onRequestAuth(view)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full min-w-0 max-w-md gap-5 p-5 sm:max-w-md">
        <DialogHeader className="min-w-0 pr-8 text-center">
          <DialogTitle className="text-xl font-bold">Csapat meghívás</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {status === "success"
              ? "A meghívás elfogadva."
              : status === "signed-out"
                ? "A csatlakozáshoz használd a meghívott e-mail-címet."
                : status === "email-mismatch"
                  ? "Másik fiókkal nyitottad meg a meghívót."
                : "A meghívás feldolgozása folyamatban."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex w-full min-w-0 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-muted/40 px-4 py-5 text-center">
          {status === "success" ? (
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          ) : status === "error" ? (
            <XCircle className="h-10 w-10 text-destructive" />
          ) : null}

          <p className="w-full min-w-0 break-words text-sm text-foreground">{message}</p>

          {status === "signed-out" ? (
            <div className="flex w-full min-w-0 flex-col gap-2">
              <Button onClick={() => onRequestAuth("login")} className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal px-3 py-2 text-left leading-snug">
                <LogIn className="mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0 whitespace-normal">Bejelentkezés</span>
              </Button>
              <Button variant="outline" onClick={() => onRequestAuth("register")} className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal px-3 py-2 text-left leading-snug">
                <UserPlus className="mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0 whitespace-normal">Fiók létrehozása</span>
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="h-auto min-h-10 w-full min-w-0 justify-center whitespace-normal px-3 py-2 text-center leading-snug">
                <span className="min-w-0 whitespace-normal">Később</span>
              </Button>
            </div>
          ) : null}

          {status === "email-mismatch" ? (
            <div className="flex w-full min-w-0 flex-col gap-2">
              <Button onClick={() => void switchAccount("login")} className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal px-3 py-2 text-left leading-snug">
                <LogIn className="mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0 whitespace-normal">Bejelentkezés a meghívott címmel</span>
              </Button>
              <Button variant="outline" onClick={() => void switchAccount("register")} className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal px-3 py-2 text-left leading-snug">
                <UserPlus className="mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0 whitespace-normal">Regisztráció a meghívott címmel</span>
              </Button>
            </div>
          ) : null}

          {status === "success" ? (
            <Button onClick={handleClose} className="w-full">
              Rendben
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
