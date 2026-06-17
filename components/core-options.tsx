"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Sailboat, LifeBuoy, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { supabase } from "@/lib/supabase"

const options = [
  {
    icon: Sailboat,
    title: "Hajóm van",
    subtitle: "Legénységet keresek a következő versenyre, vagy fix csapattagot a szezonra.",
    cta: "Szabad hely hirdetése",
    action: "skipper" as const,
  },
  {
    icon: LifeBuoy,
    title: "Hajóra szeretnék kerülni",
    subtitle: "Szabad helyet keresek egy-egy versenyre, vagy hosszú távú csapatot.",
    cta: "Böngészés és Jelentkezés",
    href: "/bongeszes",
  },
]

export function CoreOptions() {
  const [skipperOpen, setSkipperOpen] = useState(false)
  const router = useRouter()

  const handleSkipperClick = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      router.push("/kapitany-dashboard")
      return
    }

    setSkipperOpen(true)
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24" id="versenynaptar">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Hogyan szeretnél vitorlázni?
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Válaszd ki, hogy hajótulajdonosként legénységet keresel, vagy vitorlázóként szeretnél fedélzetre kerülni.
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

      <AuthGateModal open={skipperOpen} onOpenChange={setSkipperOpen} mode="skipper" />
    </section>
  )
}
