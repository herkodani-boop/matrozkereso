import { describe, expect, it } from "vitest"
import { escapeHtml, getSafeImageUrl } from "@/lib/email-html"

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'quote'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quote&#39;",
    )
  })

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Kis János")).toBe("Kis János")
  })
})

describe("getSafeImageUrl", () => {
  it("accepts http and https URLs", () => {
    expect(getSafeImageUrl("https://example.com/a.png")).toBe("https://example.com/a.png")
    expect(getSafeImageUrl("http://example.com/a.png")).toBe("http://example.com/a.png")
  })

  it("rejects non-http(s) protocols and invalid input", () => {
    expect(getSafeImageUrl("javascript:alert(1)")).toBeNull()
    expect(getSafeImageUrl("not a url")).toBeNull()
    expect(getSafeImageUrl(null)).toBeNull()
    expect(getSafeImageUrl(undefined)).toBeNull()
  })
})
