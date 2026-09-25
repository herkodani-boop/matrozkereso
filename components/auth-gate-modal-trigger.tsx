"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { TeamInviteDialog } from "@/components/team-invite-dialog"

export function AuthGateModalTrigger() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [authOpen, setAuthOpen] = useState(false)
  const [authView, setAuthView] = useState<"login" | "register">("login")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteToken, setInviteToken] = useState<string | null>(null)

  useEffect(() => {
    const authValue = searchParams.get("auth")
    const tokenValue = searchParams.get("token")

    if (authValue === "login" || authValue === "register") {
      setAuthView(authValue)
      setAuthOpen(true)
      setInviteOpen(false)
      return
    }

    if (tokenValue) {
      setInviteToken(tokenValue)
      setInviteOpen(true)
      setAuthOpen(false)
      return
    }

    setInviteToken(null)
    setInviteOpen(false)
    setAuthOpen(false)
  }, [searchParams])

  const openLoginModal = () => {
    setInviteOpen(false)
    setAuthView("login")
    setAuthOpen(true)
    router.replace("/?auth=login")
  }

  return (
    <>
      <AuthGateModal open={authOpen} onOpenChange={setAuthOpen} initialView={authView} />
      <TeamInviteDialog
        open={inviteOpen}
        onOpenChange={(nextOpen) => {
          setInviteOpen(nextOpen)
          if (!nextOpen) {
            router.replace("/")
          }
        }}
        token={inviteToken}
        onRequestLogin={openLoginModal}
      />
    </>
  )
}
