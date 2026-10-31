"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { CloudSun, Mail, Navigation2, Search, Users } from "lucide-react"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { OpenListings } from "@/components/crew/open-listings"

// A kapitány útját a bemutató blokk mutatja meg; itt csak a matrózé, hogy ne ismételjük magunkat.
const crewSteps = [
  { title: "Keress szabad helyet", text: "Szűrj alkalomra és szerepre." },
  { title: "Jelentkezz egy üzenettel", text: "Ha a kapitány kiválaszt, megkapod az elérhetőségét." },
  { title: "Ha összeszoktatok, csapattag leszel", text: "A kapitány meghív, és innentől látod a hajó minden eseményét." },
]

const showcasePoints = [
  { icon: Users, title: "Ki jön a következő versenyre?", text: "A csapat egy kattintással jelez, te egy pillantással látod a létszámot." },
  { icon: CloudSun, title: "Szél és időjárás az esemény napjára", text: "Egy héttel előtte megjelenik az előrejelzés és a vízhőmérséklet." },
  { icon: Mail, title: "Üzenet a résztvevőknek", text: "Gyülekező, felszerelés, változás: egy levél mindenkinek, a válaszok hozzád jönnek." },
  { icon: Search, title: "Ha hiányzik valaki, hirdetsz", text: "A szabad helyre jelentkezőket egy kattintással elfogadod." },
]

// Nem csak állítjuk, hogy a meglévő csapatnak is való: megmutatjuk a kapitányi felület egy kártyáját.
function CaptainShowcase({ onStart }: { onStart: () => void }) {
  return (
    <section id="csapat" aria-labelledby="guest-showcase" className="flex scroll-mt-24 flex-wrap items-center gap-10 rounded-3xl border border-border bg-card p-6 sm:p-10 lg:gap-12 lg:p-12">
      <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wider text-brand-teal">Kapitányoknak</p>
          <h2 id="guest-showcase" className="mt-2 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">Így látod a csapatodat</h2>
          <p className="mt-2.5 text-[17px] text-muted-foreground">Nem csak toborzásra való. A meglévő legénységeddel is itt szervezitek az alkalmakat.</p>
        </div>
        <ul className="flex flex-col gap-4">
          {showcasePoints.map((point) => (
            <li key={point.title} className="flex gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
                <point.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold">{point.title}</span>
                <span className="mt-0.5 block text-[15px] text-muted-foreground">{point.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3.5">
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-6 font-bold text-white transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-brand"
          >
            Csapatot szervezek
          </button>
          <span className="text-sm text-muted-foreground">Ingyenes, a hajó felvétele pár perc.</span>
        </div>
      </div>

      <div className="relative min-w-0 flex-[1_1_440px] rounded-2xl bg-brand-soft px-4 pb-5 pt-9 sm:px-7 sm:pb-7">
        <ShowcaseEventCard />
        {/* Értesítés-buborék: a csapat jelzése élőben érkezik. */}
        <div aria-hidden="true" className="absolute -top-4 right-4 flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-lg sm:right-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">A</span>
          <span className="text-[13px] leading-snug">
            <span className="font-semibold">Anna</span> jön a Dér Kupára
            <span className="block text-muted-foreground">most</span>
          </span>
        </div>
      </div>
    </section>
  )
}

// A kapitányi kezdőlap "Következő esemény" kártyájának statikus mása, mintaadatokkal.
function ShowcaseEventCard() {
  return (
    <div role="img" aria-label="Példa: a Dér Kupa eseménykártyája a kapitányi felületen, 5 fő jön a 8 fős hajóra" className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-brand/10">
      <div aria-hidden="true">
        <div className="mb-3.5 flex items-center justify-between">
          <span className="text-[15px] font-semibold">Következő esemény</span>
          <span className="text-[13px] text-muted-foreground">Összes esemény (6)</span>
        </div>
        <div className="flex items-start gap-4">
          <span className="w-16 shrink-0 rounded-xl bg-brand py-2 text-center text-white">
            <span className="block text-[11px] font-semibold uppercase tracking-wider">Nov</span>
            <span className="block text-[26px] font-bold leading-tight">8</span>
            <span className="block text-[11px] text-white/85">8 nap</span>
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold">Dér Kupa</span>
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-ink">Verseny</span>
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">November 8. · Balatonszemes</span>
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-secondary/70 p-3">
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-brand-ink"><CloudSun className="h-4 w-4" /></span>
            <span><span className="block text-sm font-bold">Részben felhős</span><span className="block text-xs text-muted-foreground">7–12 °C</span></span>
          </span>
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-brand-ink"><Navigation2 className="h-4 w-4 rotate-[135deg]" /></span>
            <span><span className="block text-sm font-bold">14 csomó</span><span className="block text-xs text-muted-foreground">ÉNy-i, lökés 21</span></span>
          </span>
        </div>
        <div className="mt-4 border-t border-border/70 pt-3.5">
          <div className="flex justify-between gap-2">
            <span className="text-[15px] font-semibold">5 fő jön · 8 fős hajó</span>
            <span className="text-[13px] text-muted-foreground">2 nem válaszolt</span>
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-secondary">
            <span className="bg-brand-ink" style={{ width: "62.5%" }} />
            <span className="bg-brand-orange" style={{ width: "25%" }} />
          </div>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5">
            <span className="flex">
              {["B", "A", "R", "M", "G"].map((initial, index) => (
                <span key={initial} className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-brand-soft text-xs font-bold text-brand-ink ${index > 0 ? "-ml-2" : ""}`}>
                  {initial}
                </span>
              ))}
            </span>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold">
              <Mail className="h-3.5 w-3.5" />
              Üzenet a résztvevőknek
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function GuestHome() {
  const [auth, setAuth] = useState<{ open: boolean; mode?: "skipper"; view: "login" | "register" }>({ open: false, view: "register" })

  const testModeDisabled = process.env.NEXT_PUBLIC_TEST_MODE === "false"
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV !== "production"
  const isTestMode = !testModeDisabled && (isPreview || process.env.NEXT_PUBLIC_TEST_MODE === "true")

  return (
    <main className="flex-1 bg-secondary/60">
      {/* Hős: két belépési út, egyértelmű elsődleges gombbal */}
      <section aria-labelledby="guest-hero" className="relative overflow-hidden text-white">
        {/* Balatoni verseny a tihanyi dombokkal. A széles sávban az alsó harmad (hajótestek, legénység) látszik,
            mobilon a bal oldali hajó és a csapata. */}
        <Image src="/hero-balaton.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[28%_82%] sm:object-[center_80%]" />
        <div className="relative bg-gradient-to-r from-[rgba(10,47,66,0.92)] via-[rgba(10,47,66,0.74)] to-[rgba(10,47,66,0.4)]">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
            <p className="text-sm font-semibold uppercase tracking-wider text-white/80">Nagyhajós vitorlázás</p>
            <h1 id="guest-hero" className="mt-3 max-w-[720px] text-balance text-[34px] font-bold leading-[1.1] tracking-tight sm:text-[52px]">
              Találd meg a csapatod.
            </h1>
            {/* A meglévő csapatok szervezése legalább olyan fontos, mint az új legénység keresése. */}
            <p className="mt-4 max-w-2xl text-lg text-white/90">
              Kapitányoknak: események, visszajelzések és üzenetek a meglévő legénységgel. Vitorlázóknak: szabad helyek versenyre,
              túrára, akár kezdőként is.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/bongeszes"
                className="inline-flex h-[52px] items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-bold text-brand transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-white"
              >
                <Search className="h-[18px] w-[18px]" aria-hidden="true" />
                Szabad helyek böngészése
              </Link>
              {/* Előbb megmutatjuk, mit kap a kapitány, a regisztráció a bemutató blokkból indul. */}
              <a
                href="#csapat"
                className="inline-flex h-[52px] items-center justify-center rounded-xl border border-white/70 px-6 text-base font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
              >
                Csapatot szervezek
              </a>
            </div>
            {isTestMode ? (
              <div className="mt-8 max-w-2xl rounded-2xl border border-amber-300/60 bg-amber-100 px-4 py-3 text-sm leading-relaxed text-amber-950 sm:px-5 sm:py-4">
                <p className="font-semibold">Tesztüzem</p>
                <p className="mt-1">
                  Az oldal jelenleg tesztüzemben működik, ezért a hirdetések csak minták, nem valós ajánlatok. Ha észrevételed van, a
                  fejlécben lévő gombbal néhány kattintással visszajelzést küldhetsz.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-12 sm:px-6 sm:py-14">
        <OpenListings title="Most keresnek legénységet" subtitle="A jelentkezéshez kell egy ingyenes fiók." />

        <CaptainShowcase onStart={() => setAuth({ open: true, mode: "skipper", view: "register" })} />

        <section id="hogyan-mukodik" aria-labelledby="guest-how" className="flex flex-col gap-4">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wider text-brand-teal">Vitorlázóknak</p>
            <h2 id="guest-how" className="mt-1 text-2xl font-bold tracking-tight">Így jutsz fel egy hajóra</h2>
          </div>
          {/* Egy kártyán belüli lépéssor: a számokat vonal köti össze, asztalon vízszintesen, mobilon függőlegesen. */}
          <ol className="grid rounded-2xl border border-border bg-card p-6 sm:p-8 md:grid-cols-3">
            {crewSteps.map((step, index) => {
              const last = index === crewSteps.length - 1
              return (
                <li key={step.title} className="flex gap-4 md:flex-col md:gap-4">
                  <div className="flex flex-col items-center md:flex-row">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-[15px] font-bold text-white">{index + 1}</span>
                    {last ? null : <span aria-hidden="true" className="my-1.5 w-0.5 flex-1 rounded-full bg-brand-soft md:mx-3 md:my-0 md:h-0.5 md:w-auto" />}
                  </div>
                  <div className={last ? "" : "pb-7 md:pb-0 md:pr-8"}>
                    <p className="font-semibold">{step.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        <section aria-labelledby="guest-cta" className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-brand p-6 text-white sm:p-8">
          <div>
            <h2 id="guest-cta" className="text-2xl font-bold">Ingyenes, és két perc a regisztráció.</h2>
            <p className="mt-1 text-white/85">Csak egy e-mail-cím kell hozzá.</p>
          </div>
          <button
            type="button"
            onClick={() => setAuth({ open: true, view: "register" })}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-6 font-bold text-brand transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-white"
          >
            Regisztrálok
          </button>
        </section>
      </div>

      <AuthGateModal
        open={auth.open}
        onOpenChange={(open) => setAuth((previous) => ({ ...previous, open }))}
        mode={auth.mode}
        initialView={auth.view}
      />
    </main>
  )
}
