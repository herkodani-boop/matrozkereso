"use client"

import Link from "next/link"
import { ArrowRight, CalendarDays, Megaphone, Sailboat, UserRoundCheck } from "lucide-react"
import { useCaptainBoats } from "@/components/captain-boats-provider"
import { Skeleton } from "@/components/ui/skeleton"

function getTodayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

function formatEventDate(startDate: string, endDate: string | null) {
  const format = (value: string) =>
    new Intl.DateTimeFormat("hu-HU", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`))
  return endDate && endDate !== startDate ? `${format(startDate)} – ${format(endDate)}` : format(startDate)
}

function getDaysUntil(startDate: string) {
  const today = new Date(`${getTodayKey()}T12:00:00`).getTime()
  const start = new Date(`${startDate}T12:00:00`).getTime()
  return Math.round((start - today) / 86400000)
}

const sectionClassName =
  "relative z-10 -mt-16 bg-[linear-gradient(to_bottom,transparent_50%,color-mix(in_oklab,var(--secondary)_35%,transparent)_50%)] px-4 pb-10 sm:-mt-24 sm:px-6 lg:-mt-28"

export function HomeBoatBanner() {
  const { status, boats } = useCaptainBoats()

  // Többhajós támogatáshoz a lista az első elemet jeleníti meg; később itt bővíthető váltóval.
  const boat = boats[0]

  if (status === "loading" && !boat) {
    return (
      <section className={sectionClassName} aria-hidden>
        <div className="mx-auto max-w-6xl">
          <div className="flex min-h-40 items-center justify-between gap-5 rounded-2xl border border-border bg-card p-5 shadow-xl sm:min-h-44 sm:p-8">
            <div className="flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-8 w-48" />
              <Skeleton className="mt-4 h-7 w-64 max-w-full rounded-full" />
            </div>
            <Skeleton className="hidden h-10 w-44 rounded-lg sm:block" />
          </div>
        </div>
      </section>
    )
  }

  if (!boat) return null

  const days = boat.nextEvent ? getDaysUntil(boat.nextEvent.startDate) : null

  return (
    <section className={sectionClassName} data-boat-banner>
      <div className="mx-auto max-w-6xl">
        <Link
          href="/kapitany-dashboard"
          aria-label={`${boat.name} – ugrás a kapitányi dashboardra`}
          className="group relative block min-h-40 overflow-hidden rounded-2xl border border-border bg-brand text-white shadow-xl transition-shadow hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-44"
        >
          {boat.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={boat.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <Sailboat aria-hidden className="absolute right-6 top-1/2 size-28 -translate-y-1/2 text-white/10" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-brand from-15% via-brand/70 via-45% to-transparent" />

          <div className="relative flex min-h-40 flex-col justify-center gap-5 p-5 sm:min-h-44 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Saját hajóm</p>
              <h2 className="mt-1 truncate text-2xl font-bold sm:text-3xl">{boat.name}</h2>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {boat.nextEvent && (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-3 py-1 font-semibold text-brand">
                    <CalendarDays className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">
                      {boat.nextEvent.title} · {formatEventDate(boat.nextEvent.startDate, boat.nextEvent.endDate)}
                    </span>
                    {days !== null && days >= 0 && days <= 14 && (
                      <span className="shrink-0 rounded-full bg-brand/10 px-2 text-xs">
                        {days === 0 ? "ma" : days === 1 ? "holnap" : `${days} nap múlva`}
                      </span>
                    )}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/80 px-3 py-1 backdrop-blur-sm">
                  <Megaphone className="size-4" aria-hidden />
                  {boat.activeAds} aktív hirdetés
                </span>
                {boat.pendingApplications > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 font-semibold text-amber-950">
                    <UserRoundCheck className="size-4" aria-hidden />
                    {boat.pendingApplications} függő jelentkezés
                  </span>
                )}
              </div>
            </div>

            <span
              aria-hidden
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand transition-transform group-hover:translate-x-0.5"
            >
              Kapitányi dashboard
              <ArrowRight className="size-4" />
            </span>
          </div>
        </Link>
      </div>
    </section>
  )
}
