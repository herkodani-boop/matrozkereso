import { Suspense } from "react"
import { AuthGateModalTrigger } from "@/components/auth-gate-modal-trigger"
import { CaptainBoatsProvider } from "@/components/captain-boats-provider"
import { HomeContent } from "@/components/home-content"
import { SiteFooter } from "@/components/site-footer"

export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <AuthGateModalTrigger />
      </Suspense>
      <div className="flex min-h-screen flex-col bg-background">
        <CaptainBoatsProvider>
          <HomeContent />
        </CaptainBoatsProvider>
        <SiteFooter />
      </div>
    </>
  )
}
