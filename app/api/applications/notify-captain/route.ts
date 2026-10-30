import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadApplicationEmailContext, sendNewApplicationEmail } from "@/lib/application-emails"

// A jelentkező hívja a saját, frissen létrehozott jelentkezése után; a kapitány e-mailt kap róla.
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
    return NextResponse.json({ error: "Bejelentkezés szükséges." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 })
  }

  const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : ""
  if (!applicationId) {
    return NextResponse.json({ error: "Hiányzó jelentkezésazonosító." }, { status: 400 })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)

  if (authError || !user) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt bejelentkezés." }, { status: 401 })
  }

  // Jelentkezésenként egyszer értesítünk: a mezőt atomikusan foglaljuk le, így az ismételt hívás nem küld újra.
  const { data: claimed, error: claimError } = await adminClient
    .from("applications")
    .update({ captain_notified_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .is("captain_notified_at", null)
    .select("id")
    .maybeSingle()

  if (claimError) {
    console.error("Kapitányi értesítés lefoglalása nem sikerült:", claimError)
    if (String(claimError.code ?? "") === "42703") {
      return NextResponse.json(
        { error: "Hiányzik a captain_notified_at mező. Futtasd le az application-captain-notified-migration.sql migrációt." },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: "Az értesítés nem sikerült." }, { status: 500 })
  }

  if (!claimed) {
    return NextResponse.json({ ok: true, emailSent: false })
  }

  const context = await loadApplicationEmailContext(adminClient, applicationId)
  if (!context?.captain.email) {
    return NextResponse.json({ ok: true, emailSent: false })
  }

  const emailSent = await sendNewApplicationEmail({
    email: context.captain.email,
    captainName: context.captain.name,
    applicantName: context.applicant.name,
    listingTitle: context.listingTitle,
    applicationMessage: context.applicationMessage,
  })

  return NextResponse.json({ ok: true, emailSent })
}
