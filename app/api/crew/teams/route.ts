import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const EVENTS_LIMIT = 300
const GENERIC_ROLES = new Set(["Csapattag", "Új tag", "Meghívott"])

// A "Csapataim" oldal adatai: a csapatok, ahol a felhasználó aktív tag vagy kapitány, a tagokkal,
// az eseményekkel és a válaszokkal. A tagok elérhetősége csak a csapaton belül látszik (a meghívó
// elfogadásakor erről szól a tájékoztatás); a users tábla RLS-e miatt ezt a service role olvassa.
// A service role nem kapja meg a törölt elemek RLS-szűrését, ezért azt itt végezzük el.
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Hiányzó Supabase konfiguráció." }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization")
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (!accessToken) {
    return NextResponse.json({ error: "Ehhez be kell jelentkezned." }, { status: 401 })
  }

  // A naptár a kért hónap elejétől mutat (a böngésző időzónája szerint), alapból a mai naptól.
  const fromParam = request.nextUrl.searchParams.get("from") ?? ""
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : new Date().toISOString().slice(0, 10)

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt bejelentkezés." }, { status: 401 })
  }

  const fail = (label: string, error: unknown) => {
    console.error(`Csapataim: ${label} lekérdezési hiba:`, error)
    return NextResponse.json({ error: "A csapataidat most nem sikerült betölteni." }, { status: 500 })
  }

  const [membershipsResult, ownBoatsResult] = await Promise.all([
    adminClient.from("boat_team_members").select("boat_id, accepted_at").eq("user_id", user.id).eq("status", "active"),
    adminClient.from("boats").select("id").eq("user_id", user.id).eq("is_deleted", false),
  ])
  if (membershipsResult.error ?? ownBoatsResult.error) return fail("tagság", membershipsResult.error ?? ownBoatsResult.error)

  const memberSince = new Map((membershipsResult.data ?? []).map((row) => [String(row.boat_id), (row.accepted_at as string | null) ?? null]))
  const boatIds = Array.from(new Set([...memberSince.keys(), ...(ownBoatsResult.data ?? []).map((row) => String(row.id))]))
  if (boatIds.length === 0) return NextResponse.json({ teams: [], people: {} })

  const [boatsResult, membersResult, eventsResult] = await Promise.all([
    adminClient.from("boats").select("id, name, type, harbor, image_url, original_image_url, user_id").in("id", boatIds).eq("is_deleted", false),
    adminClient.from("boat_team_members").select("boat_id, user_id, role, display_name, email").in("boat_id", boatIds).eq("status", "active"),
    adminClient
      .from("boat_events")
      .select("id, boat_id, title, type, start_date, end_date, location, notes")
      .in("boat_id", boatIds)
      .eq("is_deleted", false)
      .or(`end_date.gte.${from},and(end_date.is.null,start_date.gte.${from})`)
      .order("start_date")
      .limit(EVENTS_LIMIT),
  ])
  if (boatsResult.error ?? membersResult.error ?? eventsResult.error) return fail("csapat", boatsResult.error ?? membersResult.error ?? eventsResult.error)

  const events = eventsResult.data ?? []
  const attendeesResult = events.length > 0
    ? await adminClient.from("boat_event_attendees").select("event_id, user_id, status").in("event_id", events.map((row) => String(row.id)))
    : { data: [] as { event_id: string; user_id: string; status: string }[], error: null }
  if (attendeesResult.error) return fail("résztvevők", attendeesResult.error)

  const boats = boatsResult.data ?? []
  const members = (membersResult.data ?? []).filter((row) => row.user_id)
  const userIds = Array.from(new Set([
    ...boats.map((boat) => String(boat.user_id)),
    ...members.map((row) => String(row.user_id)),
    ...(attendeesResult.data ?? []).map((row) => String(row.user_id)),
  ]))
  const profilesResult = await adminClient.from("users").select("id, full_name, avatar_url, phone, email").in("id", userIds)
  if (profilesResult.error) return fail("profil", profilesResult.error)
  const profileById = new Map((profilesResult.data ?? []).map((row) => [String(row.id), row]))

  const answersByEvent = new Map<string, Record<string, string>>()
  for (const row of attendeesResult.data ?? []) {
    const answers = answersByEvent.get(String(row.event_id)) ?? {}
    answers[String(row.user_id)] = String(row.status)
    answersByEvent.set(String(row.event_id), answers)
  }

  const person = (userId: string, fallbackName: string | null, fallbackEmail: string | null, role: string | null, isCaptain: boolean) => {
    const profile = profileById.get(userId)
    return {
      id: userId,
      name: String(profile?.full_name ?? "").trim() || fallbackName?.trim() || "Csapattag",
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
      phone: String(profile?.phone ?? "").trim() || null,
      email: String(profile?.email ?? "").trim() || fallbackEmail?.trim() || null,
      role: role && !GENERIC_ROLES.has(role.trim()) ? role.trim() : null,
      isCaptain,
    }
  }

  const teams = boats.map((boat) => {
    const boatId = String(boat.id)
    const captainId = String(boat.user_id)
    const crew = members
      .filter((row) => String(row.boat_id) === boatId && String(row.user_id) !== captainId)
      .map((row) => person(String(row.user_id), row.display_name as string | null, row.email as string | null, row.role as string | null, false))
      .sort((first, second) => first.name.localeCompare(second.name, "hu"))
    return {
      boatId,
      name: boat.name || "Hajó",
      type: boat.type || "",
      harbor: boat.harbor || "",
      imageUrl: boat.image_url ?? boat.original_image_url ?? null,
      own: captainId === user.id,
      memberSince: memberSince.get(boatId) ?? null,
      captainId,
      members: [person(captainId, null, null, null, true), ...crew],
      events: events
        .filter((row) => String(row.boat_id) === boatId)
        .map((row) => ({
          id: String(row.id),
          title: row.title || "Esemény",
          type: row.type || "",
          startDate: String(row.start_date),
          endDate: (row.end_date as string | null) ?? null,
          location: row.location || "",
          note: String(row.notes ?? "").trim(),
          answers: answersByEvent.get(String(row.id)) ?? {},
        })),
    }
  })

  // Csapaton kívüli résztvevők (pl. egy hirdetésen át felvett vendég): csak név és kép.
  const people: Record<string, { name: string; avatarUrl: string | null }> = {}
  for (const userId of userIds) {
    const profile = profileById.get(userId)
    people[userId] = { name: String(profile?.full_name ?? "").trim() || "Résztvevő", avatarUrl: (profile?.avatar_url as string | null) ?? null }
  }

  return NextResponse.json({ teams, people })
}
