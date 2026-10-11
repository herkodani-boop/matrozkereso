"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { type User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { ImagePlus } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Boat } from "./types"
import { crewTypeOptions } from "./format-utils"
import { ImageCropDialog } from "./image-crop-dialog"
import { getBoatImageStoragePath, optimizeBoatImage, validateBoatImage } from "./image-optimization"
import { ImageUploadErrorDialog } from "@/components/image-upload-error-dialog"
import { clearHungarianValidationMessage, setHungarianValidationMessage } from "@/lib/hungarian-form-validation"

/*
CREATE TABLE boats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  harbor text NOT NULL,
  max_crew_size integer NOT NULL,
  team_type text NOT NULL,
  image_url text,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamp with time zone DEFAULT now()
);
*/

export function BoatRegistrationModal({
  open,
  mode,
  existingBoat,
  onOpenChange,
  onBoatSaved,
  user,
}: {
  open: boolean
  mode: "create" | "edit"
  existingBoat: Boat | null
  onOpenChange: (open: boolean) => void
  onBoatSaved: (boat: Boat) => void
  user: User | null
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState("")
  const [harbor, setHarbor] = useState("")
  const [crewSize, setCrewSize] = useState<string | number>("")
  const [crewType, setCrewType] = useState("")
  const [boatPhoto, setBoatPhoto] = useState<File | null>(null)
  const [originalPhoto, setOriginalPhoto] = useState<File | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)
  const pendingIsRecropRef = useRef(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [isValidatingImage, setIsValidatingImage] = useState(false)
  const imageSelectionId = useRef(0)
  const photoPreviewUrl = useMemo(() => (boatPhoto ? URL.createObjectURL(boatPhoto) : null), [boatPhoto])
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl)
    }
  }, [photoPreviewUrl])
  const currentPhotoUrl = photoPreviewUrl ?? existingBoat?.image_url ?? null
  const [isSaving, setIsSaving] = useState(false)
  const [isOptimizingImage, setIsOptimizingImage] = useState(false)
  const [errors, setErrors] = useState<{
    name?: string
    type?: string
    harbor?: string
    crewSize?: string
    crewType?: string
    boatPhoto?: string
    submit?: string
  }>({})

  useEffect(() => {
    if (!open) return

    if (mode === "edit" && existingBoat) {
      setName(existingBoat.name ?? "")
      setType(existingBoat.type ?? "")
      setHarbor(existingBoat.harbor ?? "")
      setCrewSize(existingBoat.max_crew_size ?? "")
      setCrewType(existingBoat.team_type ?? "")
      setBoatPhoto(null)
      setOriginalPhoto(null)
      setErrors({})
      return
    }

    setName("")
    setType("")
    setHarbor("")
    setCrewSize("")
    setCrewType("")
    setBoatPhoto(null)
    setOriginalPhoto(null)
    setErrors({})
  }, [open, mode, existingBoat])

  async function handleBoatSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const crewSizeValue = typeof crewSize === "string" ? Number(crewSize) : crewSize
    const newErrors: typeof errors = {}

    if (!name.trim()) {
      newErrors.name = "Hajó neve megadása kötelező."
    }

    if (!type.trim()) {
      newErrors.type = "Hajó típusa megadása kötelező."
    }

    if (!harbor.trim()) {
      newErrors.harbor = "Bázis kikötő megadása kötelező."
    }

    if (!Number.isInteger(crewSizeValue) || crewSizeValue <= 0) {
      newErrors.crewSize = "Pozitív egész legénységi létszámot adj meg."
    }

    if (!crewType) {
      newErrors.crewType = "Csapat jellegének kiválasztása kötelező."
    }

    if (!user) {
      newErrors.submit = "Be kell jelentkezned, hogy el tudd menteni a hajót."
    }

    if (Object.keys(newErrors).length > 0 || isValidatingImage) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setIsSaving(true)

    const uploadedPaths: string[] = []
    let boatRecordSaved = false

    const uploadBoatFile = async (file: File, suffix: string) => {
      const fileExt = file.name.split(".").pop() ?? "webp"
      const filePath = `boats/${user?.id}-${Date.now()}${suffix}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from("boats").upload(filePath, file)
      if (uploadError) throw new Error(uploadError.message)
      uploadedPaths.push(filePath)

      const { data: publicUrlData } = supabase.storage.from("boats").getPublicUrl(filePath)
      if (!publicUrlData?.publicUrl) throw new Error("Nem sikerült lekérni a hajókép nyilvános URL-jét.")
      return { path: filePath, url: publicUrlData.publicUrl }
    }

    try {
      let imageUrl: string | null = existingBoat?.image_url ?? null
      let originalImageUrl: string | null = existingBoat?.original_image_url ?? null
      let uploadedOriginalPath: string | null = null
      if (boatPhoto) {
        setIsOptimizingImage(true)
        try {
          const croppedFile = await optimizeBoatImage(boatPhoto)
          imageUrl = (await uploadBoatFile(croppedFile, "")).url

          if (originalPhoto) {
            const originalFile = await optimizeBoatImage(originalPhoto)
            const uploadedOriginal = await uploadBoatFile(originalFile, "-original")
            originalImageUrl = uploadedOriginal.url
            uploadedOriginalPath = uploadedOriginal.path
          }
        } catch (error) {
          setBoatPhoto(null)
          setOriginalPhoto(null)
          setImageError(error instanceof Error ? error.message : "A hajókép feltöltése nem sikerült.")
          return
        } finally {
          setIsOptimizingImage(false)
        }
      }

      const boatFields = {
        name: name.trim(),
        type: type.trim(),
        harbor: harbor.trim(),
        max_crew_size: parseInt(String(crewSizeValue), 10),
        team_type: crewType,
        image_url: imageUrl,
      }

      const runSave = (payload: Record<string, unknown>) =>
        mode === "edit" && existingBoat
          ? supabase.from("boats").update(payload).eq("id", existingBoat.id).select().single()
          : supabase.from("boats").insert([{ ...payload, user_id: user!.id }]).select().single()

      let savedResult = await runSave({ ...boatFields, original_image_url: originalImageUrl })
      if (savedResult.error && /original_image_url/i.test(savedResult.error.message ?? "")) {
        // Az eredeti kép oszlopa még nincs migrálva: mentés az eredeti kép nélkül.
        savedResult = await runSave(boatFields)
        if (!savedResult.error && uploadedOriginalPath) {
          await supabase.storage.from("boats").remove([uploadedOriginalPath]).catch(() => undefined)
        }
      }

      const { data: savedBoat, error: saveError } = savedResult
      if (saveError || !savedBoat) {
        setErrors({ submit: saveError?.message ?? "Hiba történt a hajó mentése közben." })
        return
      }

      boatRecordSaved = true

      if (mode === "edit" && existingBoat) {
        const oldPaths = [
          boatPhoto ? existingBoat.image_url : null,
          originalPhoto ? existingBoat.original_image_url : null,
        ]
          .map((url) => getBoatImageStoragePath(url))
          .filter((path): path is string => Boolean(path) && !uploadedPaths.includes(path as string))

        if (oldPaths.length > 0) {
          try {
            const { error: oldImageRemoveError } = await supabase.storage.from("boats").remove(oldPaths)
            if (oldImageRemoveError) {
              console.warn("Régi hajókép törlése nem sikerült:", oldImageRemoveError)
            }
          } catch (cleanupError) {
            console.warn("Régi hajókép törlése hálózati hiba miatt nem sikerült:", cleanupError)
          }
        }
      }

      onBoatSaved(savedBoat)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ismeretlen hiba történt a mentés közben."
      setErrors({ submit: message })
    } finally {
      if (uploadedPaths.length > 0 && !boatRecordSaved) {
        try {
          const { error: orphanCleanupError } = await supabase.storage.from("boats").remove(uploadedPaths)
          if (orphanCleanupError) {
            console.warn("Sikertelen hajómentés után az új kép törlése nem sikerült:", orphanCleanupError)
          }
        } catch (cleanupError) {
          console.warn("Sikertelen hajómentés után az új kép törlése hálózati hiba miatt nem sikerült:", cleanupError)
        }
      }
      setIsOptimizingImage(false)
      setIsSaving(false)
    }
  }

  async function handleBoatPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ""
    if (!file) return

    const selectionId = ++imageSelectionId.current
    setPendingPhoto(null)
    setBoatPhoto(null)
    setOriginalPhoto(null)
    setImageError(null)
    setIsValidatingImage(true)

    try {
      await validateBoatImage(file)
      if (selectionId === imageSelectionId.current) {
        pendingIsRecropRef.current = false
        setPendingPhoto(file)
      }
    } catch (error) {
      if (selectionId === imageSelectionId.current) {
        setImageError(error instanceof Error ? error.message : "A hajókép ellenőrzése nem sikerült.")
      }
    } finally {
      if (selectionId === imageSelectionId.current) setIsValidatingImage(false)
    }
  }

  async function handleRecropOriginal() {
    const originalUrl = existingBoat?.original_image_url
    if (!originalUrl || isValidatingImage) return

    setImageError(null)
    setIsValidatingImage(true)
    try {
      const response = await fetch(originalUrl)
      if (!response.ok) throw new Error("Az eredeti kép betöltése nem sikerült.")
      const blob = await response.blob()
      pendingIsRecropRef.current = true
      setPendingPhoto(new File([blob], "boat-original.webp", { type: blob.type || "image/webp" }))
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Az eredeti kép betöltése nem sikerült.")
    } finally {
      setIsValidatingImage(false)
    }
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSaving) {
          if (!nextOpen) {
            imageSelectionId.current += 1
            setIsValidatingImage(false)
            setPendingPhoto(null)
          }
          onOpenChange(nextOpen)
        }
      }}
    >
      <DialogContent showCloseButton initialFocus={false} className="max-w-lg gap-0 rounded-2xl p-0 sm:max-w-xl">
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {mode === "edit" ? "Hajó adatok szerkesztése" : "Hajó regisztrációja"}
            </DialogTitle>
            {mode === "create" ? (
              <DialogDescription className="text-pretty leading-relaxed">
                Add meg a hajód adatait. Mentés után visszatérsz a kapitányi felületre, ahol külön adhatod fel az első hirdetést.
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <form onSubmit={handleBoatSubmit} onInvalidCapture={setHungarianValidationMessage} onInputCapture={clearHungarianValidationMessage} className="flex flex-col gap-4">
            {errors.submit ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errors.submit}
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="boat-photo">Hajó fotó (opcionális)</Label>
              <label
                htmlFor="boat-photo"
                className={`group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-secondary/40 text-center text-muted-foreground transition-colors hover:border-brand hover:text-brand ${currentPhotoUrl ? "aspect-[3/1] w-full" : "h-40"}`}
              >
                {currentPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentPhotoUrl} alt="Hajókép" className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
                <span
                  className={
                    currentPhotoUrl
                      ? "absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-brand shadow-sm"
                      : "flex flex-col items-center gap-2 px-4"
                  }
                >
                  <ImagePlus className={currentPhotoUrl ? "h-4 w-4" : "h-6 w-6"} aria-hidden="true" />
                  <span className={currentPhotoUrl ? "" : "text-sm font-medium"}>
                    {currentPhotoUrl ? "Kép cseréje" : "Kép feltöltése a hajóról"}
                  </span>
                  {currentPhotoUrl ? null : (
                    <span className="text-xs font-normal text-muted-foreground">
                      Bármilyen tájolású fotót feltölthetsz, feltöltés után kiválaszthatod a látható részt.
                    </span>
                  )}
                </span>
                <input
                  id="boat-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void handleBoatPhotoChange(e)
                    if (errors.boatPhoto) {
                      setErrors((prev) => ({ ...prev, boatPhoto: undefined }))
                    }
                  }}
                />
              </label>
              {errors.boatPhoto ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.boatPhoto}
                </p>
              ) : null}
              {isValidatingImage ? (
                <p className="text-sm text-muted-foreground" role="status">Hajókép ellenőrzése...</p>
              ) : null}
              {mode === "edit" && existingBoat?.original_image_url && !originalPhoto ? (
                <button
                  type="button"
                  onClick={() => void handleRecropOriginal()}
                  disabled={isValidatingImage || isSaving}
                  className="self-start text-sm font-medium text-brand underline-offset-4 hover:underline disabled:opacity-50"
                >
                  Kivágás módosítása az eredeti képen
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="boat-name">Hajó neve</Label>
                <Input
                  id="boat-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (errors.name) {
                      setErrors((prev) => ({ ...prev, name: undefined }))
                    }
                  }}
                  placeholder="Pl. Sirocco"
                  className="h-11"
                  aria-invalid={!!errors.name}
                />
                {errors.name ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.name}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="boat-type">Hajó típusa / Hajóosztály</Label>
                <Input
                  id="boat-type"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value)
                    if (errors.type) {
                      setErrors((prev) => ({ ...prev, type: undefined }))
                    }
                  }}
                  placeholder="Pl. Bavaria 34, Dehler 30, X-35"
                  className="h-11"
                  aria-invalid={!!errors.type}
                />
                {errors.type ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.type}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="boat-harbor">Bázis kikötő</Label>
                <Input
                  id="boat-harbor"
                  value={harbor}
                  onChange={(e) => {
                    setHarbor(e.target.value)
                    if (errors.harbor) {
                      setErrors((prev) => ({ ...prev, harbor: undefined }))
                    }
                  }}
                  placeholder="Pl. Balatonfüred"
                  className="h-11"
                  aria-invalid={!!errors.harbor}
                />
                {errors.harbor ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.harbor}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="crew-size">Max legénységi létszám</Label>
                <Input
                  id="crew-size"
                  type="number"
                  min={1}
                  step={1}
                  value={crewSize}
                  onChange={(e) => {
                    const value = e.target.value === "" ? "" : Number(e.target.value)
                    setCrewSize(value)
                    if (errors.crewSize) {
                      setErrors((prev) => ({ ...prev, crewSize: undefined }))
                    }
                  }}
                  placeholder="Pl. 8"
                  className="h-11"
                  aria-invalid={!!errors.crewSize}
                />
                {errors.crewSize ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.crewSize}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Csapat jellege</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {crewTypeOptions.map((option) => {
                  const active = crewType === option.value
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                        active
                          ? "border-brand bg-brand-tint text-foreground"
                          : "border-border bg-card text-foreground hover:border-brand/60"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          active ? "border-brand" : "border-muted-foreground"
                        }`}
                      >
                        {active ? <span className="h-2 w-2 rounded-full bg-brand" /> : null}
                      </span>
                      <input
                        type="radio"
                        name="crew-type"
                        value={option.value}
                        checked={active}
                        onChange={() => {
                          setCrewType(option.value)
                          if (errors.crewType) {
                            setErrors((prev) => ({ ...prev, crewType: undefined }))
                          }
                        }}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  )
                })}
              </div>
              {errors.crewType ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.crewType}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isSaving || isOptimizingImage || isValidatingImage || Boolean(pendingPhoto)}
              className="mt-2 h-11 bg-brand! text-white! hover:bg-brand/90! disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isOptimizingImage
                ? "Kép optimalizálása..."
                : isSaving
                  ? "Mentés folyamatban..."
                  : mode === "edit"
                    ? "Hajó adatok mentése"
                    : "Hajó mentése"}
            </Button>
          </form>
        </div>
        <ImageCropDialog
          file={pendingPhoto}
          onCancel={() => setPendingPhoto(null)}
          onError={(message) => {
            setPendingPhoto(null)
            setBoatPhoto(null)
            setImageError(message)
          }}
          onConfirm={(cropped) => {
            if (!pendingIsRecropRef.current) setOriginalPhoto(pendingPhoto)
            setBoatPhoto(cropped)
            setPendingPhoto(null)
          }}
        />
      </DialogContent>
      </Dialog>
      <ImageUploadErrorDialog message={imageError} onClose={() => setImageError(null)} />
      </>
  )
    }
