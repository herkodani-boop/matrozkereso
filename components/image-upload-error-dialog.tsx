"use client"

import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function ImageUploadErrorDialog({
  message,
  onClose,
}: {
  message: string | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={Boolean(message)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
            <DialogTitle>Hiba a képfájllal</DialogTitle>
          </div>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Rendben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
