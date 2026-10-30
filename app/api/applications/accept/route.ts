import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadApplicationEmailContext, sendApplicationUpdateEmail } from "@/lib/application-emails"

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
    return NextResponse.json({ error: "A jelentkezés elfogadásához be kell jelentkezned." }, { status: 401 })
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
  const shareContact = body.shareContact === true

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)

  if (authError || !user) {
    return NextResponse.json(
      { code: "SESSION_INVALID", error: "Érvénytelen vagy lejárt bejelentkezés." },
      { status: 401 },
    )
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

  const { data: ownedListing, error: listingError } = await adminClient
    .from("ads")
    .select("id")
    .eq("id", application.ad_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (listingError) {
    console.error("Hirdetés tulajdonos ellenőrzési hiba:", listingError)
    return NextResponse.json({ error: "A hirdetés jogosultságát nem sikerült ellenőrizni." }, { status: 500 })
  }

  if (!ownedListing) {
    return NextResponse.json({ error: "Nincs jogosultságod ehhez a jelentkezéshez." }, { status: 403 })
  }

  if (application.status !== "pending") {
    return NextResponse.json({ error: "A jelentkezés már nem vár elbírálásra." }, { status: 409 })
  }

  // Az elérhetőségek megosztása az elfogadással egy lépésben, hogy a jelentkező rögtön elérje a kapitányt.
  let contactFields: {
    captain_contact_shared_at?: string
    captain_contact_name?: string | null
    captain_contact_email?: string | null
    captain_contact_phone?: string | null
  } = {}
  if (shareContact) {
    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      console.error("Kapitányi profil lekérdezési hiba:", profileError)
      return NextResponse.json({ error: "A kapitány elérhetőségeinek lekérdezése nem sikerült." }, { status: 500 })
    }

    contactFields = {
      captain_contact_shared_at: new Date().toISOString(),
      captain_contact_name: profile?.full_name || user.user_metadata?.full_name || null,
      captain_contact_email: user.email ?? null,
      captain_contact_phone: profile?.phone ?? null,
    }
  }

  const { data: updatedApplication, error: updateError } = await adminClient
    .from("applications")
    .update({ status: "accepted", ...contactFields })
    .eq("id", applicationId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle()

  if (updateError) {
    console.error("Jelentkezés elfogadási hiba:", updateError)
    return NextResponse.json({ error: "A jelentkezést nem sikerült elfogadni." }, { status: 500 })
  }

  if (!updatedApplication) {
    return NextResponse.json({ error: "A jelentkezés állapota időközben megváltozott." }, { status: 409 })
  }

  // Az elfogadás már megtörtént; az értesítő hibája nem fordítja vissza.
  const context = await loadApplicationEmailContext(adminClient, applicationId)
  const emailSent = context?.applicant.email
    ? await sendApplicationUpdateEmail({
        kind: "accepted",
        email: context.applicant.email,
        applicantName: context.applicant.name,
        listingTitle: context.listingTitle,
        boatName: context.boatName,
        captainContact: shareContact
          ? {
              name: contactFields.captain_contact_name || context.captain.name,
              email: contactFields.captain_contact_email ?? null,
              phone: contactFields.captain_contact_phone ?? null,
            }
          : null,
      })
    : false

  return NextResponse.json({ ok: true, applicationId: updatedApplication.id, contactShared: shareContact, emailSent })
}
