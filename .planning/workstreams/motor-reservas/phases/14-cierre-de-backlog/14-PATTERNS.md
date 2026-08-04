# Phase 14: Cierre de backlog — Mapa de patrones

**Mapeado:** 2026-08-04
**Archivos a tocar:** 11 (10 modificados + 2 nuevos: componente compartido de píldoras + migración 066)
**Analogías encontradas:** 11 / 11 (todo tiene molde en el repo — esta fase no inventa ningún patrón)

> Sin RESEARCH.md. Fuente única = `14-CONTEXT.md`. Este documento **no repite** el CONTEXT: aporta
> (1) la **auditoría real** de POLISH-04 causa 2, (2) los **excerpts literales** de los moldes a copiar,
> y (3) **correcciones de números de línea** verificados contra el código de hoy.

---

## Clasificación de archivos

| Archivo nuevo/modificado | Rol | Flujo de datos | Analogía más cercana | Calidad |
|---|---|---|---|---|
| `app/(dashboard)/settings/settings-client.tsx` | client component | CRUD | (sí mismo, `:1568`) | exacta |
| `app/(dashboard)/agenda/agenda-client.tsx` | client component | CRUD | `abonos-client.tsx:480` | exacta |
| `app/(dashboard)/abonos/abonos-client.tsx` | client component | CRUD | `settings-client.tsx` (2480-2522) | exacta |
| `app/(dashboard)/clients/clients-client.tsx` | client component | transform (lógica pura) | `settings-client.tsx:871-877` (counts) | rol |
| `components/dashboard/nuevo-turno-form.tsx` | component (form) | request-response | `appointments-client.tsx:275` | exacta |
| `components/dashboard/nuevo-abono-form.tsx` | component (form) | request-response | `appointments-client.tsx:275` | exacta |
| `components/crm/risk-badge.tsx` | component (UI) | — | `confirm-dialog.tsx` `confirmButtonClass()` | exacta |
| `components/dashboard/canchas-manager.tsx` | component (manager) | CRUD | `settings-client.tsx:1592-1624` | exacta |
| **NUEVO** `components/dashboard/<pills>.tsx` | component (UI compartido) | — | `settings-client.tsx:1594-1624` + `abonos-client.tsx:266-282` | exacta |
| `app/api/abonos/cancel-link/[id]/route.ts` | route handler | request-response | (sí mismo, paso 4) | exacta |
| **NUEVO** `supabase/migrations/066_*.sql` | migración | — | `065_service_snapshot_and_delete_gate.sql` §6 | exacta |

**Prohibido tocar:** `components/ui/card.tsx` (LEER, NO MODIFICAR — `:15` `flex flex-col` es transversal).
También queda fuera `app/(dashboard)/finances/finances-client.tsx` (diferido) y todo el motor de reservas.

---

## 1. POLISH-04 — Auditoría real (el CONTEXT delega esto al planner)

### 1.a Causa 1 — `w-full` explícito: los 10 casos **verificados hoy**

| Archivo | Línea | Texto / clase actual | Nota |
|---|---|---|---|
| `agenda/agenda-client.tsx` | 1035 | "Marcar como cerrado" · `className="w-full"` (`variant="destructive"`) | ⚠ vive en el **panel lateral angosto** de Días especiales (`div.space-y-2` dentro de una columna `lg:flex-row`) |
| `agenda/agenda-client.tsx` | 1037 | "Quitar excepción" · `className="w-full"` | ⚠ mismo panel angosto |
| `agenda/agenda-client.tsx` | 1047 | "Aplicar horario especial" · `className="w-full"` | ⚠ mismo panel angosto |
| `agenda/agenda-client.tsx` | 1156 | "Copiar a N días" · `className="w-full"` | ⚠ dentro de un `DialogContent` |
| `clients/clients-client.tsx` | 601 | "Importar CSV" · `className="w-full"` | ⚠ ver 1.c |
| `clients/clients-client.tsx` | 607 | "Nuevo cliente" · `className="w-full gap-1.5"` | CTA primario en fila propia |
| `components/dashboard/nuevo-turno-form.tsx` | 455 | "Usar existente" · `size="sm" variant="outline" className="w-full"` | dentro del aviso ámbar de dedupe |
| `components/dashboard/nuevo-turno-form.tsx` | 460 | "Crear nuevo cliente" · `size="sm" className="w-full gap-1.5"` | |
| `components/dashboard/nuevo-abono-form.tsx` | 417 | "Usar existente" · idéntico a nuevo-turno-form:455 | los dos forms son gemelos literales |
| `components/dashboard/nuevo-abono-form.tsx` | 422 | "Crear nuevo cliente" · idéntico a nuevo-turno-form:460 | |

**Todas las líneas del CONTEXT siguen siendo correctas post-Phase-13.** Ningún corrimiento.

**Molde de destino (ya en el repo, 3 ocurrencias):**

```tsx
// app/(dashboard)/appointments/appointments-client.tsx:275
<Button onClick={() => setDialogOpen(true)} className="gap-2 sm:w-auto w-full">
  <Plus className="w-4 h-4" /> Nuevo turno
</Button>

// app/(dashboard)/abonos/abonos-client.tsx:480
<Button variant="outline" size="sm" className="w-full gap-1.5 sm:w-auto" onClick={() => copyCancelLink(a)} disabled={copyingLink}>

// app/(dashboard)/abonos/abonos-client.tsx:492 (destructivo)
<Button variant="destructive" size="sm" className="w-full gap-1.5 sm:w-auto" …>
```

> Orden de clases no normalizado en el repo (`sm:w-auto w-full` vs `w-full … sm:w-auto`). Elegir uno y no
> tocar los existentes.

### 1.b Causa 2 — INVENTARIO REAL de `<Button>` estirados por el contenedor flex-column

Auditado con un parser de nesting JSX sobre `app/**` + `components/**` y verificado a mano caso por caso.
Criterio: `<Button>` **hijo directo** (DOM) de `<Card>` / `<CardContent>` (que son `flex flex-col` →
`align-items: stretch`) y **sin ninguna clase de ancho**.

| # | Archivo:línea | Texto del botón | Contenedor padre | Tipo (D-03) | Fix sugerido |
|---|---|---|---|---|---|
| 1 | `settings-client.tsx:1446` | "Guardar panel" (`size="sm"`) | `<Card className="p-6 space-y-3 mt-4">` (`:1429`) | footer de form de config | `self-start` |
| 2 | `settings-client.tsx:2165` | "Guardar" (Seña) | `<Card className="p-6 space-y-4">` (`:2142`) | footer de form · **caso reportado por el usuario** | `self-start` |
| 3 | `settings-client.tsx:2174` | "Liberar horarios vencidos" (`variant="outline"`) | `<Card className="p-6 space-y-3">` (`:2169`) | acción sobre card de config · **caso reportado** | `self-start` |
| 4 | `settings-client.tsx:2222` | "Conectar con MercadoPago" | `<Card>` (`:2183`), dentro de `{mpConnectEnabled && ( … )}` | acción sobre card | `self-start` |
| 5 | `settings-client.tsx:2282` | "Conectar Google Calendar" | `<Card>` (`:2256`), rama `else` del ternario `googleConnected` | acción sobre card | `self-start` |
| 6 | `settings-client.tsx:2325` | "Guardar" (Notificaciones) | `<Card>` (`:2293`) | footer de form | `self-start` |
| 7 | `settings-client.tsx:2359` | "Guardar" (reCAPTCHA) | `<Card>` (`:2332`) | footer de form | `self-start` |
| 8 | `settings-client.tsx:2392` | "Ver planes" (`variant="outline" size="sm"`) | `<Card className="p-6 space-y-3">` (`:2389`) | acción sobre card | `self-start` |
| 9 | `abonos/abonos-client.tsx:414` | "Guardar" (ventana de reserva) | `<Card>` (`:~395`) | footer de form | `self-start` |
| 10 | `agenda/agenda-client.tsx:946` | "Guardar" (ventana de reserva) | `<Card>` | footer de form | `self-start` |

**Ampliación real del alcance vs el CONTEXT:** los casos **9 y 10** están **fuera** de `settings-client.tsx`
(el CONTEXT solo citaba settings). Son los dos `saveWindow` gemelos de la ventana de reserva (v0.22) y
tienen exactamente el mismo síntoma.

**Descartados tras verificación** (parecían candidatos pero NO se estiran — su padre es un `div` de bloque
o un `div.flex` en fila): `settings-client.tsx` `:1485/:1488/:1494/:1498` (logo, dentro de `div.flex gap-2`),
`:1656/:1659/:1662` (fila de servicio, `div.flex items-center`), `:1709`, `:1854` y `:2116`
(`div.space-y-3`, bloque), `:2091`, `:2203`, `:2216`, `:2248`, `:2272/:2276`, `:2382/:2383` (`div.flex gap-2`);
`abonos-client.tsx:297` (empty state, `div` de bloque); `agenda-client.tsx:957` (`div.flex justify-between`);
`canchas-manager.tsx:244/247/250/283/356`; `onboarding/page.tsx:547/551`.

**Precedente literal a espejar** (validado en producción):

```tsx
// app/(dashboard)/settings/settings-client.tsx:1568 — hijo directo de <Card> (:1452)
<Button className="self-start" onClick={saveBusiness} disabled={savingBiz}>{savingBiz ? 'Guardando...' : 'Guardar cambios'}</Button>
```

### 1.c Riesgo de desincronización encontrado (no está en el CONTEXT)

`clients-client.tsx:595` es un `<a>` **estilizado como botón** que es hermano del `<Button>` de `:601`:

```tsx
// app/(dashboard)/clients/clients-client.tsx:594-603
<a … className={cn(buttonVariants({ variant: 'outline' }), 'w-full gap-1.5')} title="Exportar CSV">
  <Download className="w-4 h-4" /> Exportar CSV
</a>
<Button variant="outline" onClick={() => setImportOpen(true)} className="w-full">
  <Upload className="w-4 h-4" /> Importar CSV
</Button>
```

Si "Importar CSV" pasa a `w-full sm:w-auto` y el `<a>` de Exportar no, quedan **dos gemelos de distinto
ancho** dentro del mismo grid. El planner debe decidir explícitamente: tratar el `<a>` como parte del
lote, o dejar los dos como están.

---

## 2. EXTRA-A — Molde LITERAL de las píldoras Activos/Desactivados

### 2.a Fuente a extraer — Servicios (Phase 13, D-14)

**Constantes** (`settings-client.tsx:44-50`):

```tsx
// Filtro del listado de servicios (D-14). Los desactivados salen de la lista principal y viven en su
// propio tab: mezclados con el nombre tachado volvían pobre la salida que ofrece el modal de borrado.
type ServiceTab = 'activos' | 'desactivados'
const SERVICE_TABS: { key: ServiceTab; label: string }[] = [
  { key: 'activos', label: 'Activos' },
  { key: 'desactivados', label: 'Desactivados' },
]
```

**Estado + filtro + contadores** (`:520`, `:871-877`) — el invariante clave está en el comentario:

```tsx
const [serviceTab, setServiceTab] = useState<ServiceTab>('activos')

// El filtro y el contador llaman al MISMO predicado a propósito (molde de /abonos): si cada uno
// decidiera por su cuenta, el tab podría decir "Activos (1)" sobre una lista vacía.
const visibleServices = useMemo(() => manageableServices.filter(s => !!s.active === (serviceTab === 'activos')), [manageableServices, serviceTab])
const serviceTabCounts = useMemo(() => {
  const activos = manageableServices.filter(s => !!s.active).length
  return { activos, desactivados: manageableServices.length - activos }
}, [manageableServices])
```

**JSX de las píldoras** (`:1593-1609`) — clases exactas:

```tsx
{/* Píldoras de filtro (D-14), mismo molde visual que el filtro Archivados de /abonos. */}
<div className="flex gap-1 flex-wrap">
  {SERVICE_TABS.map(t => (
    <button
      key={t.key}
      type="button"
      onClick={() => setServiceTab(t.key)}
      aria-pressed={serviceTab === t.key}
      className={cn(
        'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
        serviceTab === t.key ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
      )}
    >
      {t.label} ({serviceTabCounts[t.key]})
    </button>
  ))}
</div>
```

**Empty state por tab** (`:1610-1624`) — borde punteado + icono + dos párrafos, con copy distinto por tab:

```tsx
{visibleServices.length === 0 ? (
  <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
    <Clock className="mx-auto h-6 w-6 text-muted-foreground" />
    {serviceTab === 'desactivados' ? (
      <>
        <p className="text-sm font-medium">No hay servicios desactivados</p>
        <p className="text-xs text-muted-foreground">Acá van a aparecer los que dejes de ofrecer: se conservan con todo su historial y los podés volver a activar cuando quieras.</p>
      </>
    ) : (
      <>
        <p className="text-sm font-medium">Todavía no tenés servicios activos</p>
        <p className="text-xs text-muted-foreground">Agregá el primero acá abajo para empezar a recibir reservas.</p>
      </>
    )}
  </div>
) : ( … )}
```

**Tercera ocurrencia** (la que justifica la extracción) — `abonos-client.tsx:58-61, 152-160, 266-282`:
píldoras idénticas clase por clase, con `ABONO_TABS` (`activos`/`archivados`) y el **mismo comentario**
sobre el predicado único. El icono del empty state es `Repeat` en vez de `Clock`.

**API sugerida** (discreción del planner, D-13): el componente debe recibir tabs+labels, la key activa,
el setter, y los contadores ya calculados — **el predicado de filtrado se queda en el call-site** (cada
pantalla tiene el suyo: `!!s.active` en Servicios/Canchas, `isAbonoActivo(a, counts)` en Abonos). El empty
state por tab conviene exponerlo como slot/render-prop: los copys son distintos y el icono también.

### 2.b Destino — estado actual de `canchas-manager.tsx`

- Lista única sin tabs: `canchas = canchasFromData(services, professionals, agendaSpaces)` (`:54`),
  render en `:229-263` dentro de `<Card className="p-6 space-y-4">` (`:221`) → `div.space-y-2` (`:223`).
- Empty state actual, **sin** borde punteado ni icono (`:224-228`) — a reemplazar por el molde de 2.a:
  ```tsx
  {canchas.length === 0 && (
    <p className="text-sm text-muted-foreground text-center py-4">
      Todavía no creaste ninguna cancha. Cargá la primera abajo.
    </p>
  )}
  ```
- **D-15 — el tachado a evaluar está en `:233`:**
  ```tsx
  <p className={cn('text-sm font-medium', !c.service.active && 'line-through text-muted-foreground')}>{c.service.name}</p>
  ```
  Servicios ya lo quitó con este comentario explícito (`settings-client.tsx:1645`):
  `{/* Sin tachado: en el tab "Desactivados" todos lo están, es ruido visual (D-14). */}` → **quitarlo**.
- Punto de inserción de las píldoras: entre `<Card>` (`:221`) y el `div.space-y-2` (`:223`). El toggle
  Activar/Desactivar por fila ya existe (`:244`, `toggleActive` en `:143-152`), y ya actualiza
  `service.active` + `professional.active` en el estado local → el tab se re-filtra solo.

⚠ **Serialización obligatoria:** el refactor toca `settings-client.tsx` en las mismas regiones que
POLISH-04 causa 2 (`:1446` está a 150 líneas de las píldoras). Cortar por región o serializar.

---

## 3. EXTRA-B — Moldes del gate en la base y del borrado con ConfirmDialog

### 3.a Migración 066 — calco de `065_service_snapshot_and_delete_gate.sql` §6

Forma idempotente + `RAISE EXCEPTION` con `ERRCODE 'P0001'` (excerpt reducido del original, líneas ~208-290):

```sql
-- ── 6. Gate de borrado de servicio (D-08, D-09, D-10) ─────────────────────────
-- El guard vive en la BASE, no en el cliente: el DELETE sale de `settings-client` con la sesión del
-- dueño + RLS (como el resto del CRUD de Ajustes), y el trigger corre dentro de la MISMA transacción
-- del DELETE. Eso cierra la ventana TOCTOU […]. El pre-check del modal (13-03) es UX, esto es la garantía.
CREATE OR REPLACE FUNCTION "public"."services_block_delete"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  -- 6.1 GUARD DE CASCADA (crítico). En un `DELETE FROM businesses` la fila padre se borra ANTES de
  -- que corran las acciones referenciales […]. Sin este guard, cerrar la cuenta de un negocio […]
  -- sería literalmente imposible, y `teardownOneTenant` rompería toda la suite de integración (T-13-07).
  IF OLD."business_id" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b."id" = OLD."business_id") THEN
    RETURN OLD;
  END IF;

  IF EXISTS ( … ) THEN
    -- Message = código de dominio FIJO, sin nombres, fechas ni conteos: el texto del RAISE llega al
    -- cliente y no debe filtrar datos del negocio (T-13-09). El modal (13-03) lo mapea a su copy.
    RAISE EXCEPTION 'service_has_future_appointments' USING ERRCODE = 'P0001';
  END IF;

  -- 6.4 `RETURN OLD` es OBLIGATORIO. Devolver NULL desde un trigger BEFORE DELETE CANCELA el borrado
  -- SIN error: PostgREST respondería 204 […] y la UI diría "eliminado" sin haber borrado nada (T-13-06).
  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."services_block_delete"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "services_block_delete_trg" ON "public"."services";

CREATE TRIGGER "services_block_delete_trg"
  BEFORE DELETE ON "public"."services"
  FOR EACH ROW EXECUTE FUNCTION "public"."services_block_delete"();

-- ── 7. Recargar el schema cache de PostgREST (obligatorio tras DDL) ───────────
NOTIFY pgrst, 'reload schema';
```

**Reglas del molde que la 066 debe replicar, sin excepción:**
1. `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` antes de `CREATE TRIGGER` → re-correr = no-op.
2. `SECURITY DEFINER SET search_path = public` (y por eso **RLS no aplica dentro**: todo predicado sobre
   otra tabla necesita su filtro por `business_id` explícito).
3. **Guard de cascada** análogo: sin él, `DELETE FROM businesses` (y `teardownOneTenant` de los tests de
   integración) se rompe. Para `abonos` el padre es `businesses` — mismo `NOT EXISTS`.
4. `RETURN OLD` al final, nunca `RETURN NULL`.
5. Message = **código de dominio fijo** (ej. `abono_is_active`), sin nombres ni fechas.
6. Cierre con `NOTIFY pgrst, 'reload schema';`.
7. Encabezado con el bloque "Qué hace / Qué NO hace / cómo se aplica a prod (a mano, última = 065)".

**Verificado (D-16):** `supabase/migrations/054_abonos.sql:106-107` — no hace falta migrar el FK.

```sql
-- on delete set null: borrar el abono NO borra los turnos ya generados, solo los desvincula.
ALTER TABLE "public"."appointments"
  ADD COLUMN IF NOT EXISTS "abono_id" uuid REFERENCES "public"."abonos"("id") ON DELETE SET NULL;
```

**RLS ya cubierta** (`054_abonos.sql:98-99`, espejada en `schema.sql:1809`) — no hace falta policy nueva:

```sql
DROP POLICY IF EXISTS "abonos tenant delete" ON "public"."abonos";
CREATE POLICY "abonos tenant delete" ON "public"."abonos" FOR DELETE USING (("business_id" IN ( SELECT "businesses"."id" …
```

### 3.b Flujo de borrado (13-03) — el molde completo de cliente

**(i) La función de borrado con mapeo `P0001` → dominio** (`settings-client.tsx:620-643`):

```tsx
// NO optimista: capturamos el error real. Defensa en profundidad con business_id […]. NO emite toast
// de error: el motivo se devuelve y lo traduce el modal, que sabe qué estado le estaba mostrando al
// dueño. `.select('id')` tampoco es cosmético: si la RLS filtra la fila, el DELETE vuelve sin error y
// con 0 filas — sin eso diríamos "Servicio eliminado" sin haber borrado nada.
async function deleteService(id: string): Promise<DeleteServiceResult> {
  const { data, error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id).select('id')
  if (error) {
    // Mapeo del rechazo del gate de la migr. 065 (molde: lib/booking-core.ts — message primero, code después).
    if (error.code === 'P0001' && error.message?.includes('service_has_future_appointments')) return { ok: false, error: 'has_future_appointments' }
    if (error.code === 'P0001' && error.message?.includes('service_has_active_abono')) return { ok: false, error: 'has_active_abono' }
    if (error.code === '23503') return { ok: false, error: 'has_future_appointments' }
    return { ok: false, error: 'unknown' }
  }
  if (!data || data.length === 0) return { ok: false, error: 'unknown' }
  setServices(prev => prev.filter(s => s.id !== id))
  toast.success('Servicio eliminado')
  return { ok: true }
}
```

Tipo del resultado (`:40-42`):
```tsx
type DeleteServiceResult = { ok: true } | { ok: false; error: 'has_future_appointments' | 'has_active_abono' | 'unknown' }
```

> **Nota de arquitectura para el planner:** el borrado de servicio va **directo por el browser client +
> RLS** (patrón del CRUD de Ajustes), no por route handler. La baja de abono (`confirmCancel`) sí usa
> `POST /api/abonos/cancel` porque cancela N turnos server-side. Para EXTRA-B, D-19 manda el molde de
> **13-03** (browser client + RLS + `.eq('business_id', …)` + `.select('id')`), que además cumple el
> requisito "nunca service-role".

**(ii) El `onConfirm` que LANZA ante el rechazo tardío del trigger** (`settings-client.tsx:2509-2521`):

```tsx
onConfirm={async () => {
  if (!delService) return
  const res = await deleteService(delService.id)
  if (!res.ok) {
    // Backstop del gate de la DB (D-10/D-11): alguien reservó entre el pre-check y el confirm. Hay
    // que LANZAR — el ConfirmDialog cierra el diálogo cuando onConfirm no lanza, y el rechazo se
    // tragaría en silencio. Con el throw el modal queda abierto y, con el pre-check refrescado, se
    // re-renderiza en estado bloqueado.
    await openDeleteService(delService)
    throw new Error(res.error)
  }
  setDelService(null)
  setDelInfo(null)
}}
```

**(iii) El ConfirmDialog de dos estados completo** (`settings-client.tsx:2484-2522`) — props clave:

```tsx
<ConfirmDialog
  open={!!delService}
  onOpenChange={(o) => { if (!o) { delReqRef.current++; setDelService(null); setDelInfo(null) } }}
  title="¿Eliminar servicio?"
  description={delDescription}
  risk="alto"
  confirmLabel="Eliminar"
  destructive
  hideConfirm={delInfo === null || delInfo === 'error' || delBlocked}
  secondaryAction={delBlocked && delService && delService.active ? { label: 'Desactivar', onClick: async () => { … } } : undefined}
  onConfirmError={(err) => {
    const motivo = err instanceof Error ? err.message : ''
    toast.error(motivo === 'has_future_appointments' ? '…' : motivo === 'has_active_abono' ? '…' : 'No se pudo eliminar el servicio')
  }}
  onConfirm={…}
/>
```

**(iv) El pre-check fail-closed** (`settings-client.tsx:533-582`) — patrones a copiar aunque el gate de
abonos sea más simple (`status = 'active'`, un solo count o incluso ninguno):
- `delInfo: {…} | 'error' | null` — `null` = contando, `'error'` = **sin verificar** ≠ desbloqueado.
- `delReqRef` (token de generación) para descartar respuestas tardías al cambiar de target.
- `delDescription` derivada **fuera del JSX** (los 4 estados), molde de `canchas-manager.tsx:208-214`.
- `delBlocked` como booleano único que apaga el botón Eliminar.
- "Hoy" siempre en hora AR: `new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })`.

**Molde más simple (sin pre-check)** si EXTRA-B no necesita contar nada — `canchas-manager.tsx:362-372`
o `settings-client.tsx:2523-2532` (`delLoc`).

### 3.c Estado actual de `abonos-client.tsx` (dónde entra el botón nuevo)

- **Tabs** (`:58-61`, `:145`): `type AbonoTab = 'activos' | 'archivados'`, `ABONO_TABS`, `tab` state.
- **Filtro y contadores** (`:153-160`): predicado único `isAbonoActivo(a, futureTurnoCounts)`.
  ⚠ "Archivado" **no** es `status === 'cancelled'` a secas: incluye `completed` sin turnos futuros. El gate
  de la 066 (D-18) rechaza solo `OLD.status = 'active'` → hay archivados **UI** cuyo `status` es `'active'`
  (un `completed`… no; pero un `active` con 0 turnos futuros sí puede caer en Archivados según
  `isAbonoActivo`). **El planner debe alinear el predicado de la UI con el del trigger** o el botón
  aparecerá sobre series que la base va a rechazar. Verificar `isAbonoActivo` en `lib/`.
- **Acciones actuales de una serie** (detalle, `:479-509`): "Copiar link de baja" (`:480`) + párrafo de
  ayuda (`:482`) — el bloque de POLISH-06/D-08 — y "Dar de baja" (`:488-501`) que se muestra solo si
  `a.status !== 'cancelled'`; si es cancelada, el `else` es el párrafo *"Serie dada de baja el … No genera
  turnos nuevos."* (`:504-507`). **Una serie archivada `cancelled` no tiene hoy ninguna acción** — ese es
  exactamente el hueco que llena EXTRA-B.
- **ConfirmDialog de la baja** (`:533-560`, nivel simple, sin `confirmWord`): molde de tono/estructura.
  Su `confirmCancel` (`:203-220`) documenta el contrato: *"Si algo falla se LANZA el error a propósito —
  el ConfirmDialog deja el diálogo abierto y muestra su toast"*.
- Tras el borrado: `router.refresh()` (molde `:219`) o filtrado del estado local.

---

## 4. POLISH-05 — RiskBadge `alto`

**Estado actual** (`components/crm/risk-badge.tsx:22-36` y `:50-66`):

```tsx
const riskBadgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-xs whitespace-nowrap',
  { variants: { risk: {
      alto: 'border-border bg-secondary text-foreground',              // ← :27, cambia
      medio: 'border-transparent bg-primary text-primary-foreground',
      bajo: 'border-border bg-secondary text-muted-foreground',
  } }, defaultVariants: { risk: 'bajo' } }
)
…
{/* Dot indicador: rojo --danger en alto, neutro en bajo, ninguno en medio […]. */}
{risk === 'alto' && (                                                   // ← :54-60, se elimina
  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--danger)' }} />
)}
```

**Molde de la clase de relleno de peligro** (`components/crm/confirm-dialog.tsx:190-200`) — usar
`--danger`/`--danger-foreground`, **nunca** `--crm-danger` (D-07):

```tsx
export function confirmButtonClass(destructive?: boolean): string {
  return destructive
    ? 'bg-[var(--danger)] text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)]'
    : ''
}
```

→ `alto: 'border-transparent bg-[var(--danger)] text-[var(--danger-foreground)]'`.
El badge **no** tiene hover, así que `--danger-hover` no aplica. Actualizar también el JSDoc del archivo
(`:14-17`) y el comentario del dot: describen el comportamiento viejo.

**Superficies a re-verificar visualmente (los 4 usos del panel + el CRM):** `abonos-client.tsx:551`,
`settings-client.tsx:2491` y `:2530`, `canchas-manager.tsx:368`, `/admin/auditoria`.
`plan-price-card.tsx` usa `risk="medio"` → no afectado.

---

## 5. POLISH-06 — endpoint + UI

**Query a la que se le suma el `.neq` (D-09)** — `app/api/abonos/cancel-link/[id]/route.ts:54-61`:

```tsx
// (4) Doble scoping: la serie se lee acotada por su id Y por el negocio del actor. Una columna sola.
const { data: abono } = await supabase
  .from('abonos')
  .select('cancel_token')
  .eq('id', id.trim())
  .eq('business_id', business.id)
  .maybeSingle()
if (!abono) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
```

**Forma exacta del 404 genérico ya usado 4 veces en el archivo** (`:37`, `:52`, `:61`, `:68`):
`Response.json({ ok: false, error: 'not_found' }, { status: 404 })`.
→ El caso "serie cancelada" debe usar **este mismo literal** (D-09: indistinguible de un id ajeno).
El único código distinto del archivo es `'unauthorized'` / 401 (`:44`) para sesión ausente.

**Bloque de UI a ocultar** — `abonos-client.tsx:479-483` (el `<Button>` **y** el `<p>` de ayuda):

```tsx
<div className="space-y-2 border-t border-border pt-4">
  <Button variant="outline" size="sm" className="w-full gap-1.5 sm:w-auto" onClick={() => copyCancelLink(a)} disabled={copyingLink}>
    <Copy className="w-3.5 h-3.5" /> {copyingLink ? 'Copiando...' : 'Copiar link de baja'}
  </Button>
  <p className="text-xs text-muted-foreground">Mandáselo por WhatsApp si tu cliente no tiene mail cargado: desde ese link puede darse de baja solo.</p>
  …
```

El guard `a.status !== 'cancelled'` ya existe 4 líneas más abajo (`:485`) para "Dar de baja" — reusar la
misma condición, no inventar otra.

---

## 6. POLISH-07 — `clients-client.tsx` (correcciones de línea)

| Qué | CONTEXT dice | **Real hoy** |
|---|---|---|
| `daysSinceLast … : 999` | `:405` | **`:402`** |
| `if (daysSinceLast > 45) status = 'paused'` | `:406` | `:406` ✓ |
| `getSuggestion` `> 60` | `:150` | `:150` ✓ |
| `STATUS_LABEL` (4 labels) | `:48-51` | `:48-51` ✓ |
| `FILTER_TABS` (4 labels) | `:54-57` | `:54-57` ✓ |

**Bloque a modificar** (`:394-413`):

```tsx
const clientStats = useMemo(() => {
  const now = new Date()
  return Object.fromEntries(clients.map(c => {
    const all = appts.filter(a => a.client_id === c.id)
    const confirmed = all.filter(a => ['confirmed', 'completed'].includes(a.status))
    const visits = confirmed.length
    const sorted = [...confirmed].sort((a, b) => b.date < a.date ? -1 : 1)
    const lastDate = sorted[0]?.date ?? null
    const daysSinceLast = lastDate ? differenceInDays(now, parseISO(lastDate)) : 999   // :402
    const totalSpend = confirmed.reduce((s, a) => s + apptServicePrice(a), 0)

    let status: StatusKey
    if (daysSinceLast > 45) status = 'paused'                                          // :406
    else if (visits >= 5) status = 'frequent'
    else if (visits >= 2) status = 'active'
    else status = 'new'

    return [c.id, { status, visits, lastDate, daysSinceLast, totalSpend }]
  }))
}, [clients, appts])
```

**Constantes a renombrar** (`:41-59` — el bloque completo, ojo con `STATUS_DOT` que NO cambia):

```tsx
const STATUS_DOT: Record<StatusKey, string> = { new: 'bg-red-400', active: 'bg-green-400', frequent: 'bg-yellow-400', paused: 'bg-gray-400' }
const STATUS_LABEL: Record<StatusKey, string> = { new: 'NUEVA', active: 'ACTIVA', frequent: 'FRECUENTE', paused: 'PAUSA' }
const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' }, { key: 'frequent', label: 'Frecuentes' },
  { key: 'active', label: 'Activas' }, { key: 'new', label: 'Nuevas' }, { key: 'paused', label: 'Pausa' },
]
```

**Molde de constante única de módulo** (D-11): el repo ya lo hace con `WINDOW_MIN_WEEKS`/`WINDOW_MAX_WEEKS`
(`abonos-client.tsx:225-226`) y con `SENTINEL`/`ALL_LETTERS` en este mismo archivo (`:60`). Naming:
`UPPER_SNAKE_CASE` a nivel de módulo → ej. `PAUSED_AFTER_DAYS = 60`, consumida en `:150` y `:406`.

**Testabilidad (code_context §Tests):** si se extrae la clasificación a un helper puro
(`lib/client-status.ts` con `classifyClient({ visits, daysSinceLast })`), queda unit-testeable sin DB.
Molde de helper puro extraído del client: `lib/staff-services.ts` (`isServiceCovered`,
`professionalsForService`), consumido en `settings-client.tsx:1634-1639`.

---

## Patrones transversales

### Aislamiento por tenant (aplica a EXTRA-B)
**Fuente:** `settings-client.tsx:626` · **Regla:** todo write del dashboard va por el browser client
(anon + RLS) **y además** `.eq('business_id', business.id)` **y además** `.select('id')` para detectar el
DELETE de 0 filas que la RLS filtró. Service-role prohibido en esta fase.

### Errores de dominio
**Fuente:** `cancel-link/[id]/route.ts` · `Response.json({ ok: false, error: '<snake>' }, { status })`.
En cliente: `P0001` + `message.includes('<codigo>')` → unión discriminada `{ ok } | { ok:false, error }`,
sin toast dentro de la función (lo traduce el modal).

### Comentarios
Denso, en español, explicando el **por qué** y citando la decisión (D-xx / WR-xx / T-xx-xx). Es el estándar
del workstream en los 3 archivos analizados — mantenerlo en todo lo nuevo.

### Operativo de migración
Numerada, idempotente, **a mano en prod** coordinada con el deploy + `NOTIFY pgrst, 'reload schema'`.
Última en prod = **065**. Local: `npx supabase db reset`. Regenerar `supabase/schema.sql` a mano, nunca
con `db dump`.

---

## Sin analogía

Ninguno. Los 11 archivos tienen molde directo en el repo.

---

## Metadata

**Alcance de la búsqueda:** `app/**`, `components/**`, `lib/**`, `supabase/migrations/**`
**Auditoría de POLISH-04 causa 2:** parser de nesting JSX sobre 100% de los `.tsx` de `app/` y `components/`,
+ verificación manual caso por caso de los 20 candidatos (10 confirmados, 10 descartados).
**Fecha:** 2026-08-04
