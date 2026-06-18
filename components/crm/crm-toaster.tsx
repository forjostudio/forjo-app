'use client'

import { Toaster } from '@/components/ui/sonner'

/**
 * CrmToaster — Toaster scopeado al CRM en tema dark (FND-04, UI-SPEC §"Toasts", research A4).
 *
 * El CRM fuerza dark LOCALMENTE (`.crm-shell` en el layout) pero `next-themes` global sigue en
 * light (el root fuerza light, ver app/layout.tsx). El `Toaster` compartido lee el theme de
 * `next-themes` → sin esto, los toasts del CRM saldrían en light sobre un shell dark.
 *
 * Montando este Toaster dentro del layout del CRM con `theme="dark"` explícito (que pisa el
 * `theme` que el Toaster compartido toma de next-themes vía `{...props}`), los toasts del CRM
 * salen en dark, coherentes con el shell. Posición top-right en desktop.
 */
export function CrmToaster() {
  return <Toaster theme="dark" position="top-right" />
}
