export const MAX_BOAT_IMAGE_DIMENSION = 1600
export const TARGET_BOAT_IMAGE_SIZE_BYTES = 900 * 1024
export const MAX_BOAT_IMAGE_UPLOAD_SIZE_BYTES = 12 * 1024 * 1024

export async function loadImageElement(file: File): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  const objectUrl = URL.createObjectURL(file)

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("A kép betöltése sikertelen."))
    img.src = objectUrl
  })

  return {
    image,
    revoke: () => URL.revokeObjectURL(objectUrl),
  }
}

export async function optimizeBoatImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file
  }

  const { image, revoke } = await loadImageElement(file)

  try {
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height

    if (!width || !height) {
      return file
    }

    const scale = Math.min(1, MAX_BOAT_IMAGE_DIMENSION / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return file
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

    const qualities = [0.82, 0.74, 0.66, 0.58]
    let bestBlob: Blob | null = null

    for (const quality of qualities) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/webp", quality)
      })

      if (!blob) {
        continue
      }

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob
      }

      if (blob.size <= TARGET_BOAT_IMAGE_SIZE_BYTES) {
        bestBlob = blob
        break
      }
    }

    if (!bestBlob || bestBlob.size >= file.size) {
      return file
    }

    const safeName = file.name.replace(/\.[^.]+$/, "") || "boat-photo"
    return new File([bestBlob], `${safeName}.webp`, { type: "image/webp" })
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
