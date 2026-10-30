// A hirdetéseken keresett posztok közös listája. Az ads.positions tömbben a kulcsok
// (pl. "kormanyos") vagy a kapitány által szabadon beírt posztnevek (pl. "fotós") állnak.

export type CrewRoleKey = "mancsaft" | "kormanyos" | "taktikus" | "main-trim" | "jib-trim" | "mast" | "fordeck"

export type CrewRole = {
  value: CrewRoleKey
  label: string
  shortLabel: string
  term: string
  help: string
}

export const CREW_ROLES: CrewRole[] = [
  { value: "mancsaft", label: "Segítő legénység", shortLabel: "Bármit, segítek", term: "mancsaft", help: "Nem kell tapasztalat, a fedélzeten megtanítjuk." },
  { value: "kormanyos", label: "Kormányos", shortLabel: "Kormányos", term: "helmsman", help: "Kormányozza a hajót." },
  { value: "taktikus", label: "Taktikus, navigátor", shortLabel: "Taktikus, navigátor", term: "tactician", help: "Útvonal, szél, stratégia." },
  { value: "main-trim", label: "Nagyvitorla-kezelő", shortLabel: "Nagyvitorla", term: "main trim", help: "A nagyvitorla beállítása." },
  { value: "jib-trim", label: "Orrvitorla-kezelő", shortLabel: "Orrvitorla", term: "jib / spi trim", help: "A génua és a spinakker beállítása." },
  { value: "mast", label: "Árbocnál", shortLabel: "Árbocnál", term: "mast / pit", help: "Felhúzás, leeresztés, kötelek az árbocnál." },
  { value: "fordeck", label: "Orrban", shortLabel: "Orrban", term: "foredeck", help: "Vitorlacsere és manőverek a hajó orrában." },
]

export const MAX_CUSTOM_ROLE_LENGTH = 30

const ROLE_BY_KEY = new Map<string, CrewRole>(CREW_ROLES.map((role) => [role.value, role]))

// Régi és elírt értékek a kanonikus kulcsra.
const ROLE_ALIASES: Record<string, CrewRoleKey> = {
  "main trim": "main-trim",
  "jib trim": "jib-trim",
  foredeck: "fordeck",
  barmilyen: "mancsaft",
  mindegy: "mancsaft",
  egyeb: "mancsaft",
  matroz: "mancsaft",
  trimmer: "mancsaft",
}

function simplify(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

export function isCrewRoleKey(value: string): value is CrewRoleKey {
  return ROLE_BY_KEY.has(value)
}

// Ismert posztnál a kulcsot adja, egyedi posztnál a megadott nevet, üresnél null-t.
export function normalizeCrewRole(raw: unknown): string | null {
  const text = String(raw ?? "").trim()
  if (!text) return null
  const simple = simplify(text)
  if (isCrewRoleKey(simple)) return simple
  return ROLE_ALIASES[simple] ?? text
}

export function crewRoleLabel(raw: unknown): string {
  const normalized = normalizeCrewRole(raw)
  if (!normalized) return "Segítő legénység"
  return ROLE_BY_KEY.get(normalized)?.label ?? normalized
}

export function normalizeCrewRoles(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : []
  const roles = values.map((value) => normalizeCrewRole(value)).filter((value): value is string => value !== null)
  return Array.from(new Set(roles))
}
