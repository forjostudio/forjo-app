# Phase 10: Reservar con "cualquiera" desde la página pública - Pattern Map

**Mapped:** 2026-07-25
**Files analyzed:** 8 (1 create · 6 modify · 2 reference-only)
**Analogs found:** 8 / 8 (todos con analog exacto en el repo — es una fase de superficie sobre backend ya shipeado)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/059_public_professional_services.sql` (CREATE) | migration (vista acotada anon) | CRUD read-only | `supabase/migrations/044_public_canchas.sql` | exact (mismo molde de vista) |
| `app/[slug]/page.tsx` (MODIFY) | route/RSC server component | request-response (fetch paralelo → props) | self (bloque `Promise.all` existente, líneas 75-90) | exact (patrón interno) |
| `app/[slug]/booking-client.tsx` (MODIFY) | component (client wizard) | request-response / event-driven UI | self (step 2 líneas 472-506; fetch 220-242; submit 284-351) | exact (patrón interno) |
| `app/api/booking/availability/route.ts` (MODIFY) | controller (route handler) | request-response (agregación) | self (bucketing SENTINEL + siblingBusy + full, líneas 77-156) | exact (rama nueva junto al camino de hoy) |
| `app/api/booking/create/route.ts` (MODIFY) | controller (route handler) | request-response | self (parseo body 28-49; llamada core 151-166) | exact |
| `lib/booking-core.ts` (MODIFY→ninguno) | service (core rol-agnóstico) | CRUD/transform | self (`autoAssign` ya soportado, líneas 57, 90, 108-121) | exact — NO requiere cambios |
| `lib/email.ts` (MODIFY) | utility (templates de mail) | transform (HTML) | self (`sendConfirmationEmail` líneas 217-320) | exact |
| `app/api/notify/booking/route.ts` (MODIFY) | controller (route handler) | request-response | self (select 16-21; call site 46-65) | exact |
| `app/api/payment/webhook/[slug]/route.ts` (MODIFY) | controller (route handler) | event-driven (webhook MP) | self (select línea 110; call site 174-193) | exact |
| `app/[slug]/turno/[token]/page.tsx` (REFERENCE) | route/RSC | request-response | self | NO change (ya trae `professionals(name)`) |
| `components/booking/confirmation-view.tsx` (REFERENCE) | component | render | self (líneas 159-161) | NO change (ya renderiza "Profesional") |
| `app/[slug]/canchas-booking-client.tsx` (REFERENCE) | component (gemelo) | — | — | NO TOCAR (D-09/SC5) |

---

## Pattern Assignments

### `supabase/migrations/059_public_professional_services.sql` (CREATE — migration, vista acotada)

**Analog: `supabase/migrations/044_public_canchas.sql` (leído íntegro).** Copiar el molde EXACTO: owner `postgres` (definer), **sin** `security_invoker`, `GRANT ALL` a los 3 roles, idempotente (`CREATE OR REPLACE VIEW`). Fuente de la vista = la tabla puente `professional_services` (migr. 057).

**Molde a copiar** (`044_public_canchas.sql:44-64`):
```sql
CREATE OR REPLACE VIEW "public"."public_canchas" AS
 SELECT "p"."id", "p"."business_id", "p"."name", "s"."price", "s"."duration_minutes"
   FROM ("public"."professionals" "p"
     JOIN "public"."services" "s" ON (("s"."id" = "p"."service_id")))
  WHERE (("p"."service_id" IS NOT NULL) AND ("p"."active" = true) AND ("s"."active" = true));
ALTER VIEW "public"."public_canchas" OWNER TO "postgres";
GRANT ALL ON TABLE "public"."public_canchas" TO "anon";
GRANT ALL ON TABLE "public"."public_canchas" TO "authenticated";
GRANT ALL ON TABLE "public"."public_canchas" TO "service_role";
```

**Forma objetivo para 059** (3 columnas no sensibles, sin JOIN — la puente ya tiene las 3):
```sql
CREATE OR REPLACE VIEW "public"."public_professional_services" AS
 SELECT "business_id", "professional_id", "service_id"
   FROM "public"."professional_services";
ALTER VIEW "public"."public_professional_services" OWNER TO "postgres";
GRANT ALL ON TABLE "public"."public_professional_services" TO "anon";
GRANT ALL ON TABLE "public"."public_professional_services" TO "authenticated";
GRANT ALL ON TABLE "public"."public_professional_services" TO "service_role";
```

**Pitfall crítico a copiar del comentario de 044:23-25:** NO usar `security_invoker=true` — heredaría la RLS de `professional_services` (sin policy anon, migr. 057) → 0 filas para anon → "Cualquiera" nunca se muestra. El comodín (pro sin filas = capaz de todo) se preserva solo: un pro sin filas simplemente no aparece en la vista, y `professionalsForService` lo interpreta como comodín (cero backfill).

**Header/comentarios:** replicar el estilo de bloque-comentario denso en español de 044 (contexto, qué hace, reglas duras, qué NO hace: aplicación a mano + `NOTIFY pgrst, 'reload schema';` + regenerar `supabase/schema.sql`).

---

### `app/[slug]/page.tsx` (MODIFY — RSC, sumar lectura de la vista)

**Analog: self.** El `Promise.all` de líneas 75-90 ya lee las vistas acotadas. Agregar un select más, con el MISMO patrón `.eq('business_id', business.id)`:

**Bloque a extender** (`page.tsx:80-89`):
```ts
supabase.from('public_services').select('*').eq('business_id', business.id),
supabase.from('public_professionals').select('*').eq('business_id', business.id),
...
supabase.from('public_canchas').select('*').eq('business_id', business.id),
// AGREGAR:
supabase.from('public_professional_services').select('*').eq('business_id', business.id),
```

**Flujo de props** (`page.tsx:138-147`): pasar `professionalServices` SOLO a `<BookingClient>`, **NO** a `<CanchasBookingClient>` (D-09). El `bookingNode` para no-canchas es:
```tsx
<BookingClient
  business={business as unknown as PublicBusiness}
  services={services || []}
  professionals={professionals || []}
  // AGREGAR: professionalServices={professionalServices || []}
  timeBlocks={timeBlocks || []}
  exceptions={exceptions || []}
  locations={locations || []}
/>
```
También pasarlo en la rama `<LandingRenderer>` (líneas 178-187) que renderiza el mismo `BookingClient` — verificar si el renderer necesita el prop o si `bookingSlot` ya lo lleva resuelto (aquí `bookingNode` ya está armado, así que basta con agregarlo en la construcción de `bookingNode`).

---

### `app/[slug]/booking-client.tsx` (MODIFY — wizard client)

**Analog: self.** Tres puntos de anclaje.

**1. Props + estado** (`booking-client.tsx:19-29, 42, 45`): agregar `professionalServices: ProfessionalService[]` a `Props` y al destructuring. El estado ya existe:
```ts
const [selectedPro, setSelectedPro] = useState<Professional | null | 'none'>('none')  // línea 45 — default 'none' = "Cualquiera"
```
Import a sumar: `import { professionalsForService } from '@/lib/staff-services'` y el tipo `ProfessionalService` de `@/lib/types`.

**2. Cómputo de capaces + tarjeta "Cualquiera"** — el step 2 vive en líneas 472-506. Hoy la lista es `professionals.map(...)` (línea 488) precedida por una tarjeta "Sin preferencia" (líneas 476-487). El cambio D-02/D-03:
- Derivar `const capaces = professionalsForService(selectedService.id, professionals, professionalServices)` (helper PURO, ya testeado — `lib/staff-services.ts:43-53`).
- `const showAny = capaces.length >= 2` (D-02).
- Filtrar la lista renderizada a `capaces` (no `professionals` crudo).
- La tarjeta existente "Sin preferencia" (476-487) se **re-etiqueta** a copy "Cualquiera" + sub-texto "El primero disponible" y se muestra solo si `showAny`. Mantiene `onClick={() => { setSelectedPro('none'); setStep(3) }}`.

**Tarjeta actual a re-significar** (`booking-client.tsx:476-487`):
```tsx
<button onClick={() => { setSelectedPro('none'); setStep(3) }}
  className="w-full flex items-center gap-3 p-4 rounded-md border border-border bg-card hover:border-primary transition-colors text-left">
  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground text-sm flex-shrink-0">?</div>
  <div>
    <p className="font-medium text-sm">Sin preferencia</p>          {/* → "Cualquiera" */}
    <p className="text-xs text-muted-foreground">Se asignará automáticamente</p>  {/* → "El primero disponible" */}
  </div>
</button>
```
El resumen del paso 3 (línea 544) también muestra `'Sin preferencia'` — alinear el copy a "Cualquiera".

**3. Señal al availability + al create (D-05, sin id de asignación).** Hoy `proId` se deriva en DOS lugares idénticos: `handleDateSelect` (línea 220) y `handleConfirm` (línea 289):
```ts
const proId = selectedPro && selectedPro !== 'none' ? (selectedPro as Professional).id : null
```
Agregar el boolean `isAny` derivado y gatear:
```ts
const isAny = selectedPro === 'none' && capaces.length >= 2
```
- **Availability** (`booking-client.tsx:232-234`): hoy
  ```ts
  const params = new URLSearchParams({ slug: business.slug, date: dateStr })
  if (proId) params.set('professionalId', proId)
  ```
  → agregar `if (isAny) { params.set('any', '1'); params.set('serviceId', selectedService.id) }` en la rama `else`.
- **Create body** (`booking-client.tsx:318-330`): hoy manda `professionalId: proId`. → mandar `professionalId: isAny ? null : proId, anyProfessional: isAny`. **Nunca** un id como asignación (D-05).

**NO tocar:** el bucle de generación de slots (255-278) consume `busy`/`full` igual — la rama `any` devuelve `busy:[]` + `full` poblado, byte-compatible con el consumo actual (`full.includes(time)` en línea 271).

---

### `app/api/booking/availability/route.ts` (MODIFY — rama de agregación nueva)

**Analog: self.** El camino de hoy (bucketing por `professionalId || SENTINEL`) debe quedar **byte-idéntico** (DISP-02/D-08). Agregar una rama gateada por `any=1 && serviceId` que retorna ANTES de tocar el bucketing existente.

**Constructos a reusar de la ruta actual:**
- `SENTINEL` (línea 11) y la resolución de negocio por slug (28-34).
- La query de `appts` con `professional_id, duration_minutes` (37-42) — reusar; en la rama `any` bucketear por cada `professional_id` real (no colapsar a SENTINEL — ver Pitfall 1 de RESEARCH).
- `dow = new Date(`${date}T00:00:00Z`).getUTCDay()` (línea 53) + `capBlocks`/`capacityFor` (54-75) — misma convención de dow que el RPC 058.
- La lógica `siblingBusy` de espacio compartido (86-120) — computar por-pro dentro de la enumeración (un pro con el espacio ocupado por hermana NO cuenta libre).
- El contrato de retorno EXACTO (línea 156): `Response.json({ ok: true, busy, full }, { headers: { 'Cache-Control': 'no-store' } })`.

**Forma de la rama nueva** (insertar tras validar slug/date, ~línea 25, antes de resolver el bucket específico):
```ts
const any = searchParams.get('any') === '1'
const serviceIdParam = searchParams.get('serviceId') || ''
if (any && serviceIdParam) {
  // 1. duración del servicio (por business_id, anti-tampering aunque sea read)
  // 2. buckets capaces: professionals active=true AND service_id IS NULL (excluir canchas)
  //    AND (location_id = p_location_id OR NULL) AND comodín(professional_services) — EXACTO criterio RPC 058:88-130
  // 3. appts del negocio+fecha (ya se traen) bucketeados por professional_id
  // 4. enumerar grilla del dow a paso=duración; por start-time:
  //      libreParaAlguno = capaces.some(pro => !solapa(pro) && !full(pro) && !espacioBloqueado(pro))
  //      if (!libreParaAlguno) full.push('HH:MM')
  return Response.json({ ok: true, busy: [], full }, { headers: { 'Cache-Control': 'no-store' } })
}
// … camino de hoy (líneas 27-156), BYTE-IDÉNTICO …
```

**Regla dura (D-06):** la agregación colapsa a booleano-por-slot en `full` (con `busy: []`); NUNCA counts ni per-pro. Concatenar los `busy` de todos los pros daría intersección (lo opuesto a la unión DISP-01) — NO hacerlo.

---

### `app/api/booking/create/route.ts` (MODIFY — wire-ear autoAssign)

**Analog: self.** Dos puntos.

**1. Parseo del boolean** — junto al parseo defensivo existente (`create/route.ts:28-41`):
```ts
const professionalId = typeof body.professionalId === 'string' ? body.professionalId : null   // línea 31
// AGREGAR:
const anyProfessional = body.anyProfessional === true
```

**2. Pasar el flag al core** — la llamada a `createAppointmentCore` (líneas 151-166):
```ts
const result = await createAppointmentCore({
  supabase, business, serviceId: resolvedServiceId, professionalId, locationId, date, time,
  clientId: client?.id || null, clientName, clientPhone, clientEmail, notes,
  requireDeposit, depositExpiryHours: Number(business.deposit_expiry_hours) || 1,
  // AGREGAR: autoAssign: anyProfessional,
})
```

**Guards INTACTOS (D-10):** el gate `plan_status` (73-75), el backstop de ventana `isDateOutOfWindow` (85-87) y reCAPTCHA (96-101) corren ANTES del core, independientes de `autoAssign`. NO reordenar. La derivación de service de cancha (128-146) es del path canchas — no la toca `anyProfessional`. Anti-tampering intacto: si un cliente forja `anyProfessional` sin capaces, el RPC 058 hace `RAISE 'slot_taken'` → 409 (fail-safe).

---

### `lib/booking-core.ts` (NO cambios — ya soporta autoAssign)

**Analog: self.** Ya está listo desde Phase 9. `autoAssign?: boolean` en el input (línea 57), destructurado con default `false` (línea 90), y traducido a `ANY_PROFESSIONAL` (`00000000-...-0001`, distinto del `SENTINEL` cero) en líneas 108-121:
```ts
if (autoAssign) { proId = ANY_PROFESSIONAL }
else if (professionalId && professionalId !== 'none') { /* anti-tampering por business_id */ }
```
Con `autoAssign` se saltean los re-checks JS (134-237) — la autoridad es el RPC. **Referenciar para el planner, sin editar.**

---

### `lib/email.ts` (MODIFY — agregar professionalName a sendConfirmationEmail)

**Analog: self.** `sendConfirmationEmail` (líneas 217-320). Firma actual = objeto destructurado (líneas 217-235) + type inline (236-254). Agregar un param opcional `professionalName?: string | null` en AMBOS. Renderizar una fila en la tabla de detalle del HTML (patrón de fila existente, líneas 300-311):
```html
<tr>
  <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Profesional</td>
  <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${esc(professionalName)}</td>
</tr>
```
Condicional `${professionalName ? `...` : ''}` (mismo patrón que la fila `deposit > 0` en líneas 316-319). Usar `esc(...)` (helper ya usado en el template, líneas 291/302) — input persistido, escapado obligatorio.

---

### `app/api/notify/booking/route.ts` (MODIFY — mail sin seña)

**Analog: self.** Dos cambios.
1. Sumar `professionals(name)` al select (línea 18):
   ```ts
   .select('*, services(name, price), professionals(name), businesses(id, name, slug, palette, theme, font, landing_config, logo_url, whatsapp, notification_email)')
   ```
2. Pasar `professionalName` al call site (líneas 46-65):
   ```ts
   const professionalName = (appt.professionals as { name?: string } | null)?.name || null
   await sendConfirmationEmail({ ..., professionalName })
   ```
(Extraer con el mismo cast que `serviceName` en línea 32.)

---

### `app/api/payment/webhook/[slug]/route.ts` (MODIFY — mail con seña) — A1 CONFIRMADO

**Analog: self.** Verificado: el webhook SÍ llama `sendConfirmationEmail` (líneas 174-193) y su select es `.select('*, services(name, price)')` (línea 110) — **no trae** `professionals(name)`. Cambios:
1. Select (línea 110): `.select('*, services(name, price), professionals(name)')`.
2. Call site (líneas 174-193): agregar `professionalName: (appt.professionals as { name?: string } | null)?.name || null`.

**Pitfall 3 (RESEARCH):** NO olvidar este path — si solo se toca `notify/booking`, el mail del flujo con seña queda sin el nombre.

---

### REFERENCE — NO modificar

- **`app/[slug]/turno/[token]/page.tsx`** (líneas 15-19): ya hace `.select('... professionals(name) ...')` por `cancel_token` y extrae `professional` (línea 34). Sin cambios.
- **`components/booking/confirmation-view.tsx`** (líneas 159-161): ya renderiza `{professionalName && <Row icon={<User />} label="Profesional">{professionalName}</Row>}`. Como el RPC 058 inserta el pro REAL, la confirmación en pantalla muestra el nombre para específico y para "Cualquiera", y nada cuando `professional_id` es NULL (sentinel) — exactamente D-04. **Cero código.**
- **`app/[slug]/canchas-booking-client.tsx`** (el gemelo): NO tocar (D-09/SC5). Canchas nunca manda `any=1` ni `anyProfessional`.

---

## Shared Patterns

### Vista pública acotada (aislamiento anon)
**Source:** `supabase/migrations/044_public_canchas.sql:44-64` (+ baseline `public_services`/`public_professionals`).
**Apply to:** migr. 059. Owner `postgres` (definer), sin `security_invoker`, `GRANT ALL` a los 3 roles; el aislamiento efectivo lo da el `.eq('business_id', ...)` del RSC que la lee. Aplicación a prod = a mano + `NOTIFY pgrst, 'reload schema';` + regenerar `supabase/schema.sql`.

### Anti-tampering de tenant (server = autoridad, D-05)
**Source:** `lib/booking-core.ts:93-121` (service/professional re-validados `.eq('business_id', business.id)`); `app/api/booking/create/route.ts:129-146`.
**Apply to:** la rama `any` de availability (resolver service + capaces por `business_id`, aunque sea read) y el create (el front manda boolean, nunca id de asignación).

### Regla del comodín (fuente única)
**Source:** `lib/staff-services.ts:43-53` (`professionalsForService`, PURO). Comodín = 0 filas ⇒ capaz de todo.
**Apply to:** `booking-client.tsx` (contar/filtrar capaces, D-02). En el endpoint, espejar el MISMO criterio que el RPC 058 (active + service_id IS NULL + sede + comodín) — NO reimplementar la regla en JS ad-hoc.

### Contrato de disponibilidad acotado (D-06)
**Source:** `app/api/booking/availability/route.ts:131-156` (`{ ok, busy, full }`, solo booleano-por-slot, nunca counts/per-pro; `full` en `'HH:MM'`).
**Apply to:** la rama `any` retorna la misma forma (`busy: []`, `full` poblado). El `siblingBusy` (líneas 86-120) va SIEMPRE a `busy`, nunca a `full`.

### Branding de mail theme-aware
**Source:** `emailBrandInputs(business)` → `brand.{theme,palette,font,primaryOverride}`, pasado a todos los `send*` (create/route.ts:64; notify/booking:30; webhook:brand). `brandEmail(...)` en `lib/email.ts:265`.
**Apply to:** el nuevo param `professionalName` NO cambia el branding; solo se suma una fila al HTML ya branded.

---

## No Analog Found

Ninguno. Es una fase de superficie: cada archivo tiene un analog exacto en sí mismo o en `044_public_canchas.sql`. El "motor" (RPC 058, `autoAssign`, `staff-services`, ConfirmationView) ya existe. El riesgo no es lógica nueva sino **regresión** de los 4 caminos que comparten endpoint/core (específico, canchas, abono, cupo grupal).

## Metadata

**Analog search scope:** `supabase/migrations/`, `app/[slug]/`, `app/api/booking/`, `app/api/notify/`, `app/api/payment/webhook/`, `lib/`, `components/booking/`.
**Files scanned:** 11 (todos leídos en el código real).
**Pattern extraction date:** 2026-07-25
