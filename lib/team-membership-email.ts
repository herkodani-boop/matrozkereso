import { Resend } from "resend"

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }
    return entities[character]
  })
}

export async function sendTeamMembershipEmail({
  email,
  memberName,
  boatName,
}: {
  email: string
  memberName: string
  boatName: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const senderEmail = process.env.RESEND_FROM_EMAIL?.trim()
  const senderName = process.env.RESEND_FROM_NAME?.trim() || "Matrózkereső"

  if (
    !apiKey ||
    !senderEmail ||
    /yourdomain\.com|localhost|127\.0\.0\.1|resend\.dev/i.test(senderEmail)
  ) {
    console.error("Csapattagsági értesítő email konfigurációja hiányzik vagy érvénytelen.")
    return false
  }

  const safeMemberName = escapeHtml(memberName)
  const safeBoatName = escapeHtml(boatName)

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [email],
      replyTo: senderEmail,
      subject: `Csatlakoztál a(z) ${boatName} csapatához`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px;">
            <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">Matrózkereső</p>
            <h1 style="margin: 0 0 18px; font-size: 24px; line-height: 1.3;">Sikeresen csatlakoztál a csapathoz</h1>
            <p style="margin: 0;">Kedves ${safeMemberName}!</p>
            <p style="margin: 12px 0 0;">Mostantól a(z) <strong>${safeBoatName}</strong> csapatának tagja vagy.</p>
          </div>
        </div>
      `,
      text: `Sikeresen csatlakoztál a csapathoz\n\nKedves ${memberName}!\n\nMostantól a(z) ${boatName} csapatának tagja vagy.`,
    })

    if (error) {
      console.error("Csapattagsági értesítő email küldése nem sikerült:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("Csapattagsági értesítő email küldése nem sikerült:", error)
    return false
  }
}
