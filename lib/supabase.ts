import { createClient } from "@supabase/supabase-js"

function getValidatedSupabaseUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()

  if (!rawUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
  }

  const normalizedUrl = rawUrl.replace(/\/+$/, "")

  let parsedUrl: URL
  try {
    parsedUrl = new URL(normalizedUrl)
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL format. Expected format: https://<project-ref>.supabase.co"
    )
  }

  const hasInvalidHostname = parsedUrl.hostname.includes("..") || !parsedUrl.hostname.endsWith(".supabase.co")
  if (parsedUrl.protocol !== "https:" || hasInvalidHostname) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL host. Expected format: https://<project-ref>.supabase.co"
    )
  }

  return normalizedUrl
}

const supabaseUrl = getValidatedSupabaseUrl()
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
