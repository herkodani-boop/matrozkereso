import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null
  return normalized
}

function isPlaceholderDomain(value: string | undefined) {
  return !value || /yourdomain\.com|localhost|127\.0\.0\.1|resend\.dev/i.test(value)
}

function getSenderEmail() {
  const senderEmail = process.env.RESEND_FROM_EMAIL?.trim()

  if (!senderEmail || isPlaceholderDomain(senderEmail)) {
    throw new Error(
      "A RESEND_FROM_EMAIL mezőnek egy tényleges, ellenőrzött domainre kell mutatnia, például: no-reply@matrozkereso.com",
    )
  }

  return senderEmail
}

function getAppBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()

  if (!configuredUrl || /localhost|127\.0\.0\.1/.test(configuredUrl)) {
    return "https://www.matrozkereso.com"
  }

  return configuredUrl.replace(/\/$/, "")
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const senderName = process.env.RESEND_FROM_NAME || "Matrózkereső"

  let senderEmail: string
  try {
    senderEmail = getSenderEmail()
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "A RESEND_FROM_EMAIL mezőnek egy ellenőrzött, valós domainre kell mutatnia.",
      },
      { status: 500 },
    )
  }

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
    .select("id, name, image_url")
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
  const baseUrl = getAppBaseUrl()
  const inviteLink = tokenValue ? `${baseUrl}/accept-team-invite?token=${tokenValue}` : null
  const inviterDisplayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "A hajós csapat"

  if (!inviteLink) {
    return NextResponse.json({ error: "A meghívó link generálása nem sikerült." }, { status: 500 })
  }

  const resend = new Resend(resendApiKey)
  const fromAddress = `${senderName} <${senderEmail}>`
  const logoImageUrl = "https://www.matrozkereso.com/matrozkereso-logo-csomag/png/matrozkereso-logo-512.png"
  const boatImageUrl =
    ownerBoat?.image_url && /^https?:\/\//.test(ownerBoat.image_url)
      ? ownerBoat.image_url
      : "https://www.matrozkereso.com/placeholder.svg"
  const safeBoatImageMarkup = `
    <div style="width: 100%; max-width: 600px; height: 180px; overflow: hidden; background: #e2e8f0; border-radius: 12px 12px 0 0;">
      <img
        src="${boatImageUrl}"
        alt="Hajó kép"
        width="600"
        height="180"
        style="display: block; width: 100%; height: 180px; object-fit: cover; border: 0; background-color: #e2e8f0;"
      />
    </div>
  `

  const emailResult = await resend.emails.send({
    from: fromAddress,
    to: [email],
    replyTo: senderEmail,
    subject: "Meghívás csapatba a Matrózkeresőn",
    headers: {
      "List-Unsubscribe": `mailto:${senderEmail}?subject=Unsubscribe`,
    },
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827; max-width: 660px; margin: 0 auto; background: #f8fafc; padding: 24px;">
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);">
          <div style="padding: 22px 28px 14px; border-bottom: 1px solid #e2e8f0; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);">
            <img src="${logoImageUrl}" alt="Matrózkereső logo" width="44" height="44" style="display: block; width: 44px; height: 44px; border-radius: 12px;" />
          </div>

          <div style="padding: 28px 28px 20px; background: #ffffff;">
            <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 10px;">Matrózkereső</div>
            <h2 style="margin: 0 0 18px; font-size: 32px; line-height: 1.2; color: #0f172a; font-weight: 700;">Meghívás csapatba a Matrózkeresőn</h2>

            <p style="margin: 0 0 10px; font-size: 16px; color: #334155;">Kedves Címzett!</p>
            <p style="margin: 0 0 22px; font-size: 16px; color: #334155; line-height: 1.7;">
              <strong>${inviterDisplayName}</strong> meghívott a csapatába, amelyet a lenti gomb megnyomásával tudsz elfogadni.
            </p>

            <div style="margin: 0 0 20px; display: block; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;">
              ${safeBoatImageMarkup}
              <div style="padding: 18px 18px 12px;">
                <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Hajó</div>
                <div style="font-size: 22px; font-weight: 700; color: #0f172a;">${ownerBoat.name}</div>
              </div>
            </div>

            <p style="margin: 0 0 18px; font-size: 15px; color: #475569;">A meghívás elfogadásához kattints az alábbi gombra:</p>

            <p style="margin: 0 0 22px; text-align: left;">
              <a href="${inviteLink}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 15px 28px; border-radius: 999px; font-weight: 700; font-size: 16px; line-height: 1;">
                Elfogadom a meghívást
              </a>
            </p>

            <p style="margin: 0; font-size: 12px; color: #64748b;">Ez a meghívás 7 napig érvényes.</p>
          </div>
        </div>
      </div>
    `,
    text: `Meghívás csapatba a Matrózkeresőn\n\nKedves Címzett!\n\n${inviterDisplayName} meghívott a csapatába. A meghívást az alkalmazásban vagy a weboldalon tudja elfogadni.\n\nHajó: ${ownerBoat.name}\n\nEz a meghívás 7 napig érvényes.`,
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
