type AdVisibilityInput = {
  commitment?: string | null
  start_date?: string | null
  end_date?: string | null
}

function todayKey(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function isAdVisibleByDate(ad: AdVisibilityInput, now = new Date()) {
  const commitment = String(ad.commitment ?? "")
  const startDate = ad.start_date ?? null
  const endDate = ad.end_date ?? null
  const today = todayKey(now)

  if (commitment === "egy-verseny") {
    if (!startDate) return true
    return today <= startDate
  }

  if (commitment === "szezon") {
    if (!endDate) return true
    return today <= endDate
  }

  return true
}
