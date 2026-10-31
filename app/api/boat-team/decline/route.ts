import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Meghívó elutasítása ("Most nem"): a meghívó visszavonttá válik, a kapitány listájáról pedig
// lekerül a függő tag, így nem emlékeztetjük tovább az újraküldésre.
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
    return NextResponse.json({ error: "A meghívó elutasításához be kell jelentkezned." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 })
  }
  const inviteToken = typeof body.token === "string" ? body.token.trim() : ""
  if (!inviteToken) {
    return NextResponse.json({ error: "Hiányzó meghívási token." }, { status: 400 })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)
  if (authError || !user?.email) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt bejelentkezés." }, { status: 401 })
  }

  const { data: invitation, error: invitationError } = await adminClient
    .from("boat_team_invitations")
    .select("id, boat_id, invitee_email, status")
    .eq("token", inviteToken)
    .maybeSingle()
  if (invitationError) {
    console.error("Meghívó lekérdezési hiba elutasításkor:", invitationError)
    return NextResponse.json({ error: "A meghívót nem sikerült betölteni." }, { status: 500 })
  }
  if (!invitation || invitation.status !== "pending") {
    return NextResponse.json({ error: "A meghívó már nem érvényes." }, { status: 404 })
  }
  const email = user.email.trim().toLowerCase()
  if (String(invitation.invitee_email).trim().toLowerCase() !== email) {
    return NextResponse.json({ error: "Ez a meghívó másik e-mail-címre szól." }, { status: 403 })
  }

  const { error: updateError } = await adminClient
    .from("boat_team_invitations")
    .update({ status: "cancelled" })
    .eq("id", invitation.id)
    .eq("status", "pending")
  if (updateError) {
    console.error("Meghívó elutasítási hiba:", updateError)
    return NextResponse.json({ error: "A meghívót nem sikerült elutasítani." }, { status: 500 })
  }

  const { error: memberError } = await adminClient
    .from("boat_team_members")
    .update({ status: "removed" })
    .eq("boat_id", invitation.boat_id)
    .eq("email", email)
    .eq("status", "invited")
  if (memberError) console.error("Függő csapattag törlési hiba elutasításkor:", memberError)

  return NextResponse.json({ ok: true })
}
