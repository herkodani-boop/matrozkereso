import { NextRequest, NextResponse } from "next/server"
import {
  adminCategoryConfig,
  cleanAdminSearch,
  isAdminCategory,
  pickEditableFields,
  requireAdminAccess,
  type AdminCategory,
} from "@/lib/admin-platform"

export const dynamic = "force-dynamic"

const PAGE_SIZE_MAX = 50
const USER_BAN_DURATION = "876000h"

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: NextRequest) {
  const result = await requireAdminAccess()
  if (!result.access) return errorResponse(result.error, result.status)

  const params = request.nextUrl.searchParams
  const categoryParam = params.get("category")
  if (!isAdminCategory(categoryParam)) return errorResponse("Érvénytelen kategória.", 400)

  const category = categoryParam
  const config = adminCategoryConfig[category]
  const status = params.get("status") ?? "active"
  if (!["active", "deleted", "reported"].includes(status)) {
    return errorResponse("Érvénytelen szűrő.", 400)
  }

  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number.parseInt(params.get("pageSize") ?? "25", 10) || 25),
  )
  const search = cleanAdminSearch(params.get("search"))
  const requestedSort = params.get("sort") ?? "created_at"
  const sortColumn = config.sortableColumns.includes(requestedSort) ? requestedSort : "created_at"
  const ascending = params.get("direction") === "asc"
  const client = result.access.adminClient

  const countRows = async (isDeleted: boolean) => {
    const { count, error } = await client
      .from(config.table)
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", isDeleted)
    if (error) throw error
    return count ?? 0
  }

  try {
    const [activeCount, deletedCount] = await Promise.all([countRows(false), countRows(true)])
    if (status === "reported") {
      return NextResponse.json({
        rows: [],
        page,
        pageSize,
        matchCount: 0,
        counts: { total: activeCount + deletedCount, active: activeCount, reported: 0, deleted: deletedCount },
      })
    }

    let query = client
      .from(config.table)
      .select("*", { count: "exact" })
      .eq("is_deleted", status === "deleted")
      .order(sortColumn, { ascending, nullsFirst: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (search) {
      const pattern = `*${search}*`
      const searchFilter = config.searchColumns.map((column) => `${column}.ilike.${pattern}`).join(",")
      query = query.or(searchFilter)
    }

    const { data, count, error } = await query
    if (error) throw error

    let emailByUserId = new Map<string, string>()
    let bannedUntilByUserId = new Map<string, string | null>()
    if (category === "users" && data?.length) {
      const { data: authUsers, error: authUsersError } = await client.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })
      if (authUsersError) throw authUsersError
      emailByUserId = new Map(authUsers.users.map((user) => [user.id, user.email ?? ""]))
      bannedUntilByUserId = new Map(
        authUsers.users.map((user) => [user.id, user.banned_until ?? null]),
      )
    }

    const rows = (data ?? []).map((row) => {
      const item = { ...row } as Record<string, unknown>
      if (category === "users") {
        const id = String(item.id)
        item.email = emailByUserId.get(id) || item.email || ""
        item.banned_until = bannedUntilByUserId.get(id) ?? null
      }
      return item
    })

    return NextResponse.json({
      rows,
      page,
      pageSize,
      matchCount: count ?? 0,
      counts: {
        total: activeCount + deletedCount,
        active: activeCount,
        reported: 0,
        deleted: deletedCount,
      },
    })
  } catch (error) {
    console.error("Admin lista betöltési hiba:", error)
    return errorResponse("Nem sikerült betölteni a kategória adatait.", 500)
  }
}

type AdminMutation = {
  category?: unknown
  id?: unknown
  fields?: unknown
  action?: unknown
}

export async function PATCH(request: NextRequest) {
  return handleMutation(request, "update")
}

export async function POST(request: NextRequest) {
  return handleMutation(request, "action")
}

async function handleMutation(request: NextRequest, operation: "update" | "action") {
  const result = await requireAdminAccess()
  if (!result.access) return errorResponse(result.error, result.status)

  let body: AdminMutation
  try {
    body = (await request.json()) as AdminMutation
  } catch {
    return errorResponse("Érvénytelen kérés.", 400)
  }

  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return errorResponse("Érvénytelen azonosító.", 400)
  }
  if (typeof body.category !== "string" || !isAdminCategory(body.category)) {
    return errorResponse("Érvénytelen kategória.", 400)
  }
  const category: AdminCategory = body.category
  const client = result.access.adminClient

  if (operation === "action") {
    if (category === "users") {
      return handleUserAction(body.id, body.action, result.access.userId, client)
    }
    if (body.action !== "delete") return errorResponse("Érvénytelen művelet.", 400)

    if (category === "boats") {
      const { data, error } = await client.rpc("admin_soft_delete_boat", { p_boat_id: body.id })
      if (error) {
        console.error("Admin hajó soft delete hiba:", error)
        return errorResponse("Nem sikerült törölni a hajót és kapcsolódó adatait.", 500)
      }
      if (!data) return errorResponse("A hajó nem található, vagy már törölve lett.", 404)
      return NextResponse.json({ ok: true })
    }

    const { data, error } = await client
      .from(adminCategoryConfig[category].table)
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("is_deleted", false)
      .select("id")
      .maybeSingle()
    if (error) {
      console.error("Admin soft delete hiba:", error)
      return errorResponse("Nem sikerült törölni az elemet.", 500)
    }
    if (!data) return errorResponse("Az elem nem található, vagy már törölve lett.", 404)
    return NextResponse.json({ ok: true })
  }

  const fields = pickEditableFields(category, body.fields)
  if (!fields) return errorResponse("Nincs módosítható adat, vagy érvénytelen mező szerepel a kérésben.", 400)

  const { data, error } = await client
    .from(adminCategoryConfig[category].table)
    .update(fields)
    .eq("id", body.id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle()

  if (error) {
    console.error("Admin szerkesztési hiba:", error)
    return errorResponse("Nem sikerült menteni a módosításokat.", 500)
  }
  if (!data) return errorResponse("Az elem nem található, vagy már törölve lett.", 404)

  return NextResponse.json({ row: data })
}

async function handleUserAction(
  userId: string,
  action: unknown,
  currentAdminId: string,
  client: import("@supabase/supabase-js").SupabaseClient,
) {
  if (userId === currentAdminId) return errorResponse("A saját admin fiókodat nem módosíthatod innen.", 400)
  if (!["ban", "unban", "delete"].includes(String(action))) return errorResponse("Érvénytelen művelet.", 400)

  const { data: profile, error: profileError } = await client
    .from("users")
    .select("is_deleted")
    .eq("id", userId)
    .maybeSingle()
  if (profileError) {
    console.error("Admin felhasználó lekérdezési hiba:", profileError)
    return errorResponse("Nem sikerült betölteni a felhasználót.", 500)
  }
  if (!profile) return errorResponse("A felhasználó nem található.", 404)
  if (action === "unban" && profile.is_deleted) {
    return errorResponse("A törölt felhasználó tiltása nem oldható fel.", 400)
  }
  if (profile.is_deleted) {
    return errorResponse("A felhasználó már törölve lett.", 400)
  }

  const { data: authResult, error: authError } = await client.auth.admin.updateUserById(userId, {
    ban_duration: action === "unban" ? "none" : USER_BAN_DURATION,
  })
  if (authError || !authResult.user) {
    console.error("Admin Supabase Auth felhasználómódosítási hiba:", authError)
    return errorResponse("Nem sikerült módosítani a felhasználó belépési jogosultságát.", 500)
  }

  const isDeleted = action === "delete"
  const isBanned = action !== "unban"
  const now = new Date().toISOString()
  if (isDeleted) {
    const { data, error: deleteError } = await client.rpc("admin_soft_delete_user", { p_user_id: userId })
    if (deleteError || !data) {
      const { error: rollbackError } = await client.auth.admin.updateUserById(userId, { ban_duration: "none" })
      if (rollbackError) console.error("Admin felhasználótiltás visszaállítása sikertelen:", rollbackError)
      if (deleteError) console.error("Admin felhasználó soft delete hiba:", deleteError)
      return errorResponse("Nem sikerült törölni a felhasználót és kapcsolódó adatait.", deleteError ? 500 : 404)
    }
    return NextResponse.json({ ok: true })
  }

  const { error: updateError } = await client
    .from("users")
    .update({
      is_deleted: profile.is_deleted,
      is_banned: isBanned,
      banned_at: isBanned ? now : null,
    })
    .eq("id", userId)

  if (updateError) {
    const { error: rollbackError } = await client.auth.admin.updateUserById(userId, {
      ban_duration: action === "unban" ? USER_BAN_DURATION : "none",
    })
    if (rollbackError) console.error("Admin felhasználótiltás visszaállítása sikertelen:", rollbackError)
    console.error("Admin felhasználó státuszmentési hiba:", updateError)
    return errorResponse("Nem sikerült menteni a felhasználó státuszát.", 500)
  }

  return NextResponse.json({ ok: true })
}
