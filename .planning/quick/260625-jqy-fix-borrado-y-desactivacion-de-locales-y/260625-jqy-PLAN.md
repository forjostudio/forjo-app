---
phase: quick-260625-jqy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(dashboard)/settings/settings-client.tsx
autonomous: true
requirements:
  - QUICK-260625-jqy
must_haves:
  truths:
    - "Borrar un local pide confirmación (ConfirmDialog) antes de ejecutar"
    - "Borrar un servicio pide confirmación (ConfirmDialog) antes de ejecutar"
    - "Si el borrado falla por FK (turnos asociados, error 23503) la UI NO quita el item y muestra un mensaje claro sugiriendo desactivar"
    - "Un borrado exitoso persiste: el item no reaparece al refrescar"
    - "Existe un botón 'Desactivar/Activar' para locales (soft-disable vía locations.is_active), análogo al de servicios"
    - "Se puede editar un servicio (nombre, duración, precio y consultorios donde se ofrece) reusando el form de alta"
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      provides: "CRUD de servicios y locales con confirmación de borrado, manejo de error FK, soft-disable de locales y edición de servicios"
      contains: "ConfirmDialog"
  key_links:
    - from: "app/(dashboard)/settings/settings-client.tsx"
      to: "supabase.from('locations'/'services')"
      via: "delete/update con .eq('business_id', business.id) y chequeo de error"
      pattern: "\\.delete\\(\\).*\\.eq\\('business_id'"
---

<objective>
Arreglar el CRUD de Servicios y Locales (consultorios) en el dashboard, que viven ambos en `app/(dashboard)/settings/settings-client.tsx` (renderizado por `/servicios` y `/consultorios` vía la prop `view`).

Tres cosas:
1. BUG de borrado (locales y servicios): hoy borra optimista sin confirmar ni chequear error → al refrescar reaparece. Agregar confirmación con el `ConfirmDialog` del proyecto y manejar el error real.
2. FEATURE: "Desactivar/Activar" local (soft-disable vía `locations.is_active`), análogo al de servicios.
3. FEATURE: editar un servicio (nombre, duración, precio, consultorios) reusando el form de alta.

Purpose: que el dueño pueda gestionar de verdad sus locales y servicios sin perder confianza en la UI (borrados que no persisten) y sin romper la integridad referencial con los turnos.
Output: `settings-client.tsx` modificado.
</objective>

<diagnosis>
## Causa raíz del bug de borrado (CONFIRMADA leyendo código + schema, no asumida)

NO es RLS. Las policies `business access` (locations, schema.sql:1179) y `business member access` (services, schema.sql:1227) son `USING (business_id IN (negocios del owner))` para TODOS los comandos, así que el DELETE del dueño sobre SUS filas pasa RLS.

ES una **violación de foreign key (Postgres 23503)**. En `supabase/schema.sql`:
- `appointments_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id)` — SIN cláusula `ON DELETE` (línea 912) → por defecto NO ACTION/RESTRICT.
- `appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id)` — SIN cláusula `ON DELETE` (línea 922) → por defecto NO ACTION/RESTRICT.

Si un local o servicio tiene CUALQUIER turno (appointment) que lo referencia, el `DELETE` falla con 23503. (Forjo Barbers / estudio-test tiene turnos de prueba → por eso reaparece siempre.)

El código cliente IGNORA ese error:
- `deleteService` (settings-client.tsx:360-364): `await supabase...delete()...` sin capturar `error`, luego `setServices(filter)` + `toast.success`. El error de DB se descarta; la UI quita el item; al refrescar, el server vuelve a traer la fila que NUNCA se borró.
- `deleteLocation` (settings-client.tsx:534-538): idéntico patrón.

Nota de diseño: NO se debe cambiar el FK a `ON DELETE CASCADE` (borraría turnos = pérdida de historial/integridad de pagos). La política correcta es: si hay turnos, BLOQUEAR el borrado y sugerir desactivar. El soft-disable de locales ya está soportado end-to-end (la página pública `app/[slug]/page.tsx:69` filtra `is_active.is.null,is_active.eq.true`), y el de servicios ya funciona vía la vista `public_services` (`WHERE active = true`). Por eso este fix es solo de capa cliente: ninguna migración SQL.
</diagnosis>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.claude/CLAUDE.md
@AGENTS.md

# CRUD de servicios y locales (ambas vistas viven acá)
@app/(dashboard)/settings/settings-client.tsx

# ConfirmDialog reutilizable del proyecto (props: open, onOpenChange, title, description, risk, confirmLabel, destructive, onConfirm)
@components/crm/confirm-dialog.tsx

# Skills obligatorias del proyecto (multi-tenant + convenciones)
@.claude/skills/supabase-multitenant-rls/SKILL.md
@.claude/skills/convenciones-forjo/SKILL.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix borrado de servicios y locales — confirmación + manejo de error FK (sin borrado optimista)</name>
  <files>app/(dashboard)/settings/settings-client.tsx</files>
  <action>
Importar el `ConfirmDialog` del proyecto: `import { ConfirmDialog } from '@/components/crm/confirm-dialog'`.

Agregar estado para los dos diálogos de borrado (junto al resto de los useState de cada sección):
- Para servicios: `const [delService, setDelService] = useState&lt;Service | null&gt;(null)`.
- Para locales: `const [delLoc, setDelLoc] = useState&lt;Location | null&gt;(null)`.

Reescribir `deleteService(id)` (actual settings-client.tsx:360-364) para que: (a) NO sea optimista, (b) capture y chequee el error. Nueva forma — CAPTURAR error y filtrar por business_id (defensa en profundidad, igual que `deleteProfessional` que ya hace `.eq('id', id).eq('business_id', business.id)`):
  - `const { error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id)`
  - Si `error`: detectar FK violation por `error.code === '23503'` (foreign_key_violation de Postgres) y mostrar `toast.error('No se puede eliminar: el servicio tiene turnos asociados. Desactivalo en vez de borrarlo.')`; para cualquier otro error mostrar `toast.error('No se pudo eliminar el servicio')`. En AMBOS casos hacer `return` SIN tocar el estado `services` (no quitar el item).
  - Solo si NO hay error: `setServices(prev => prev.filter(s => s.id !== id))` y `toast.success('Servicio eliminado')`.
  - La función debe devolver/propagar para encajar con `onConfirm` del ConfirmDialog: hacer que `onConfirm` llame a esta lógica y, ante error, LANCE (throw) para que el dialog quede abierto (el dialog ya hace toast genérico + console.error y NO cierra ante throw — ver confirm-dialog.tsx handleConfirm). Como acá ya mostramos un toast específico, preferir cerrar el dialog igual: en `onConfirm` resolver normalmente (sin throw) tras mostrar el toast de error y limpiar `setDelService(null)`. Decisión: NO throw; mostrar toast específico y cerrar — el item simplemente sigue en la lista porque no se filtró del estado.

Reescribir `deleteLocation(id)` (actual settings-client.tsx:534-538) con el mismo patrón pero sobre `locations`, agregando `.eq('business_id', business.id)`, detectando `23503` con mensaje `'No se puede eliminar: el consultorio tiene turnos asociados. Desactivalo en vez de borrarlo.'` (usar `term`/`locWord` si querés el término del rubro, pero no es obligatorio), y `toast.success('Eliminado')` solo en éxito.

Cablear los botones de la papelera para que abran el ConfirmDialog en vez de borrar directo:
- Servicios (settings-client.tsx:1034): cambiar `onClick={() => deleteService(s.id)}` por `onClick={() => setDelService(s)}`.
- Locales (settings-client.tsx:1190): cambiar `onClick={() => deleteLocation(loc.id)}` por `onClick={() => setDelLoc(loc)}`.

Renderizar dos `ConfirmDialog` cerca del final del componente (junto a los otros Dialog, antes del cierre de `</div>` raíz). Props (ver contrato en confirm-dialog.tsx):
- Servicio: `open={!!delService}`, `onOpenChange={(o) => { if (!o) setDelService(null) }}`, `title="¿Eliminar servicio?"`, `description={delService ? \`Vas a eliminar "${delService.name}". Esta acción no se puede deshacer.\` : undefined}`, `risk="alto"`, `confirmLabel="Eliminar"`, `destructive`, `onConfirm={async () => { if (delService) { await deleteService(delService.id); setDelService(null) } }}`.
- Local: análogo con `delLoc`, `title="¿Eliminar ${locWord}?"` (interpolar `locWord`), `description` con `delLoc.name`, `risk="alto"`, `confirmLabel="Eliminar"`, `destructive`, `onConfirm` que llame `deleteLocation(delLoc.id)` y `setDelLoc(null)`.

GOTCHA del proyecto (respetar): el ConfirmDialog usa el cliente browser de Supabase directamente acá (NO server actions, NO `redirect()`), así que el toast espurio de `NEXT_REDIRECT` no aplica. No introducir server actions para esto.

Mantener todas las queries filtrando por `business_id` (aislamiento multi-tenant, skill supabase-multitenant-rls). No tocar `toggleService`, `addService`, `addLocation`, `saveEditLocation`, ni la lógica de la vista pública.
  </action>
  <verify>
    <automated>cd "c:/Users/franc/Desktop/Forjo Studio/forjo-app" && npx tsc --noEmit</automated>
  </verify>
  <done>
`npx tsc --noEmit` pasa. Los botones de papelera de servicios y locales abren un ConfirmDialog en vez de borrar al instante. Un borrado que falla por FK (23503) deja el item en la lista y muestra un toast claro sugiriendo desactivar; un borrado exitoso quita el item y persiste (no reaparece al refrescar). Todas las queries de delete filtran por `business_id`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Soft-disable de locales (toggle is_active) + edición de servicios reusando el form de alta</name>
  <files>app/(dashboard)/settings/settings-client.tsx</files>
  <action>
PARTE A — Desactivar/Activar local (análogo al `toggleService` de la línea 365-368, pero la columna en `locations` se llama `is_active`, NO `active`):

Agregar `async function toggleLocation(id: string, is_active: boolean)`:
  - `const { error } = await supabase.from('locations').update({ is_active }).eq('id', id).eq('business_id', business.id)`
  - Si `error`: `toast.error('Error al actualizar')`; `return`.
  - Si ok: `setLocations(prev => prev.map(l => l.id === id ? { ...l, is_active } : l))` y `toast.success(is_active ? 'Activado' : 'Desactivado')`.

En la fila de cada local (settings-client.tsx:1177-1193), agregar un botón "Desactivar/Activar" ANTES de los botones de editar/borrar, espejando el de servicios (settings-client.tsx:1031-1033):
  - `<Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => toggleLocation(loc.id, loc.is_active === false)}>{loc.is_active === false ? 'Activar' : 'Desactivar'}</Button>`
  - Reflejar el estado inactivo en el nombre con `line-through text-muted-foreground` cuando `loc.is_active === false` (igual que el servicio inactivo en :1028). Usar el chequeo `loc.is_active === false` para tratar `null`/`undefined` (locales viejos) como activos, consistente con el filtro de la página pública (`is_active.is.null,is_active.eq.true`).

Nota: la lista muestra `locations` (todos), no solo `activeLocations`; el contador `activeLocations.length` (:1170) ya cuenta solo activos — dejarlo. El público ya respeta `is_active` (app/[slug]/page.tsx:69) y los servicios ya filtran consultorios activos vía `activeLocations` (:513), así que un local desactivado deja de ofrecerse sin más cambios.

PARTE B — Editar servicio (reusar el form de alta: nombre, duración, precio, consultorios donde se ofrece):

Imitar el patrón de edición de local ya existente (`editLoc`/`openEditLocation`/`saveEditLocation`, :539-556) y el de profesional (dialog `editingPro`, :1452-1496).

Agregar estado:
  - `const [editSvc, setEditSvc] = useState&lt;Service | null&gt;(null)`
  - `const [editSvcForm, setEditSvcForm] = useState&lt;{ name: string; duration_minutes: number; price: number; location_ids: string[] }&gt;({ name: '', duration_minutes: 30, price: 0, location_ids: [] })`
  - `const [savingEditSvc, setSavingEditSvc] = useState(false)`

`function openEditService(s: Service)`: setear `editSvc = s` y poblar el form desde `s` usando el helper existente `serviceLocSet(s)` (:370) para los consultorios: `setEditSvcForm({ name: s.name, duration_minutes: s.duration_minutes, price: Number(s.price), location_ids: serviceLocSet(s) })`.

`async function saveEditService()`:
  - Guard: `if (!editSvc || !editSvcForm.name.trim()) return`.
  - `setSavingEditSvc(true)`.
  - Payload: `{ name: editSvcForm.name.trim(), duration_minutes: editSvcForm.duration_minutes, price: editSvcForm.price, location_ids: editSvcForm.location_ids.length ? editSvcForm.location_ids : null, location_id: null }` (normaliza igual que `setServiceLocations`/`addService`: array vacío → null = "todos", y limpia el legacy `location_id`).
  - `const { error } = await supabase.from('services').update(payload).eq('id', editSvc.id).eq('business_id', business.id)`
  - `setSavingEditSvc(false)`; si `error`: `toast.error('Error al guardar')`; `return`.
  - Éxito: `setServices(prev => prev.map(s => s.id === editSvc.id ? { ...s, ...payload } : s))`, `setEditSvc(null)`, `toast.success('Servicio actualizado')`.

En la fila de cada servicio (settings-client.tsx:1031-1036), agregar un botón de editar (icono `Pencil`, ya importado en :20) ANTES del de papelera, espejando el de local (:1187-1189): `<Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8" onClick={() => openEditService(s)} aria-label={\`Editar ${s.name}\`}><Pencil className="w-4 h-4" /></Button>`.

Agregar un `<Dialog>` de edición de servicio (espejar el de local :1216-1228 y el de profesional). Dentro: inputs para Nombre, Min. (number) y Precio (number) controlados por `editSvcForm`, y — si `activeLocations.length > 0` — los chips "Todos" + un chip por cada `activeLocations` para togglear `editSvcForm.location_ids` (reusar exactamente el patrón de chips del form de alta, :1070-1083: "Todos" setea `location_ids: []`, cada chip agrega/quita su id). Footer: botón "Guardar" con `onClick={saveEditService}` y `disabled={savingEditSvc || !editSvcForm.name.trim()}`. Abrir con `open={!!editSvc}` / `onOpenChange={o => { if (!o) setEditSvc(null) }}`.

Reglas del proyecto: todas las queries con `.eq('business_id', business.id)`; usar tokens de diseño/componentes ya presentes (Button, Input, Label, Dialog, chips existentes); NO crear componentes nuevos ni dependencias. Mantener consistencia visual con los forms hermanos (alta de servicio, edición de local).
  </action>
  <verify>
    <automated>cd "c:/Users/franc/Desktop/Forjo Studio/forjo-app" && npx tsc --noEmit && npx eslint "app/(dashboard)/settings/settings-client.tsx"</automated>
  </verify>
  <done>
`npx tsc --noEmit` y `eslint` del archivo pasan. La sección de Locales muestra un botón Desactivar/Activar que persiste `is_active` y tacha el nombre cuando está inactivo. La sección de Servicios muestra un botón de editar (lápiz) que abre un dialog para cambiar nombre, duración, precio y consultorios, y guarda con `.eq('business_id', business.id)`. Un local desactivado deja de ofrecerse en el booking público (ya filtrado por `is_active`).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser (dueño autenticado) → Supabase (anon key + RLS) | El dashboard usa el cliente browser; toda mutación cruza RLS + filtro explícito por `business_id` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jqy-01 | Tampering | delete/update de services y locations desde el browser | mitigate | Cada query lleva `.eq('business_id', business.id)` además de la RLS owner-only ya existente (`business access` / `business member access`). Un id de otro tenant no matchea y no muta nada. |
| T-jqy-02 | Information Disclosure | mensaje de error de borrado | accept | El mensaje "tiene turnos asociados" no revela datos de otro negocio; solo informa la condición FK del propio item. |
| T-jqy-03 | Tampering | reactivar/borrar saltando el ConfirmDialog (request directo) | accept | El dialog es UX/refuerzo; la garantía real es RLS + `business_id` server-side (Postgres). Saltarlo no permite tocar datos ajenos. |
</threat_model>

<verification>
- `npx tsc --noEmit` pasa (sin errores de tipos).
- `npx eslint "app/(dashboard)/settings/settings-client.tsx"` pasa (Core Web Vitals + TS preset de Next).
- Revisión de grep: ningún `deleteService`/`deleteLocation`/`toggleLocation`/`saveEditService` ejecuta mutación sin `.eq('business_id', business.id)`.
</verification>

<success_criteria>
- Borrar local o servicio pide confirmación con el ConfirmDialog del proyecto.
- Borrado que falla por FK (turnos asociados) NO quita el item de la UI y muestra un mensaje claro sugiriendo desactivar.
- Borrado exitoso persiste (no reaparece al refrescar).
- Locales tienen toggle Desactivar/Activar (soft-disable vía `is_active`), respetado por el booking público.
- Servicios se pueden editar (nombre, duración, precio, consultorios) reusando el patrón del form de alta.
- Aislamiento multi-tenant intacto: todas las mutaciones filtran por `business_id`.
</success_criteria>

<uat_note>
UAT manual (el usuario verifica visualmente en estudio-test / Forjo Barbers):
1. /servicios → papelera de un servicio CON turnos → confirma → debe quedar en la lista con toast "tiene turnos asociados". Crear un servicio nuevo SIN turnos → borrarlo → desaparece y NO reaparece al refrescar (F5).
2. /servicios → lápiz de un servicio → cambiar nombre/min/precio/consultorios → Guardar → cambios visibles y persistentes tras refrescar.
3. /consultorios → "Desactivar" un local → nombre tachado, contador baja; abrir la página pública /estudio-test → ese local ya no se ofrece. "Activar" lo vuelve a habilitar.
4. /consultorios → papelera de un local CON turnos → confirma → queda en la lista con mensaje claro. Un local nuevo SIN turnos se borra y persiste.
</uat_note>

<output>
Create `.planning/quick/260625-jqy-fix-borrado-y-desactivacion-de-locales-y/260625-jqy-SUMMARY.md` when done
</output>
