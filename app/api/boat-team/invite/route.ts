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
  const inviterDisplayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "A hajós csapat"

  if (!inviteLink) {
    return NextResponse.json({ error: "A meghívó link generálása nem sikerült." }, { status: 500 })
  }

  const resend = new Resend(resendApiKey)
  const fromAddress = `${senderName} <${senderEmail}>`

  const emailResult = await resend.emails.send({
    from: fromAddress,
    to: [email],
    replyTo: senderEmail,
    subject: "Meghívás csapatba a Matrózkeresőn",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827; max-width: 620px; margin: 0 auto; padding: 28px 24px; background: #ffffff;">
        <div style="font-size: 14px; color: #475569; margin-bottom: 20px;">Matrózkereső</div>

        <h2 style="margin: 0 0 18px; font-size: 30px; line-height: 1.2; color: #0f172a;">Meghívás csapatba a Matrózkeresőn</h2>

        <p style="margin: 0 0 10px; font-size: 16px;">Kedves Címzett!</p>
        <p style="margin: 0 0 18px; font-size: 16px;">
          <strong>${inviterDisplayName}</strong> meghívott a csapatába, melyet az alábbi linken tudsz elfogadni bejelentkezés vagy regisztrációt követően.
        </p>

        <div style="margin: 0 0 18px; padding: 18px 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <div style="font-size: 14px; color: #475569; margin-bottom: 6px;">Hajó</div>
          <div style="font-size: 20px; font-weight: 700; color: #0f172a;">${ownerBoat.name}</div>
        </div>

        <p style="margin: 0 0 18px; font-size: 16px;">A meghívás elfogadásához kattints az alábbi gombra:</p>

        <p style="margin: 0 0 20px;">
          <a href="${inviteLink}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 999px; font-weight: 700; font-size: 16px;">
            Elfogadom a meghívást
          </a>
        </p>

        <p style="margin: 0 0 10px; font-size: 14px; color: #475569;">Ha a gomb nem nyílik meg, másold be ezt a linket a böngészőbe:</p>
        <p style="margin: 0; font-size: 14px; word-break: break-all;"><a href="${inviteLink}" style="color: #2563eb;">${inviteLink}</a></p>

        <p style="margin-top: 22px; font-size: 14px; color: #475569;">Ez a meghívás 7 napig érvényes.</p>
      </div>
    `,
    text: `Meghívás csapatba a Matrózkeresőn\n\nKedves Címzett!\n\n${inviterDisplayName} meghívott a csapatába, melyet az alábbi linken tudsz elfogadni bejelentkezés vagy regisztrációt követően.\n\nHajó: ${ownerBoat.name}\n\nElfogadási link:\n${inviteLink}\n\nEz a meghívás 7 napig érvényes.`,
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
