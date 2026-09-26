"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export function RequireAuth({ children, redirectTo = "/" }: { children: ReactNode; redirectTo?: string }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function verify() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (!isMounted) return

      if (error || !user) {
        router.replace(redirectTo)
        return
      }

      setChecking(false)
    }

    void verify()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace(redirectTo)
      } else if (isMounted) {
        setChecking(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [redirectTo, router])

  if (checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 py-12 text-sm text-muted-foreground">
        Betöltés...
      </div>
    )
  }

  return <>{children}</>
}
