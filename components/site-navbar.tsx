"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { LogOut, ChevronDown, MessageSquare, Sailboat, ShieldCheck, User as UserIcon } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { NotificationsMenu } from "@/components/notifications-menu"
import { supabase } from "@/lib/supabase"
import { clearHungarianValidationMessage, setHungarianValidationMessage } from "@/lib/hungarian-form-validation"

type UserProfile = {
  full_name: string
  avatar_url: string | null
}

type NavLink = { href: string; label: string }

function getInitials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

// Magyar névsorrend: a keresztnév az utolsó tag.
function getFirstName(fullName: string) {
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1] ?? fullName
}

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

function ProfileAvatar({ profile, className }: { profile: UserProfile; className: string }) {
  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`${className} rounded-full object-cover`} />
  }
  return (
    <span className={`${className} flex items-center justify-center rounded-full bg-brand font-semibold text-white`}>
      {getInitials(profile.full_name)}
    </span>
  )
}

export function SiteNavbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [authOpen, setAuthOpen] = useState(false)
  const [authView, setAuthView] = useState<"login" | "register">("login")
  const { user } = useAuth()
  const userId = user?.id ?? null
  // A betöltött adatot a felhasználóhoz kötjük, így kijelentkezéskor vagy fiókváltáskor
  // a régi felhasználó adatai külön nullázás nélkül sem jelennek meg.
  const [adminState, setAdminState] = useState<{ userId: string; isAdmin: boolean } | null>(null)
  const [profileState, setProfileState] = useState<{ userId: string; profile: UserProfile } | null>(null)
  // name: null, ha a felhasználónak nincs saját hajója. Kapitány az, akinek van.
  const [boatState, setBoatState] = useState<{ userId: string; id: string | null; name: string | null } | null>(null)
  const isAdmin = adminState?.userId === userId && adminState.isAdmin
  const profile = profileState?.userId === userId ? profileState.profile : null
  const boat = boatState?.userId === userId ? boatState : null
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null)
  const isTestMode =
    process.env.NEXT_PUBLIC_TEST_MODE !== "false" &&
    (process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_TEST_MODE === "true")

  const isCaptain = Boolean(boat?.name)
  const navLinks: NavLink[] = [
    { href: "/", label: "Kezdőlap" },
    { href: "/bongeszes", label: "Szabad helyek" },
    ...(isCaptain ? [{ href: "/kapitany-dashboard", label: "Hajóm" }] : []),
  ]

  async function fetchBoatSummary(userId: string) {
    const { data: ownBoat } = await supabase
      .from("boats")
      .select("id, name")
      .eq("user_id", userId)
      .maybeSingle()

    setBoatState(ownBoat?.id ? { userId, id: String(ownBoat.id), name: ownBoat.name ?? "Hajó" } : { userId, id: null, name: null })
  }

  async function signOut() {
    setMenuOpen(false)
    try {
      await supabase.auth.signOut()
    } catch {
      // Hálózati hiba esetén is kijelentkeztetjük a felhasználót
    }
    router.push("/")
  }

  function openAuth(view: "login" | "register") {
    setAuthView(view)
    setAuthOpen(true)
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = feedbackText.trim()

    if (message.length < 3) {
      setFeedbackNotice("Minimum 3 karaktert adj meg.")
      return
    }

    if (message.length > 1000) {
      setFeedbackNotice("Maximum 1000 karakter küldhető.")
      return
    }

    setFeedbackSubmitting(true)
    setFeedbackNotice(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message, pagePath: pathname }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setFeedbackNotice(payload.error ?? "Nem sikerült elküldeni az észrevételt.")
        return
      }

      setFeedbackText("")
      setFeedbackNotice("Köszönjük, rögzítettük az észrevételt.")
    } catch {
      setFeedbackNotice("Hálózati hiba történt. Próbáld újra.")
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  useEffect(() => {
    if (!userId) return

    let active = true

    const fetchProfile = async () => {
      const { data: adminAccess, error: adminError } = await supabase.rpc("is_admin")
      if (!active) return

      if (adminError) {
        console.error("Admin jogosultság lekérdezési hiba:", adminError)
      }
      setAdminState({ userId, isAdmin: !adminError && adminAccess === true })

      const { data, error } = await supabase
        .from("users")
        .select("full_name, avatar_url")
        .eq("id", userId)
        .maybeSingle()
      if (!active) return

      if (error) {
        console.error("Profil lekérdezési hiba:", error)
        setProfileState(null)
        return
      }

      if (!data) {
        // A felhasználó létrehozása még folyamatban lehet.
        return
      }

      setProfileState({ userId, profile: data })
      void fetchBoatSummary(userId)
    }

    void fetchProfile()
    const handleProfileUpdated = () => {
      void fetchProfile()
    }
    window.addEventListener("profile-updated", handleProfileUpdated)

    return () => {
      active = false
      window.removeEventListener("profile-updated", handleProfileUpdated)
    }
  }, [userId])

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [menuOpen])

  const menuItemClass =
    "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base font-medium text-foreground transition-colors hover:bg-muted sm:h-11 sm:text-[15px]"

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="mx-auto flex h-15 max-w-6xl items-center gap-2 px-4 sm:h-17 sm:gap-7 sm:px-6">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5">
            <span className="relative h-9 w-9 overflow-hidden rounded-lg">
              <Image src="/logo-mark.svg" alt="" fill className="object-cover" sizes="36px" />
            </span>
            <span className="text-[17px] font-bold tracking-tight text-foreground">Matrózkereső</span>
          </Link>

          <nav aria-label="Fő navigáció" className="hidden h-full items-stretch gap-0.5 sm:flex">
            {navLinks.map((link) => {
              const active = isActivePath(pathname, link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center border-b-[3px] px-3.5 pt-[3px] text-[15px] font-semibold transition-colors ${
                    active ? "border-brand text-brand-ink" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {isTestMode && (
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="hidden h-10 items-center gap-2 rounded-full border border-dashed border-border px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Teszt visszajelzés
              </button>
            )}

            {user && profile ? (
              <>
                {isCaptain && boat?.id && userId ? <NotificationsMenu userId={userId} boatId={boat.id} /> : null}

                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Profil menü"
                    onClick={() => setMenuOpen((prev) => !prev)}
                    className="flex h-11 items-center gap-2 rounded-full border border-border bg-card p-0.5 transition-colors hover:border-brand/40 sm:pr-2.5"
                  >
                    <ProfileAvatar profile={profile} className="h-9 w-9 text-sm" />
                    <span className="hidden max-w-32 truncate text-[15px] font-semibold text-foreground sm:block">
                      {getFirstName(profile.full_name)}
                    </span>
                    <ChevronDown
                      className={`hidden h-4 w-4 text-muted-foreground transition-transform sm:block ${menuOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" aria-hidden="true" />
                      <div
                        role="menu"
                        aria-label="Profil menü"
                        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-border bg-popover p-3 pb-6 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-full sm:mt-2 sm:w-72 sm:rounded-2xl sm:p-2"
                      >
                        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden="true" />
                        <div className="flex items-center gap-3 px-3 pt-1 pb-3">
                          <ProfileAvatar profile={profile} className="h-11 w-11 shrink-0 text-[15px]" />
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold text-foreground">{profile.full_name}</p>
                            {isCaptain ? (
                              <p className="truncate text-sm text-muted-foreground">Kapitány · {boat?.name}</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="mx-1 mb-1.5 h-px bg-border" />
                        <Link href="/profil" role="menuitem" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                          <UserIcon className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
                          Profilom
                        </Link>
                        {boat && !isCaptain ? (
                          <Link href="/kapitany-dashboard" role="menuitem" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                            <Sailboat className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
                            Saját hajóm van – felveszem
                          </Link>
                        ) : null}
                        {isTestMode && (
                          <button
                            type="button"
                            role="menuitem"
                            className={`${menuItemClass} sm:hidden`}
                            onClick={() => {
                              setMenuOpen(false)
                              setFeedbackOpen(true)
                            }}
                          >
                            <MessageSquare className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
                            Teszt visszajelzés
                          </button>
                        )}
                        {isAdmin && (
                          <Link href="/admin" role="menuitem" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                            <ShieldCheck className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
                            Admin felület
                          </Link>
                        )}
                        <div className="mx-1 my-1.5 h-px bg-border" />
                        <button type="button" role="menuitem" className={menuItemClass} onClick={signOut}>
                          <LogOut className="h-[18px] w-[18px] text-muted-foreground" aria-hidden="true" />
                          Kijelentkezés
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : user ? null : (
              <>
                <Button type="button" variant="ghost" className="hidden h-11 px-4 text-[15px] font-semibold text-brand-ink sm:inline-flex" onClick={() => openAuth("login")}>
                  Bejelentkezés
                </Button>
                <Button type="button" className="hidden h-11 bg-brand px-4.5 text-[15px] font-bold text-white hover:bg-brand/90 sm:inline-flex" onClick={() => openAuth("register")}>
                  Regisztráció
                </Button>
                <Button type="button" className="h-11 bg-brand px-4 text-[15px] font-bold text-white hover:bg-brand/90 sm:hidden" onClick={() => openAuth("login")}>
                  Belépés
                </Button>
              </>
            )}
          </div>
        </div>

        <nav aria-label="Fő navigáció" className="flex border-t border-border/60 sm:hidden">
          {navLinks.map((link) => {
            const active = isActivePath(pathname, link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 min-w-0 flex-1 items-center justify-center border-b-[3px] pt-[3px] text-[15px] font-semibold ${
                  active ? "border-brand text-brand-ink" : "border-transparent text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </header>

      {isTestMode && (
        <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Teszt visszajelzés</DialogTitle>
              <DialogDescription>Mi nem működik, vagy mi furcsa ezen az oldalon?</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={submitFeedback}
              onInvalidCapture={setHungarianValidationMessage}
              onInputCapture={clearHungarianValidationMessage}
              className="flex flex-col gap-3"
            >
              <textarea
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                aria-label="Teszt visszajelzés"
                maxLength={1000}
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              {feedbackNotice && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {feedbackNotice}
                </p>
              )}
              <Button type="submit" className="h-11 bg-brand text-white hover:bg-brand/90" disabled={feedbackSubmitting}>
                {feedbackSubmitting ? "Küldés..." : "Beküldés"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <AuthGateModal open={authOpen} onOpenChange={setAuthOpen} initialView={authView} />
    </>
  )
}
