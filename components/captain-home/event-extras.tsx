"use client"

import { useEffect, useState } from "react"
import { CloudSun, Mail, Thermometer, Waves, Navigation2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { EventWeather } from "@/lib/weather"
import type { MessageGroup } from "@/lib/event-message"
import { daysUntil, type HomeEvent } from "./use-captain-home-data"

const FORECAST_DAYS = 7

// Az előrejelzés az esemény előtti héten jelenik meg; a lekérés a saját szerverünkön át, gyorsítótárral megy.
export function EventWeatherPanel({ event, harbor }: { event: HomeEvent; harbor: string }) {
  const days = daysUntil(event.startDate)
  // Helyszín nélkül is kérünk: a szerver a hajó kikötőjére, végső esetben Balatonfüredre kér előrejelzést.
  const inRange = days >= 0 && days <= FORECAST_DAYS
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; weather: EventWeather | null }>({
    status: "loading",
    weather: null,
  })

  useEffect(() => {
    if (!inRange) return
    let active = true
    const params = new URLSearchParams({ location: event.location, harbor, date: event.startDate })
    fetch(`/api/weather?${params}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { weather: EventWeather | null }) => {
        if (active) setState({ status: "ready", weather: data.weather })
      })
      .catch((error) => {
        console.error("Időjárás betöltési hiba:", error)
        if (active) setState({ status: "error", weather: null })
      })
    return () => {
      active = false
    }
  }, [inRange, event.location, harbor, event.startDate])

  if (!inRange) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">Az időjárás-előrejelzés az esemény előtt egy héttel jelenik meg.</p>
    )
  }
  if (state.status === "loading") {
    return <div className="mt-4 h-[76px] animate-pulse rounded-xl bg-secondary/70" aria-hidden="true" />
  }
  // Ismeretlen helyszín vagy elérhetetlen szolgáltatás: a kártya időjárás nélkül is teljes.
  if (!state.weather) return null

  const weather = state.weather
  const items = [
    { icon: CloudSun, value: weather.description, label: weekdayLabel(weather.date) },
    { icon: Thermometer, value: `${weather.tempMin}–${weather.tempMax} °C`, label: "hőmérséklet" },
    {
      // A Navigation2 alapállásban pontosan északra (felfelé) mutat, így a forgatás szöge megegyezik az iránytűvel.
      icon: Navigation2,
      // A nyíl arra mutat, amerre a szél fúj (a meteorológiai irány az, ahonnan jön).
      iconStyle: { transform: `rotate(${weather.windDirection + 180}deg)` },
      // Keskeny oszlop: a szám a fő sorban, az irány és a lökés a második sorban fér ki.
      value: `${weather.windKnots} csomó`,
      label: `${weather.windDirectionLabel}-i, lökés ${weather.gustKnots}`,
      title: `${weather.windDirectionLabel}-i szél, ${weather.windKnots} csomó, lökésekben ${weather.gustKnots} csomó`,
    },
    ...(weather.water
      ? [{ icon: Waves, value: `Víz ${weather.water.temperature} °C`, label: `ma mérve, ${weather.water.station}` }]
      : []),
  ]

  return (
    <div className="mt-4 rounded-xl bg-secondary/70 px-4 py-3.5">
      <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {items.map((item) => (
          <li key={item.label} className="flex min-w-0 items-center gap-2.5" title={"title" in item ? item.title : undefined}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-brand-ink">
              <item.icon className="h-[18px] w-[18px]" style={"iconStyle" in item ? item.iconStyle : undefined} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight text-foreground">{item.value}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{item.label}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-xs text-muted-foreground">
        {weather.place
          ? weather.place.source === "event"
            ? `${weather.place.name} környékére. `
            : `${weather.place.name} környékére, mert az esemény helyszíne nem azonosítható. `
          : ""}
        Előrejelzés: Open-Meteo{weather.water ? " · Vízhőmérséklet: HungaroMet" : ""}
      </p>
    </div>
  )
}

const weekdayFormat = new Intl.DateTimeFormat("hu-HU", { weekday: "long" })

function weekdayLabel(dateKey: string) {
  return weekdayFormat.format(new Date(`${dateKey}T12:00:00`))
}

const groupOptions: { value: MessageGroup; label: string }[] = [
  { value: "confirmed", label: "Akik jönnek" },
  { value: "unanswered", label: "Akik még nem válaszoltak" },
  { value: "declined", label: "A csapat többi tagja" },
]

export function EventMessageButton({ event, dateLabel }: { event: HomeEvent; dateLabel: string }) {
  const [open, setOpen] = useState(false)
  const audienceTotal = event.audience.confirmed + event.audience.unanswered + event.audience.declined
  if (audienceTotal === 0) return null

  return (
    <>
      <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4" aria-hidden="true" />
        Üzenet a résztvevőknek
      </Button>
      {/* Újranyitáskor tiszta űrlap: a tartalom csak nyitott állapotban él. */}
      {open ? <EventMessageDialog event={event} dateLabel={dateLabel} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function EventMessageDialog({ event, dateLabel, onClose }: { event: HomeEvent; dateLabel: string; onClose: () => void }) {
  const [groups, setGroups] = useState<MessageGroup[]>(() => (event.audience.confirmed > 0 ? ["confirmed"] : ["unanswered"]))
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState<number | null>(null)
  const recipientCount = groups.reduce((sum, group) => sum + event.audience[group], 0)

  async function send() {
    if (!message.trim() || recipientCount === 0 || sending) return
    setSending(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error("Az üzenetküldéshez be kell jelentkezned.")
      const response = await fetch("/api/events/message", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ eventId: event.id, groups, message }),
      })
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; sent?: number; error?: string }
      if (!response.ok || !result.ok) throw new Error(result.error || "Az üzenetet nem sikerült elküldeni.")
      setSentCount(result.sent ?? recipientCount)
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Az üzenetet nem sikerült elküldeni.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (!next && !sending ? onClose() : undefined)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-lg">
        <DialogHeader className="gap-0.5 border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="text-lg font-bold">Üzenet a résztvevőknek</DialogTitle>
          <DialogDescription>{event.title} · {dateLabel}</DialogDescription>
        </DialogHeader>

        {sentCount !== null ? (
          <div className="flex flex-col gap-4 px-5 py-6">
            <p className="text-base font-semibold text-foreground">Elküldve {sentCount} főnek.</p>
            <p className="text-sm text-muted-foreground">Ha valaki válaszol, a válasz a te e-mail címedre érkezik.</p>
            <Button type="button" className="h-11 self-end bg-brand px-5 text-white hover:bg-brand/90" onClick={onClose}>
              Rendben
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5 px-5 py-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold text-foreground">Kinek megy?</legend>
                {groupOptions.map((option) => {
                  const count = event.audience[option.value]
                  const checked = groups.includes(option.value)
                  return (
                    <label
                      key={option.value}
                      className={`flex min-h-12 items-center gap-3 rounded-xl border px-3.5 text-[15px] transition-colors ${
                        count === 0
                          ? "cursor-not-allowed border-border text-muted-foreground opacity-60"
                          : checked
                            ? "cursor-pointer border-brand bg-brand/5"
                            : "cursor-pointer border-border hover:border-brand/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={count === 0}
                        onChange={() =>
                          setGroups((previous) =>
                            previous.includes(option.value) ? previous.filter((group) => group !== option.value) : [...previous, option.value],
                          )
                        }
                        className="h-[18px] w-[18px] accent-accent"
                      />
                      {option.label}
                      <span className="ml-auto text-sm text-muted-foreground">{count} fő</span>
                    </label>
                  )
                })}
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="event-message-text" className="text-sm font-semibold text-foreground">Üzenet</label>
                <textarea
                  id="event-message-text"
                  rows={5}
                  maxLength={2000}
                  value={message}
                  onChange={(changeEvent) => setMessage(changeEvent.target.value)}
                  placeholder="Pl. Szombaton 7:30-kor gyülekező a kikötőben, hozzatok vízálló ruhát."
                  className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <p className="text-[13px] text-muted-foreground">
                  E-mailben megy ki. Ha valaki válaszol, a válasz a te e-mail címedre érkezik. A címzettek egymás címét nem látják.
                </p>
              </div>
              {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
              <Button type="button" variant="outline" className="h-11" onClick={onClose} disabled={sending}>
                Mégse
              </Button>
              <Button
                type="button"
                className="h-11 bg-brand px-5 text-white hover:bg-brand/90"
                disabled={sending || !message.trim() || recipientCount === 0}
                onClick={() => void send()}
              >
                {sending ? "Küldés..." : `Küldés ${recipientCount} főnek`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
