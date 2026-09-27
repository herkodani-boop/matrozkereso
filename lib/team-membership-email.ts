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

function getSafeImageUrl(value: string | null | undefined) {
  if (!value) return null

  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

function getAppBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!configuredUrl || /localhost|127\.0\.0\.1/i.test(configuredUrl)) {
    return "https://www.matrozkereso.com"
  }

  try {
    const url = new URL(configuredUrl)
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString().replace(/\/$/, "")
    }
    return "https://www.matrozkereso.com"
  } catch {
    return "https://www.matrozkereso.com"
  }
}

export async function sendTeamMembershipEmail({
  email,
  memberName,
  boatName,
  captainName,
  captainEmail,
  captainPhone,
  captainAvatarUrl,
}: {
  email: string
  memberName: string
  boatName: string
  captainName: string
  captainEmail: string | null
  captainPhone: string | null
  captainAvatarUrl: string | null
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
  const safeCaptainName = escapeHtml(captainName)
  const safeCaptainEmail = captainEmail ? escapeHtml(captainEmail) : null
  const safeCaptainPhone = captainPhone ? escapeHtml(captainPhone) : null
  const captainAvatar = getSafeImageUrl(captainAvatarUrl)
  const logoImageUrl = "https://www.matrozkereso.com/matrozkereso-logo-csomag/png/matrozkereso-logo-512.png"
  const appBaseUrl = getAppBaseUrl()
  const captainAvatarMarkup = captainAvatar
    ? `<img src="${escapeHtml(captainAvatar)}" alt="${safeCaptainName} profilképe" width="52" height="52" style="display: block; width: 52px; height: 52px; border-radius: 50%; object-fit: cover;" />`
    : `<div style="width: 52px; height: 52px; border-radius: 50%; background: #dbeafe; color: #1d4ed8; text-align: center; line-height: 52px; font-size: 20px; font-weight: 700;">${escapeHtml(captainName.charAt(0).toUpperCase() || "K")}</div>`
  const contactLines = [
    safeCaptainEmail ? `<div style="margin-top: 5px;"><a href="mailto:${safeCaptainEmail}" style="color: #0369a1; text-decoration: none;">${safeCaptainEmail}</a></div>` : "",
    safeCaptainPhone ? `<div style="margin-top: 5px;"><a href="tel:${encodeURIComponent(captainPhone!)}" style="color: #0369a1; text-decoration: none;">${safeCaptainPhone}</a></div>` : "",
  ].filter(Boolean).join("")
  const textContact = [captainEmail, captainPhone].filter(Boolean).join(" | ")

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [email],
      replyTo: senderEmail,
      subject: `Csatlakoztál a(z) ${boatName} csapatához`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px;">
            <img src="${logoImageUrl}" alt="Matrózkereső" width="48" height="48" style="display: block; width: 48px; height: 48px; margin: 0 0 18px; border-radius: 10px;" />
            <h1 style="margin: 0 0 18px; font-size: 24px; line-height: 1.3;">Sikeresen csatlakoztál a csapathoz</h1>
            <p style="margin: 0;">Kedves ${safeMemberName}!</p>
            <p style="margin: 12px 0 0;">Mostantól a(z) <strong>${safeBoatName}</strong> csapatának tagja vagy.</p>
            <div style="margin-top: 22px; padding: 16px; border: 1px solid #dbeafe; border-radius: 10px; background: #f8fbff;">
              <p style="margin: 0 0 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; color: #475569; text-transform: uppercase;">A kapitány elérhetőségei</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                <tbody><tr>
                  <td style="vertical-align: top; padding-right: 12px;">${captainAvatarMarkup}</td>
                  <td style="vertical-align: middle;">
                    <strong style="font-size: 16px;">${safeCaptainName}</strong>
                    ${contactLines}
                  </td>
                </tr></tbody>
              </table>
            </div>
            <p style="margin: 22px 0 0;"><a href="${escapeHtml(appBaseUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #087f5b; color: #ffffff; font-weight: 700; text-decoration: none;">Matrózkereső megnyitása</a></p>
            <p style="margin: 22px 0 0;">Üdvözlettel,<br /><strong>a Matrózkereső csapata</strong></p>
          </div>
        </div>
      `,
      text: `Sikeresen csatlakoztál a csapathoz\n\nKedves ${memberName}!\n\nMostantól a(z) ${boatName} csapatának tagja vagy.\n\nA kapitány: ${captainName}${textContact ? `\nElérhetőségek: ${textContact}` : ""}\n\nMatrózkereső megnyitása: ${appBaseUrl}\n\nÜdvözlettel,\na Matrózkereső csapata`,
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
