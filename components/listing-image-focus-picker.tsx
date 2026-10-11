"use client"

import type React from "react"
import { useRef } from "react"

type Focus = { x: number; y: number }

const clamp = (value: number) => Math.min(100, Math.max(0, value))

export function ListingImageFocusPicker({
  src,
  focus,
  onChange,
}: {
  src: string
  focus: Focus
  onChange: (focus: Focus) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    onChange({
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100),
    })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 3
    const delta: Record<string, Focus> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const move = delta[event.key]
    if (!move) return
    event.preventDefault()
    onChange({ x: clamp(focus.x + move.x), y: clamp(focus.y + move.y) })
  }

  return (
    // The container shrinks to the rendered image so pointer percentages map exactly onto the photo.
    <div
      ref={containerRef}
      role="group"
      tabIndex={0}
      aria-label="A kártyán kiemelt képrész kiválasztása. A nyílbillentyűkkel mozgatható."
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        updateFromPointer(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event)
      }}
      onKeyDown={handleKeyDown}
      className="relative mx-auto w-fit max-w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl outline-none ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} className="block max-h-72 w-auto max-w-full" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand/40 shadow-[0_0_0_1.5px_rgb(14_63_87)]"
        style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
      />
    </div>
  )
}
