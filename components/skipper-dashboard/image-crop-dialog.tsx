"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { Minus, Plus } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { loadImageElement } from "./image-optimization"

export const BOAT_IMAGE_ASPECT = 3
const OUTPUT_WIDTH = 1600
const MIN_RECOMMENDED_WIDTH = 1200
const MAX_ZOOM = 3

export function ImageCropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File | null
  onCancel: () => void
  onConfirm: (cropped: File) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [frame, setFrame] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!file) {
      setImage(null)
      setSrc(null)
      return
    }
    let cancelled = false
    let revoke: (() => void) | null = null
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    loadImageElement(file)
      .then((result) => {
        if (cancelled) {
          result.revoke()
          return
        }
        revoke = result.revoke
        setImage(result.image)
        setSrc(result.image.src)
      })
      .catch(() => {
        if (!cancelled) onCancel()
      })
    return () => {
      cancelled = true
      revoke?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  useEffect(() => {
    const el = frameRef.current
    if (!el || !image) return
    const update = () => setFrame({ w: el.clientWidth, h: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [image])

  const nw = image?.naturalWidth ?? 0
  const nh = image?.naturalHeight ?? 0
  const baseScale = nw && nh && frame.w ? Math.max(frame.w / nw, frame.h / nh) : 1
  const scale = baseScale * zoom
  const dw = nw * scale
  const dh = nh * scale

  const clamp = useCallback(
    (x: number, y: number, nextScale = scale) => {
      const maxX = Math.max(0, (nw * nextScale - frame.w) / 2)
      const maxY = Math.max(0, (nh * nextScale - frame.h) / 2)
      return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
    },
    [scale, nw, nh, frame.w, frame.h],
  )

  const changeZoom = (next: number) => {
    const value = Math.min(MAX_ZOOM, Math.max(1, next))
    setZoom(value)
    setOffset((prev) => clamp(prev.x, prev.y, baseScale * value))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setOffset(clamp(drag.ox + event.clientX - drag.x, drag.oy + event.clientY - drag.y))
  }

  const handleConfirm = async () => {
    if (!image || !file || !frame.w) return
    setIsSaving(true)
    try {
      const left = frame.w / 2 - dw / 2 + offset.x
      const top = frame.h / 2 - dh / 2 + offset.y
      const sx = -left / scale
      const sy = -top / scale
      const sw = frame.w / scale
      const sh = frame.h / scale
      const outWidth = Math.round(Math.min(OUTPUT_WIDTH, sw))
      const outHeight = Math.round(outWidth / BOAT_IMAGE_ASPECT)

      const canvas = document.createElement("canvas")
      canvas.width = outWidth
      canvas.height = outHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("canvas")
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outWidth, outHeight)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9))
      if (!blob) throw new Error("blob")
      const safeName = file.name.replace(/\.[^.]+$/, "") || "boat-photo"
      onConfirm(new File([blob], `${safeName}.webp`, { type: "image/webp" }))
    } catch {
      onCancel()
    } finally {
      setIsSaving(false)
    }
  }

  const warnings: string[] = []
  if (image) {
    if (nw / nh < 1.3) warnings.push("Álló vagy négyzetes kép: a vágás után sok elveszhet belőle. Fekvő fotó a legjobb.")
    if (nw < MIN_RECOMMENDED_WIDTH) warnings.push("Kisebb felbontású kép, nagy méretben életlen lehet.")
  }

  return (
    <Dialog
      open={Boolean(file)}
      onOpenChange={(open) => {
        if (!open && !isSaving) onCancel()
      }}
      disablePointerDismissal
    >
      <DialogContent className="max-w-lg gap-0 rounded-2xl p-0 sm:max-w-2xl">
        <div className="flex flex-col gap-4 p-6">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-lg font-bold">Hajókép beállítása</DialogTitle>
            <DialogDescription>
              Húzd a képet a megfelelő pozícióba, nagyítsd a csúszkával. A keretben pontosan az látszik, ami a
              kapitányi felületen is megjelenik.
            </DialogDescription>
          </DialogHeader>

          <div
            ref={frameRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => {
              dragRef.current = null
            }}
            onPointerCancel={() => {
              dragRef.current = null
            }}
            className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-brand-tint active:cursor-grabbing"
            style={{ aspectRatio: BOAT_IMAGE_ASPECT }}
          >
            {src && frame.w ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt="Kivágandó hajókép"
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  width: dw,
                  height: dh,
                  left: frame.w / 2 - dw / 2 + offset.x,
                  top: frame.h / 2 - dh / 2 + offset.y,
                }}
              />
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Kicsinyítés"
              onClick={() => changeZoom(zoom - 0.25)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-brand-tint hover:text-brand"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(event) => changeZoom(Number(event.target.value))}
              aria-label="Nagyítás"
              className="h-1.5 flex-1 cursor-pointer accent-[var(--color-brand)]"
            />
            <button
              type="button"
              aria-label="Nagyítás"
              onClick={() => changeZoom(zoom + 0.25)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-brand-tint hover:text-brand"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {warnings.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Tipp: a hajó legyen a kép középső részén, jól látható méretben.</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Mégse
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isSaving || !image}
              className="bg-brand! text-white! hover:bg-brand/90!"
            >
              Kép használata
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
