"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Bell, User } from "lucide-react"
import { type User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { AuthGateModal } from "@/components/auth-gate-modal"
import { supabase } from "@/lib/supabase"
import { isAdVisibleByDate } from "@/lib/ad-visibility"

type UserProfile = {
  full_name: string
  role: string
  avatar_url: string | null
}

function isCaptainRole(role?: string | null) {
  return role === "skipper" || role === "kapitany"
}

function roleLabel(role?: string | null) {
  if (isCaptainRole(role)) return "Kapitány"
  if (role === "sailor" || role === "mancsaft") return "Mancsaft"
  return "Mancsaft"
}

export function SiteNavbar() {
  const router = useRouter()
  const [authOpen, setAuthOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  async function fetchPendingCount(userId: string) {
    const { data: boats } = await supabase
      .from("boats")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()

    if (!boats?.id) return

    const { data: ads } = await supabase
      .from("ads")
      .select("id, commitment, start_date, end_date")
      .eq("boat_id", boats.id)
      .eq("is_active", true)

    const adIds = (ads ?? []).filter((a: any) => isAdVisibleByDate(a)).map((a: any) => a.id)
    if (adIds.length === 0) return

    const { count } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("ad_id", adIds)
      .eq("status", "pending")

    setPendingCount(count ?? 0)
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
    } catch {
      // Hálózati hiba esetén is kijelentkeztetjük a felhasználót
    }
    router.push("/")
  }

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) {
        setUser(null)
        setProfile(null)
        return
      }

      setUser(currentUser)
      const { data, error } = await supabase
        .from("users")
        .select("full_name, role, avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle()

      if (error) {
        console.error("Profil lekérdezési hiba:", error)
        setProfile(null)
        return
      }

      if (!data) {
        // A felhasználó létrehozása még folyamatban lehet.
        return
      }

      setProfile(data)
      if (isCaptainRole(data.role)) {
        void fetchPendingCount(currentUser.id)
      }
    }

    fetchUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchUser()
      } else {
        setUser(null)
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="relative h-9 w-9 overflow-hidden rounded-lg">
              <Image src="/logo-mark.png" alt="Matrózkereső logó" fill className="object-cover" sizes="36px" />
            </span>
            <span className="text-base font-semibold tracking-tight text-foreground">Matrózkereső</span>
          </Link>

          <nav className="flex items-center gap-1.5 sm:gap-3">
            {user && profile ? (
              <>
                {isCaptainRole(profile.role) && (
                  <div className="relative">
                    <button
                      type="button"
                      aria-label="Értesítések"
                      onClick={() => router.push("/kapitany-dashboard")}
                      className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-accent hover:text-accent"
                    >
                      <Bell className="h-4 w-4" aria-hidden="true" />
                      {pendingCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                          {pendingCount > 9 ? "9+" : pendingCount}
                        </span>
                      )}
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-1.5 sm:gap-3 sm:px-3 sm:py-2">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {profile.full_name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                )}
                <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  <p className="truncate text-sm font-semibold text-foreground">{profile.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {roleLabel(profile.role)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-full px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => router.push("/profil")}
                >
                  <User className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-full px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={signOut}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={() => setAuthOpen(true)}>
                Bejelentkezés
              </Button>
            )}
          </nav>
        </div>
      </header>

      <AuthGateModal open={authOpen} onOpenChange={setAuthOpen} />
    </>
  )
}
