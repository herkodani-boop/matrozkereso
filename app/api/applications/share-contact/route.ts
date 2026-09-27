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

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt session." }, { status: 401 })
  }

  const { data: application, error: applicationError } = await adminClient
    .from("applications")
    .select("id, ad_id, status")
    .eq("id", applicationId)
    .maybeSingle()

  if (applicationError) {
    console.error("Jelentkezés lekérdezési hiba:", applicationError)
    return NextResponse.json({ error: "A jelentkezést nem sikerült betölteni." }, { status: 500 })
  }

  if (!application) {
    return NextResponse.json({ error: "A jelentkezés nem található." }, { status: 404 })
  }

  const { data: listing, error: listingError } = await adminClient
    .from("ads")
    .select("id, user_id, boat_id")
    .eq("id", application.ad_id)
    .maybeSingle()

  if (listingError) {
    console.error("Hirdetés jogosultság ellenőrzési hiba:", listingError)
    return NextResponse.json({ error: "A hirdetés jogosultságát nem sikerült ellenőrizni." }, { status: 500 })
  }

  if (!listing) {
    return NextResponse.json({ error: "A hirdetés nem található." }, { status: 404 })
  }

  let isCaptain = listing.user_id === user.id
  if (!isCaptain && listing.boat_id) {
    const { data: ownedBoat, error: boatError } = await adminClient
      .from("boats")
      .select("id")
      .eq("id", listing.boat_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (boatError) {
      console.error("Hajótulajdonos ellenőrzési hiba:", boatError)
      return NextResponse.json({ error: "A hajó jogosultságát nem sikerült ellenőrizni." }, { status: 500 })
    }

    isCaptain = Boolean(ownedBoat)
  }

  if (!isCaptain) {
    return NextResponse.json({ error: "Nincs jogosultságod ehhez a hirdetéshez." }, { status: 403 })
  }

  if (application.status !== "accepted") {
    return NextResponse.json({ error: "Előbb kezdeményezd a kapcsolatfelvételt a jelentkezővel." }, { status: 409 })
  }

  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("full_name, phone")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("Kapitányi profil lekérdezési hiba:", profileError)
    return NextResponse.json({ error: "A kapitány elérhetőségeinek lekérdezése nem sikerült." }, { status: 400 })
  }

  const { data: updatedApplication, error: updateError } = await adminClient
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
    if (String(updateError.code ?? "") === "42703") {
      return NextResponse.json(
        { error: "Hiányoznak a kontaktmegosztás adatbázismezői. Futtasd le az application-contact-sharing-migration.sql migrációt." },
        { status: 500 },
      )
    }
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