"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, Compass, Sailboat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"

const steps = {
  sailor: {
    title: "Vitorlázóként",
    icon: Compass,
    items: [
      { title: "Jelentkezz a hirdetésre", text: "Böngéssz hajók és versenyek között, majd a jelentkezéskor írj pár sort a kapitánynak, hogy miért te vagy a jó választás." },
      { title: "Kövesd a kapitány döntését", text: "A jelentkezésed állapotát a kezdőlapon látod, és amíg nem döntöttek, vissza is vonhatod." },
      { title: "Egyeztessetek", text: "Ha a kapitány kapcsolatot kezdeményez, megkapod az elérhetőségeit. A csapatba később tagként is felvehet." },
    ],
  },
  captain: {
    title: "Hajótulajdonosként",
    icon: Sailboat,
    items: [
      { title: "Vedd fel a hajód", text: "Add meg a hajó adatait, és hívd meg a már meglévő legénységedet e-mailben." },
      { title: "Hirdess vagy szervezz", text: "Tegyél közzé hirdetést szabad helyekre, és hozz létre eseményeket, amelyeken követheted, ki jön." },
      { title: "Dönts a jelentkezőkről", text: "Fogadd el vagy utasítsd el a jelentkezőket, oszd meg velük az elérhetőségedet, és ha beválnak, vedd fel őket a csapatba." },
    ],
  },
}

const perks = ["A regisztráció ingyenes", "Böngészéshez nem kell fiók", "Nincs rejtett költség"]

export function HomeGuestInfo() {
  const [guest, setGuest] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setGuest(!data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setGuest(!session)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (!guest) return null

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16" id="hogyan-mukodik">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Hogyan működik?
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Három lépés, bármelyik oldalról indulsz.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {Object.values(steps).map((group) => (
          <div key={group.title} className="rounded-2xl border border-border bg-card p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
                <group.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-xl font-semibold tracking-tight text-card-foreground">{group.title}</h3>
            </div>
            <ol className="mt-6 space-y-6">
              {group.items.map((item, index) => (
                <li key={item.title} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-card-foreground">{item.title}</p>
                    <p className="mt-1 text-pretty leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center gap-5 rounded-2xl bg-secondary px-6 py-8 text-center">
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {perks.map((perk) => (
            <li key={perk} className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Check className="h-4 w-4 text-accent" aria-hidden="true" />
              {perk}
            </li>
          ))}
        </ul>
        <Button
          size="lg"
          nativeButton={false}
          className="h-11 bg-accent! px-6 text-base text-accent-foreground! hover:bg-accent/90!"
          render={<Link href="/bongeszes" />}
        >
          Nézd meg a hirdetéseket
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}
