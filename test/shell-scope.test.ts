import { describe, it, expect } from 'vitest'
import { CRM_SHELL_CLASS, portalScopeClass } from '@/lib/shell-scope'

// ── Phase 14 (POLISH-05, gap 1 de 14-VERIFICATION.md) — contrato del scope portaleado ────────────
// Espeja test/client-status.test.ts: describe/it/expect, import por el alias @/lib/..., sin Supabase
// y sin ningún gate de entorno → esta suite corre siempre.
//
// Qué congela: el helper que decide si una superficie portaleada lleva o no el scope del shell.
// El caso `undefined` es LA prueba anti-regresión del dashboard: fuera de un proveedor el helper
// devuelve `undefined`, `cn()` descarta los falsy, y el className del popup queda byte-idéntico al
// de hoy. Si alguien hiciera que el default fuera el shell del CRM, el dueño vería su panel con el
// chrome del super-admin (T-14-32).

describe('CRM_SHELL_CLASS — la constante del shell del super-admin', () => {
  it('contiene exactamente las dos clases del wrapper de app/(crm)/layout.tsx (dark + el scope)', () => {
    // Las dos y NADA más: si se colara una clase de layout o de color, el popup portaleado
    // heredaría geometría del shell y no solo sus custom properties (la premisa de la opción C).
    expect(CRM_SHELL_CLASS.split(/\s+/).filter(Boolean)).toEqual(['dark', 'crm-shell'])
  })

  it('NO nombra ningún custom property (invariante D-07: la constante nombra scopes, nunca tokens)', () => {
    // Lección del gap 13-05 #1: un símbolo compartido que nombra el token propio de un shell se
    // rompe fuera de ese shell. Acá solo viajan nombres de scope.
    expect(CRM_SHELL_CLASS).not.toMatch(/--/)
    expect(CRM_SHELL_CLASS).not.toMatch(/crm-danger/)
    expect(CRM_SHELL_CLASS).not.toMatch(/var\(/)
  })
})

describe('portalScopeClass — sin scope no cambia un solo byte', () => {
  it('undefined → undefined (el caso del dashboard, del booking público y del landing)', () => {
    // ESTE es el test anti-regresión: fuera de un ShellScopeProvider el hook devuelve '' y el
    // helper devuelve undefined, así que cn() lo descarta y el className del popup queda igual
    // que antes de este plan. Si esto devolviera una string, todo diálogo de la app cambiaría.
    expect(portalScopeClass(undefined)).toBeUndefined()
  })

  it('cadena vacía → undefined (el default del contexto)', () => {
    expect(portalScopeClass('')).toBeUndefined()
  })

  it('solo espacios → undefined (no se cuela una clase fantasma en el className)', () => {
    expect(portalScopeClass('   ')).toBeUndefined()
  })

  it('CRM_SHELL_CLASS → exactamente CRM_SHELL_CLASS (el shell y el portal no pueden divergir)', () => {
    expect(portalScopeClass(CRM_SHELL_CLASS)).toBe(CRM_SHELL_CLASS)
  })
})
