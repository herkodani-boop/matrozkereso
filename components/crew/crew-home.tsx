"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Check } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { useCaptainBoats } from "@/components/captain-boats-provider"
import { Skeleton } from "@/components/ui/skeleton"
import { getTodayKey, formatLongDate } from "@/components/captain-home/use-captain-home-data"
import { useInvitations, useProfileGaps } from "./crew-data"
import { CrewOverview, crewSummary, useCrewOverviewData } from "./crew-overview"
import { InvitationCard, ProfileBanner, capitalize, primaryButton, secondaryButton, weekday } from "./crew-ui"
import { OpenListings } from "./open-listings"

// A hajó nélküli bejelentkezett felhasználó kezdőlapja: ez egyben a "Vitorlázásaim" nézet.
export function CrewHome() {
  const { user } = useAuth()
  const { firstName } = useCaptainBoats()
  const userId = user?.id ?? null
  // Meghívó elfogadása után újratöltjük a csapatokat és az eseményeket.
  const [refreshKey, setRefreshKey] = useState(0)
  const data = useCrewOverviewData(userId, refreshKey)
  const invitations = useInvitations(userId)
  const gaps = useProfileGaps(userId)
  const invitation = invitations.invitations[0] ?? null
  const ready = !data.loading
  const isNew = ready && data.empty && !invitation

  return (
    <div className="bg-secondary/60">
      <main className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8">
        <ProfileBanner gaps={gaps} />

        {invitation ? (
          <InvitationCard
            key={invitation.token}
            invitation={invitation}
            moreCount={invitations.invitations.length - 1}
            onDone={(accepted) => {
              invitations.remove(invitation.token)
              if (accepted) setRefreshKey((key) => key + 1)
            }}
          />
        ) : (
          <CrewGreeting
            firstName={firstName}
            summary={!ready ? null : isNew ? "Még nem vagy egy hajón sem. Nézz körül a szabad helyek között, sok kapitány kezdőket is szívesen visz." : crewSummary(data) || (data.failed ? "Most nem sikerült mindent betölteni, próbáld újra egy kicsit később." : "Most nincs teendőd.")}
          />
        )}

        {!ready ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : isNew ? (
          <>
            <CrewGettingStarted profileDone={gaps !== null && !gaps.name && !gaps.phone && !gaps.level} />
            <OpenListings title="Kezdőknek ajánlott szabad helyek" subtitle="Ahol a kapitány jelezte, hogy kezdőt is szívesen visz." beginnerOnly withRoleFilter />
          </>
        ) : (
          <>
            {data.empty ? null : (
              <section aria-labelledby="crew-mine" className="flex flex-col gap-3.5">
                <div>
                  <h2 id="crew-mine" className="text-xl font-bold tracking-tight">Vitorlázásaim</h2>
                  <p className="text-sm text-muted-foreground">Ahova mész, ahol csapattag vagy, és ahova jelentkeztél.</p>
                </div>
                <CrewOverview data={data} userId={userId} mode="full" />
              </section>
            )}
            <OpenListings
              title={data.crew.teams.length > 0 ? "Más hajók keresnek legénységet" : "Még több szabad hely"}
              subtitle="Olyan hirdetések, amelyekre még nem jelentkeztél."
            />
          </>
        )}
      </main>
    </div>
  )
}

function CrewGreeting({ firstName, summary }: { firstName: string | null; summary: string | null }) {
  const todayKey = getTodayKey()
  return (
    <section aria-labelledby="crew-greeting" className="relative overflow-hidden rounded-2xl text-white">
      <Image src="/hero-balaton.jpg" alt="" fill priority sizes="(max-width: 1200px) 100vw, 1152px" className="object-cover object-[28%_82%] sm:object-[center_80%]" />
      <div className="relative flex min-h-[160px] flex-col justify-end bg-gradient-to-t from-[rgba(10,47,66,0.9)] to-[rgba(10,47,66,0.72)] p-6 sm:p-8">
        <p className="text-sm font-medium text-white/80">{`${capitalize(weekday(todayKey))}, ${formatLongDate(todayKey)}`}</p>
        <h1 id="crew-greeting" className="mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-[34px]">
          {firstName ? `Szia, ${firstName}!` : "Üdv a fedélzeten!"}
        </h1>
        {summary ? <p className="mt-2 max-w-2xl text-white/90">{summary}</p> : <Skeleton className="mt-3 h-4 w-72 bg-white/20" />}
      </div>
    </section>
  )
}

// Új matróznak: két lépés, és hogy hogyan jut fel egy hajóra (jelentkezés ≠ csapattagság).
function CrewGettingStarted({ profileDone }: { profileDone: boolean }) {
  const steps = [
    { done: profileDone, title: "Töltsd ki a profilodat", text: "Név, telefonszám, tapasztalat: ezt látja a kapitány, amikor jelentkezel.", href: "/profil", action: "Profilom" },
    { done: false, title: "Jelentkezz egy szabad helyre", text: "Egy rövid üzenet elég. Ha elfogadnak, megkapod a kapitány elérhetőségét.", href: "/bongeszes", action: "Szabad helyek" },
  ]
  const nextIndex = steps.findIndex((step) => !step.done)
  const flow = [
    { title: "Jelentkezel egy alkalomra", text: "Versenyre, túrára, hajószerelésre." },
    { title: "A kapitány elfogad", text: "Erre az egy alkalomra; egyeztettek a részletekről." },
    { title: "Meghív a csapatába", text: "Ha összeszoktatok. Innentől látod a hajó összes eseményét." },
  ]

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-labelledby="crew-steps" className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <h2 id="crew-steps" className="text-base font-semibold">Kezdő lépések</h2>
          <span className="text-sm text-muted-foreground">{steps.filter((step) => step.done).length} / {steps.length} kész</span>
        </div>
        <ol>
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/70 px-5 py-4">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  step.done ? "bg-brand-soft text-brand-ink" : index === nextIndex ? "bg-brand text-white" : "bg-secondary text-muted-foreground"
                }`}
              >
                {step.done ? <Check className="h-5 w-5" aria-hidden="true" /> : index + 1}
                <span className="sr-only">{step.done ? "Kész" : `${index + 1}. lépés`}</span>
              </span>
              <div className="min-w-0 flex-[999_1_240px]">
                <p className={`font-semibold ${step.done ? "text-muted-foreground" : ""}`}>{step.title}</p>
                {!step.done ? <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p> : null}
              </div>
              {!step.done ? (
                <Link href={step.href} className={index === nextIndex ? primaryButton : secondaryButton}>{step.action}</Link>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="px-5 py-3.5 text-sm text-muted-foreground">
          Van saját hajód? <Link href="/kapitany-dashboard" className="font-semibold text-brand-ink underline-offset-4 hover:underline">Vedd fel</Link>, és legénységet is kereshetsz.
        </p>
      </section>

      <aside aria-labelledby="crew-flow" className="overflow-hidden rounded-2xl border border-border bg-card">
        <h2 id="crew-flow" className="border-b border-border/70 px-5 py-4 text-base font-semibold">Így jutsz fel egy hajóra</h2>
        <ol className="flex flex-col gap-4 p-5">
          {flow.map((item, index) => (
            <li key={item.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-ink">{index + 1}</span>
              <span>
                <span className="block font-semibold">{item.title}</span>
                <span className="block text-sm text-muted-foreground">{item.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}
