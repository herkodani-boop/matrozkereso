"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { TeamInviteDialog } from "@/components/team-invite-dialog"
import { supabase } from "@/lib/supabase"

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

    if (tokenValue) {
      setInviteToken(tokenValue)
    } else {
      setInviteToken(null)
    }

    if (authValue === "login" || authValue === "register") {
      setAuthView(authValue)
      setAuthOpen(true)
      setInviteOpen(false)
      return
    }

    if (tokenValue) {
      setInviteOpen(true)
      setAuthOpen(false)
      return
    }

    setInviteOpen(false)
    setAuthOpen(false)
  }, [searchParams])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && inviteToken && session?.access_token) {
        setAuthOpen(false)
        setInviteOpen(true)
        router.replace(`/?token=${inviteToken}`, { scroll: false })
      }
    })

    return () => subscription.unsubscribe()
  }, [inviteToken, router])

  const syncUrl = (nextAuth: "login" | "register" | null, nextToken: string | null) => {
    const params = new URLSearchParams(window.location.search)

    if (nextAuth) {
      params.set("auth", nextAuth)
    } else {
      params.delete("auth")
    }

    if (nextToken) {
      params.set("token", nextToken)
    } else {
      params.delete("token")
    }

    const query = params.toString()
    router.replace(query ? `/?${query}` : "/", { scroll: false })
  }

  const openLoginModal = () => {
    setInviteOpen(false)
    setAuthView("login")
    setAuthOpen(true)
    syncUrl("login", inviteToken)
  }

  return (
    <>
      <AuthGateModal
        open={authOpen}
        onOpenChange={(nextOpen) => {
          setAuthOpen(nextOpen)
          if (!nextOpen && !inviteToken) {
            syncUrl(null, null)
          }
        }}
        initialView={authView}
      />
      <TeamInviteDialog
        open={inviteOpen}
        onOpenChange={(nextOpen) => {
          setInviteOpen(nextOpen)
          if (!nextOpen) {
            setInviteToken(null)
            router.replace("/", { scroll: false })
          }
        }}
        token={inviteToken}
        onRequestLogin={openLoginModal}
        onAccepted={() => {
          setInviteToken(null)
          setInviteOpen(false)
          router.replace("/", { scroll: false })
        }}
      />
    </>
  )
}
