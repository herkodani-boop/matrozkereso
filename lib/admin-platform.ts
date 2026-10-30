import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export const adminCategories = ["users", "boats", "listings", "events"] as const
export type AdminCategory = (typeof adminCategories)[number]

export const adminCategoryConfig: Record<
  AdminCategory,
  { table: string; searchColumns: string[]; sortableColumns: string[]; editableColumns: string[] }
> = {
  users: {
    table: "users",
    searchColumns: ["full_name", "email", "phone"],
    sortableColumns: [
      "full_name",
      "email",
      "created_at",
      "admin_deleted_listings",
      "received_reports",
      "invalid_reports_sent",
    ],
    editableColumns: ["full_name", "phone", "birthdate", "role", "level", "avatar_url"],
  },
  boats: {
    table: "boats",
    searchColumns: ["name", "type", "harbor"],
    sortableColumns: ["name", "type", "harbor", "created_at"],
    editableColumns: ["name", "type", "harbor", "max_crew_size", "team_type", "image_url"],
  },
  listings: {
    table: "ads",
    searchColumns: ["title", "location", "date_text"],
    sortableColumns: ["title", "start_date", "created_at", "report_count", "creator_name"],
    editableColumns: [
      "title",
      "location",
      "date_text",
      "positions",
      "commitment",
      "experience_level",
      "start_date",
      "end_date",
      "captain_note",
      "max_applicants",
      "is_active",
    ],
  },
  events: {
    table: "boat_events",
    searchColumns: ["title", "location", "type"],
    sortableColumns: ["title", "location", "start_date", "created_at"],
    editableColumns: ["title", "type", "start_date", "end_date", "is_one_day", "location", "notes"],
  },
}

export type AdminAccess = {
  userId: string
  supabase: SupabaseClient
  adminClient: SupabaseClient
}

export async function requireAdminAccess(): Promise<
  | { access: AdminAccess; error?: never; status?: never }
  | { access?: never; error: string; status: number }
> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: "Bejelentkezés szükséges.", status: 401 }
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin")
  if (adminError) {
    console.error("Admin jogosultság ellenőrzési hiba:", adminError)
    return { error: "Nem sikerült ellenőrizni az admin jogosultságot.", status: 500 }
  }

  if (!isAdmin) {
    return { error: "Nincs jogosultságod ehhez a művelethez.", status: 403 }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Hiányzik a szerveroldali Supabase service role konfiguráció.")
    return { error: "Az admin műveletek szerveroldali konfigurációja hiányzik.", status: 500 }
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return { access: { userId: user.id, supabase, adminClient } }
}

export function isAdminCategory(value: string | null): value is AdminCategory {
  return value !== null && (adminCategories as readonly string[]).includes(value)
}

export function cleanAdminSearch(value: string | null): string {
  return (value ?? "").replace(/[^\p{L}\p{N}@._\- ]/gu, "").trim().slice(0, 80)
}

export function pickEditableFields(category: AdminCategory, value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const input = value as Record<string, unknown>
  const allowed = new Set(adminCategoryConfig[category].editableColumns)
  const output: Record<string, unknown> = {}
  const arrayFields = new Set(["positions"])
  const booleanFields = new Set(["is_one_day", "is_active"])
  const numberFields = new Set(["max_crew_size", "max_applicants"])

  for (const [key, fieldValue] of Object.entries(input)) {
    if (!allowed.has(key)) return null
    if (arrayFields.has(key)) {
      if (!Array.isArray(fieldValue) || !fieldValue.every((item) => typeof item === "string") || fieldValue.length > 20) return null
    } else if (booleanFields.has(key)) {
      if (typeof fieldValue !== "boolean") return null
    } else if (numberFields.has(key)) {
      if (typeof fieldValue !== "number" || !Number.isInteger(fieldValue) || fieldValue < 1 || fieldValue > 1000) return null
    } else if (fieldValue !== null && typeof fieldValue !== "string") {
      return null
    }
    if (typeof fieldValue === "string" && fieldValue.length > 5000) return null
    output[key] = fieldValue
  }

  return Object.keys(output).length > 0 ? output : null
}
