import { Suspense } from "react"
import ResetPasswordClient from "@/components/reset-password-client"

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-secondary/40 px-4 py-10 sm:px-6 sm:py-16">
          <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <p className="text-sm text-muted-foreground">Link ellenőrzése...</p>
          </section>
        </main>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  )
}
