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
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (!isMounted) return

      if (sessionError || !session?.user) {
        router.replace(redirectTo)
        return
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!isMounted) return

      if (userError || !user) {
        router.replace(redirectTo)
        return
      }

      setChecking(false)
    }

    void verify()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return

      if (session?.user) {
        setChecking(false)
        return
      }

      if (event === "SIGNED_OUT") {
        router.replace(redirectTo)
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
