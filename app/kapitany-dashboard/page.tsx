import { RequireAuth } from "@/components/require-auth"
import { SkipperDashboard } from "@/components/skipper-dashboard"

export default function KapitanyDashboardPage() {
  return (
    <RequireAuth>
      <SkipperDashboard />
    </RequireAuth>
  )
}
