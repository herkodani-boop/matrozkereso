"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { isAuthRetryableFetchError, type Session, type User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

type AuthState = {
  // "loading": még nem tudjuk, van-e bejelentkezett felhasználó
  status: "loading" | "ready"
  user: User | null
  // Megjelenítéshez. API-híváshoz a supabase.auth.getSession()-t használd,
  // mert az lejárt token esetén előbb frissít.
  session: Session | null
}

const AuthContext = createContext<AuthState>({ status: "loading", user: null, session: null })

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, session: null })

  useEffect(() => {
    let active = true
    // Ha a szerver elutasította a helyi sessiont, a később érkező INITIAL_SESSION ne állítsa vissza.
    let rejected = false

    // Az INITIAL_SESSION a helyi tárolóból azonnal megérkezik, így nem kell rá hálózati kérés.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === "INITIAL_SESSION" && rejected) return
      if (event === "SIGNED_IN") rejected = false
      setState((prev) => {
        const user = session?.user ?? null
        // Token-frissítéskor ugyanaz a felhasználó marad, a user objektumot megtartjuk,
        // hogy a user-re figyelő effektek ne fussanak le újra.
        const sameUser = prev.user && user && prev.user.id === user.id
        return { status: "ready", user: sameUser ? prev.user : user, session }
      })
    })

    // A helyi session nincs a szerver által ellenőrizve; egyszer, központilag validáljuk.
    // Hálózati hibánál nem jelentkeztetünk ki, csak ha a szerver ténylegesen elutasítja.
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active || (!error && data.user) || isAuthRetryableFetchError(error)) return
      rejected = true
      setState({ status: "ready", user: null, session: null })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
