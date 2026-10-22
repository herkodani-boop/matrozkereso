import { redirect } from "next/navigation"
import { AdminDashboard } from "./admin-dashboard"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/")
  }

  if (userError) {
    throw new Error(`Nem sikerült ellenőrizni a bejelentkezést: ${userError.message}`)
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin")

  if (adminError) {
    throw new Error(`Nem sikerült ellenőrizni az admin jogosultságot: ${adminError.message}`)
  }

  if (!isAdmin) {
    redirect("/")
  }

  return <AdminDashboard />
}
