"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Wrench } from "lucide-react"
import { AuthGateModal } from "@/components/auth-gate-modal"

type Mode = "sailor" | "skipper"
type View = "login" | "register" | "boat" | "listing"

type Shortcut = {
  label: string
  open: boolean
  mode?: Mode
  view?: View
  href?: string
}

const shortcuts: Shortcut[] = [
  { label: "1. Főoldal", open: false, href: "/" },
  { label: "2. Bejelentkezés Modal", open: true, mode: "sailor", view: "login" },
  { label: "3. Mancsaft Regisztráció", open: true, mode: "sailor", view: "register" },
  { label: "4. Kapitány Regisztráció", open: true, mode: "skipper", view: "register" },
  { label: "5. Hajó Profil Regisztráció", open: true, mode: "skipper", view: "boat" },
  { label: "6. Szabad Hely Hirdetés", open: true, mode: "skipper", view: "listing" },
  { label: "7. Kapitányi Dashboard", open: false, href: "/kapitany-dashboard" },
]

export function DevNavBar() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("sailor")
  const [view, setView] = useState<View>("login")
  // A view propot kulccsal kényszerítjük újra a modálba, így minden ugrás friss állapotot kap.
  const [nonce, setNonce] = useState(0)

  function jump(s: Shortcut) {
    if (!s.open) {
      setOpen(false)
      if (s.href) router.push(s.href)
      return
    }
    if (s.mode) setMode(s.mode)
    if (s.view) setView(s.view)
    setNonce((n) => n + 1)
    setOpen(true)
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center gap-x-4 gap-y-1 bg-neutral-900 px-4 py-2 text-neutral-100">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-400">
          <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
          [PM Dev Tool - Képernyő Ugrás]
        </span>
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => jump(s)}
            className="text-xs font-medium text-neutral-200 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            {s.label}
          </button>
        ))}
      </div>
      {/* Térkitöltő, hogy a dev sáv ne takarja a fő headert. */}
      <div className="h-9" aria-hidden="true" />

      <AuthGateModal key={nonce} open={open} onOpenChange={setOpen} mode={mode} initialView={view} />
    </>
  )
}
