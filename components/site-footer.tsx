import Link from "next/link"
import { Sailboat } from "lucide-react"

const links = [
  { label: "Súgó", href: "#sugo" },
  { label: "ÁSZF", href: "#aszf" },
  { label: "Kapcsolat", href: "#kapcsolat" },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sailboat className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">Matrózkereső</span>
        </Link>

        <nav className="flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="text-sm text-muted-foreground">
          {"\u00A9"} {new Date().getFullYear()} Matrózkereső
        </p>
      </div>
    </footer>
  )
}
