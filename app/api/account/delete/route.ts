import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getAvatarStoragePath(avatarUrl?: string | null): string | null {
  if (!avatarUrl) return null

  try {
    const url = new URL(avatarUrl)
    const marker = "/object/public/avatars/"
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex === -1) return null
    const rawPath = url.pathname.slice(markerIndex + marker.length)
    if (!rawPath) return null
    return decodeURIComponent(rawPath)
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Hianyzo szerver oldali kornyezeti valtozo. Add meg a NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY es SUPABASE_SERVICE_ROLE_KEY ertekeket.",
      },
      { status: 500 },
    )
  }

  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: "Hianyzik az azonosito token." }, { status: 401 })
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey)
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: "Ervenytelen vagy lejart token." }, { status: 401 })
  }

  const { data: profileRow, error: profileLoadError } = await adminClient
    .from("users")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle()

  if (profileLoadError) {
    return NextResponse.json({ error: profileLoadError.message }, { status: 400 })
  }

  const { data: boats, error: boatsLoadError } = await adminClient
    .from("boats")
    .select("id")
    .eq("user_id", user.id)

  if (boatsLoadError) {
    return NextResponse.json({ error: boatsLoadError.message }, { status: 400 })
  }

  const boatIds = (boats ?? []).map((boat: any) => String(boat.id)).filter(Boolean)

  let adIds: string[] = []
  if (boatIds.length > 0) {
    const { data: adsByBoat, error: adsByBoatError } = await adminClient
      .from("ads")
      .select("id")
      .in("boat_id", boatIds)

    if (adsByBoatError) {
      return NextResponse.json({ error: adsByBoatError.message }, { status: 400 })
    }

    adIds = (adsByBoat ?? []).map((ad: any) => String(ad.id)).filter(Boolean)
  }

  const { data: adsByUser, error: adsByUserError } = await adminClient
    .from("ads")
    .select("id")
    .eq("user_id", user.id)

  if (adsByUserError) {
    return NextResponse.json({ error: adsByUserError.message }, { status: 400 })
  }

  const allAdIds = Array.from(
    new Set([...adIds, ...(adsByUser ?? []).map((ad: any) => String(ad.id)).filter(Boolean)]),
  )

  if (allAdIds.length > 0) {
    const { error: deleteAdApplicationsError } = await adminClient
      .from("applications")
      .delete()
      .in("ad_id", allAdIds)

    if (deleteAdApplicationsError) {
      return NextResponse.json({ error: deleteAdApplicationsError.message }, { status: 400 })
    }
  }

  const { error: deleteUserApplicationsError } = await adminClient
    .from("applications")
    .delete()
    .eq("user_id", user.id)

  if (deleteUserApplicationsError) {
    return NextResponse.json({ error: deleteUserApplicationsError.message }, { status: 400 })
  }

  if (allAdIds.length > 0) {
    const { error: deleteAdsError } = await adminClient
      .from("ads")
      .delete()
      .in("id", allAdIds)

    if (deleteAdsError) {
      return NextResponse.json({ error: deleteAdsError.message }, { status: 400 })
    }
  }

  if (boatIds.length > 0) {
    const { error: deleteBoatsError } = await adminClient
      .from("boats")
      .delete()
      .in("id", boatIds)

    if (deleteBoatsError) {
      return NextResponse.json({ error: deleteBoatsError.message }, { status: 400 })
    }
  }

  const avatarPath = getAvatarStoragePath(profileRow?.avatar_url)
  if (avatarPath) {
    const { error: removeAvatarError } = await adminClient.storage.from("avatars").remove([avatarPath])

    if (removeAvatarError) {
      return NextResponse.json({ error: removeAvatarError.message }, { status: 400 })
    }
  }

  const { error: deleteProfileError } = await adminClient.from("users").delete().eq("id", user.id)

  if (deleteProfileError) {
    return NextResponse.json({ error: deleteProfileError.message }, { status: 400 })
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
