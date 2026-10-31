import { Resend } from "resend"
import { escapeHtml, getAppBaseUrl } from "@/lib/email-html"

export type MessageGroup = "confirmed" | "unanswered" | "declined"

export const MAX_MESSAGE_LENGTH = 2000
// Egy levél legfeljebb ennyi címzettnek mehet ki (a Resend korlátja); ennél nagyobb csapat itt nem várható.
export const MAX_MESSAGE_RECIPIENTS = 50

// A címzettek ugyanabból a körből jönnek, mint a kezdőlap részvételi számai: a csapattagok
// (aktív és meghívott) és az esemény többi résztvevője. A kapitány maga sosem címzett.
export function selectRecipientIds({
  teamUserIds,
  attendees,
  captainId,
  groups,
}: {
  teamUserIds: string[]
  attendees: { user_id: string; status: string }[]
  captainId: string
  groups: MessageGroup[]
}) {
  const statusById = new Map(attendees.map((row) => [String(row.user_id), row.status]))
  const roster = new Set([...teamUserIds, ...attendees.map((row) => String(row.user_id))])
  roster.delete(captainId)

  const groupOf = (userId: string): MessageGroup => {
    const status = statusById.get(userId)
    if (status === "confirmed") return "confirmed"
    if (status === "declined") return "declined"
    return "unanswered"
  }

  return Array.from(roster).filter((userId) => groups.includes(groupOf(userId)))
}

const logoImageUrl = "https://www.matrozkereso.com/matrozkereso-logo-csomag/png/matrozkereso-logo-512.png"

type EventMessage = {
  recipients: { email: string; name: string }[]
  captainName: string
  captainEmail: string
  eventTitle: string
  eventDate: string
  boatName: string
  message: string
}

// Egyetlen levél: a csapat a címzett, a kapitány másolatban. Így a „Válasz mindenkinek” valódi
// levelezési láncot indít a csapat és a kapitány között; a Reply-To miatt a válasz nem a mi címünkre megy.
export async function sendEventMessage(content: EventMessage) {
  const apiKey = process.env.RESEND_API_KEY
  const senderEmail = process.env.RESEND_FROM_EMAIL?.trim()
  const senderName = process.env.RESEND_FROM_NAME?.trim() || "Matrózkereső"

  if (!apiKey || !senderEmail || /yourdomain\.com|localhost|127\.0\.0\.1|resend\.dev/i.test(senderEmail)) {
    throw new Error("Az e-mail küldés nincs beállítva.")
  }

  const subject = `${content.boatName}: ${content.eventTitle} – üzenet a kapitánytól`
  const messageHtml = escapeHtml(content.message)
  const ctaUrl = `${getAppBaseUrl()}/`
  const replyHint = "A „Válasz mindenkinek” gombbal a kapitány és a csapat is megkapja a válaszodat."

  const { data, error } = await new Resend(apiKey).emails.send({
    from: `${content.captainName} (${senderName}) <${senderEmail}>`,
    to: content.recipients.map((recipient) => recipient.email),
    cc: [content.captainEmail],
    replyTo: content.captainEmail,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px;">
          <img src="${logoImageUrl}" alt="Matrózkereső" width="48" height="48" style="display: block; width: 48px; height: 48px; margin: 0 0 18px; border-radius: 10px;" />
          <p style="margin: 0; color: #475569; font-size: 14px;">${escapeHtml(content.boatName)} · ${escapeHtml(content.eventTitle)} · ${escapeHtml(content.eventDate)}</p>
          <h1 style="margin: 6px 0 18px; font-size: 22px; line-height: 1.3;">Üzenet ${escapeHtml(content.captainName)} kapitánytól</h1>
          <p style="margin: 0;">Sziasztok!</p>
          <div style="margin: 14px 0 0; padding: 14px 16px; border-left: 3px solid #0e3f57; background: #f8fafc; white-space: pre-line;">${messageHtml}</div>
          <p style="margin: 18px 0 0; color: #475569; font-size: 14px;">${replyHint}</p>
          <p style="margin: 18px 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display: inline-block; padding: 10px 16px; border-radius: 6px; background: #0e3f57; color: #ffffff; font-weight: 700; text-decoration: none;">Megnyitom a Matrózkeresőt</a></p>
        </div>
      </div>
    `,
    text: `${content.boatName} · ${content.eventTitle} · ${content.eventDate}\n\nSziasztok!\n\n${content.message}\n\n${replyHint}\n\n${ctaUrl}`,
  })
  if (error || !data) throw new Error(error?.message ?? "Ismeretlen küldési hiba.")
  return content.recipients.length
}
