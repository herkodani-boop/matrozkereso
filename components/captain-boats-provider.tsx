"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"

export type CaptainBoat = {
  id: string
  name: string
  imageUrl: string | null
  activeAds: number
  pendingApplications: number
  nextEvent: { title: string; startDate: string; endDate: string | null } | null
}

type CaptainBoatsState = {
  // "loading": van bejelentkezett felhasználó, de a hajói még töltődnek
  status: "loading" | "ready"
  firstName: string | null
  boats: CaptainBoat[]
}

const CaptainBoatsContext = createContext<CaptainBoatsState>({ status: "ready", firstName: null, boats: [] })

export function useCaptainBoats() {
  return useContext(CaptainBoatsContext)
}

function getTodayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

async function loadBoats(userId: string): Promise<CaptainBoat[]> {
  const { data: boats, error } = await supabase
    .from("boats")
    .select("id, name, image_url")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error || !boats?.length) return []

  const boatIds = boats.map((boat) => boat.id)
  const todayKey = getTodayKey()

  const [adsResult, eventsResult] = await Promise.all([
    supabase.from("ads").select("id, boat_id").in("boat_id", boatIds).eq("is_active", true).eq("is_deleted", false),
    supabase
      .from("boat_events")
      .select("boat_id, title, start_date, end_date")
      .in("boat_id", boatIds)
      .or(`end_date.gte.${todayKey},and(end_date.is.null,start_date.gte.${todayKey})`)
      .order("start_date", { ascending: true }),
  ])

  const adRows = adsResult.data ?? []
  const adBoat = new Map(adRows.map((ad) => [ad.id as string, ad.boat_id as string]))
  const pendingByBoat = new Map<string, number>()

  if (adRows.length > 0) {
    const { data: applications } = await supabase
      .from("applications")
      .select("ad_id")
      .in("ad_id", adRows.map((ad) => ad.id))
      .eq("status", "pending")

    for (const application of applications ?? []) {
      const boatId = adBoat.get(application.ad_id as string)
      if (boatId) pendingByBoat.set(boatId, (pendingByBoat.get(boatId) ?? 0) + 1)
    }
  }

  return boats.map((boat) => {
    const next = (eventsResult.data ?? []).find((event) => event.boat_id === boat.id)
    return {
      id: boat.id as string,
      name: (boat.name as string) || "Névtelen hajó",
      imageUrl: (boat.image_url as string | null) ?? null,
      activeAds: adRows.filter((ad) => ad.boat_id === boat.id).length,
      pendingApplications: pendingByBoat.get(boat.id as string) ?? 0,
      nextEvent: next
        ? { title: next.title as string, startDate: next.start_date as string, endDate: (next.end_date as string | null) ?? null }
        : null,
    }
  })
}

export function CaptainBoatsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CaptainBoatsState>({ status: "ready", firstName: null, boats: [] })

  useEffect(() => {
    let active = true

    const refresh = async (userId: string | null) => {
      if (!userId) {
        if (active) setState({ status: "ready", firstName: null, boats: [] })
        return
      }

      if (active) setState((prev) => ({ ...prev, status: "loading" }))
      const [boats, profile] = await Promise.all([
        loadBoats(userId),
        supabase.from("users").select("full_name").eq("id", userId).maybeSingle(),
      ])
      const fullName = (profile.data?.full_name as string | undefined)?.trim() ?? ""
      // Magyar névsorrendben a keresztnév az utolsó tag.
      const firstName = fullName ? fullName.split(/\s+/).slice(-1)[0] : null
      if (active) setState({ status: "ready", firstName, boats })
    }

    // A getSession helyi, így azonnal tudjuk, kell-e vázat mutatni.
    void supabase.auth.getSession().then(({ data }) => refresh(data.session?.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return
      void refresh(session?.user?.id ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return <CaptainBoatsContext.Provider value={state}>{children}</CaptainBoatsContext.Provider>
}
