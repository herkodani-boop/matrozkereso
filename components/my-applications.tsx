"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { CalendarDays, MapPin, Anchor, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import { isAdVisibleByDate } from "@/lib/ad-visibility"
import type { User } from "@supabase/supabase-js"

type ApplicationRow = {
  id: string
  status: "pending" | "accepted" | "rejected"
  ad: {
    id: string
    title: string
    location: string
    date_text: string
    commitment?: string | null
    start_date?: string | null
    end_date?: string | null
    boat: {
      name: string
      image_url: string | null
    } | null
  } | null
}

const statusConfig = {
  pending: {
    label: "Elbírálás alatt",
    className: "bg-secondary text-secondary-foreground",
  },
  accepted: {
    label: "Elfogadva",
    className: "bg-emerald-600 text-white",
  },
  rejected: {
    label: "Elutasítva",
    className: "bg-secondary text-muted-foreground",
  },
}

const MAX_SHOWN = 3

export function MyApplications() {
  const [user, setUser] = useState<User | null>(null)
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()
      setUser(currentUser)
    }

    void fetchUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setApplications([])
      setLoading(false)
      return
    }

    const fetchApplications = async () => {
      setLoading(true)
      setFetchError(null)

      const { data, error } = await supabase
        .from("applications")
        .select("id, status, ad:ads!inner(id, title, location, date_text, is_active, commitment, start_date, end_date, boat:boats(name, image_url))")
        .eq("user_id", user.id)
        .eq("ad.is_active", true)
        .order("created_at", { ascending: false })
        .limit(20)

      if (error) {
        console.error("Jelentkezések lekérdezési hiba:", error)
        setFetchError("A jelentkezések betöltése most nem sikerült.")
        setLoading(false)
        return
      }

      const visibleApplications = ((data ?? []) as ApplicationRow[])
        .filter((row) => (row.ad ? isAdVisibleByDate(row.ad) : false))
        .slice(0, MAX_SHOWN)

      setApplications(visibleApplications)
      setLoading(false)
    }

    void fetchApplications()
  }, [user])

  async function cancelApplication(applicationId: string) {
    setFetchError(null)
    setCancelingId(applicationId)

    const { error } = await supabase.from("applications").delete().eq("id", applicationId)

    if (error) {
      console.error("Visszavonási hiba:", error)
      setFetchError("A jelentkezés visszavonása nem sikerült.")
      setCancelingId(null)
      return
    }

    setApplications((prev) => prev.filter((a) => a.id !== applicationId))
    setCancelingId(null)
  }

  if (!user) {
    return null
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="mt-2 h-3.5 w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (applications.length === 0) {
    return null
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-6">
        <div>
          <h2 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Legutóbbi jelentkezéseim
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Az általad beküldött legutóbbi {MAX_SHOWN} jelentkezés állapota.
          </p>
        </div>
      </div>

      {fetchError ? (
        <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {applications.map((application) => {
          const ad = application.ad
          const boat = ad?.boat
          const config = statusConfig[application.status] ?? statusConfig.pending
          const isCanceling = cancelingId === application.id

          return (
            <div
              key={application.id}
              className={`flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 transition-opacity sm:flex-row sm:items-center sm:gap-6 ${
                application.status === "rejected" ? "opacity-60" : ""
              }`}
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                <Image
                  src={boat?.image_url ?? "/placeholder.svg"}
                  alt={boat?.name ?? "Hajó"}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>

              <div className="flex flex-1 flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground truncate">{ad?.title ?? "Ismeretlen hirdetés"}</h3>
                  <Badge className={`shrink-0 border-0 ${config.className}`}>{config.label}</Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {boat?.name && (
                    <span className="flex items-center gap-1.5">
                      <Anchor className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                      {boat.name}
                    </span>
                  )}
                  {ad?.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                      {ad.location}
                    </span>
                  )}
                  {ad?.date_text && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                      {ad.date_text}
                    </span>
                  )}
                </div>
              </div>

              {application.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isCanceling}
                  onClick={() => void cancelApplication(application.id)}
                  className="shrink-0 h-9 text-muted-foreground hover:text-destructive hover:border-destructive/50"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  {isCanceling ? "Visszavonás..." : "Visszavon"}
                </Button>
              )}
            </div>
          )
        })}
      </div>

    </section>
  )
}
