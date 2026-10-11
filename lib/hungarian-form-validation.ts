import type React from "react"

type ValidationControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

function isValidationControl(target: EventTarget | null): target is ValidationControl {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  )
}

function getHungarianValidationMessage(control: ValidationControl): string {
  const { validity } = control

  if (validity.valueMissing) {
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      return "Jelöld be a folytatáshoz."
    } else if (
      control instanceof HTMLInputElement &&
      (control.type === "radio" || control.type === "checkbox")
    ) {
      return "Válassz egy lehetőséget."
    } else if (control instanceof HTMLSelectElement) {
      return "Válassz egy lehetőséget."
    }
    return "A mező kitöltése kötelező."
  }

  if (validity.typeMismatch) {
    return control instanceof HTMLInputElement && control.type === "email"
      ? "Adj meg egy érvényes e-mail-címet."
      : "A megadott érték formátuma nem megfelelő."
  }
  if (validity.patternMismatch) return control.title || "A megadott formátum nem megfelelő."
  if (validity.tooShort) return `Legalább ${control.getAttribute("minlength")} karaktert adj meg.`
  if (validity.tooLong) return `Legfeljebb ${control.getAttribute("maxlength")} karaktert adj meg.`
  if (validity.rangeUnderflow) return "A megadott érték túl kicsi."
  if (validity.rangeOverflow) return "A megadott érték túl nagy."
  if (validity.stepMismatch) return "Adj meg egy megengedett értéket."
  if (validity.badInput) return "Adj meg egy érvényes értéket."

  return ""
}

export function setHungarianValidationMessage(event: React.FormEvent<HTMLFormElement>) {
  const control = event.target
  if (!isValidationControl(control) || control.validity.customError) return

  const message = getHungarianValidationMessage(control)
  if (message) control.setCustomValidity(message)
}

export function clearHungarianValidationMessage(event: React.FormEvent<HTMLFormElement>) {
  const control = event.target
  if (!isValidationControl(control)) return

  control.setCustomValidity("")
  if (control.validity.valid) return

  const message = getHungarianValidationMessage(control)
  if (message) control.setCustomValidity(message)
}
