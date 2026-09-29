import type { Applicant, EventItem, Listing } from "./types"

export function getEventTypeBadgeClass(type: EventItem["type"]) {
  switch (type) {
    case "Verseny":
      return "border-0 bg-cyan-500 text-white shadow-sm"
    case "Edzés":
      return "border-0 bg-emerald-500 text-white shadow-sm"
    case "Egyéb":
      return "border-0 bg-amber-500 text-white shadow-sm"
    default:
      return "border-0 bg-slate-500 text-white shadow-sm"
  }
}

export function calculateAge(birthdate: string) {
  const birth = new Date(birthdate)
  if (Number.isNaN(birth.getTime())) return undefined
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  const dayDiff = today.getDate() - birth.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }
  return age
}

export function experienceLevelLabel(level?: string): Applicant["level"] {
  switch (level) {
    case "kezdo":
      return "Kezdő"
    case "halado":
      return "Haladó"
    case "profi":
      return "Profi / Versenyző"
    default:
      return "Kezdő"
  }
}

export function formatPositionLabel(positionRaw: unknown) {
  const normalized = String(positionRaw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  if (normalized === "kormanyos") return "Kormányos"
  if (normalized === "taktikus") return "Taktikus"
  if (normalized === "main-trim" || normalized === "main trim") return "Main Trim"
  if (normalized === "jib-trim" || normalized === "jib trim") return "Jib trim"
  if (normalized === "mast") return "Mast"
  if (normalized === "fordeck" || normalized === "foredeck") return "Fordeck"
  if (normalized === "barmilyen" || normalized === "mindegy" || normalized === "egyeb") return "Bármilyen"
  if (normalized === "mancsaft" || normalized === "matroz" || normalized === "trimmer") return "Mancsaft"
  if (!normalized) return "Legénység"
  return String(positionRaw)
}

export function normalizeMatchText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

export function isMatchingListingToEvent(listing: Listing | undefined, event: EventItem | undefined) {
  if (!listing || !event) {
    return false
  }

  if (listing.eventId) {
    return listing.eventId === event.id
  }

  const titleMatches = normalizeMatchText(listing.event) === normalizeMatchText(event.title)
  const locationMatches = normalizeMatchText(listing.location) === normalizeMatchText(event.location)
  const dateMatches =
    !listing.date || !event.date || normalizeMatchText(listing.date) === normalizeMatchText(event.date)

  return titleMatches && locationMatches && dateMatches
}

export function resolveAvatarUrl(userData: any): string {
  const directAvatar =
    userData?.avatar_url ??
    userData?.avatar ??
    userData?.profile_image ??
    userData?.profile_image_url ??
    userData?.image_url

  if (typeof directAvatar === "string" && directAvatar.trim()) {
    return directAvatar
  }

  return "/placeholder.svg"
}

export const crewTypeOptions = [
  { value: "verprofi", label: "Profi versenyzés" },
  { value: "amator", label: "Amatőr versenyzés / Tanulás" },
  { value: "tura", label: "Túra / Hobbi vitorlázás" },
]

export function resolveCrewTypeLabel(value?: string | null) {
  if (!value) return "Nincs megadva"
  return crewTypeOptions.find((option) => option.value === value)?.label ?? value
}

export function formatEventDate(dateValue: string | null | undefined) {
  if (!dateValue) return "—"

  const parsed = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateValue

  return `${parsed.getFullYear()}. ${String(parsed.getMonth() + 1).padStart(2, "0")}. ${String(parsed.getDate()).padStart(2, "0")}.`
}

export function formatListingExpiryDate(dateValue: string | null) {
  if (!dateValue) return null
  const parsed = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" }).format(parsed)
}
