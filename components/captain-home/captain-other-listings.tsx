"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { supabase } from "@/lib/supabase"
import { isAdVisibleByDate } from "@/lib/ad-visibility"
import { crewRoleLabel } from "@/lib/crew-roles"

const LISTINGS_SHOWN = 3

type OtherListing = {
  id: string
  title: string
  location: string
  dateText: string
  positions: string[]
  boatName: string
  boatType: string
  imageUrl: string | null
}

type BoatEmbed = { name: string | null; type: string | null; image_url: string | null }

// Más hajók friss hirdetései; a saját és a már megpályázott hirdetéseket kihagyjuk.
export function CaptainOtherListings() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [listings, setListings] = useState<OtherListing[]>([])

  useEffect(() => {
    if (!userId) return
    let active = true

    const load = async () => {
      const [adsResult, ownApplicationsResult] = await Promise.all([
        supabase
          .from("ads")
          .select("id, user_id, title, location, date_text, positions, commitment, start_date, end_date, boat:boats(name, type, image_url)")
          .eq("is_active", true)
          .eq("is_deleted", false)
          .neq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("applications").select("ad_id").eq("user_id", userId),
      ])

      if (adsResult.error || ownApplicationsResult.error) {
        console.error("Más hajók hirdetéseinek lekérdezési hiba:", adsResult.error ?? ownApplicationsResult.error)
        return
      }

      const appliedAdIds = new Set((ownApplicationsResult.data ?? []).map((row) => String(row.ad_id)))
      const next = (adsResult.data ?? [])
        .filter((ad) => isAdVisibleByDate(ad) && !appliedAdIds.has(String(ad.id)))
        .slice(0, LISTINGS_SHOWN)
        .map((ad) => {
          const boat = (Array.isArray(ad.boat) ? ad.boat[0] : ad.boat) as BoatEmbed | null | undefined
          return {
            id: String(ad.id),
            title: (ad.title as string) || "Hirdetés",
            location: (ad.location as string) || "",
            dateText: (ad.date_text as string) || "",
            positions: ((ad.positions as unknown[] | null) ?? []).map((position) => crewRoleLabel(position)),
            boatName: boat?.name ?? "Hajó",
            boatType: boat?.type ?? "",
            imageUrl: boat?.image_url ?? null,
          }
        })

      if (active) setListings(next)
    }

    void load()
    return () => {
      active = false
    }
  }, [userId])

  if (listings.length === 0) return null

  return (
    <section aria-labelledby="captain-other-listings" className="mt-2 flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="captain-other-listings" className="text-lg font-bold">Más hajók keresnek legénységet</h2>
          <p className="text-sm text-muted-foreground">Ha te is beszállnál valahova.</p>
        </div>
        <Link href="/bongeszes" className="text-sm font-medium text-brand-ink underline-offset-4 hover:underline">
          Böngészés
        </Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((listing) => (
          <li key={listing.id}>
            <Link
              href={`/bongeszes?ad=${encodeURIComponent(listing.id)}`}
              className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-brand/40"
            >
              <span className="relative block h-[140px] bg-brand-soft">
                {listing.imageUrl ? (
                  <Image
                    src={listing.imageUrl}
                    alt={`A ${listing.boatName} vitorlás`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : null}
              </span>
              <span className="block px-4 pb-4 pt-3.5">
                <span className="block text-[13px] text-muted-foreground">
                  {[listing.boatName, listing.boatType].filter(Boolean).join(" · ")}
                </span>
                <span className="mt-1 block font-semibold">{listing.title}</span>
                <span className="mt-1.5 block text-sm text-muted-foreground">
                  {[listing.dateText, listing.location].filter(Boolean).join(" · ")}
                </span>
                {listing.positions.length > 0 ? (
                  <span className="mt-2.5 flex flex-wrap gap-1.5">
                    {listing.positions.map((position) => (
                      <span key={position} className="rounded-md bg-brand-soft px-2 py-0.5 text-[13px] text-brand-ink">
                        {position}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
