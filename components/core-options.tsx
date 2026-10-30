"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Compass, ArrowRight, Sailboat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { useAuth } from "@/components/auth-provider"
import { useCaptainBoats } from "@/components/captain-boats-provider"

const options = [
  {
    icon: Compass,
    title: "Vitorlázni szeretnék",
    subtitle: "Találj helyet versenyekre vagy a szezonra, jelentkezz a hirdetésekre, és légy tagja egy hajó csapatának.",
    cta: "Böngészés és jelentkezés",
    href: "/bongeszes",
  },
  {
    icon: Sailboat,
    title: "Hajóm van",
    subtitle: "Kezeld a hajód csapatát és eseményeit, és hirdess szabad helyet, ha legénységre van szükséged.",
    cta: "Hajó és legénység kezelése",
    action: "skipper" as const,
  },
]

export function CoreOptions() {
  const [skipperOpen, setSkipperOpen] = useState(false)
  const { boats } = useCaptainBoats()
  const ownsBoat = boats.length > 0
  const router = useRouter()
  const { user } = useAuth()

  const handleSkipperClick = () => {
    if (user) {
      router.push("/kapitany-dashboard")
      return
    }

    setSkipperOpen(true)
  }

  if (ownsBoat) return null

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24" id="versenynaptar">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Hogyan kezdenél bele?
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Hajótulajdonosként szervezheted a legénységedet, vitorlázóként pedig csatlakozhatsz egy csapathoz.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon
          return (
            <div
              key={option.title}
              className="group flex flex-col rounded-2xl border border-border bg-card p-8 transition-colors hover:border-accent"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                <Icon className="h-7 w-7" aria-hidden="true" />
              </span>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight text-card-foreground">{option.title}</h3>
              <p className="mt-3 flex-1 text-pretty leading-relaxed text-muted-foreground">{option.subtitle}</p>
              {option.href ? (
                <Button
                  size="lg"
                  nativeButton={false}
                  className="mt-8 h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
                  render={<Link href={option.href} />}
                >
                  {option.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handleSkipperClick}
                  className="mt-8 h-11 w-full bg-accent! text-base text-accent-foreground! hover:bg-accent/90!"
                >
                  {option.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <AuthGateModal open={skipperOpen} onOpenChange={setSkipperOpen} mode="skipper" initialView="login" />
    </section>
  )
}
