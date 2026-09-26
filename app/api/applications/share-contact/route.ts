import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Hiányzó Supabase konfiguráció." }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: "Az elérhetőségek megosztásához be kell jelentkezned." }, { status: 401 })
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

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt session." }, { status: 401 })
  }

  const { data: profile, error: profileError } = await userClient
    .from("users")
    .select("full_name, phone")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("Kapitányi profil lekérdezési hiba:", profileError)
    return NextResponse.json({ error: "A kapitány elérhetőségeinek lekérdezése nem sikerült." }, { status: 400 })
  }

  const { data: updatedApplication, error: updateError } = await userClient
    .from("applications")
    .update({
      captain_contact_shared_at: new Date().toISOString(),
      captain_contact_name: profile?.full_name || user.user_metadata?.full_name || null,
      captain_contact_email: user.email ?? null,
      captain_contact_phone: profile?.phone ?? null,
    })
    .eq("id", applicationId)
    .eq("status", "accepted")
    .select("id")
    .maybeSingle()

  if (updateError) {
    console.error("Kapitányi elérhetőségek mentési hiba:", updateError)
    return NextResponse.json({ error: "Az elérhetőségek megosztása nem sikerült." }, { status: 400 })
  }

  if (!updatedApplication) {
    return NextResponse.json(
      { error: "A jelentkezés nem található, nem elfogadott, vagy nincs jogosultságod a megosztáshoz." },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true })
}