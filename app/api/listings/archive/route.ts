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
    return NextResponse.json({ error: "A hirdetés lezárásához be kell jelentkezned." }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 })
  }

  const listingId = typeof body.listingId === "string" ? body.listingId.trim() : ""
  if (!listingId) {
    return NextResponse.json({ error: "Hiányzó hirdetésazonosító." }, { status: 400 })
  }
  const isDeleted = body.isDeleted === true

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

  if (isDeleted) {
    const { data: deletedAdId, error } = await userClient.rpc("owner_soft_delete_ad", {
      p_ad_id: listingId,
    })

    if (error) {
      console.error("Hirdetés törlési adatbázis-művelet hiba:", error)
      if (error.code === "42883") {
        return NextResponse.json(
          { error: "Hiányzik az adatbázisból az owner-delete-listing-migration.sql migráció. Futtasd le a Supabase SQL Editorban." },
          { status: 500 },
        )
      }
      if (error.code === "42501") {
        return NextResponse.json(
          { error: "A hirdetést nem sikerült törölni: az adatbázis elutasította a műveletet. Ellenőrizd, hogy a friss owner-delete-listing-migration.sql migráció lefutott-e." },
          { status: 403 },
        )
      }
      return NextResponse.json({ error: "A hirdetés törlése nem sikerült." }, { status: 400 })
    }

    if (!deletedAdId) {
      return NextResponse.json(
        { error: "A hirdetés nem található, már törölve van, vagy nem a saját hirdetésed." },
        { status: 404 },
      )
    }

    return NextResponse.json({ ok: true, id: String(deletedAdId) })
  }

  const { data, error } = await userClient
    .from("ads")
    .update({ is_active: false })
    .eq("id", listingId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle()

  if (error) {
    console.error("Hirdetés lezárási hiba:", error)
    if (error.code === "42501") {
      return NextResponse.json(
        {
          error:
            "Az adatbázis még tiltja a saját hirdetés törlését. Futtasd le az owner-delete-listing-migration.sql migrációt a Supabase SQL Editorban.",
        },
        { status: 403 },
      )
    }
    return NextResponse.json({ error: "A hirdetés lezárása nem sikerült." }, { status: 400 })
  }

  if (!data) {
    return NextResponse.json(
      { error: "A hirdetés nem található, vagy nincs jogosultságod a lezárásához." },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true, id: String(data.id) })
}