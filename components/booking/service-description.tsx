'use client'

// Esqueleto para el RED de TDD (G-23-6): exporta la forma pública sin comportamiento, así los
// tests fallan por aserción y no por un import roto. El GREEN lo reemplaza entero.

export function descriptionOverflows(_scrollHeight: number, _clientHeight: number): boolean {
  return false
}

export function showDescriptionToggle(_overflows: boolean, _expanded: boolean): boolean {
  return false
}

export function ServiceDescription(_props: {
  text: string
  name: string
  id?: string
  className?: string
  toggleClassName?: string
}) {
  return null
}
