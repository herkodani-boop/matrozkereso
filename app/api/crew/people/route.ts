import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const MAX_IDS = 100

// Nevek és profilképek a legénység-nézethez. A users tábla RLS-e csak a saját és a kapitány által
// látható profilokat engedi, ezért a matróz itt kapja meg a vele egy csapatban lévők (kapitány,
// csapattagok, a csapat eseményeinek résztvevői) nevét. Mást nem adunk ki, csak nevet és képet.
export async function POST(request: NextRequest) {
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

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 })
  }
  const requested = Array.isArray(body.userIds)
    ? Array.from(new Set(body.userIds.filter((id): id is string => typeof id === "string" && id.length > 0))).slice(0, MAX_IDS)
    : []
  if (requested.length === 0) return NextResponse.json({ people: [] })

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt bejelentkezés." }, { status: 401 })
  }

  // A felhasználó hajói: ahol aktív csapattag, vagy amelyiknek ő a kapitánya.
  const [membershipsResult, ownBoatsResult] = await Promise.all([
    adminClient.from("boat_team_members").select("boat_id").eq("user_id", user.id).eq("status", "active"),
    adminClient.from("boats").select("id").eq("user_id", user.id),
  ])
  const firstError = membershipsResult.error ?? ownBoatsResult.error
  if (firstError) {
    console.error("Csapat-nevek: hajók lekérdezési hiba:", firstError)
    return NextResponse.json({ error: "A neveket nem sikerült betölteni." }, { status: 500 })
  }
  const boatIds = Array.from(new Set([
    ...(membershipsResult.data ?? []).map((row) => String(row.boat_id)),
    ...(ownBoatsResult.data ?? []).map((row) => String(row.id)),
  ]))
  if (boatIds.length === 0) return NextResponse.json({ people: [] })

  const [captainsResult, membersResult, eventsResult] = await Promise.all([
    adminClient.from("boats").select("user_id").in("id", boatIds),
    adminClient.from("boat_team_members").select("user_id").in("boat_id", boatIds).eq("status", "active"),
    adminClient.from("boat_events").select("id").in("boat_id", boatIds),
  ])
  const secondError = captainsResult.error ?? membersResult.error ?? eventsResult.error
  if (secondError) {
    console.error("Csapat-nevek: csapat lekérdezési hiba:", secondError)
    return NextResponse.json({ error: "A neveket nem sikerült betölteni." }, { status: 500 })
  }

  const eventIds = (eventsResult.data ?? []).map((row) => String(row.id))
  const attendeesResult = eventIds.length > 0
    ? await adminClient.from("boat_event_attendees").select("user_id").in("event_id", eventIds).in("user_id", requested)
    : { data: [] as { user_id: string }[], error: null }
  if (attendeesResult.error) {
    console.error("Csapat-nevek: résztvevők lekérdezési hiba:", attendeesResult.error)
    return NextResponse.json({ error: "A neveket nem sikerült betölteni." }, { status: 500 })
  }

  const related = new Set([
    ...(captainsResult.data ?? []).map((row) => String(row.user_id)),
    ...(membersResult.data ?? []).map((row) => String(row.user_id)),
    ...(attendeesResult.data ?? []).map((row) => String(row.user_id)),
  ])
  const allowed = requested.filter((id) => related.has(id))
  if (allowed.length === 0) return NextResponse.json({ people: [] })

  const { data: profiles, error: profilesError } = await adminClient.from("users").select("id, full_name, avatar_url").in("id", allowed)
  if (profilesError) {
    console.error("Csapat-nevek: profilok lekérdezési hiba:", profilesError)
    return NextResponse.json({ error: "A neveket nem sikerült betölteni." }, { status: 500 })
  }

  return NextResponse.json({
    people: (profiles ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.full_name ?? "").trim(),
      avatarUrl: (row.avatar_url as string | null) ?? null,
    })),
  })
}
