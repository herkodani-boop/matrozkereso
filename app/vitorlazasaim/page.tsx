import { RequireAuth } from "@/components/require-auth"
import { SailingPage } from "@/components/crew/sailing-page"
import { SiteFooter } from "@/components/site-footer"

export default function VitorlazasaimPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <RequireAuth>
        <SailingPage />
      </RequireAuth>
      <SiteFooter />
    </div>
  )
}
