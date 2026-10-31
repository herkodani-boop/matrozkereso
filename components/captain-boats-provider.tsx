"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/auth-provider"

export type CaptainBoat = {
  id: string
  name: string
  imageUrl: string | null
}

type CaptainBoatsState = {
  // "loading": van bejelentkezett felhasználó, de a hajói még töltődnek
  status: "loading" | "ready"
  firstName: string | null
  boats: CaptainBoat[]
  // Kinek az adatai vannak betöltve; így a fogyasztó meg tudja különböztetni a "még nem töltött be" állapotot.
  ownerId: string | null
}

const CaptainBoatsContext = createContext<CaptainBoatsState>({ status: "ready", firstName: null, boats: [], ownerId: null })

export function useCaptainBoats() {
  return useContext(CaptainBoatsContext)
}

// Csak azt tölti be, ami a kezdőlap kiválasztásához és a köszöntéshez kell; a részletes adatokat a kapitányi kezdőlap kéri le.
export function CaptainBoatsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CaptainBoatsState>({ status: "ready", firstName: null, boats: [], ownerId: null })
  const { status: authStatus, user } = useAuth()
  const userId = user?.id ?? null

  useEffect(() => {
    if (authStatus === "loading") return

    let active = true

    const refresh = async (userId: string | null) => {
      if (!userId) {
        if (active) setState({ status: "ready", firstName: null, boats: [], ownerId: null })
        return
      }

      if (active) setState((prev) => ({ ...prev, status: "loading" }))
      const [boatsResult, profile] = await Promise.all([
        supabase
          .from("boats")
          .select("id, name, image_url, original_image_url")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase.from("users").select("full_name").eq("id", userId).maybeSingle(),
      ])
      const boats = (boatsResult.data ?? []).map((boat) => ({
        id: boat.id as string,
        name: (boat.name as string) || "Névtelen hajó",
        // A kapitány által beállított kivágás az image_url; az eredeti kép csak tartalék.
        imageUrl: (boat.image_url as string | null) ?? (boat.original_image_url as string | null) ?? null,
      }))
      const fullName = (profile.data?.full_name as string | undefined)?.trim() ?? ""
      // Magyar névsorrendben a keresztnév az utolsó tag.
      const firstName = fullName ? fullName.split(/\s+/).slice(-1)[0] : null
      if (active) setState({ status: "ready", firstName, boats, ownerId: userId })
    }

    void refresh(userId)

    return () => {
      active = false
    }
  }, [authStatus, userId])

  return <CaptainBoatsContext.Provider value={state}>{children}</CaptainBoatsContext.Provider>
}
