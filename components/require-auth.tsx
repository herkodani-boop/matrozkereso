"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"

export function RequireAuth({ children, redirectTo = "/" }: { children: ReactNode; redirectTo?: string }) {
  const router = useRouter()
  const { status, user } = useAuth()
  const checking = status === "loading" || !user

  useEffect(() => {
    if (status === "ready" && !user) {
      router.replace(redirectTo)
    }
  }, [status, user, redirectTo, router])

  if (checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-12 text-sm text-muted-foreground">
        Betöltés...
      </div>
    )
  }

  return <>{children}</>
}
