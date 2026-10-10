"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
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
import { MAX_BOAT_IMAGE_UPLOAD_SIZE_BYTES, getBoatImageStoragePath, optimizeBoatImage } from "./image-optimization"

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
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)
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
      setErrors({})
      return
    }

    setName("")
    setType("")
    setHarbor("")
    setCrewSize("")
    setCrewType("")
    setBoatPhoto(null)
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

    if (boatPhoto && boatPhoto.size > MAX_BOAT_IMAGE_UPLOAD_SIZE_BYTES) {
      newErrors.boatPhoto = "A kép túl nagy. Maximum 12 MB méretű fájl tölthető fel."
    }

    if (!user) {
      newErrors.submit = "Be kell jelentkezned, hogy el tudd menteni a hajót."
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setIsSaving(true)

    let uploadedBoatPhotoPath: string | null = null
    let boatRecordSaved = false

    try {
      let imageUrl: string | null = existingBoat?.image_url ?? null
      if (boatPhoto) {
        setIsOptimizingImage(true)
        const uploadFile = await optimizeBoatImage(boatPhoto)
        setIsOptimizingImage(false)

        const fileExt = uploadFile.name.split(".").pop() ?? "webp"
        const fileName = `${user?.id}-${Date.now()}.${fileExt}`
        const filePath = `boats/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from("boats")
          .upload(filePath, uploadFile)

        if (uploadError) {
          setErrors({ submit: uploadError.message })
          return
        }
        uploadedBoatPhotoPath = filePath

        const { data: publicUrlData } = await supabase.storage
          .from("boats")
          .getPublicUrl(filePath)

        if (!publicUrlData?.publicUrl) {
          setErrors({ submit: "Nem sikerült lekérni a kép nyilvános URL-jét." })
          return
        }

        imageUrl = publicUrlData.publicUrl
      }

      if (mode === "edit" && existingBoat) {
        const { data: updatedBoat, error: updateError } = await supabase
          .from("boats")
          .update({
            name: name.trim(),
            type: type.trim(),
            harbor: harbor.trim(),
            max_crew_size: parseInt(String(crewSizeValue), 10),
            team_type: crewType,
            image_url: imageUrl,
          })
          .eq("id", existingBoat.id)
          .select()
          .single()

        if (updateError || !updatedBoat) {
          setErrors({ submit: updateError?.message ?? "Hiba történt a hajó mentése közben." })
          return
        }

        boatRecordSaved = true
        if (uploadedBoatPhotoPath && existingBoat.image_url) {
          const oldImagePath = getBoatImageStoragePath(existingBoat.image_url)
          if (oldImagePath && oldImagePath !== uploadedBoatPhotoPath) {
            try {
              const { error: oldImageRemoveError } = await supabase.storage.from("boats").remove([oldImagePath])
              if (oldImageRemoveError) {
                console.warn("Régi hajókép törlése nem sikerült:", oldImageRemoveError)
              }
            } catch (cleanupError) {
              console.warn("Régi hajókép törlése hálózati hiba miatt nem sikerült:", cleanupError)
            }
          }
        }

        onBoatSaved(updatedBoat)
        onOpenChange(false)
        return
      }

      const { data: insertedBoat, error: insertError } = await supabase
        .from("boats")
        .insert([
          {
            name: name.trim(),
            type: type.trim(),
            harbor: harbor.trim(),
            max_crew_size: parseInt(String(crewSizeValue), 10),
            team_type: crewType,
            image_url: imageUrl,
            user_id: user!.id,
          },
        ])
        .select()
        .single()

      if (insertError || !insertedBoat) {
        setErrors({ submit: insertError?.message ?? "Hiba történt a hajó mentése közben." })
        return
      }

      boatRecordSaved = true
      onBoatSaved(insertedBoat)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ismeretlen hiba történt a mentés közben."
      setErrors({ submit: message })
    } finally {
      if (uploadedBoatPhotoPath && !boatRecordSaved) {
        try {
          const { error: orphanCleanupError } = await supabase.storage.from("boats").remove([uploadedBoatPhotoPath])
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

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSaving) onOpenChange(nextOpen)
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

          <form onSubmit={handleBoatSubmit} className="flex flex-col gap-4">
            {errors.submit ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errors.submit}
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="boat-photo">Hajó fotó (opcionális)</Label>
              <label
                htmlFor="boat-photo"
                className="group relative flex aspect-[3/1] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-secondary/40 text-center text-muted-foreground transition-colors hover:border-brand hover:text-brand"
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
                      Fekvő fotó a legjobb, feltöltés után kiválaszthatod a látható részt.
                    </span>
                  )}
                </span>
                <input
                  id="boat-photo"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    setPendingPhoto(e.target.files?.[0] ?? null)
                    e.target.value = ""
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
              disabled={isSaving || isOptimizingImage}
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
          onConfirm={(cropped) => {
            setBoatPhoto(cropped)
            setPendingPhoto(null)
          }}
        />
      </DialogContent>
      </Dialog>
  )
    }
