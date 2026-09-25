"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function RedirectAcceptTeamInvite() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get("token")

    if (!token) {
      router.replace("/")
      return
    }

    const target = `/?token=${encodeURIComponent(token)}`
    router.replace(target)
  }, [router, searchParams])

  return null
}

export default function AcceptTeamInvitePage() {
  return (
    <Suspense fallback={null}>
      <RedirectAcceptTeamInvite />
    </Suspense>
  )
}
