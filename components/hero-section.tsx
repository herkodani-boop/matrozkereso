"use client"

import Image from "next/image"
import { useCaptainBoats } from "@/components/captain-boats-provider"

export function HeroSection() {
  const { boats, firstName } = useCaptainBoats()
  const isCaptain = boats.length > 0

  const testModeDisabled = process.env.NEXT_PUBLIC_TEST_MODE === "false"
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production"
  const isTestMode = !testModeDisabled && (isPreview || process.env.NEXT_PUBLIC_TEST_MODE === "true")

  return (
    <section className="relative overflow-hidden border-b border-border bg-primary text-primary-foreground">
      <div className="absolute inset-0">
        <Image
          src="/hero-sailing.png"
          alt="Versenyvitorlás nagyhajó megdőlve halad a nyílt vízen"
          fill
          priority
          className="object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/40" />
      </div>

      <div
        className={
          isCaptain
            ? "relative mx-auto max-w-6xl px-4 pb-32 pt-14 sm:px-6 sm:pb-40 sm:pt-16 lg:pb-44"
            : "relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40"
        }
      >
        <div className="max-w-3xl">
          {isCaptain ? (
            <>
              <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                {firstName ? `Szia, ${firstName}!` : "Üdv újra a fedélzeten!"}
              </h1>
              <p className="mt-3 max-w-2xl text-pretty text-base leading-relaxed text-primary-foreground/80 sm:text-lg">
                Itt találod a hajód, a közelgő eseményeidet és a legfrissebb hirdetéseket.
              </p>
            </>
          ) : (
            <>
              <span className="inline-flex items-center rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary-foreground/90">
                Magyar nagyhajós vitorlázás
              </span>
              <h1 className="mt-6 text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Találd meg a csapatod.
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-primary-foreground/80">
                Hajótulajdonosok és vitorlázók közös felülete. Szervezd a csapatod és az eseményeidet, vagy találj helyet a következő versenyre.
              </p>
            </>
          )}
          {isTestMode && (
            <div
              className={
                isPreview
                  ? "mt-8 max-w-2xl rounded-2xl border border-red-300/60 bg-red-100 px-4 py-3 text-sm leading-relaxed text-red-950 shadow-lg shadow-black/10 sm:px-5 sm:py-4 sm:text-base"
                  : "mt-8 max-w-2xl rounded-2xl border border-amber-300/60 bg-amber-100 px-4 py-3 text-sm leading-relaxed text-amber-950 shadow-lg shadow-black/10 sm:px-5 sm:py-4 sm:text-base"
              }
            >
              <p className="font-semibold tracking-wide">Tesztüzem</p>
              <p className="mt-1">
                Az oldal jelenleg tesztüzemben működik, ezért a hirdetések csak minták, nem valós ajánlatok.
                Ha észrevételed van, a fejlécben lévő mezőn keresztül néhány kattintással visszajelzést tudsz
                küldeni nekünk.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
