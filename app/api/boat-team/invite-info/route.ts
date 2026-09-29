import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// A token birtoklása maga a jogosultság (ugyanaz a bizalmi szint, mint magánál a meghívó linknél),
// ezért ez a végpont bejelentkezés nélkül, csak a tokennel érhető el.
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Hiányzó Supabase konfiguráció." }, { status: 500 })
  }

  const token = request.nextUrl.searchParams.get("token")?.trim()
  if (!token) {
    return NextResponse.json({ error: "Hiányzó meghívási token." }, { status: 400 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: invitation, error } = await adminClient
    .from("boat_team_invitations")
    .select("invitee_email, status, expires_at, boat_id")
    .eq("token", token)
    .maybeSingle()

  if (error) {
    console.error("Meghívó adatlekérdezési hiba:", error)
    return NextResponse.json({ error: "A meghívás ellenőrzése nem sikerült." }, { status: 500 })
  }

  if (!invitation) {
    return NextResponse.json({ error: "A meghívás nem létezik vagy lejárt." }, { status: 404 })
  }

  let boatName: string | null = null
  if (invitation.boat_id) {
    const { data: boat } = await adminClient.from("boats").select("name").eq("id", invitation.boat_id).maybeSingle()
    boatName = boat?.name ?? null
  }

  const isValid = invitation.status === "pending" && new Date(invitation.expires_at).getTime() > Date.now()

  return NextResponse.json({
    ok: true,
    valid: isValid,
    invitedEmail: String(invitation.invitee_email),
    boatName,
  })
}
