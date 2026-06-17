import { HeroSection } from "@/components/hero-section"
import { CoreOptions } from "@/components/core-options"
import { LatestListings } from "@/components/latest-listings"
import { MyApplications } from "@/components/my-applications"
import { SiteFooter } from "@/components/site-footer"

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">
        <HeroSection />
        <CoreOptions />
        <LatestListings />
        <MyApplications />
      </main>
      <SiteFooter />
    </div>
  )
}
