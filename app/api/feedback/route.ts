import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type FeedbackBody = {
  message?: unknown
  pagePath?: unknown
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json(
      {
        error:
          "Hianyzo kornyezeti valtozo. Add meg a NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY es SUPABASE_SERVICE_ROLE_KEY ertekeket.",
      },
      { status: 500 },
    )
  }

  let body: FeedbackBody
  try {
    body = (await request.json()) as FeedbackBody
  } catch {
    return NextResponse.json({ error: "Ervenytelen kerestorzs." }, { status: 400 })
  }

  const message = normalizeOptionalText(body.message, 1000)
  if (!message || message.length < 3) {
    return NextResponse.json({ error: "A visszajelzes legalabb 3 karakter legyen." }, { status: 400 })
  }

  const pagePath = normalizeOptionalText(body.pagePath, 300)
  const userAgent = normalizeOptionalText(request.headers.get("user-agent"), 500)

  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  let userId: string | null = null
  let userEmail: string | null = null

  if (token) {
    const userClient = createClient(supabaseUrl, supabaseAnonKey)
    const {
      data: { user },
      error,
    } = await userClient.auth.getUser(token)

    if (error || !user) {
      return NextResponse.json({ error: "Ervenytelen vagy lejart token." }, { status: 401 })
    }

    userId = user.id
    userEmail = user.email ?? null
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { error: insertError } = await adminClient.from("test_feedback").insert({
    message,
    page_path: pagePath,
    user_id: userId,
    user_email: userEmail,
    user_agent: userAgent,
  })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
