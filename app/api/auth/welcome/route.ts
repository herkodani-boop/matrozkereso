import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendWelcomeEmail } from "@/lib/welcome-email"

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Hiányzó Supabase konfiguráció." }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: "Az üdvözlő email küldéséhez be kell jelentkezned." }, { status: 401 })
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token)

  if (userError || !user || !user.email) {
    return NextResponse.json({ error: "Érvénytelen vagy lejárt session." }, { status: 401 })
  }

  const fullName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    user.email.split("@")[0]

  const emailSent = await sendWelcomeEmail({ email: user.email, fullName })

  return NextResponse.json({ ok: true, emailSent })
}
