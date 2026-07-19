"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"

// Input de hora custom que reemplaza <input type="time">. En mobile el nativo
// abre el reloj (rueda) y no se puede forzar a modo teclado; acá se tipea
// directo con teclado numérico. Contrato idéntico al type=time: value/onChange
// con string "HH:MM" (o "" si vacío). Formatea al tipear (0930 → 09:30) y
// normaliza + clampa en blur (9:5 → 09:05, hora 0-23, min 0-59).

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n))

// Normaliza dígitos crudos a "HH:MM". "" si no hay dígitos.
function normalizeTime(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4)
  if (!digits) return ""
  let hh: number
  let mm: number
  if (digits.length <= 2) {
    hh = parseInt(digits, 10)
    mm = 0
  } else {
    hh = parseInt(digits.slice(0, 2), 10)
    mm = parseInt(digits.slice(2), 10)
  }
  hh = clamp(hh, 23)
  mm = clamp(mm, 59)
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

type TimeFieldProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value: string
  onChange: (value: string) => void
}

function TimeField({ value, onChange, onBlur, ...props }: TimeFieldProps) {
  const [text, setText] = React.useState(value)
  // Sincronizar cuando el value externo cambia (ej. reset del form) sin useEffect:
  // ajuste de estado en render, patrón oficial de React. Al tipear no propagamos
  // (solo en blur), así que value no cambia mientras se edita → no pisa el texto.
  const [prevValue, setPrevValue] = React.useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setText(value)
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="--:--"
      maxLength={5}
      value={text}
      onChange={(e) => {
        // Formateo progresivo: HHMM → HH:MM mientras se tipea.
        const digits = e.target.value.replace(/\D/g, "").slice(0, 4)
        setText(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits)
      }}
      onBlur={(e) => {
        const norm = normalizeTime(text)
        setText(norm)
        if (norm !== value) onChange(norm)
        onBlur?.(e)
      }}
    />
  )
}

export { TimeField, normalizeTime }
