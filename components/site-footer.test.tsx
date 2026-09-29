import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { SiteFooter } from "@/components/site-footer"

describe("SiteFooter", () => {
  it("renders without crashing and shows the legal/help links", () => {
    render(<SiteFooter />)

    expect(screen.getByRole("link", { name: "Súgó" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "ÁSZF" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Adatkezelés" })).toBeInTheDocument()
  })
})
