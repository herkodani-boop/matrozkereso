"use client"

import { useRef, type KeyboardEvent } from "react"
import { CalendarDays, Sailboat, Trophy } from "lucide-react"
import type { EventItem } from "./types"

const OPTIONS: { value: EventItem["type"]; icon: typeof Trophy }[] = [
  { value: "Verseny", icon: Trophy },
  { value: "Edzés", icon: Sailboat },
  { value: "Egyéb", icon: CalendarDays },
]

// Három lehetőséghez a natív legördülő helyett: minden opció látszik, egy kattintással választható.
export function EventTypeSelector({
  value,
  onChange,
  labelId,
}: {
  value: EventItem["type"]
  onChange: (value: EventItem["type"]) => void
  labelId: string
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Rádiócsoport-viselkedés: a nyilak léptetik és ki is választják az opciót.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    if (!step) return
    event.preventDefault()
    const currentIndex = OPTIONS.findIndex((option) => option.value === value)
    const nextIndex = (currentIndex + step + OPTIONS.length) % OPTIONS.length
    onChange(OPTIONS[nextIndex].value)
    buttonRefs.current[nextIndex]?.focus()
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} onKeyDown={handleKeyDown} className="grid grid-cols-3 gap-2">
      {OPTIONS.map((option, index) => {
        const selected = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttonRefs.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
              selected
                ? "border-brand bg-brand-tint text-brand"
                : "border-border bg-background text-foreground/80 hover:border-brand/50 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {option.value}
          </button>
        )
      })}
    </div>
  )
}
