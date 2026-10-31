"use client"

import { useAuth } from "@/components/auth-provider"
import { useCaptainBoats } from "@/components/captain-boats-provider"
import { CaptainHome } from "@/components/captain-home/captain-home"
import { CrewHome } from "@/components/crew/crew-home"
import { GuestHome } from "@/components/guest-home"
import { Skeleton } from "@/components/ui/skeleton"

// Akinek hajója van, a kapitányi kezdőlapot kapja; a bejelentkezett matróz a saját vitorlázásait,
// a vendég a bemutatkozó oldalt.
export function HomeContent() {
  const { status: authStatus, user } = useAuth()
  const { status: boatsStatus, boats, ownerId } = useCaptainBoats()

  // Amíg nem tudjuk, van-e hajója, semleges vázat mutatunk, hogy ne villanjon fel a rossz változat.
  const resolved = authStatus === "ready" && (!user || (boatsStatus === "ready" && ownerId === user.id))
  if (!resolved) {
    return (
      <main className="flex-1" aria-busy="true">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
          <Skeleton className="h-[200px] w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </main>
    )
  }

  if (!user) return <GuestHome />

  return (
    <div className="flex-1">
      {boats.length > 0 ? <CaptainHome /> : <CrewHome />}
    </div>
  )
}
