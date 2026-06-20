import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { loadImpersonationData } from '@/lib/impersonation'
import { PaletteScript } from '@/components/palette-script'

/**
 * Sub-página de impersonación read-only (/admin/negocios/[id]/ver) — IMP-01/IMP-02/IMP-03.
 *
 * D-01: vista DEDICADA bajo /admin. El operador conserva su propia sesión admin y SOLO LEE datos del
 * otro negocio; no se reusa el dashboard real del cliente con su sesión ni una cookie de impersonación.
 *
 * Aislamiento (calca el comentario de [id]/page.tsx:9-19): el id viene de la URL (cliente) pero NO es
 * autorización — la garantía es requireAdmin. La lectura cross-tenant va con service-role acotado por
 * business_id, centralizada en loadImpersonationData (lib/impersonation.ts). Cero write paths en este
 * árbol (D-02): este loader no declara ninguna server action de mutación ni cliente browser.
 */

export default async function VerPage({ params }: { params: Promise<{ id: string }> }) {
  // (1) requireAdmin() PRIMERA operación: re-valida en el loader, NO confía solo en el guard del
  //     layout (crm) — un acceso directo por URL/route invocada no necesariamente pasa por él (Pitfall 2).
  const actor = await requireAdmin()

  // (2) Next 16: params es un Promise → await.
  const { id } = await params

  // (3) Lectura read-only cross-tenant acotada por business_id (negocio por id).
  const data = await loadImpersonationData(id)

  // (4) Negocio inexistente → 404, ANTES de auditar la vista (no se cuenta una vista de algo que no existe).
  if (!data.business) notFound()

  // #2 TRAIL COMPLETO (producto multi-operador): se audita CADA carga del loader, no solo la entrada
  // por botón. POR QUÉ acá y no solo en la action startImpersonation: el acceso directo por URL
  // (bookmark/historial) que NO pasa por el botón también debe dejar traza — no existe forma de ver
  // datos del tenant sin auditoría. La fila de entrada (user.impersonate, con motivo) y la(s) fila(s)
  // de vista (user.impersonate.view, risk='medio', sin motivo) son complementarias. Aceptamos un
  // sobre-conteo menor por refresh/prefetch — /ver es ruta autenticada dinámica (requireAdmin +
  // service-role la hacen no-prefetchable de forma agresiva); si en el futuro genera ruido se
  // deduplica por (actor, business, minuto). logAudit es best-effort: NO rompe el render si falla.
  await logAudit({
    actorId: actor.id,
    action: 'user.impersonate.view',
    targetType: 'business',
    targetId: id,
    businessId: id,
    risk: 'medio',
  })

  const { business } = data

  // D-12 + Pitfall 4 (escape del dark shell): el layout (crm) envuelve TODO en `<div className="dark
  // crm-shell">` — lo opuesto a lo que pide D-12 (ver LO QUE VE EL CLIENTE, su paleta, no el chrome
  // dark del CRM). PaletteScript setea data-palette/theme/font del negocio impersonado en <html>; el
  // wrapper full-bleed de abajo lleva `.impersonation-view` (globals.css), que RE-DECLARA los neutrales
  // LIGHT para neutralizar los neutrales dark heredados de `.dark` — el acento sale del data-palette del
  // negocio. Los offsets negativos (-mx/-my) sacan el contenido del padding del <main> del CRM para que
  // la vista del cliente sea full-bleed.
  return (
    <>
      <PaletteScript palette={business.palette} theme={business.theme} font={business.font} />
      <div className="impersonation-view -mx-4 -my-6 min-h-screen bg-background text-foreground lg:-mx-6">
        <div className="p-4 sm:p-6 lg:p-8">
          <h1 className="text-2xl font-semibold">{business.name}</h1>
          {/* Plan 03-02: ImpersonationBanner + renderers read-only por sección */}
        </div>
      </div>
    </>
  )
}
