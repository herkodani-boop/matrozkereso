"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { CalendarDays, LoaderCircle, MapPin, MessageSquareText, Ship, UserX, Users } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"

export type EventDetailsSummary = {
  id: string
  title: string
  date: string
  location: string
  boatName: string
}

type Participant = {
  userId: string
  name: string
  avatar: string
  status: "confirmed" | "pending" | "declined" | "unset"
}

const statusLabels: Record<Participant["status"], string> = {
  confirmed: "Részt vesz",
  pending: "Válaszra vár",
  declined: "Nem vesz részt",
  unset: "Nincs beállítva",
}

const statusDotClass: Record<Participant["status"], string> = {
  confirmed: "bg-emerald-500",
  pending: "bg-amber-500",
  declined: "bg-rose-500",
  unset: "bg-slate-400",
}

export function EventDetailsModal({
  event,
  open,
  onOpenChange,
  currentUserId = null,
  onCancelParticipation,
  canceling = false,
  actionError = null,
}: {
  event: EventDetailsSummary | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId?: string | null
  onCancelParticipation?: () => void
  canceling?: boolean
  actionError?: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [boatImage, setBoatImage] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])

  useEffect(() => {
    if (!open || !event) {
      return
    }

    let active = true

    const loadDetails = async () => {
      setLoading(true)
      setLoadError(false)

      const [eventResult, attendeesResult] = await Promise.all([
        supabase.from("boat_events").select("notes, boat:boats(image_url)").eq("id", event.id).maybeSingle(),
        supabase.from("boat_event_attendees").select("user_id, status").eq("event_id", event.id),
      ])

      if (!active) return

      if (eventResult.error || attendeesResult.error) {
        console.error("Esemény részletei lekérdezési hiba:", eventResult.error ?? attendeesResult.error)
        setLoadError(true)
        setLoading(false)
        return
      }

      const boat = Array.isArray(eventResult.data?.boat) ? eventResult.data.boat[0] : eventResult.data?.boat
      setBoatImage(boat?.image_url ?? null)
      setNotes(eventResult.data?.notes?.trim() || null)

      const attendeeRows = attendeesResult.data ?? []
      const userIds = Array.from(new Set(attendeeRows.map((row) => String(row.user_id))))
      const profilesByUserId = new Map<string, { full_name?: string; avatar_url?: string | null }>()

      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("users")
          .select("id, full_name, avatar_url")
          .in("id", userIds)

        if (profilesError) {
          console.error("Résztvevő profilok lekérdezési hiba:", profilesError)
        } else {
          ;(profiles ?? []).forEach((profile) => {
            if (profile?.id) {
              profilesByUserId.set(String(profile.id), profile)
            }
          })
        }
      }

      if (!active) return

      const mappedParticipants: Participant[] = attendeeRows.map((row) => {
        const profile = profilesByUserId.get(String(row.user_id))
        const status =
          row.status === "confirmed" || row.status === "pending" || row.status === "declined"
            ? row.status
            : "unset"

        return {
          userId: String(row.user_id),
          name: profile?.full_name || "Résztvevő",
          avatar: profile?.avatar_url || "/placeholder.svg",
          status,
        }
      })

      mappedParticipants.sort((a, b) => a.name.localeCompare(b.name, "hu"))

      setParticipants(mappedParticipants)
      setLoading(false)
    }

    void loadDetails()

    return () => {
      active = false
    }
  }, [open, event])

  useEffect(() => {
    if (!open) {
      setBoatImage(null)
      setNotes(null)
      setParticipants([])
      setLoadError(false)
    }
  }, [open])

  const myParticipant = currentUserId ? participants.find((participant) => participant.userId === currentUserId) : undefined
  const canCancelParticipation =
    Boolean(onCancelParticipation) && myParticipant && (myParticipant.status === "confirmed" || myParticipant.status === "pending")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg">
        <div className="relative h-[9rem] w-full shrink-0 bg-secondary">
          <Image
            src={boatImage || "/placeholder.svg"}
            alt={event?.boatName ? `${event.boatName} hajó` : "Hajó"}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 512px"
          />
        </div>

        <div className="flex flex-col gap-5 p-6">
          <DialogHeader className="gap-1.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
              <Ship className="h-3.5 w-3.5" aria-hidden="true" />
              {event?.boatName}
            </p>
            <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground">
              {event?.title}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {event?.date}
              </span>
              {event?.location ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {event.location}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {loadError ? (
            <p role="alert" className="text-sm text-destructive">
              Az esemény részleteit nem sikerült betölteni. Próbáld újra később.
            </p>
          ) : (
            <>
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                  Kapitány megjegyzése
                </h3>
                {loading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <p className="text-sm leading-relaxed text-foreground">
                    {notes ?? "Nincs megjegyzés a kapitánytól."}
                  </p>
                )}
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  Résztvevők {loading ? "" : `(${participants.length})`}
                </h3>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : participants.length > 0 ? (
                  <ul className="divide-y divide-border border-y border-border">
                    {participants.map((participant) => (
                      <li key={participant.userId} className="flex items-center gap-3 py-2.5">
                        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border bg-secondary">
                          <Image
                            src={participant.avatar}
                            alt={participant.name}
                            fill
                            className="object-cover"
                            sizes="32px"
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {participant.name}
                        </span>
                        <Badge className="shrink-0 gap-1.5 border-0 bg-secondary text-secondary-foreground">
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass[participant.status]}`} aria-hidden="true" />
                          {statusLabels[participant.status]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Még nincs résztvevő ehhez az eseményhez.</p>
                )}
              </div>

              {actionError ? (
                <p role="alert" className="text-sm text-destructive">
                  {actionError}
                </p>
              ) : null}

              {canCancelParticipation ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={canceling}
                  onClick={onCancelParticipation}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  {canceling ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UserX className="h-4 w-4" aria-hidden="true" />
                  )}
                  {canceling ? "Részvétel törlése..." : "Részvétel törlése"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
