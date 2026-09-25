import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null
  return normalized
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const senderEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
  const senderName = process.env.RESEND_FROM_NAME || "Matrózkereső"

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Hiányzó Supabase konfiguráció." }, { status: 500 })
  }

  if (!resendApiKey) {
    return NextResponse.json(
      { error: "Hiányzó RESEND_API_KEY környezeti változó. A valódi emailküldéshez be kell állítani." },
      { status: 500 },
    )
  }

  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: "A meghívás létrehozásához be kell jelentkezned." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 })
  }

  const email = normalizeEmail(body.email)
  const boatId = typeof body.boatId === "string" ? body.boatId.trim() : null
  const invitedName = typeof body.invitedName === "string" ? body.invitedName.trim() || null : null

  if (!email || !boatId) {
    return NextResponse.json({ error: "Érvényes email cím és hajó azonosító szükséges." }, { status: 400 })
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt session." }, { status: 401 })
  }

  const { data: ownerBoat, error: boatError } = await adminClient
    .from("boats")
    .select("id, name")
    .eq("id", boatId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (boatError) {
    return NextResponse.json({ error: boatError.message }, { status: 400 })
  }

  if (!ownerBoat) {
    return NextResponse.json({ error: "A hajó nem a bejelentkezett felhasználóhoz tartozik." }, { status: 403 })
  }

  const { data, error } = await adminClient.rpc("create_boat_team_invitation", {
    p_boat_id: boatId,
    p_inviter_id: user.id,
    p_invitee_email: email,
    p_invited_name: invitedName,
    p_expires_in_days: 7,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const invitation = data as { id?: string; token?: string; invitee_email?: string } | null
  const tokenValue = invitation?.token ?? null
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const inviteLink = tokenValue ? `${baseUrl}/accept-team-invite?token=${tokenValue}` : null

  if (!inviteLink) {
    return NextResponse.json({ error: "A meghívó link generálása nem sikerült." }, { status: 500 })
  }

  const resend = new Resend(resendApiKey)
  const fromAddress = `${senderName} <${senderEmail}>`

  const emailResult = await resend.emails.send({
    from: fromAddress,
    to: [email],
    replyTo: senderEmail,
    subject: "Meghívás a hajó csapatába",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827; max-width: 600px; margin: 0 auto;">
        <p style="margin: 0 0 16px;">Sziasztok!</p>
        <p style="margin: 0 0 16px;">${user.email ?? "Valaki"} meghívott a csapatába.</p>
        <p style="margin: 0 0 8px;"><strong>Hajó:</strong> ${ownerBoat.name}</p>
        <p style="margin: 0 0 20px;">A csatlakozáshoz kattints az alábbi gombra:</p>
        <p style="margin: 0 0 20px;">
          <a href="${inviteLink}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 999px; font-weight: 600;">
            Csatlakozás a csapathoz
          </a>
        </p>
        <p style="margin: 0 0 8px;">Ha a gomb nem nyílik meg, használhatod ezt a linket:</p>
        <p style="margin: 0 0 16px; word-break: break-all;"><a href="${inviteLink}">${inviteLink}</a></p>
        <p style="margin: 0; color: #374151;">Ez a meghívás 7 napig érvényes.</p>
      </div>
    `,
    text: `Sziasztok!\n\n${user.email ?? "Valaki"} meghívott a csapatába.\nHajó: ${ownerBoat.name}\n\nA csatlakozáshoz kattints erre a linkre:\n${inviteLink}\n\nEz a meghívás 7 napig érvényes.`,
  })

  if (emailResult.error) {
    return NextResponse.json(
      { error: emailResult.error.message || "A meghívó email elküldése nem sikerült." },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    invite: invitation,
    inviteLink,
    sent: true,
  })
}
