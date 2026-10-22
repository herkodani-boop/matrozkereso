import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables")
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })

        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const authorization = request.headers.get("authorization")
    const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null
    const bearerClient = accessToken
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null

    let authenticatedUser = user
    if (!authenticatedUser && bearerClient && accessToken) {
      const { data: bearerData, error: bearerError } = await bearerClient.auth.getUser(accessToken)
      if (!bearerError) authenticatedUser = bearerData.user
    }

    if (authenticatedUser) {
      const activeClient = bearerClient ?? supabase
      const { data: isActive, error } = await activeClient.rpc("is_active_user")
      if (error) {
        console.error("Aktív felhasználó ellenőrzési hiba:", error)
        return NextResponse.json({ error: "A fiók állapotát nem sikerült ellenőrizni." }, { status: 503 })
      }
      if (!isActive) {
        return NextResponse.json({ error: "A fiók le van tiltva." }, { status: 403 })
      }
    }
  }

  return response
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
}
