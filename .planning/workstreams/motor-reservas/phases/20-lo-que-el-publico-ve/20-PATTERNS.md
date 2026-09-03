# Phase 20: Lo que el público ve - Mapa de Patrones

**Mapeado:** 2026-09-03
**Archivos analizados:** 3 (2 modificados, 0 nuevos — sin migración, sin endpoint nuevo)
**Analogs encontrados:** 3 / 3

## Clasificación de archivos

| Archivo a modificar | Rol | Data Flow | Analog más cercano | Calidad del match |
|---|---|---|---|---|
| `app/[slug]/page.tsx` | RSC / data loader | CRUD (read-only, `Promise.all`) | mismo archivo — bloque `public_professional_services` (migr. 059, líneas 91-97) | exacto (mismo patrón, mismo archivo) |
| `app/[slug]/booking-client.tsx` (paso 1 — selector de servicio) | component (client) | request-response / UI-derive | mismo archivo — picker de consultorios paso 3 (líneas 655-681) | exacto (D-02 lo ordena copiar tal cual) |
| `app/[slug]/booking-client.tsx` (`openDaysSet`, D-04) | component (client) | transform | mismo archivo — `blocksForService` ya usado como firma en `lib/time-block-services.ts` | role-match (nueva derivación, mismo helper) |
| `test/time-block-services.test.ts` (extender) | test | unit | mismo archivo — Suite 2 `isServiceScheduled` (líneas 74-100) | exacto |

No hay archivos nuevos. No hay migración nueva (071/072 ya en prod). No hay endpoint nuevo.

## Pattern Assignments

### `app/[slug]/page.tsx` — sumar `public_time_block_services` al `Promise.all`

**Analog exacto (mismo archivo):** el bloque `public_professional_services`, líneas 91-97.

**Query pattern a copiar** (verificado, líneas 76-97 — contexto del `Promise.all`):
```tsx
// Source: app/[slug]/page.tsx:80-97 (VERIFICADO)
    supabase.from('public_services').select('*').eq('business_id', business.id),
    // Vista pública acotada (id, name, specialty) — no expone contacto/matrícula del staff.
    supabase.from('public_professionals').select('*').eq('business_id', business.id),
    supabase.from('time_blocks').select('*').eq('business_id', business.id),
    supabase.from('schedule_exceptions').select('date, closed, start_time, end_time, location_id').eq('business_id', business.id).gte('date', todayStr),
    supabase.from('locations').select('id, name, address, phone').eq('business_id', business.id).or('is_active.is.null,is_active.eq.true'),
    // Vista pública acotada (migración 044): canchas del vertical canchas con { id, business_id,
    // name, price, duration_minutes }, SIN service_id. Query aditiva y barata: para salud/belleza/
    // general devuelve [] (no hay canchas) y no afecta su render. La usa el gateo por vertical abajo.
    supabase.from('public_canchas').select('*').eq('business_id', business.id),
    // Vista pública acotada (migración 059): mapeo staff↔servicios (business_id, professional_id,
    // service_id), SIN abrir la tabla puente `professional_services` a anon (D-07). La consume
    // BookingClient con la regla del comodín (lib/staff-services) para gatear "Cualquiera" (≥2
    // capaces, D-02) y filtrar la lista al servicio elegido. Fail-safe: si la vista todavía no está
    // aplicada en la DB, el select devuelve []/error y el `|| []` lo neutraliza — el booking sigue
    // funcionando (sin la vista, "Cualquiera" simplemente no se gatea con precisión).
    supabase.from('public_professional_services').select('*').eq('business_id', business.id),
  ])
```

**Molde literal para la query nueva** (8vo elemento del array, mismo `Promise.all`, dentro del mismo `[` `]`):
```tsx
    // Vista pública acotada (migración 071 §3): mapeo franja↔servicio (business_id, time_block_id,
    // service_id), SIN abrir la tabla puente `time_block_services` a anon (misma regla que D-07 para
    // staff). La consume BookingClient con la regla del comodín (lib/time-block-services) para
    // deshabilitar en el selector el servicio sin ninguna franja que lo cubra (D-02/D-06/AGENDA-07) y
    // para filtrar los días clickeables del calendario al servicio elegido (D-04). Fail-safe: sin
    // filas ⇒ TODO servicio agendado (comodín) — degrada al comportamiento actual, nunca al revés.
    supabase.from('public_time_block_services').select('*').eq('business_id', business.id),
```

**Cómo se desestructura del `Promise.all`:** revisar el `const [...]` que recibe el array — agregar la variable en la misma posición que la query nueva (8va), con el mismo patrón `|| []` que las demás al pasarla como prop.

**Cómo viaja como prop** (mirror exacto de `professionalServices`, definición del tipo en `booking-client.tsx:31-34`):
```tsx
// Source: app/[slug]/booking-client.tsx:31-34 (VERIFICADO — la prop existente a espejar)
  // Mapeo staff↔servicios (vista acotada public_professional_services, migr. 059). Se interpreta con
  // la regla del comodín (lib/staff-services): 0 filas para un profesional = capaz de todos. Sirve
  // para filtrar la lista de profesionales al servicio elegido y gatear "Cualquiera" (≥2 capaces).
  professionalServices: ProfessionalService[]
```
→ Nueva prop (mismo molde): `timeBlockServices: TimeBlockService[]` (tipo ya existe en `lib/types.ts:179-183`, NO crear tipo nuevo — es espejo exacto de las 3 columnas de la vista).

**Consumo — precedente en el mismo `page.tsx`** (líneas 136-141, eje staff, para contraste — NO tocar esto, D-05 lo deja para otra tarea si se decide):
```tsx
// Source: app/[slug]/page.tsx:136-141 (VERIFICADO)
  // Gap UAT Phase 10: un servicio que NINGÚN profesional nombrado hace NO debe ofrecerse (hoy caía al
  // fallback "Sin preferencia" y se reservaba contra el sentinel). Filtramos la lista SOLO para el
  // selector de reserva con staff (BookingClient), aplicando la regla del comodín + la guarda de modo
  // sentinel (0 profesionales nombrados → todos los servicios, sin regresión). El catálogo del
  // LandingRenderer (superficie de marketing) NO se toca: sigue mostrando el catálogo completo.
  const staffBookableServices = bookableServices(services || [], professionals || [], professionalServices || [])
```
⚠ Este es el filtro `bookableServices` que la D-05 pide unificar (oculta hoy; pasa a deshabilitar-con-motivo). La lista que llega a `BookingClient` como `services` YA viene filtrada por este helper — el nuevo estado disabled de esta fase se aplica sobre esa lista ya filtrada (o, si D-05 se implementa, sobre la lista que `bookableServices` devuelva con el motivo adjunto en vez de ocultar).

---

### `app/[slug]/booking-client.tsx` — paso 1, selector de servicio (D-02 + D-05)

**Analog exacto (mismo archivo):** picker de consultorios, paso 3, líneas 655-681.

**Molde completo a copiar** (verificado carácter por carácter):
```tsx
// Source: app/[slug]/booking-client.tsx:655-681 (VERIFICADO)
        {step === 3 && needLocStep && !bookingLoc && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí el {locWord.toLowerCase()}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {bookableLocs.map(l => {
                const enabled = locHasBlocks(l.id)
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => { setBookingLoc(l.id); setSelectedDate(undefined); setSelectedTime('') }}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      enabled ? 'border-border bg-card hover:border-primary' : 'border-border/50 bg-secondary/30 opacity-60 cursor-not-allowed'
                    )}
                  >
                    <p className="font-semibold">{l.name}</p>
                    {l.address && <p className="text-sm text-muted-foreground mt-0.5">{l.address}</p>}
                    {l.phone && <p className="text-xs text-muted-foreground mt-0.5">{l.phone}</p>}
                    {!enabled && <p className="text-xs text-muted-foreground mt-1">Sin horarios disponibles</p>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
```

**Piezas trasladables exactas:**

| Pieza | Valor literal en el molde | Traducción para el paso 1 (servicio) |
|---|---|---|
| Estado | `const enabled = locHasBlocks(l.id)` | `const enabled = isServiceScheduled(service.id, timeBlocks, timeBlockServices)` |
| Deshabilitado | `disabled={!enabled}` sobre el `<button>` | igual |
| `type` | `type="button"` | agregar — el paso 1 hoy NO lo tiene (Pitfall 4) |
| Clases | `enabled ? 'border-border bg-card hover:border-primary' : 'border-border/50 bg-secondary/30 opacity-60 cursor-not-allowed'` | igual, PERO el paso 1 tiene un 3er estado (seleccionado) — `disabled` debe ganar sobre `selected` en la precedencia del `cn()` |
| Motivo | `{!enabled && <p className="text-xs text-muted-foreground mt-1">Sin horarios disponibles</p>}` | mismo texto o equivalente; D-05 pide un SEGUNDO motivo para el eje staff si se unifica |

**Estado actual del paso 1 a modificar** (el `<button>` NO tiene `type` ni `disabled`, el `onClick` avanza incondicional):
```tsx
// Source: app/[slug]/booking-client.tsx:539-575 (VERIFICADO)
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí tu servicio</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {services.map(service => (
                <button
                  key={service.id}
                  onClick={() => { setSelectedService(service); setBookingLoc(null); setSelectedDate(undefined); setSelectedTime(''); setStep(2) }}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    selectedService?.id === service.id
                      ? 'border-primary bg-primary/[0.06]'
                      : 'border-border bg-card hover:border-primary'
                  )}
                >
                  {/* … título + descripción a la izquierda; precio + duración a la derecha … */}
                </button>
              ))}
            </div>
          </div>
        )}
```
⚠ El `disabled` nativo del `<button>` ya cancela el `onClick` — no hace falta guard adicional en el handler (Pitfall 4). Con `disabled`, la rama `selectedService?.id === service.id` pasa a ser inalcanzable para un servicio deshabilitado (el `onClick` nunca corrió), así que el orden correcto del `cn()` es: `!enabled` primero, `selected` segundo, `default` último.

---

### `openDaysSet` — filtro por servicio a nivel día (D-04, HALLAZGO-01)

**Cómo se construye hoy** (sin noción de servicio):
```ts
// Source: app/[slug]/booking-client.tsx:183-184, 204-211 (VERIFICADO)
  const openDaysSet = useMemo(() => new Set(timeBlocks.map(b => b.day_of_week)), [timeBlocks])
  const isDayOpen = (d: Date) => {
    const ds = format(d, 'yyyy-MM-dd')
    const g = globalExcByDate.get(ds)
    if (g) return !g.closed
    return openDaysSet.has(d.getDay()) || locSpecialDates.has(ds)
  }
```

**Derivación a introducir** (usa el mismo helper `blocksForService`, no reimplementar nada — AGENDA-02):
```ts
// Molde de la derivación (research, sección HALLAZGO-01) — cuelga openDaysSet de esta lista en vez
// de timeBlocks directo:
const serviceBlocks = useMemo(
  () => (selectedService ? blocksForService(selectedService.id, timeBlocks, timeBlockServices) : timeBlocks),
  [selectedService, timeBlocks, timeBlockServices],
)
```
Reglas duras a respetar (research, Pitfall 3 y 6):
- Aplicar `serviceBlocks` SOLO en la rama `openDaysSet`/`weekly` (los días clickeables), nunca en `locHasBlocks` (que responde una pregunta de sede, no de servicio — Pitfall 6).
- No tocar `locSpecialDates`/`globalExcByDate` (vienen de `schedule_exceptions`, fuera del alcance del filtro — dejarlos exactamente como están).
- Sobre los slots visibles es un no-op demostrable; solo apaga días sin franja.

---

### `lib/time-block-services.ts` — la fuente única (NO SE TOCA, solo se consume)

**Firma exacta a importar y usar** (verificada, líneas 111-116):
```ts
// Source: lib/time-block-services.ts:111-116 (VERIFICADO)
export function isServiceScheduled<T extends { id: string }>(
  serviceId: string,
  blocks: T[],
  bridge: TimeBlockService[],
): boolean {
  return blocksForService(serviceId, blocks, bridge).length > 0
}
```

**Shape exacto que espera `bridge`** (mismo tipo de la prop nueva, `lib/types.ts:179-183`):
```ts
export interface TimeBlockService {
  business_id: string
  time_block_id: string
  service_id: string
}
```

**Genericidad relevante:** `isServiceScheduled`/`blocksForService` son genéricas sobre `T extends { id: string }` — aceptan `TimeBlock[]` completo (`timeBlocks` que ya tiene el cliente) sin cast.

**Regla del fail-safe (Pitfall 5 — CRÍTICO):** sin filas en `bridge` ⇒ `blocksForService` devuelve TODAS las franjas ⇒ `isServiceScheduled` es `true` para todo servicio. NUNCA agregar un guard tipo `if (bridge.length === 0) return false` — eso invierte la regla del comodín y apaga la agenda entera de negocios sin mapeo configurado.

---

### `test/time-block-services.test.ts` — molde de test a extender

**Estilo existente a copiar** (Suite 2, líneas 74-100):
```ts
// Source: test/time-block-services.test.ts:74-100 (VERIFICADO)
describe('isServiceScheduled — servicio sin franja que lo cubra (D-06)', () => {
  it('todas las franjas comodín: TODO servicio está agendado', () => {
    const blocks = [block('manana', '09:00', '13:00'), block('tarde', '14:00', '18:00')]
    expect(isServiceScheduled('corte', blocks, [])).toBe(true)
    expect(isServiceScheduled('ceramica', blocks, [])).toBe(true)
  })

  it('CONTROL NEGATIVO de 5: todas con mapeo explícito y ninguna marca el servicio ⇒ false (legal, sólo computable)', () => {
    const blocks = [block('manana', '09:00', '13:00'), block('tarde', '14:00', '18:00')]
    const bridge = [map('manana', 'corte'), map('tarde', 'color')]
    expect(isServiceScheduled('ceramica', blocks, bridge)).toBe(false)
    // no es un error: corte y color siguen agendados, el negocio opera igual (D-06)
    expect(isServiceScheduled('corte', blocks, bridge)).toBe(true)
    expect(isServiceScheduled('color', blocks, bridge)).toBe(true)
  })

  it('una sola franja comodín entre varias mapeadas vuelve a agendar todo', () => {
    const blocks = [block('manana', '09:00', '13:00'), block('tarde', '14:00', '18:00')]
    const bridge = [map('manana', 'corte')] // "tarde" queda comodín
    expect(isServiceScheduled('ceramica', blocks, bridge)).toBe(true)
    // y es consistente con blocksForService (fuente única)
    expect(isServiceScheduled('ceramica', blocks, bridge)).toBe(
      blocksForService('ceramica', blocks, bridge).length > 0,
    )
  })
})
```
Usar `block(...)` y `map(...)` (helpers de fixture ya definidos arriba en el mismo archivo) para las nuevas pruebas: cobertura del `serviceBlocks` derivado en el cliente (HALLAZGO-01) y del fail-safe del `bridge` vacío en el contexto del selector público. El planner NO debe inventar un estilo nuevo de fixture.

## Shared Patterns

### Vista pública acotada `public_*` (aislamiento por tenant)
**Source:** `supabase/migrations/071_time_block_services.sql:144-151` + `072_public_views_read_only.sql:103-106` (ya en prod)
**Aplica a:** la query nueva en `app/[slug]/page.tsx`
```sql
CREATE OR REPLACE VIEW "public"."public_time_block_services" AS
 SELECT "business_id", "time_block_id", "service_id"
   FROM "public"."time_block_services";
ALTER VIEW "public"."public_time_block_services" OWNER TO "postgres";

REVOKE ALL ON TABLE "public"."public_time_block_services" FROM "anon";
GRANT SELECT ON TABLE "public"."public_time_block_services" TO "anon";
```
El aislamiento efectivo lo pone el `.eq('business_id', business.id)` en el RSC — igual que las otras 6 vistas `public_*` ya usadas en el mismo archivo.

### Prop + helper puro (nunca `.filter()` inline en JSX)
**Source:** `app/[slug]/booking-client.tsx:31-34` (prop `professionalServices`) + `:138-140` (consumo con `professionalsForService`)
**Aplica a:** la prop nueva `timeBlockServices` — se interpreta SIEMPRE con `isServiceScheduled`/`blocksForService` de `lib/time-block-services.ts`, nunca reimplementando la regla del comodín en el componente (AGENDA-02).

### Fail-safe `|| []` en las queries del `Promise.all`
**Source:** patrón repetido en las 3 vistas `public_*` que ya consume `page.tsx` (`professionalServices || []`, etc.)
**Aplica a:** la query nueva — si la vista aún no responde, `|| []` degrada al comportamiento actual (comodín = todo agendado), nunca al revés.

## Sin analog (no aplica en esta fase)

Ninguno. Los tres archivos a tocar tienen analog exacto en el propio repo (dos de ellos en el mismo archivo que se modifica). No hay archivos nuevos, no hay migración nueva, no hay endpoint nuevo.

## Metadata

**Alcance de búsqueda de analogs:** `app/[slug]/page.tsx`, `app/[slug]/booking-client.tsx`, `lib/time-block-services.ts`, `lib/types.ts`, `test/time-block-services.test.ts`, `app/api/booking/availability/route.ts` (para coherencia, no se toca).
**Archivos escaneados:** 6 (todos verificados con `sed -n`/lectura directa; ninguno excede 2000 líneas en las secciones leídas).
**Fecha de extracción:** 2026-09-03
</content>
