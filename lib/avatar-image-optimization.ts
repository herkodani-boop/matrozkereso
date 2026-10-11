export const MAX_AVATAR_SOURCE_SIZE_BYTES = 10 * 1024 * 1024
export const MAX_AVATAR_SOURCE_PIXELS = 40_000_000
export const MAX_AVATAR_DIMENSION = 512
export const MAX_AVATAR_FILE_SIZE_BYTES = 300 * 1024

const supportedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"])

export async function optimizeAvatarImage(file: File): Promise<File> {
  if (!supportedAvatarTypes.has(file.type)) {
    throw new Error("Csak JPG, PNG vagy WebP formátumú kép tölthető fel.")
  }

  if (file.size > MAX_AVATAR_SOURCE_SIZE_BYTES) {
    throw new Error("A kiválasztott kép nagyobb 10 MB-nál. Válassz kisebb képet.")
  }

  const objectUrl = URL.createObjectURL(file)
  const image = new window.Image()

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("A kép nem olvasható vagy sérült. Válassz másik képet."))
      image.src = objectUrl
    })

    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height || width * height > MAX_AVATAR_SOURCE_PIXELS) {
      throw new Error("A kép felbontása túl nagy. Válassz legfeljebb 40 megapixeles képet.")
    }

    const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(width, height))
    const baseWidth = Math.max(1, Math.round(width * scale))
    const baseHeight = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("A kép feldolgozása nem sikerült ebben a böngészőben.")
    }

    let bestBlob: Blob | null = null
    for (const sizeScale of [1, 0.75, 0.5, 0.375]) {
      canvas.width = Math.max(1, Math.round(baseWidth * sizeScale))
      canvas.height = Math.max(1, Math.round(baseHeight * sizeScale))
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      for (const quality of [0.82, 0.7, 0.58, 0.46]) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/webp", quality)
        })

        if (!blob || blob.type !== "image/webp") {
          continue
        }

        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob
        }

        if (blob.size <= MAX_AVATAR_FILE_SIZE_BYTES) {
          const safeName = file.name.replace(/\.[^.]+$/, "") || "profile-photo"
          return new File([blob], `${safeName}.webp`, { type: "image/webp" })
        }
      }
    }

    if (!bestBlob) {
      throw new Error("A kép WebP formátumba alakítása nem sikerült.")
    }

    throw new Error("A kép tömörítés után is túl nagy. Válassz egyszerűbb vagy kisebb képet.")
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
