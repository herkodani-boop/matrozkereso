export type Commitment = "egy-verseny" | "szezon"
export type Role = "matroz" | "trimmer" | "kormanyos" | "egyeb"
export type Level = "kezdo" | "halado" | "profi"

export type Listing = {
  id: string
  boatName: string
  image: string
  commitment: Commitment
  event: string
  location: string
  date: string
  role: Role
  level: Level
}

export const listings: Listing[] = [
  {
    id: "1",
    boatName: "Sirocco",
    image: "/boats/sirocco.png",
    commitment: "egy-verseny",
    event: "Kékszalag Erste Kör",
    location: "Balatonfüred",
    date: "2026. július 17–18.",
    role: "trimmer",
    level: "halado",
  },
  {
    id: "2",
    boatName: "Nemere II",
    image: "/boats/nemere.png",
    commitment: "szezon",
    event: "Balatoni Bajnokság – teljes szezon",
    location: "Balatonkenese",
    date: "2026. május – szeptember",
    role: "matroz",
    level: "kezdo",
  },
  {
    id: "3",
    boatName: "Avalon",
    image: "/boats/avalon.png",
    commitment: "egy-verseny",
    event: "Kékszalag nagytávú verseny",
    location: "Balatonfüred",
    date: "2026. július 24.",
    role: "kormanyos",
    level: "profi",
  },
]
