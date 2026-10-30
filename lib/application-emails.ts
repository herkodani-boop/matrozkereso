import { Resend } from "resend"
import type { SupabaseClient } from "@supabase/supabase-js"
import { escapeHtml, getAppBaseUrl } from "@/lib/email-html"

export type ApplicationEmailContext = {
  applicant: { email: string | null; name: string }
  captain: { email: string | null; name: string }
  listingTitle: string
  boatName: string | null
  applicationMessage: string | null
}

// Service role klienssel hívandó: az e-mail címek az auth.users táblából jönnek.
export async function loadApplicationEmailContext(
  adminClient: SupabaseClient,
  applicationId: string,
): Promise<ApplicationEmailContext | null> {
  const { data: application, error: applicationError } = await adminClient
    .from("applications")
    .select("user_id, message, ad:ads(title, user_id, boat:boats(name))")
    .eq("id", applicationId)
    .maybeSingle()

  if (applicationError || !application) {
    console.error("Értesítő adatainak lekérdezése nem sikerült:", applicationError)
    return null
  }

  const ad = (Array.isArray(application.ad) ? application.ad[0] : application.ad) as
    | { title: string | null; user_id: string; boat: { name: string | null } | { name: string | null }[] | null }
    | null
  if (!ad) return null
  const boat = Array.isArray(ad.boat) ? ad.boat[0] : ad.boat

  const applicantId = String(application.user_id)
  const captainId = String(ad.user_id)
  const [applicantAuth, captainAuth, profiles] = await Promise.all([
    adminClient.auth.admin.getUserById(applicantId),
    adminClient.auth.admin.getUserById(captainId),
    adminClient.from("users").select("id, full_name").in("id", [applicantId, captainId]),
  ])
  const nameById = new Map((profiles.data ?? []).map((row) => [String(row.id), String(row.full_name ?? "").trim()]))

  return {
    applicant: {
      email: applicantAuth.data.user?.email ?? null,
      name: nameById.get(applicantId) || "Vitorlázó",
    },
    captain: {
      email: captainAuth.data.user?.email ?? null,
      name: nameById.get(captainId) || "Kapitány",
    },
    listingTitle: ad.title?.trim() || "hirdetés",
    boatName: boat?.name?.trim() || null,
    applicationMessage: typeof application.message === "string" ? application.message : null,
  }
}

const logoImageUrl = "https://www.matrozkereso.com/matrozkereso-logo-csomag/png/matrozkereso-logo-512.png"

type EmailContent = {
  to: string
  subject: string
  heading: string
  // Már escape-elt HTML bekezdések.
  htmlParagraphs: string[]
  textParagraphs: string[]
  ctaLabel: string
  ctaPath: string
  logLabel: string
}

async function sendApplicationEmail(content: EmailContent): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const senderEmail = process.env.RESEND_FROM_EMAIL?.trim()
  const senderName = process.env.RESEND_FROM_NAME?.trim() || "Matrózkereső"

  if (
    !apiKey ||
    !senderEmail ||
    /yourdomain\.com|localhost|127\.0\.0\.1|resend\.dev/i.test(senderEmail)
  ) {
    console.error(`${content.logLabel} email konfigurációja hiányzik vagy érvénytelen.`)
    return false
  }

  const ctaUrl = `${getAppBaseUrl()}${content.ctaPath}`
  const paragraphsHtml = content.htmlParagraphs
    .map((paragraph) => `<p style="margin: 12px 0 0;">${paragraph}</p>`)
    .join("")

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [content.to],
      replyTo: senderEmail,
      subject: content.subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px;">
            <img src="${logoImageUrl}" alt="Matrózkereső" width="48" height="48" style="display: block; width: 48px; height: 48px; margin: 0 0 18px; border-radius: 10px;" />
            <h1 style="margin: 0 0 18px; font-size: 24px; line-height: 1.3;">${escapeHtml(content.heading)}</h1>
            ${paragraphsHtml}
            <p style="margin: 22px 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #087f5b; color: #ffffff; font-weight: 700; text-decoration: none;">${escapeHtml(content.ctaLabel)}</a></p>
            <p style="margin: 22px 0 0;">Üdvözlettel,<br /><strong>a Matrózkereső csapata</strong></p>
          </div>
        </div>
      `,
      text: `${content.heading}\n\n${content.textParagraphs.join("\n\n")}\n\n${content.ctaLabel}: ${ctaUrl}\n\nÜdvözlettel,\na Matrózkereső csapata`,
    })

    if (error) {
      console.error(`${content.logLabel} email küldése nem sikerült:`, error)
      return false
    }

    return true
  } catch (error) {
    console.error(`${content.logLabel} email küldése nem sikerült:`, error)
    return false
  }
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value
}

export function sendNewApplicationEmail({
  email,
  captainName,
  applicantName,
  listingTitle,
  applicationMessage,
}: {
  email: string
  captainName: string
  applicantName: string
  listingTitle: string
  applicationMessage: string | null
}) {
  const message = applicationMessage?.trim() ? truncate(applicationMessage.trim(), 500) : null

  return sendApplicationEmail({
    to: email,
    subject: `Új jelentkező: ${applicantName} – ${listingTitle}`,
    heading: "Új jelentkező érkezett",
    htmlParagraphs: [
      `Kedves ${escapeHtml(captainName)}!`,
      `<strong>${escapeHtml(applicantName)}</strong> jelentkezett a(z) <strong>${escapeHtml(listingTitle)}</strong> hirdetésedre.`,
      ...(message
        ? [`<span style="display: block; padding: 12px 16px; border-left: 3px solid #cbd5e1; background: #f8fafc; color: #334155; white-space: pre-line;">${escapeHtml(message)}</span>`]
        : []),
      "A jelentkezést a kapitányi felületen fogadhatod el vagy utasíthatod el.",
    ],
    textParagraphs: [
      `Kedves ${captainName}!`,
      `${applicantName} jelentkezett a(z) ${listingTitle} hirdetésedre.`,
      ...(message ? [`Üzenet:\n${message}`] : []),
      "A jelentkezést a kapitányi felületen fogadhatod el vagy utasíthatod el.",
    ],
    ctaLabel: "Jelentkező megtekintése",
    ctaPath: "/kapitany-dashboard",
    logLabel: "Új jelentkezés értesítő",
  })
}

export function sendApplicationUpdateEmail({
  kind,
  email,
  applicantName,
  listingTitle,
  boatName,
  captainContact,
}: {
  // "accepted": a kapitány elfogadta; "contact-shared": utólag osztotta meg az elérhetőségeit.
  kind: "accepted" | "contact-shared"
  email: string
  applicantName: string
  listingTitle: string
  boatName: string | null
  captainContact: { name: string; email: string | null; phone: string | null } | null
}) {
  const boatPart = boatName ? ` (${boatName})` : ""
  const contactHtml = captainContact
    ? [
        `A kapitány elérhetőségei: <strong>${escapeHtml(captainContact.name)}</strong>`
          + (captainContact.email ? `, <a href="mailto:${escapeHtml(captainContact.email)}" style="color: #0369a1; text-decoration: none;">${escapeHtml(captainContact.email)}</a>` : "")
          + (captainContact.phone ? `, <a href="tel:${encodeURIComponent(captainContact.phone)}" style="color: #0369a1; text-decoration: none;">${escapeHtml(captainContact.phone)}</a>` : ""),
      ]
    : []
  const contactText = captainContact
    ? [`A kapitány elérhetőségei: ${[captainContact.name, captainContact.email, captainContact.phone].filter(Boolean).join(", ")}`]
    : []
  const accepted = kind === "accepted"

  return sendApplicationEmail({
    to: email,
    subject: accepted
      ? `Elfogadták a jelentkezésed: ${listingTitle}`
      : `A kapitány megosztotta az elérhetőségeit: ${listingTitle}`,
    heading: accepted ? "Elfogadták a jelentkezésed" : "Megkaptad a kapitány elérhetőségeit",
    htmlParagraphs: [
      `Kedves ${escapeHtml(applicantName)}!`,
      accepted
        ? `A kapitány elfogadta a jelentkezésedet a(z) <strong>${escapeHtml(listingTitle)}</strong>${escapeHtml(boatPart)} hirdetésre.`
        : `A(z) <strong>${escapeHtml(listingTitle)}</strong>${escapeHtml(boatPart)} hirdetés kapitánya megosztotta veled az elérhetőségeit.`,
      ...contactHtml,
      captainContact
        ? "Vedd fel vele a kapcsolatot, és egyeztessétek a részleteket."
        : "A kapitány hamarosan felveszi veled a kapcsolatot.",
    ],
    textParagraphs: [
      `Kedves ${applicantName}!`,
      accepted
        ? `A kapitány elfogadta a jelentkezésedet a(z) ${listingTitle}${boatPart} hirdetésre.`
        : `A(z) ${listingTitle}${boatPart} hirdetés kapitánya megosztotta veled az elérhetőségeit.`,
      ...contactText,
      captainContact
        ? "Vedd fel vele a kapcsolatot, és egyeztessétek a részleteket."
        : "A kapitány hamarosan felveszi veled a kapcsolatot.",
    ],
    ctaLabel: "Jelentkezéseim megnyitása",
    ctaPath: "/",
    logLabel: accepted ? "Elfogadási értesítő" : "Kapcsolatmegosztási értesítő",
  })
}
