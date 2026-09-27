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
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: "A meghívás elfogadásához be kell jelentkezned." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 })
  }

  const rawToken = typeof body.token === "string" ? body.token.trim() : ""
  if (!rawToken) {
    return NextResponse.json({ error: "Hiányzó meghívási token." }, { status: 400 })
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json(
      { code: "SESSION_INVALID", error: "Érvénytelen vagy lejárt session." },
      { status: 401 },
    )
  }

  const { data: invitation, error: invitationError } = await adminClient
    .from("boat_team_invitations")
    .select("invitee_email")
    .eq("token", rawToken)
    .maybeSingle()

  if (invitationError) {
    console.error("Csapatmeghívás ellenőrzési hiba:", invitationError)
    return NextResponse.json({ error: "A meghívás ellenőrzése nem sikerült." }, { status: 500 })
  }

  if (!invitation) {
    return NextResponse.json({ error: "A meghívás nem létezik vagy lejárt." }, { status: 404 })
  }

  const invitedEmail = String(invitation.invitee_email ?? "").trim().toLowerCase()
  const signedInEmail = String(user.email ?? "").trim().toLowerCase()

  if (!signedInEmail || signedInEmail !== invitedEmail) {
    return NextResponse.json(
      {
        code: "INVITATION_EMAIL_MISMATCH",
        error: "Ez a meghívó másik e-mail-címre szól. A folytatáshoz jelentkezz be vagy regisztrálj a meghívott e-mail-címmel.",
      },
      { status: 403 },
    )
  }

  const { data, error } = await adminClient.rpc("accept_boat_team_invitation", {
    p_token: rawToken,
    p_user_id: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, memberId: data })
}
