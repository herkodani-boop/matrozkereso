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
    .select("invitee_email, boat_id, inviter_id")
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

  const { data: existingMembership, error: membershipLookupError } = await adminClient
    .from("boat_team_members")
    .select("id")
    .eq("boat_id", invitation.boat_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle()

  if (membershipLookupError) {
    console.error("Meglévő csapattagság lekérdezési hiba:", membershipLookupError)
    return NextResponse.json({ error: "A meglévő csapattagság ellenőrzése nem sikerült." }, { status: 500 })
  }

  const { data, error } = await adminClient.rpc("accept_boat_team_invitation", {
    p_token: rawToken,
    p_user_id: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  let emailSent: boolean | null = null
  if (!existingMembership) {
    const [
      { data: boat, error: boatError },
      { data: profile, error: profileError },
      { data: captainProfile, error: captainProfileError },
      { data: captainAccount, error: captainAccountError },
    ] = await Promise.all([
      adminClient.from("boats").select("name").eq("id", invitation.boat_id).maybeSingle(),
      adminClient.from("users").select("full_name").eq("id", user.id).maybeSingle(),
      adminClient.from("users").select("full_name, phone, avatar_url").eq("id", invitation.inviter_id).maybeSingle(),
      adminClient.auth.admin.getUserById(invitation.inviter_id),
    ])

    if (boatError) console.error("Hajónév lekérdezési hiba az értesítő emailhez:", boatError)
    if (profileError) console.error("Csapattag profil lekérdezési hiba az értesítő emailhez:", profileError)
    if (captainProfileError) console.error("Kapitányi profil lekérdezési hiba az értesítő emailhez:", captainProfileError)
    if (captainAccountError) console.error("Kapitányi fiók lekérdezési hiba az értesítő emailhez:", captainAccountError)

    emailSent = boat?.name
      ? await sendTeamMembershipEmail({
          email: signedInEmail,
          memberName: profile?.full_name || user.user_metadata?.full_name || signedInEmail.split("@")[0],
          boatName: boat.name,
          captainName: captainProfile?.full_name || captainAccount.user?.user_metadata?.full_name || captainAccount.user?.email?.split("@")[0] || "Kapitány",
          captainEmail: captainAccount.user?.email ?? null,
          captainPhone: captainProfile?.phone ?? null,
          captainAvatarUrl: captainProfile?.avatar_url ?? null,
        })
      : false
  }

  return NextResponse.json({ ok: true, memberId: data, emailSent })
}
