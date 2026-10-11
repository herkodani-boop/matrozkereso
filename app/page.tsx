import { Suspense } from "react"
import { AuthGateModalTrigger } from "@/components/auth-gate-modal-trigger"
import { HeroSection } from "@/components/hero-section"
import { CaptainBoatsProvider } from "@/components/captain-boats-provider"
import { HomeBoatBanner } from "@/components/home-boat-banner"
import { HomeEventsHub } from "@/components/home-events-hub"
import { CoreOptions } from "@/components/core-options"
import { HomeGuestInfo } from "@/components/home-guest-info"
import { LatestListings } from "@/components/latest-listings"
import { MyApplications } from "@/components/my-applications"
import { SiteFooter } from "@/components/site-footer"

export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <AuthGateModalTrigger />
      </Suspense>
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1">
          <CaptainBoatsProvider>
            <HeroSection />
            <HomeBoatBanner />
            <HomeEventsHub />
            <CoreOptions />
            <LatestListings />
            <MyApplications />
            <HomeGuestInfo />
          </CaptainBoatsProvider>
        </main>
        <SiteFooter />
      </div>
    </>
  )
}
