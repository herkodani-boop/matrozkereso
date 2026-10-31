import { Suspense } from "react"
import { RequireAuth } from "@/components/require-auth"
import { TeamsPage } from "@/components/crew/teams-page"
import { SiteFooter } from "@/components/site-footer"

export default function CsapataimPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <RequireAuth>
        {/* A kiválasztott csapat a ?hajo= paraméterből jön, ehhez kell a Suspense. */}
        <Suspense fallback={null}>
          <TeamsPage />
        </Suspense>
      </RequireAuth>
      <SiteFooter />
    </div>
  )
}
