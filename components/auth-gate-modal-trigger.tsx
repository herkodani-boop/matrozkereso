"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AuthGateModal } from "@/components/auth-gate-modal"

export function AuthGateModalTrigger() {
  const searchParams = useSearchParams()
  const [authOpen, setAuthOpen] = useState(false)
  const [authView, setAuthView] = useState<"login" | "register">("login")

  useEffect(() => {
    const authValue = searchParams.get("auth")
    if (authValue === "login" || authValue === "register") {
      setAuthView(authValue)
      setAuthOpen(true)
      return
    }

    setAuthOpen(false)
  }, [searchParams])

  return (
    <AuthGateModal open={authOpen} onOpenChange={setAuthOpen} initialView={authView} />
  )
}
