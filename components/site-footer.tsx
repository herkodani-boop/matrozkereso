import Link from "next/link"
import Image from "next/image"

const links = [
  { label: "Súgó", href: "/sugo" },
  { label: "ÁSZF", href: "/aszf" },
  { label: "Adatkezelés", href: "/adatkezelesi-tajekoztato" },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="relative h-8 w-8 overflow-hidden rounded-lg">
            <Image src="/logo-mark.png" alt="Matrózkereső logó" fill className="object-cover" sizes="32px" />
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

        <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground sm:items-end">
          <p>{"\u00A9"} {new Date().getFullYear()} Matrózkereső</p>
          <Link href="mailto:matrozkereso@gmail.com" className="transition-colors hover:text-foreground">
            matrozkereso@gmail.com
          </Link>
        </div>
      </div>
    </footer>
  )
}
