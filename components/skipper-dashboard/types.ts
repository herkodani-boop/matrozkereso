export type ApplicantStatus = "pending" | "accepted" | "rejected"

export type Applicant = {
  id: string
  userId: string
  name: string
  age?: number
  level: "Kezdő" | "Haladó" | "Profi / Versenyző"
  phone: string
  email: string
  avatar: string
  applicationMessage: string | null
  contactShared: boolean
}

export type Listing = {
  id: string
  eventId: string | null
  commitment: "egy-verseny" | "szezon"
  event: string
  location: string
  date: string
  expiryDate: string | null
  isActive: boolean
  isDeleted: boolean
  isHistorical: boolean
  positions: string[]
  applicants: Applicant[]
}

export type UserProfile = {
  full_name: string
  role: string
  avatar_url: string | null
}

export type Boat = {
  id: string
  name: string
  type: string
  harbor: string
  max_crew_size: number
  team_type: string
  image_url: string | null
  user_id: string
}

export const PRIMARY_BOAT = {
  name: "Sirocco",
  type: "X-35 — Versenycirkáló",
  harbor: "Balatonfüred",
  image: "/boats/sirocco.png",
}

export type EventItem = {
  id: string
  title: string
  date: string
  location: string
  type: "Verseny" | "Edzés" | "Egyéb"
  details: string
  startDate: string
  endDate: string
  oneDay: boolean
  participants: {
    userId: string
    name: string
    avatar: string
    status: "confirmed" | "pending" | "declined" | "unset"
    source?: "team" | "listing" | "captain"
  }[]
}

export type TeamMember = {
  id: string
  userId: string
  name: string
  email: string
  role: string
  avatar: string
  phone?: string | null
  status: "active" | "invited"
}

export const levelStyles: Record<Applicant["level"], string> = {
  Kezdő: "bg-secondary text-secondary-foreground",
  Haladó: "border border-cyan-300 bg-cyan-100 text-cyan-950 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-100",
  "Profi / Versenyző": "bg-primary text-primary-foreground",
}
