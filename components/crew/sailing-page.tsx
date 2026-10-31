"use client"

import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { CrewOverview, useCrewOverviewData } from "./crew-overview"
import { OpenListings } from "./open-listings"

// "Vitorlázásaim": a kapitány teljes legénység-nézete más hajókon (a kezdőlapon csak a kivonata van).
export function SailingPage() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const data = useCrewOverviewData(userId)

  return (
    <div className="flex-1 bg-secondary/60">
      <main className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vitorlázásaim</h1>
          <p className="mt-1 text-muted-foreground">Más hajókon: ahova mész, ahol csapattag vagy, és ahova jelentkeztél.</p>
        </div>
        {data.loading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : data.empty ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="font-semibold">Még nem vitorlázol más hajón.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ha jelentkezel egy szabad helyre, vagy meghívnak egy csapatba, itt látod.{" "}
              <Link href="/bongeszes" className="font-semibold text-brand-ink underline-offset-4 hover:underline">Szabad helyek</Link>
            </p>
          </div>
        ) : (
          <CrewOverview data={data} userId={userId} mode="full" />
        )}
        <OpenListings title="Más hajók keresnek legénységet" subtitle="Olyan hirdetések, amelyekre még nem jelentkeztél." />
      </main>
    </div>
  )
}
