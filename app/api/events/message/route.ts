import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGE_RECIPIENTS,
  selectRecipientIds,
  sendEventMessage,
  type MessageGroup,
} from "@/lib/event-message"

const GROUPS: MessageGroup[] = ["confirmed", "unanswered", "declined"]
const longDate = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric", timeZone: "Europe/Budapest" })

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
    return NextResponse.json({ error: "Az üzenetküldéshez be kell jelentkezned." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 })
  }

  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : ""
  const message = typeof body.message === "string" ? body.message.trim() : ""
  const groups = Array.isArray(body.groups) ? GROUPS.filter((group) => (body.groups as unknown[]).includes(group)) : []

  if (!eventId || groups.length === 0) {
    return NextResponse.json({ error: "Válassz legalább egy címzett csoportot." }, { status: 400 })
  }
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Az üzenet 1 és ${MAX_MESSAGE_LENGTH} karakter között lehet.` }, { status: 400 })
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt bejelentkezés." }, { status: 401 })
  }

  const { data: event, error: eventError } = await adminClient
    .from("boat_events")
    .select("id, title, start_date, boat:boats(id, name, user_id)")
    .eq("id", eventId)
    .maybeSingle()
  if (eventError) {
    console.error("Üzenet: esemény lekérdezési hiba:", eventError)
    return NextResponse.json({ error: "Az eseményt nem sikerült betölteni." }, { status: 500 })
  }

  const boat = (Array.isArray(event?.boat) ? event?.boat[0] : event?.boat) as { id: string; name: string | null; user_id: string } | null
  if (!event || !boat) {
    return NextResponse.json({ error: "Az esemény nem található." }, { status: 404 })
  }
  if (boat.user_id !== user.id) {
    return NextResponse.json({ error: "Csak a hajó kapitánya küldhet üzenetet." }, { status: 403 })
  }

  const [teamResult, attendeesResult, captainResult] = await Promise.all([
    adminClient.from("boat_team_members").select("user_id").eq("boat_id", boat.id).in("status", ["active", "invited"]),
    adminClient.from("boat_event_attendees").select("user_id, status").eq("event_id", eventId),
    adminClient.from("users").select("full_name").eq("id", user.id).maybeSingle(),
  ])
  if (teamResult.error || attendeesResult.error) {
    console.error("Üzenet: címzettek lekérdezési hiba:", teamResult.error ?? attendeesResult.error)
    return NextResponse.json({ error: "A címzetteket nem sikerült összegyűjteni." }, { status: 500 })
  }

  const recipientIds = selectRecipientIds({
    teamUserIds: (teamResult.data ?? []).map((row) => row.user_id as string | null).filter((id): id is string => Boolean(id)),
    attendees: (attendeesResult.data ?? []) as { user_id: string; status: string }[],
    captainId: user.id,
    groups,
  })
  if (recipientIds.length === 0) {
    return NextResponse.json({ error: "A kiválasztott csoportokban nincs címzett." }, { status: 400 })
  }
  if (recipientIds.length > MAX_MESSAGE_RECIPIENTS) {
    return NextResponse.json({ error: `Egyszerre legfeljebb ${MAX_MESSAGE_RECIPIENTS} főnek küldhetsz üzenetet.` }, { status: 400 })
  }

  // Az e-mail címek az auth.users táblából jönnek, ezért a service role kliens kérdezi le őket.
  const [profilesResult, ...authUsers] = await Promise.all([
    adminClient.from("users").select("id, full_name").in("id", recipientIds),
    ...recipientIds.map((id) => adminClient.auth.admin.getUserById(id)),
  ])
  const nameById = new Map((profilesResult.data ?? []).map((row) => [String(row.id), String(row.full_name ?? "").trim()]))
  const recipients = authUsers
    .map((result, index) => ({ email: result.data.user?.email ?? null, name: nameById.get(recipientIds[index]) || "Csapattag" }))
    .filter((recipient): recipient is { email: string; name: string } => Boolean(recipient.email))

  if (!user.email || recipients.length === 0) {
    return NextResponse.json({ error: "Nem található e-mail cím a címzetteknél." }, { status: 400 })
  }

  try {
    const sent = await sendEventMessage({
      recipients,
      captainName: String(captainResult.data?.full_name ?? "").trim() || "A kapitány",
      captainEmail: user.email,
      eventTitle: String(event.title ?? "Esemény"),
      eventDate: event.start_date ? longDate.format(new Date(`${event.start_date}T12:00:00Z`)) : "",
      boatName: boat.name?.trim() || "Hajó",
      message,
    })
    return NextResponse.json({ ok: true, sent })
  } catch (error) {
    console.error("Esemény-üzenet küldése nem sikerült:", error)
    return NextResponse.json({ error: "Az üzenetet nem sikerült elküldeni. Próbáld újra később." }, { status: 502 })
  }
}
