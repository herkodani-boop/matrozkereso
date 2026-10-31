import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// A bejelentkezett felhasználó függő csapatmeghívói. A meghívó e-mail-címre szól, és a token maga
// a belépőjegy, ezért a táblát a service role kliens olvassa, és csak a saját címre szólókat adjuk vissza.
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
    return NextResponse.json({ error: "A meghívók megtekintéséhez be kell jelentkezned." }, { status: 401 })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)
  if (authError || !user?.email) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt bejelentkezés." }, { status: 401 })
  }

  const { data: invitations, error } = await adminClient
    .from("boat_team_invitations")
    .select("token, boat_id, inviter_id, created_at, boat:boats(id, name, type, harbor, image_url, original_image_url, user_id)")
    .eq("invitee_email", user.email.trim().toLowerCase())
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(5)

  if (error) {
    console.error("Saját meghívók lekérdezési hiba:", error)
    return NextResponse.json({ error: "A meghívókat nem sikerült betölteni." }, { status: 500 })
  }

  type BoatRow = { id: string; name: string | null; type: string | null; harbor: string | null; image_url: string | null; original_image_url: string | null; user_id: string }
  const rows = (invitations ?? []).map((row) => ({
    ...row,
    boat: (Array.isArray(row.boat) ? row.boat[0] ?? null : row.boat) as BoatRow | null,
  }))
  // A saját hajóra szóló meghívó értelmetlen; a tulajdonos amúgy is a hajó kapitánya.
  const relevant = rows.filter((row) => row.boat && row.boat.user_id !== user.id)
  const boatIds = relevant.map((row) => String(row.boat_id))
  const inviterIds = Array.from(new Set(relevant.map((row) => String(row.inviter_id))))
  const today = new Date().toISOString().slice(0, 10)

  const [profilesResult, membersResult, eventsResult] = await Promise.all([
    inviterIds.length > 0 ? adminClient.from("users").select("id, full_name").in("id", inviterIds) : Promise.resolve({ data: [], error: null }),
    boatIds.length > 0 ? adminClient.from("boat_team_members").select("boat_id").in("boat_id", boatIds).eq("status", "active") : Promise.resolve({ data: [], error: null }),
    boatIds.length > 0
      ? adminClient.from("boat_events").select("id, boat_id, title, type, start_date, end_date, location").in("boat_id", boatIds).gte("start_date", today).order("start_date").limit(20)
      : Promise.resolve({ data: [], error: null }),
  ])
  const firstError = profilesResult.error ?? membersResult.error ?? eventsResult.error
  if (firstError) {
    console.error("Meghívó részleteinek lekérdezési hiba:", firstError)
    return NextResponse.json({ error: "A meghívókat nem sikerült betölteni." }, { status: 500 })
  }

  const nameById = new Map((profilesResult.data ?? []).map((row) => [String(row.id), String(row.full_name ?? "").trim()]))
  const crewByBoat = new Map<string, number>()
  for (const row of membersResult.data ?? []) crewByBoat.set(String(row.boat_id), (crewByBoat.get(String(row.boat_id)) ?? 0) + 1)

  return NextResponse.json({
    invitations: relevant.map((row) => {
      const boat = row.boat as BoatRow
      return {
        token: String(row.token),
        createdAt: row.created_at,
        inviterName: nameById.get(String(row.inviter_id)) || "A kapitány",
        boat: {
          id: String(boat.id),
          name: boat.name || "Hajó",
          type: boat.type || "",
          harbor: boat.harbor || "",
          imageUrl: boat.image_url ?? boat.original_image_url ?? null,
          crewCount: crewByBoat.get(String(boat.id)) ?? 0,
        },
        upcomingEvents: (eventsResult.data ?? [])
          .filter((event) => String(event.boat_id) === String(boat.id))
          .slice(0, 3)
          .map((event) => ({
            id: String(event.id),
            title: event.title || "Esemény",
            type: event.type || "",
            startDate: event.start_date,
            endDate: event.end_date,
            location: event.location || "",
          })),
      }
    }),
  })
}
