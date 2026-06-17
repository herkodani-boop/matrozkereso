import { Suspense } from "react"
import { SiteFooter } from "@/components/site-footer"
import { BrowseBoats } from "@/components/browse-boats"

export default function BongeszesPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <main className="flex-1">
        <Suspense>
          <BrowseBoats />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  )
}
