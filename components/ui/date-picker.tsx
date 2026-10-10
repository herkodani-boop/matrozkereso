"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

const MONTH_NAMES = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
]
const WEEKDAY_LABELS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"]

function toKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseKey(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) } : null
}

function formatDisplay(value: string) {
  const parsed = parseKey(value)
  return parsed ? `${parsed.year}. ${String(parsed.month + 1).padStart(2, "0")}. ${String(parsed.day).padStart(2, "0")}.` : ""
}

type DatePickerProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  // A naptár ennél a dátumnál nyílik meg, ha még nincs kiválasztott érték.
  initialMonth?: string
  min?: string
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Válassz dátumot",
  className,
  disabled,
  initialMonth,
  min,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState(() => {
    const base = parseKey(value) ?? parseKey(initialMonth) ?? parseKey(toKeyFromDate(new Date()))!
    return { year: base.year, month: base.month }
  })

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const base = parseKey(value) ?? parseKey(initialMonth) ?? parseKey(toKeyFromDate(new Date()))!
      setView({ year: base.year, month: base.month })
    }
    setOpen(nextOpen)
  }

  function shiftMonth(delta: number) {
    setView((previous) => {
      const date = new Date(previous.year, previous.month + delta, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
  }

  const firstWeekday = (new Date(view.year, view.month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  const todayKey = toKeyFromDate(new Date())

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 text-left text-sm outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-50",
          value ? "text-foreground" : "text-muted-foreground",
          className,
        )}
      >
        <span>{value ? formatDisplay(value) : placeholder}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={6} align="start" className="z-[100]">
          <PopoverPrimitive.Popup className="w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Előző hónap"
                onClick={() => shiftMonth(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <p className="text-sm font-semibold">
                {view.year}. {MONTH_NAMES[view.month]}
              </p>
              <button
                type="button"
                aria-label="Következő hónap"
                onClick={() => shiftMonth(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label} className="py-1 text-xs font-medium text-muted-foreground">
                  {label}
                </span>
              ))}
              {cells.map((day, index) => {
                if (day === null) return <span key={`empty-${index}`} />
                const key = toKey(view.year, view.month, day)
                const isSelected = key === value
                const isDisabled = Boolean(min && key < min)
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      onChange(key)
                      setOpen(false)
                    }}
                    className={cn(
                      "mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                      isSelected
                        ? "bg-brand font-semibold text-white"
                        : "hover:bg-brand-tint hover:text-brand",
                      !isSelected && key === todayKey ? "font-bold text-brand ring-1 ring-brand/40" : "",
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function toKeyFromDate(date: Date) {
  return toKey(date.getFullYear(), date.getMonth(), date.getDate())
}
