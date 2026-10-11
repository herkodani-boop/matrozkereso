export const MAX_BOAT_IMAGE_DIMENSION = 1600
export const TARGET_BOAT_IMAGE_SIZE_BYTES = 900 * 1024
export const MAX_BOAT_IMAGE_UPLOAD_SIZE_BYTES = 12 * 1024 * 1024
export const MAX_BOAT_IMAGE_SOURCE_PIXELS = 40_000_000

const supportedBoatImageTypes = new Set(["image/jpeg", "image/png", "image/webp"])

export async function loadImageElement(file: File): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("A kép nem olvasható vagy sérült. Válassz másik képet."))
      img.src = objectUrl
    })

    return {
      image,
      revoke: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export async function validateBoatImage(file: File): Promise<void> {
  if (!supportedBoatImageTypes.has(file.type)) {
    throw new Error("Csak JPG, PNG vagy WebP formátumú hajókép tölthető fel.")
  }

  if (file.size > MAX_BOAT_IMAGE_UPLOAD_SIZE_BYTES) {
    throw new Error("A kiválasztott kép nagyobb 12 MB-nál. Válassz kisebb képet.")
  }

  const { image, revoke } = await loadImageElement(file)
  try {
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) {
      throw new Error("A kép felbontása nem olvasható.")
    }
    if (width * height > MAX_BOAT_IMAGE_SOURCE_PIXELS) {
      throw new Error("A kép felbontása túl nagy. Válassz legfeljebb 40 megapixeles képet.")
    }
  } finally {
    revoke()
  }
}

export async function optimizeBoatImage(file: File): Promise<File> {
  await validateBoatImage(file)

  const { image, revoke } = await loadImageElement(file)

  try {
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height

    if (!width || !height) {
      throw new Error("A kép felbontása nem olvasható.")
    }

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("A kép feldolgozása nem sikerült ebben a böngészőben.")
    }

    let bestBlob: Blob | null = null
    const scale = Math.min(1, MAX_BOAT_IMAGE_DIMENSION / Math.max(width, height))
    const baseWidth = Math.max(1, Math.round(width * scale))
    const baseHeight = Math.max(1, Math.round(height * scale))

    for (const sizeScale of [1, 0.875, 0.75, 0.625, 0.5]) {
      canvas.width = Math.max(1, Math.round(baseWidth * sizeScale))
      canvas.height = Math.max(1, Math.round(baseHeight * sizeScale))
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

      for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/webp", quality)
        })

        if (!blob || blob.type !== "image/webp") continue
        if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob

        if (blob.size <= TARGET_BOAT_IMAGE_SIZE_BYTES) {
          const safeName = file.name.replace(/\.[^.]+$/, "") || "boat-photo"
          return new File([blob], `${safeName}.webp`, { type: "image/webp" })
        }
      }
    }

    if (!bestBlob) {
      throw new Error("A kép WebP formátumba alakítása nem sikerült ebben a böngészőben.")
    }

    throw new Error("A hajókép tömörítés után is túl nagy. Válassz kisebb vagy egyszerűbb képet.")
  } finally {
    revoke()
  }
}

export function getBoatImageStoragePath(imageUrl?: string | null) {
  if (!imageUrl) return null

  try {
    const url = new URL(imageUrl)
    const marker = "/object/public/boats/"
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex === -1) return null
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length)) || null
  } catch {
    return null
  }
}
