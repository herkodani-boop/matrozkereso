"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { supabase } from "@/lib/supabase"
import { isAdVisibleByDate } from "@/lib/ad-visibility"
import { CREW_ROLES, crewRoleLabel, normalizeCrewRole } from "@/lib/crew-roles"

const LISTINGS_SHOWN = 3

type OpenListing = {
  id: string
  title: string
  location: string
  dateText: string
  roles: string[]
  roleKeys: string[]
  beginner: boolean
  crewNeeded: number | null
  boatName: string
  boatType: string
  imageUrl: string | null
}

type BoatEmbed = { name: string | null; type: string | null; image_url: string | null; original_image_url: string | null }

const monthDay = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric" })
const yearMonthDay = new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" })

// A hirdetés időpontja olvasható formában a valódi dátumokból: az idei évet elhagyjuk, az egy hónapon
// belüli tartományt összevonjuk ("július 8–11."). Dátum nélkül a kapitány által beírt szöveg marad.
export function formatListingDate(startDate: string | null, endDate: string | null, fallback: string, now = new Date()) {
  if (!startDate) return fallback
  const start = new Date(`${startDate}T12:00:00`)
  if (Number.isNaN(start.getTime())) return fallback
  const end = endDate && endDate !== startDate ? new Date(`${endDate}T12:00:00`) : null
  const format = (date: Date) => (date.getFullYear() === now.getFullYear() ? monthDay : yearMonthDay).format(date)
  if (!end || Number.isNaN(end.getTime())) return format(start)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${format(start).replace(/\.$/, "")}–${end.getDate()}.`
  }
  return `${format(start)} – ${format(end).replace(/^\d{4}\. /, "")}`
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// A szűrőben a leggyakoribb szerepek; a többi a Szabad helyek oldalon érhető el.
const FILTER_ROLES = CREW_ROLES.filter((item) => ["kormanyos", "main-trim", "mast", "fordeck"].includes(item.value))

// Más hajók friss hirdetései. Kihagyjuk a saját, a már megpályázott és a csapataink hajóinak hirdetéseit.
// beginnerOnly: csak a kezdőbarát helyek (új matróznak); withRoleFilter: "Mit vállalnál?" szűrő.
export function OpenListings({
  title,
  subtitle,
  beginnerOnly = false,
  withRoleFilter = false,
}: {
  title: string
  subtitle: string
  beginnerOnly?: boolean
  withRoleFilter?: boolean
}) {
  const { status: authStatus, user } = useAuth()
  const userId = user?.id ?? null
  const [listings, setListings] = useState<OpenListing[]>([])
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    if (authStatus === "loading") return
    let active = true

    const load = async () => {
      let query = supabase
        .from("ads")
        .select("id, user_id, boat_id, title, location, date_text, positions, crew_needed, experience_level, commitment, start_date, end_date, boat:boats(name, type, image_url, original_image_url)")
        .eq("is_active", true)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(40)
      if (beginnerOnly) query = query.eq("experience_level", "kezdo")
      if (userId) query = query.neq("user_id", userId)

      const [adsResult, ownApplicationsResult, membershipsResult] = await Promise.all([
        query,
        userId ? supabase.from("applications").select("ad_id").eq("user_id", userId) : Promise.resolve({ data: [], error: null }),
        userId ? supabase.from("boat_team_members").select("boat_id").eq("user_id", userId).eq("status", "active") : Promise.resolve({ data: [], error: null }),
      ])

      const queryError = adsResult.error ?? ownApplicationsResult.error ?? membershipsResult.error
      if (queryError) {
        console.error("Szabad helyek lekérdezési hiba:", queryError)
        return
      }

      const appliedAdIds = new Set((ownApplicationsResult.data ?? []).map((row: { ad_id: string }) => String(row.ad_id)))
      // Ahol már csapattag, azt a hajót nem ajánljuk: annak eseményei a saját listáiban vannak.
      const teamBoatIds = new Set((membershipsResult.data ?? []).map((row: { boat_id: string }) => String(row.boat_id)))
      const next = (adsResult.data ?? [])
        .filter((ad) => isAdVisibleByDate(ad) && !appliedAdIds.has(String(ad.id)) && !teamBoatIds.has(String(ad.boat_id)))
        .map((ad) => {
          const boat = (Array.isArray(ad.boat) ? ad.boat[0] : ad.boat) as BoatEmbed | null | undefined
          const positions = (ad.positions as unknown[] | null) ?? []
          return {
            id: String(ad.id),
            title: (ad.title as string) || "Hirdetés",
            location: (ad.location as string) || "",
            dateText: formatListingDate(ad.start_date as string | null, ad.end_date as string | null, (ad.date_text as string) || ""),
            roles: positions.map((position) => crewRoleLabel(position)),
            roleKeys: positions.map((position) => normalizeCrewRole(position)).filter((key): key is string => Boolean(key)),
            beginner: ad.experience_level === "kezdo",
            crewNeeded: typeof ad.crew_needed === "number" ? ad.crew_needed : null,
            boatName: boat?.name ?? "Hajó",
            boatType: boat?.type ?? "",
            imageUrl: boat?.image_url ?? boat?.original_image_url ?? null,
          }
        })

      if (active) setListings(next)
    }

    void load()
    return () => {
      active = false
    }
  }, [authStatus, userId, beginnerOnly])

  // Szerep nélküli és segítő legénységet kereső hirdetés minden szerepre illik.
  const filtered = role
    ? listings.filter((listing) => listing.roleKeys.length === 0 || listing.roleKeys.includes(role) || listing.roleKeys.includes("mancsaft"))
    : listings
  const shown = filtered.slice(0, LISTINGS_SHOWN)
  if (listings.length === 0) return null

  return (
    <section aria-labelledby="open-listings" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="open-listings" className="text-xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Link href={beginnerOnly ? "/bongeszes?level=kezdo" : "/bongeszes"} className="text-sm font-semibold text-brand-ink underline-offset-4 hover:underline">
          Összes szabad hely
        </Link>
      </div>
      {withRoleFilter ? (
        <div role="group" aria-label="Mit vállalnál?" className="flex flex-wrap gap-2">
          {[{ key: null as string | null, label: "Bármit" }, ...FILTER_ROLES.map((item) => ({ key: item.value as string | null, label: item.shortLabel }))].map((item) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={role === item.key}
              onClick={() => setRole(item.key)}
              className={`h-10 rounded-full border px-4 text-sm font-medium transition-colors ${
                role === item.key ? "border-brand bg-brand text-white" : "border-border bg-card text-foreground hover:border-brand/40"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">Erre a szerepre most nincs szabad hely.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((listing) => (
            <li key={listing.id}>
              <Link
                href={`/bongeszes?ad=${encodeURIComponent(listing.id)}`}
                className="group block h-full overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-brand/40"
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
                  <span className="block text-[13px] text-muted-foreground">{[listing.boatName, listing.boatType].filter(Boolean).join(" · ")}</span>
                  <span className="mt-1 block font-semibold">{listing.title}</span>
                  <span className="mt-1.5 block text-sm text-muted-foreground">
                    {capitalizeFirst([listing.dateText, listing.location, listing.crewNeeded ? `${listing.crewNeeded} hely` : null].filter(Boolean).join(" · "))}
                  </span>
                  <span className="mt-2.5 flex flex-wrap gap-1.5">
                    {listing.beginner ? <span className="rounded-md bg-success-soft px-2 py-0.5 text-[13px] font-semibold text-success-ink">Kezdőbarát</span> : null}
                    {(listing.roles.length > 0 ? listing.roles : ["Bárki jöhet"]).map((label) => (
                      <span key={label} className="rounded-md bg-brand-soft px-2 py-0.5 text-[13px] text-brand-ink">{label}</span>
                    ))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
