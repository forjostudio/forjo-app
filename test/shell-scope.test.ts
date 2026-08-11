import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
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

// ── Cableado (lectura de fuentes) ────────────────────────────────────────────────────────────────
// El contrato puro de arriba puede estar verde con el helper DESCONECTADO — que es exactamente el
// estado en el que quedó el repo tras 14-01 y lo que la UAT de 14-07 encontró en pantalla. El
// entorno de Vitest de este repo es `node` (vitest.config.mts): no hay DOM, no hay Testing Library y
// el milestone prohíbe agregar paquetes, así que el cableado NO se puede probar renderizando. Se
// afirma leyendo el código fuente, mismo mecanismo que test/auth-email-templates.test.ts.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/**
 * Marca de MONTAJE del proveedor, armada por concatenación para que ESTE archivo no se matchee a sí
 * mismo en el barrido de unicidad de más abajo. Por eso las aserciones que la usan construyen su
 * regex con `new RegExp(...)` en vez de escribirla literal.
 */
const MARCA = '<' + 'ShellScopeProvider'

/**
 * Todos los .ts/.tsx del repo (excluidas dependencias, artefactos de build y directorios ocultos).
 * Es el `grep -rln` del audit llevado a test: sin él, "se monta en un solo lugar" es una afirmación
 * sobre el archivo que a alguien se le ocurrió mirar, no un invariante.
 */
function fuentesDelRepo(dir = process.cwd(), acc: string[] = []): string[] {
  const IGNORAR = new Set(['node_modules', 'coverage', 'supabase', 'public'])
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || IGNORAR.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) fuentesDelRepo(full, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(full)
  }
  return acc
}

describe('cableado del scope portaleado (regresión del gap 1 de 14-VERIFICATION.md)', () => {
  const dialog = read(join('components', 'ui', 'dialog.tsx'))
  const crmLayout = read(join('app', '(crm)', 'layout.tsx'))
  const riskBadge = read(join('components', 'crm', 'risk-badge.tsx'))
  const dashboardLayout = read(join('app', '(dashboard)', 'layout.tsx'))

  it('DialogContent consume el scope del shell activo', () => {
    // Previene: que alguien borre el hook y el popup vuelva a montarse sin los tokens del shell.
    expect(dialog).toMatch(/const\s+\w+\s*=\s*useShellScope\(\)/)
  })

  it('el scope se aplica sobre el POPUP mismo, no sobre el backdrop ni sobre un descendiente', () => {
    // Previene la regresión exacta: el `className` del Popup portaleado vuelve a quedar sin el
    // scope y, dentro de los ConfirmDialog del CRM, "Alto" y "Medio" se ven del mismo color otra
    // vez. También fija la superficie correcta: el backdrop no consume ninguna custom property del
    // shell, así que aplicárselo sería peso muerto.
    //
    // La aserción se acota al BLOQUE del Popup (WR-A4). Antes era
    // `dialog.lastIndexOf('portalScopeClass(') > popupAt`, que se conforma con "en algún lugar
    // después del marcador": mover el scope al DialogHeader, al DialogFooter o al DialogTitle
    // —regresiones plausibles, porque "se sigue viendo distinto"— dejaba la suite VERDE mientras el
    // popup perdía los tokens. Y `lastIndexOf` sobre el archivo entero se satisface con un COMENTARIO
    // que mencione el helper. Acá el scope tiene que estar dentro del `cn()` del propio Popup.
    const overlayAt = dialog.indexOf('data-slot="dialog-overlay"')
    const popupAt = dialog.indexOf('data-slot="dialog-content"')
    expect(overlayAt).toBeGreaterThan(-1)
    expect(popupAt).toBeGreaterThan(overlayAt)

    // El bloque del Popup: desde su data-slot hasta el spread de props que lo cierra.
    const propsAt = dialog.indexOf('{...props}', popupAt)
    expect(propsAt).toBeGreaterThan(popupAt)
    const popupBlock = dialog.slice(popupAt, propsAt)
    expect(popupBlock).toMatch(/className=\{cn\(\s*portalScopeClass\(\w+\)/)

    // El bloque del backdrop (entre su data-slot y el del popup) queda limpio.
    expect(dialog.slice(overlayAt, popupAt)).not.toContain('portalScopeClass(')
  })

  it('el layout del CRM importa la constante del shell y monta el proveedor', () => {
    // Previene: que el proveedor se caiga del layout y el portal se quede sin scope aunque el
    // Dialog siga consumiendo el hook (el fix necesita las dos mitades).
    expect(crmLayout).toMatch(/import\s*\{[^}]*CRM_SHELL_CLASS[^}]*\}\s*from\s*['"]@\/lib\/shell-scope['"]/)
    expect(crmLayout).toMatch(new RegExp(`${MARCA}\\s+scope=\\{CRM_SHELL_CLASS\\}`))
  })

  it('el wrapper del shell del CRM usa la constante y NO reescribe las clases como literal', () => {
    // Previene la divergencia: si el wrapper volviera a llevar las clases a mano, alguien podría
    // cambiar una sola de las dos superficies y el modal dejaría de verse como el shell.
    expect(crmLayout).toMatch(/<div className=\{[^}]*CRM_SHELL_CLASS/)
    expect(crmLayout).not.toMatch(/className="[^"]*crm-shell/)
  })

  it('RiskBadge sigue resolviendo el peligro por la indirección compartida y "alto" ≠ "medio" (D-05/D-07)', () => {
    // Previene reabrir el gap 13-05 #1: un componente compartido que nombra el token propio de un
    // shell se rompe fuera de ese shell. Y fija la premisa del fix del portal: si las dos variantes
    // apuntaran al mismo token, arreglar la herencia no alcanzaría para distinguirlas.
    expect(riskBadge).toMatch(/alto:\s*'[^']*var\(--danger\)/)
    expect(riskBadge).toMatch(/medio:\s*'[^']*bg-primary/)
    expect(riskBadge).not.toMatch(/crm-danger/)
    expect(riskBadge).not.toMatch(/var\(--destructive\)/)
  })

  it('anti-fuga: el layout del dashboard NO monta el proveedor de scope', () => {
    // Previene T-14-32 (confusión de superficie): si el dueño heredara el scope del super-admin,
    // su panel se vería con el chrome del CRM y podría creer que está en otra superficie.
    expect(dashboardLayout).not.toContain('ShellScopeProvider')
    expect(dashboardLayout).not.toContain('crm-shell')
  })

  it('anti-fuga EXHAUSTIVA: el proveedor se monta SOLO donde está registrado (WR-A3)', () => {
    // El test de arriba mira UN archivo, pero el invariante es "un solo lugar de montaje". Montarlo
    // en app/[slug]/layout.tsx, en app/layout.tsx, en un componente compartido de components/dashboard
    // o en cualquier *-client.tsx pasaba sin un solo test rojo — y con eso alcanza para que TODOS los
    // diálogos de esa superficie tomen el chrome del super-admin (T-14-32 exacto). Acá se afirma la
    // UNICIDAD recorriendo el repo, que es el criterio (`grep -rln`) que el audit usó a mano.
    //
    // Los dos montajes legítimos, y por qué son dos:
    //   - app/(crm)/layout.tsx                      → PUBLICA el shell del super-admin.
    //   - app/(crm)/admin/negocios/[id]/ver/page.tsx → lo APAGA (scope vacío) porque esa sub-página
    //     escapa del shell a propósito (D-12): lo portaleado tiene que escapar con ella (WR-A5).
    // Cualquier tercero es una fuga hasta que se demuestre lo contrario.
    const MONTAJES_ESPERADOS = [
      'app/(crm)/admin/negocios/[id]/ver/page.tsx',
      'app/(crm)/layout.tsx',
    ]
    const montajes = fuentesDelRepo()
      .filter((f) => readFileSync(f, 'utf8').includes(MARCA))
      .map((f) => relative(process.cwd(), f).replace(/\\/g, '/'))
      .sort()
    expect(montajes).toEqual(MONTAJES_ESPERADOS)

    // Y el único que publica un scope NO vacío es el layout del CRM: el de la impersonación tiene que
    // seguir apagándolo, no heredarlo.
    // La regex también se arma con MARCA, por lo mismo: escribirla literal haría que este archivo
    // apareciera en la lista de montajes de arriba.
    const ver = read(join('app', '(crm)', 'admin', 'negocios', '[id]', 'ver', 'page.tsx'))
    expect(ver).toMatch(new RegExp(`${MARCA}\\s+scope=""\\s*>`))
  })
})
