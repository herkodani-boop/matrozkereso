// Shared HTML-safety helpers for transactional email templates.

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }
    return entities[character]
  })
}

export function getSafeImageUrl(value: string | null | undefined) {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

export function getAppBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!configuredUrl || /localhost|127\.0\.0\.1/i.test(configuredUrl)) {
    return "https://www.matrozkereso.com"
  }

  try {
    const url = new URL(configuredUrl)
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString().replace(/\/$/, "")
    }
    return "https://www.matrozkereso.com"
  } catch {
    return "https://www.matrozkereso.com"
  }
}
