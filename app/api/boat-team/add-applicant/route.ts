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

  const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : ""
  if (!applicationId) {
    return NextResponse.json({ error: "Hiányzó jelentkezésazonosító." }, { status: 400 })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user: captain }, error: authError } = await authClient.auth.getUser(accessToken)

  if (authError || !captain) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt bejelentkezés." }, { status: 401 })
  }

  const { data: application, error: applicationError } = await adminClient
    .from("applications")
    .select("id, user_id, status, ad_id")
    .eq("id", applicationId)
    .maybeSingle()

  if (applicationError) {
    console.error("Jelentkezés lekérdezési hiba:", applicationError)
    return NextResponse.json({ error: "A jelentkezést nem sikerült betölteni." }, { status: 500 })
  }

  if (!application) {
    return NextResponse.json({ error: "A jelentkezés nem található." }, { status: 404 })
  }

  if (application.status !== "accepted") {
    return NextResponse.json({ error: "Csak elfogadott jelentkezőt adhatsz a csapathoz." }, { status: 409 })
  }

  const { data: listing, error: listingError } = await adminClient
    .from("ads")
    .select("id, boat_id")
    .eq("id", application.ad_id)
    .eq("user_id", captain.id)
    .maybeSingle()

  if (listingError) {
    console.error("Hirdetés jogosultság ellenőrzési hiba:", listingError)
    return NextResponse.json({ error: "A hirdetés jogosultságát nem sikerült ellenőrizni." }, { status: 500 })
  }

  if (!listing) {
    return NextResponse.json({ error: "Nincs jogosultságod ehhez a jelentkezéshez." }, { status: 403 })
  }

  const { data: applicantProfile, error: profileError } = await adminClient
    .from("users")
    .select("full_name, email, avatar_url, phone")
    .eq("id", application.user_id)
    .maybeSingle()

  if (profileError) {
    console.error("Jelentkezői profil lekérdezési hiba:", profileError)
    return NextResponse.json({ error: "A jelentkező profilját nem sikerült betölteni." }, { status: 500 })
  }

  const { data: authApplicant, error: authApplicantError } = await adminClient.auth.admin.getUserById(application.user_id)
  if (authApplicantError) {
    console.error("Jelentkezői fiók lekérdezési hiba:", authApplicantError)
    return NextResponse.json({ error: "A jelentkező fiókját nem sikerült betölteni." }, { status: 500 })
  }

  const applicantEmail = String(applicantProfile?.email || authApplicant.user?.email || "").trim().toLowerCase()
  if (!applicantEmail) {
    return NextResponse.json({ error: "A jelentkezőhöz nem tartozik használható e-mail-cím." }, { status: 400 })
  }

  const applicantName = String(
    applicantProfile?.full_name || authApplicant.user?.user_metadata?.full_name || applicantEmail.split("@")[0],
  ).trim()

  const { data: existingMember, error: existingMemberError } = await adminClient
    .from("boat_team_members")
    .select("id, user_id, email, display_name, role, status")
    .eq("boat_id", listing.boat_id)
    .eq("user_id", application.user_id)
    .maybeSingle()

  if (existingMemberError) {
    console.error("Meglévő csapattagság lekérdezési hiba:", existingMemberError)
    return NextResponse.json({ error: "A meglévő csapattagság ellenőrzése nem sikerült." }, { status: 500 })
  }

  if (existingMember?.status === "active") {
    return NextResponse.json({ ok: true, alreadyMember: true, member: existingMember })
  }

  const memberPayload = {
    boat_id: listing.boat_id,
    user_id: application.user_id,
    email: applicantEmail,
    invited_by: captain.id,
    status: "active",
    display_name: applicantName,
    accepted_at: new Date().toISOString(),
    role: "Csapattag",
  }

  const memberQuery = existingMember
    ? adminClient
        .from("boat_team_members")
        .update(memberPayload)
        .eq("id", existingMember.id)
    : adminClient
        .from("boat_team_members")
        .upsert(memberPayload, { onConflict: "boat_id,email" })

  const { data: member, error: memberError } = await memberQuery
    .select("id, user_id, email, display_name, role, status")
    .single()

  if (memberError || !member) {
    console.error("Csapattag hozzáadási hiba:", memberError)
    return NextResponse.json({ error: "A jelentkezőt nem sikerült csapattaggá tenni." }, { status: 500 })
  }

  const [{ data: boat, error: boatNameError }, { data: captainProfile, error: captainProfileError }] = await Promise.all([
    adminClient.from("boats").select("name").eq("id", listing.boat_id).maybeSingle(),
    adminClient.from("users").select("full_name, phone, avatar_url").eq("id", captain.id).maybeSingle(),
  ])

  if (boatNameError) console.error("Hajónév lekérdezési hiba az értesítő emailhez:", boatNameError)
  if (captainProfileError) console.error("Kapitányi profil lekérdezési hiba az értesítő emailhez:", captainProfileError)

  const emailSent = boat?.name
    ? await sendTeamMembershipEmail({
        email: applicantEmail,
        memberName: applicantName,
        boatName: boat.name,
        captainName: captainProfile?.full_name || captain.user_metadata?.full_name || captain.email?.split("@")[0] || "Kapitány",
        captainEmail: captain.email ?? null,
        captainPhone: captainProfile?.phone ?? null,
        captainAvatarUrl: captainProfile?.avatar_url ?? null,
      })
    : false

  return NextResponse.json({
    ok: true,
    alreadyMember: false,
    emailSent,
    member: {
      ...member,
      avatar_url: applicantProfile?.avatar_url ?? null,
      phone: applicantProfile?.phone ?? null,
    },
  })
}
