"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { CalendarDays, MapPin, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import { isAdVisibleByDate } from "@/lib/ad-visibility"

type ListingPreview = {
  id: string
  title: string
  location: string
  date_text: string
  positions: string[]
  boat: {
    name: string
    image_url: string | null
  } | null
}

export function LatestListings() {
  const [listings, setListings] = useState<ListingPreview[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchListings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from("ads")
        .select(
          "id, user_id, boat_id, title, location, date_text, positions, commitment, start_date, end_date, boat:boats(name, image_url), applications(user_id)",
        )
        .eq("is_active", true)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(40)

      if (error) {
        console.error("Élő hirdetések lekérdezési hiba:", error)
        setListings([])
        setLoading(false)
        return
      }

      const seenBoats = new Set<string>()
      const mapped: ListingPreview[] = (data ?? [])
        .filter((ad: any) => isAdVisibleByDate(ad))
        .filter((ad: any) => !user || ad.user_id !== user.id)
        .filter((ad: any) => !user || !(ad.applications ?? []).some((application: any) => application.user_id === user.id))
        .filter((ad: any) => {
          const key = ad.boat_id ?? ad.id
          if (seenBoats.has(key)) return false
          seenBoats.add(key)
          return true
        })
        .slice(0, 4)
        .map((ad: any) => ({
          id: ad.id,
          title: ad.title ?? "",
          location: ad.location ?? "",
          date_text: ad.date_text ?? "",
          positions: ad.positions ?? [],
          boat: ad.boat ?? null,
        }))

      setListings(mapped)
      setLoading(false)
    }

    void fetchListings()
  }, [])

  if (loading) {
    return (
      <section className="bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-8">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-2 h-4 w-80" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
                <Skeleton className="aspect-[3/1] w-full rounded-none" />
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (listings.length === 0) {
    return null
  }

  return (
    <section className="bg-secondary/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Aktuális lehetőségek
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A legfrissebb hirdetések hajóktól, amelyek legénységet keresnek.
            </p>
          </div>
          <Link
            href="/bongeszes"
            className="hidden items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline sm:flex"
          >
            Összes megtekintése
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {listings.map((listing, index) => (
            <Link
              key={listing.id}
              href={`/bongeszes?ad=${listing.id}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-accent"
            >
              <div className="relative aspect-[3/1] overflow-hidden">
                <Image
                  src={listing.boat?.image_url ?? "/placeholder.svg"}
                  alt={listing.boat?.name ?? "Hajó"}
                  fill
                  priority={index === 0}
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              </div>

              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="font-semibold leading-snug text-card-foreground line-clamp-1">
                  {listing.title}
                </h3>

                <div className="mt-auto flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    {listing.location}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    {listing.date_text}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <Link
          href="/bongeszes"
          className="mt-6 flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline sm:hidden"
        >
          Összes megtekintése
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
