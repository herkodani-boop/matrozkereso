import { Resend } from "resend"
import { escapeHtml, getAppBaseUrl } from "@/lib/email-html"

export async function sendWelcomeEmail({
  email,
  fullName,
}: {
  email: string
  fullName: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const senderEmail = process.env.RESEND_FROM_EMAIL?.trim()
  const senderName = process.env.RESEND_FROM_NAME?.trim() || "Matrózkereső"

  if (
    !apiKey ||
    !senderEmail ||
    /yourdomain\.com|localhost|127\.0\.0\.1|resend\.dev/i.test(senderEmail)
  ) {
    console.error("Üdvözlő email konfigurációja hiányzik vagy érvénytelen.")
    return false
  }

  const safeFullName = escapeHtml(fullName)
  const logoImageUrl = "https://www.matrozkereso.com/matrozkereso-logo-csomag/png/matrozkereso-logo-512.png"
  const appBaseUrl = getAppBaseUrl()
  const ctaUrl = `${appBaseUrl}/bongeszes`
  const ctaLabel = "Szabad helyek böngészése"
  const introText =
    "Regisztráltál a Matrózkeresőn. Innentől kezdve böngészheted a szabad fedélzeti helyeket, jelentkezhetsz a neked megfelelő hajókra, vagy ha van hajód, feladhatod a saját hirdetésed is."

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [email],
      replyTo: senderEmail,
      subject: "Sikeres regisztráció a Matrózkeresőn",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px;">
            <img src="${logoImageUrl}" alt="Matrózkereső" width="48" height="48" style="display: block; width: 48px; height: 48px; margin: 0 0 18px; border-radius: 10px;" />
            <h1 style="margin: 0 0 18px; font-size: 24px; line-height: 1.3;">Sikeres regisztráció</h1>
            <p style="margin: 0;">Kedves ${safeFullName}!</p>
            <p style="margin: 12px 0 0;">${introText}</p>
            <p style="margin: 22px 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #087f5b; color: #ffffff; font-weight: 700; text-decoration: none;">${ctaLabel}</a></p>
            <p style="margin: 22px 0 0;">Üdvözlettel,<br /><strong>a Matrózkereső csapata</strong></p>
          </div>
        </div>
      `,
      text: `Sikeres regisztráció\n\nKedves ${fullName}!\n\n${introText}\n\n${ctaLabel}: ${ctaUrl}\n\nÜdvözlettel,\na Matrózkereső csapata`,
    })

    if (error) {
      console.error("Üdvözlő email küldése nem sikerült:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("Üdvözlő email küldése nem sikerült:", error)
    return false
  }
}
