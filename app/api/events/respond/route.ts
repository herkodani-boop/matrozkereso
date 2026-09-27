import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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
    return NextResponse.json({ error: "A válasz mentéséhez be kell jelentkezned." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 })
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : ""
  const status = body.status
  if (!eventId || (status !== "confirmed" && status !== "declined")) {
    return NextResponse.json({ error: "Érvénytelen esemény vagy részvételi válasz." }, { status: 400 })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)

  if (authError || !user) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt bejelentkezés." }, { status: 401 })
  }

  const { data: event, error: eventError } = await adminClient
    .from("boat_events")
    .select("id, boat_id")
    .eq("id", eventId)
    .maybeSingle()

  if (eventError) {
    console.error("Esemény válasz jogosultság lekérdezési hiba:", eventError)
    return NextResponse.json({ error: "Az esemény jogosultságát nem sikerült ellenőrizni." }, { status: 500 })
  }

  if (!event) {
    return NextResponse.json({ error: "Az esemény nem található." }, { status: 404 })
  }

  const [{ data: boat, error: boatError }, { data: membership, error: membershipError }] = await Promise.all([
    adminClient.from("boats").select("id, user_id").eq("id", event.boat_id).maybeSingle(),
    adminClient
      .from("boat_team_members")
      .select("id")
      .eq("boat_id", event.boat_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ])

  if (boatError || membershipError) {
    console.error("Esemény válasz tagsági ellenőrzési hiba:", boatError ?? membershipError)
    return NextResponse.json({ error: "A csapattagságot nem sikerült ellenőrizni." }, { status: 500 })
  }

  if (!boat || (boat.user_id !== user.id && !membership)) {
    return NextResponse.json({ error: "Ehhez az eseményhez csak a hajó kapitánya vagy aktív csapattagja válaszolhat." }, { status: 403 })
  }

  const { error: saveError } = await adminClient
    .from("boat_event_attendees")
    .upsert(
      { event_id: event.id, user_id: user.id, status },
      { onConflict: "event_id,user_id" },
    )

  if (saveError) {
    console.error("Esemény-visszajelzés mentési hiba:", saveError)
    return NextResponse.json({ error: "A részvételi válasz mentése nem sikerült." }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status })
}
