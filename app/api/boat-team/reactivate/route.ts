import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTeamMembershipEmail } from "@/lib/team-membership-email"

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
    return NextResponse.json({ error: "A csapattag hozzáadásához be kell jelentkezned." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 })
  }

  const memberId = typeof body.memberId === "string" ? body.memberId.trim() : ""
  if (!memberId) {
    return NextResponse.json({ error: "Hiányzó tagazonosító." }, { status: 400 })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user: captain }, error: authError } = await authClient.auth.getUser(accessToken)

  if (authError || !captain) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt bejelentkezés." }, { status: 401 })
  }

  const { data: member, error: memberError } = await adminClient
    .from("boat_team_members")
    .select("id, boat_id, user_id, email, display_name, role, status")
    .eq("id", memberId)
    .maybeSingle()

  if (memberError) {
    console.error("Csapattag lekérdezési hiba:", memberError)
    return NextResponse.json({ error: "A csapattagot nem sikerült betölteni." }, { status: 500 })
  }

  if (!member) {
    return NextResponse.json({ error: "A csapattag nem található." }, { status: 404 })
  }

  const { data: boat, error: boatError } = await adminClient
    .from("boats")
    .select("id, name")
    .eq("id", member.boat_id)
    .eq("user_id", captain.id)
    .maybeSingle()

  if (boatError) {
    console.error("Hajó jogosultság ellenőrzési hiba:", boatError)
    return NextResponse.json({ error: "A jogosultságot nem sikerült ellenőrizni." }, { status: 500 })
  }

  if (!boat) {
    return NextResponse.json({ error: "Nincs jogosultságod ehhez a csapathoz." }, { status: 403 })
  }

  if (member.status === "active") {
    return NextResponse.json({ ok: true, alreadyMember: true, member })
  }

  if (member.status !== "removed" || !member.user_id) {
    return NextResponse.json({ error: "Csak korábbi csapattagot adhatsz vissza a csapatba." }, { status: 409 })
  }

  const { data: updated, error: updateError } = await adminClient
    .from("boat_team_members")
    .update({ status: "active", accepted_at: new Date().toISOString(), role: "Csapattag" })
    .eq("id", member.id)
    .select("id, user_id, email, display_name, role, status")
    .single()

  if (updateError || !updated) {
    console.error("Csapattag visszaállítási hiba:", updateError)
    return NextResponse.json({ error: "A csapattagot nem sikerült visszaadni a csapatba." }, { status: 500 })
  }

  const [{ data: profile }, { data: captainProfile }] = await Promise.all([
    adminClient.from("users").select("full_name, avatar_url, phone").eq("id", member.user_id).maybeSingle(),
    adminClient.from("users").select("full_name, phone, avatar_url").eq("id", captain.id).maybeSingle(),
  ])

  const memberName = String(updated.display_name || profile?.full_name || updated.email.split("@")[0]).trim()
  const emailSent = await sendTeamMembershipEmail({
    email: updated.email,
    memberName,
    boatName: boat.name,
    captainName: captainProfile?.full_name || captain.user_metadata?.full_name || captain.email?.split("@")[0] || "Kapitány",
    captainEmail: captain.email ?? null,
    captainPhone: captainProfile?.phone ?? null,
    captainAvatarUrl: captainProfile?.avatar_url ?? null,
  })

  return NextResponse.json({
    ok: true,
    alreadyMember: false,
    emailSent,
    member: {
      ...updated,
      avatar_url: profile?.avatar_url ?? null,
      phone: profile?.phone ?? null,
    },
  })
}
