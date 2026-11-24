---
phase: quick-261124-nxz
plan: "01"
type: execute
wave: 1
depends_on: []
quick_id: 261124-nxz
files_modified:
  - test/manual-booking.test.ts
  - app/api/appointments/create/route.ts
  - components/dashboard/nuevo-turno-form.tsx
  - test/abono-create.test.ts
  - app/api/abonos/create/route.ts
  - components/dashboard/nuevo-abono-form.tsx
  - app/(dashboard)/finances/finances-client.tsx
autonomous: true
# MANUAL-02 (alta de turno con cliente nuevo inline), ABONO-01 (alta de abono) y CLIENT-01 (alta de
# cliente) son los requisitos dueños de estas superficies. Se LISTAN, no se marcan: ya están Complete;
# este quick les suma el apellido opcional. El SUMMARY lleva requirements-completed: [].
requirements: [MANUAL-02, ABONO-01, CLIENT-01]

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "En Nuevo turno, el alta rápida de cliente tiene «Apellido (opcional)» al lado de «Nombre» (misma fila, mismo estilo que los campos vecinos); el turno que se crea deja clients.last_name con el apellido (NULL si quedó vacío) y appointments.client_name = «Nombre Apellido»; el resumen de confirmación y la tarjeta del cliente elegido muestran el nombre completo (A-01, A-04)"
    - "En Nuevo abono, el alta rápida tiene el mismo campo; el cliente nuevo queda con last_name y TODOS los turnos que genera la primera tanda llevan client_name = «Nombre Apellido» (A-02, A-04)"
    - "En la venta de Finanzas, el modo «Nuevo» del cliente tiene «Apellido» al lado de «Nombre *»; el cliente que se inserta lleva last_name normalizado (NULL si vacío) (A-03)"
    - "El camino del cliente existente no cambia: elegirlo del buscador sigue mandando el nombre completo en clientName y el apellido va null (el snapshot sale igual que antes, sin apellido duplicado); un contacto repetido sigue reusando el cliente existente por teléfono/email sin pisarle nombre ni apellido (A-05)"
    - "Escribir SOLO el apellido marca el borrador como sucio (isDirty de turno y abono, huella de la venta) y el campo arranca vacío cada vez que se empieza un cliente nuevo o se reabre el formulario (A-06)"
    - "Aislamiento intacto: los dos route handlers siguen con anon+RLS, el negocio sale de la sesión por owner_id, el dedupe sigue filtrando por business_id, no aparece ningún cliente de service role nuevo; el insert de la venta sigue siendo del navegador bajo RLS; ninguna migración nueva; la reserva pública no se toca (A-07)"
    - "Los campos nuevos no disparan el zoom de iOS (≥16px en mobile): panel-input-zoom-ios, panel-draft-guard-coverage y forms-no-get-leak siguen verdes (A-06)"
  artifacts:
    - path: app/api/appointments/create/route.ts
      provides: "lee clientLastName con normalizeLastName, lo inserta en clients.last_name dentro de resolveClientId, y usa fullName = clientFullName(...) para el snapshot, Google Calendar y el mail"
    - path: app/api/abonos/create/route.ts
      provides: "lee clientLastName con normalizeLastName y lo inserta en clients.last_name; el mail de alta saluda con el nombre completo; el snapshot de cada ocurrencia lo sigue armando lib/abono-generation.ts desde la base"
    - path: components/dashboard/nuevo-turno-form.tsx
      provides: "campo Apellido en el alta inline, SelectedClient.last_name, body.clientLastName, resumen/tarjeta/aviso de dedupe con clientFullName"
    - path: components/dashboard/nuevo-abono-form.tsx
      provides: "lo mismo que nuevo-turno-form, sin paso de confirmación"
    - path: app/(dashboard)/finances/finances-client.tsx
      provides: "NewClientDraft.last_name, ncLastName en saleFingerprint, campo Apellido en el modo Nuevo, last_name en el insert del cliente de la venta"
    - path: test/manual-booking.test.ts
      provides: "casos que invocan el POST REAL de /api/appointments/create (molde de test/abono-cancel-routes.test.ts) contra el Supabase local"
    - path: test/abono-create.test.ts
      provides: "casos que invocan el POST REAL de /api/abonos/create contra el Supabase local"
  key_links:
    - from: "alta inline de nuevo-turno-form"
      to: "POST /api/appointments/create → normalizeLastName(body.clientLastName) → resolveClientId insert last_name → createAppointmentCore clientName: fullName → appointments.client_name"
      via: "campo clientLastName del body JSON"
    - from: "alta inline de nuevo-abono-form"
      to: "POST /api/abonos/create → resolveClientId insert last_name → generateAbonoOccurrences lee name, last_name → clientFullName → client_name de cada ocurrencia"
      via: "campo clientLastName del body JSON + el select de lib/abono-generation.ts (ya hecho en 261124-lfd)"
    - from: "saveSale de finances-client"
      to: "insert de clients con last_name: normalizeLastName(saleNewClient.last_name)"
      via: "cliente de navegador anon+RLS (igual que hoy)"
    - from: "saleNewClient.last_name / newClientLastName"
      to: "saleFingerprint (ncLastName) / isDirty → guardDraftOnDismiss"
      via: "la guarda de borrador existente"
---

<objective>
Cerrar el ítem 1 del «Diferido» de la quick 261124-lfd: el alta rápida de cliente que vive DENTRO de Nuevo
turno, Nuevo abono y la venta de Finanzas pasa a tener «Apellido (opcional)», igual que el alta de /clients.

- Formularios: un campo Apellido al lado de Nombre, mismo helper (`lib/client-name.ts`: `clientFullName`,
  `normalizeLastName`), mismos estilos que los campos vecinos, 16px en mobile, cuenta para la guarda de
  borrador.
- Servidor (turno y abono): aceptan un apellido opcional en el body con parseo defensivo, lo guardan en
  `clients.last_name` y el snapshot `client_name` del turno sale con el nombre completo.
- Finanzas: el insert del cliente de la venta (navegador, RLS) lleva `last_name`.
- Sin migración (la columna ya está en local, staging y prod). La reserva pública no se toca.

Purpose: hoy un cliente creado desde un turno, un abono o una venta queda sin apellido y su turno sin el
nombre completo; con esto todas las altas del panel cargan lo mismo.

Output: 7 archivos editados (2 route handlers, 3 pantallas, 2 suites de la base extendidas con casos que
pegan contra el handler real).
</objective>

## Alcance aprobado (numerado para trazabilidad)

- **A-01** Nuevo turno (`components/dashboard/nuevo-turno-form.tsx`): «Apellido (opcional)» en el alta
  inline; el resumen de confirmación muestra el nombre completo; el body lleva el apellido a
  `/api/appointments/create`.
- **A-02** Nuevo abono (`components/dashboard/nuevo-abono-form.tsx`): ídem → `/api/abonos/create`.
- **A-03** Venta de Finanzas (`finances-client.tsx`, modo «Nuevo»): campo Apellido; el insert del cliente
  (hoy directo desde el navegador con RLS) pasa `last_name`.
- **A-04** Servidor: los dos handlers aceptan un apellido opcional (string, trim, vacío → null vía
  `normalizeLastName`), lo insertan en `clients.last_name` y el snapshot `client_name` = `clientFullName`.
- **A-05** Camino del cliente existente y dedupe por contacto: SIN cambios (verificar que pickClient ya
  manda el nombre completo desde 261124-lfd).
- **A-06** Guardas de borrador: el campo nuevo cuenta como cambio y se resetea; candados verdes
  (panel-input-zoom-ios, forms-no-get-leak, panel-draft-guard-coverage, overlay-history).
- **A-07** Aislamiento: anon+RLS, `.eq('business_id', …)` donde ya está, nunca un business id del cliente
  en los handlers; sin migración; reserva pública intacta.

## Decisiones de criterio del planner (documentadas)

- **Nombre del campo en el body: `clientLastName`.** Los dos handlers ya reciben `clientName`,
  `clientPhone`, `clientEmail` en camelCase; `/api/clients/create` usa `last_name` porque su body es
  snake_case. Se sigue a los vecinos de cada body.
- **`SelectedClient` gana `last_name: string | null` (obligatorio, no opcional).** Así se le puede pasar
  el objeto entero a `clientFullName`, y `tsc` obliga a completar todos los lugares que arman un cliente
  elegido (pickClient, confirmNewClient, goToConfirm/doSubmit). Para un cliente EXISTENTE va `null`,
  porque su `name` ya es el completo desde 261124-lfd: si se le pusiera `c.last_name` el apellido saldría
  dos veces.
- **El nombre completo va al snapshot, a Google Calendar y a los mails de alta (turno y abono).** El camino
  del cliente existente ya manda el completo en `clientName` desde 261124-lfd, así que hoy el mail de un
  cliente existente dice «Hola Ana Pérez». Usar el mismo valor en el camino del cliente nuevo hace que el
  mismo cliente reciba el mismo saludo venga por donde venga. Los mails de BAJA de abono (que leen
  `clients(name)`) no se tocan: esa decisión de 261124-lfd sigue.
- **«Crear nuevo cliente» desde la búsqueda sigue pasando el texto buscado a Nombre, sin partirlo.** No se
  puede adivinar dónde termina el nombre («María José», «De la Fuente»); Apellido arranca vacío.
- **El aviso de dedupe («Ya tenés un cliente con ese contacto: …») pasa a mostrar el nombre completo.** Es
  la regla D-06 de 261124-lfd (todo cliente de `clients` se ve completo) en un lugar que quedó afuera,
  dentro del mismo bloque que se edita. El resto del copy de esa línea no cambia.
- **El placeholder del Nombre deja de pedir el nombre completo** (hoy dice nombre + apellido en un solo
  campo). Con un campo Apellido al lado, ese texto invita a escribir todo en Nombre; pasa a «Nombre».
- **Fila de Nombre/Apellido:** en turno y abono, la fila `flex flex-col sm:flex-row gap-2` del alta de
  /clients (apilada en mobile, lado a lado desde sm), con el `space-y-1.5` que usan los campos vecinos de
  ese formulario. En Finanzas, la grilla `grid grid-cols-2 gap-1.5` que ya usa la fila Teléfono/Email del
  mismo bloque, con las mismas clases de Input (`h-8 text-base sm:text-sm`).
- **Tests a nivel HANDLER REAL, no extendiendo las réplicas.** `test/manual-booking.test.ts` y
  `test/abono-create.test.ts` hoy replican la lógica del handler; una réplica sigue verde aunque el handler
  se olvide del apellido. Los casos nuevos importan el `POST` real y lo invocan con la sesión del dueño,
  con el molde ya probado en el repo por `test/abono-cancel-routes.test.ts` (mock PARCIAL de `next/server`
  que reemplaza solo `after`, y `@/lib/supabase/server` devolviendo el cliente autenticado del caso). Los
  casos existentes no se tocan.
- **Sin test puro nuevo.** `normalizeLastName` y `clientFullName` ya están cubiertos en
  `test/client-name.test.ts` (incluido no-string → null). Finanzas no tiene handler (insert de navegador)
  y la escritura de `last_name` por el dueño bajo RLS ya la prueba el caso «apellido — last_name se
  persiste» de `test/manual-client.test.ts`; para Finanzas alcanzan `tsc` (el tipo NewClientDraft obliga a
  completar todos los literales) y los gates de grep.
- **`origin` de los clientes creados inline: no se toca.** Los tres inserts inline no lo mandan y la base
  pone su default. Está fuera del pedido; el SUMMARY lo anota como observación para que Franco decida.

## Coordinación con otra sesión (leer antes de empezar)

En el working tree hay trabajo SIN commitear de otra sesión (quick 261124-neg del workstream onboarding):
`app/(dashboard)/finances/page.tsx` modificado y `app/(dashboard)/error.tsx`,
`components/dashboard/panel-error-de-carga.tsx`, `lib/negocio-del-dueno.ts`, `tsconfig.probe-neg.json`
sin trackear. Reglas para el ejecutor:
- Commitear SOLO los archivos de este quick, nombrándolos uno por uno en el `git add` (nunca `-A` ni `.`).
- No hacer stash, checkout, reset ni ningún comando de git que mueva el trabajo ajeno.
- Si `npm test`, `tsc` o `npm run build` fallan en archivos que NO son de este quick, no arreglarlos:
  anotarlo en el SUMMARY con el archivo y el error, y comprobar que con nuestros archivos el rojo es el
  mismo que antes de editar.

<!-- planner-discipline-allow: finances/page.tsx -->

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/panel-nav/STATE.md
@AGENTS.md
@.claude/skills/convenciones-forjo/SKILL.md
@.claude/skills/supabase-multitenant-rls/SKILL.md
@.planning/workstreams/panel-nav/quick/261124-lfd-apellido-opcional-del-cliente-solo-panel/261124-lfd-SUMMARY.md
@lib/client-name.ts

# Leer COMPLETOS antes de tocar
@app/api/appointments/create/route.ts
@app/api/abonos/create/route.ts

# Leer SOLO estos rangos
# components/dashboard/nuevo-turno-form.tsx — L36 (import de client-name), L76 (type SelectedClient),
#   L352-460 (estado del cliente, isDirty, pickClient, confirmNewClient, goToConfirm), L463-486 (body del
#   fetch), L508-516 (resumen de confirmación), L540-690 (tarjeta del elegido, botón Editar, alta inline,
#   aviso de dedupe, los dos «Crear nuevo cliente»)
# components/dashboard/nuevo-abono-form.tsx — L37, L93, L249-358 (estado, isDirty, pickClient,
#   confirmNewClient, doSubmit y su body), L394-520 (tarjeta, Editar, alta inline, dedupe, los dos «Crear
#   nuevo cliente»)
# app/(dashboard)/finances/finances-client.tsx — L29 (import), L52-82 (SaleForm, NewClientDraft,
#   saleFingerprint y su comentario), L343-347 (estado de la venta), L551-610 (resetSaleClientState,
#   openNewSale, openEditSale, isSaleDirty, saveSale hasta el insert del cliente), L1300-1325 (modo Nuevo)
# test/manual-booking.test.ts — L1-125 (imports, réplica, beforeAll/afterEach, sesión del dueño)
# test/abono-create.test.ts — L1-30, L163-225 (beforeAll con el time block del lunes y el cliente
#   sembrado, afterEach con purgeAbonos)
# test/abono-cancel-routes.test.ts — L35-100 (el molde: vi.hoisted, mock parcial de next/server, mock de
#   @/lib/supabase/server, import del POST real). NO copiar el mock de @/lib/email: en abono-create.test.ts
#   los casos m1-m4 usan el template REAL.
# Patrón del campo a imitar: app/(dashboard)/clients/clients-client.tsx L1254-1263 (fila Nombre/Apellido
#   del alta de /clients). NO tocar clients-client.tsx.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): un turno con cliente nuevo inline guarda el apellido — form → handler → clients + appointments</name>
  <files>test/manual-booking.test.ts, app/api/appointments/create/route.ts, components/dashboard/nuevo-turno-form.tsx</files>
  <precondition>El Supabase local responde (`supabase status` lista DB_URL) y `clients.last_name` existe en la base local (de 261124-lfd). Ninguno de los 3 archivos de la task tiene cambios sin commitear de otra sesión (`git status --porcelain -- <archivo>` vacío). Si la base local no está, PARAR: los casos nuevos skipean y no se pueden dar por verdes.</precondition>
  <behavior>
    - (carril db, POST real) cliente nuevo inline con clientName 'Ana' y clientLastName '  Pérez ' y un teléfono que no existe en el negocio → 200 ok; el turno tiene client_name 'Ana Pérez'; su cliente tiene name 'Ana' y last_name 'Pérez'
    - (carril db, POST real) clientLastName de solo espacios → el cliente queda con last_name null y el turno con client_name 'Ana'
    - (carril db, POST real) cliente existente (clientId del cliente sembrado, clientName 'Cliente Existente', sin clientLastName en el body) → client_name 'Cliente Existente', client_id = el existente, sigue habiendo 1 solo cliente y su last_name sigue null
    - (carril db, POST real) dedupe sin cambios: clientId null, clientName 'Otra', clientLastName 'Persona', teléfono '1122334455' (mismos dígitos que el existente) → reusa el cliente existente, no crea otro, NO le pisa name ni last_name, y el snapshot del turno es 'Otra Persona' (el nombre tipeado, como hoy)
  </behavior>
  <action>
    Orden TDD: primero los casos nuevos de test/manual-booking.test.ts (rojos: el 1 y el 4 tienen que fallar antes de tocar el handler; el 2 y el 3 son guardas y pueden pasar desde el principio — anotarlo en el SUMMARY), después el handler, después el form. Antes de editar, correr eslint sobre los 3 archivos y anotar la cuenta (261124-lfd midió 0 en el form).

    1) test/manual-booking.test.ts (per A-04, A-05) — SIN tocar la réplica ni los casos existentes:
       - Sumar `vi` al import de vitest. Con `vi.hoisted`, un holder `h` con `session: { current: null as SupabaseClient | null }`.
       - Mock PARCIAL de `next/server` con importOriginal (molde de test/abono-cancel-routes.test.ts L51-61) que reemplaza SOLO `after` por una función que descarta la tarea: Google Calendar y el mail son best-effort y no se ejercitan acá; sin request scope el `after` real no funciona fuera de Next. Comentario en español con ese porqué.
       - Mock de `@/lib/supabase/server` con `createClient: async () => h.session.current` (comentario: el handler pide la sesión del dueño; se le entrega el cliente anon autenticado del caso, así corre con RLS como en producción).
       - Importar `POST` de `@/app/api/appointments/create/route` con un alias (p. ej. createAppointmentPOST) y un helper local que arma un `Request` POST JSON a `http://localhost/api/appointments/create` y devuelve status + json.
       - Actualizar el comentario de cabecera del archivo: además de la réplica, ahora hay casos que invocan el handler REAL (quick 261124-nxz) porque una réplica no detecta un handler que se olvide del apellido.
       - Cuatro `it` nuevos DENTRO del describe existente (reusan t, ownerAnon, existingClientId y el afterEach que ya borra turnos y clientes nuevos), cada uno arrancando con `h.session.current = ownerAnon`: los cuatro del behavior. Body con serviceId/professionalId/locationId del tenant sembrado, date DATE y horario '10:00' o '14:00' (los dos ya probados reservables en este archivo; el afterEach limpia los turnos entre casos); teléfonos únicos de la forma '11 6000-000N' para los casos 1 y 2. Leer turno y cliente con t.admin (solo para asertar). Nombres de los casos en español, prefijo «alta rápida —».

    2) app/api/appointments/create/route.ts (per A-04, A-05, A-07) — edición parcial:
       - Importar clientFullName y normalizeLastName de @/lib/client-name.
       - Debajo del parseo de clientName: `clientLastName = normalizeLastName(body.clientLastName)`, con comentario: apellido opcional del alta rápida inline (quick 261124-nxz); solo lo manda el modo «cliente nuevo»; con un cliente existente el form ya manda el nombre completo en clientName y este campo llega null.
       - El guard de missing_fields NO cambia (el nombre sigue obligatorio; un apellido solo no alcanza).
       - Después del guard: `fullName = clientFullName({ name: clientName, last_name: clientLastName })`, con comentario corto del porqué (el snapshot, el evento del calendario del dueño y el mail llevan el completo, igual que el camino del cliente existente).
       - resolveClientId: el tipo del input suma `clientLastName: string | null`, la llamada lo pasa, y el insert del paso (3) suma `last_name: clientLastName` junto a name. Los pasos (1) y (2) (re-validación del clientId por business_id y dedupe por contacto) NO cambian: un contacto repetido sigue reusando el cliente sin actualizarlo.
       - createAppointmentCore recibe `clientName: fullName`; el summary y la línea «Cliente:» del evento de Google Calendar usan fullName; sendManualBookingConfirmation recibe `clientName: fullName`.
       - Cabecera: una línea sobre el apellido opcional del alta inline. Nada más cambia (auth, owner_id, anon+RLS, el resto del parseo).

    3) components/dashboard/nuevo-turno-form.tsx (per A-01, A-05, A-06) — SOLO estas ediciones:
       - Importar normalizeLastName junto a clientFullName.
       - `type SelectedClient` suma `last_name: string | null`, con comentario: lo trae solo el cliente nuevo inline; para uno existente va null porque su name ya es el completo (si no, el apellido saldría dos veces).
       - Estado nuevo `newClientLastName` / `setNewClientLastName` (string, '') al lado de newClientName.
       - isDirty suma `newClientLastName.trim()`.
       - pickClient arma exactamente `{ id: c.id, name: clientFullName(c), last_name: null, phone: c.phone, email: c.email }` (el resto de la función igual; el comentario de D-07 sigue valiendo).
       - confirmNewClient y el cliente que arma goToConfirm suman `last_name: normalizeLastName(newClientLastName)`. Las validaciones y toasts no cambian.
       - doSubmit: el body suma `clientLastName: client.last_name` junto a clientName.
       - Display con el helper: el resumen de confirmación pasa a `clientFullName(pendingClient)`, la tarjeta del cliente elegido a `clientFullName(selectedClient)` y el aviso de dedupe a `clientFullName(dedupeMatch)`. El resto del copy de esas líneas queda igual.
       - Botón «Editar» (cliente nuevo todavía no guardado): además de nombre y contacto, restaura `setNewClientLastName(selectedClient.last_name || '')`.
       - Los dos «Crear nuevo cliente» (el del estado vacío de la búsqueda y el del pie de la lista) suman `setNewClientLastName('')`.
       - Alta inline: el bloque de Nombre pasa a ser una fila `flex flex-col sm:flex-row gap-2` con dos hijos `flex-1 space-y-1.5`: el de Nombre (Label e Input como hoy, con placeholder «Nombre» en vez del actual, que pide el nombre completo en un solo campo) y uno nuevo con Label «Apellido (opcional)» apuntando a `${searchListId}-last-name`, Input con ese id, value/onChange de newClientLastName, placeholder «Apellido» y autoComplete off. Sin clases de tamaño en el Input (hereda text-base; el candado del zoom de iOS lo exige).
       - Ninguna otra línea cambia.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && npm test -- manual-booking > "C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/nxz-manual-booking.log" 2>&1 && ! grep -qE "[0-9]+ skipped" "C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/nxz-manual-booking.log" && npm test -- client-name panel-draft-guard-coverage panel-input-zoom-ios forms-no-get-leak overlay-history && node node_modules/typescript/bin/tsc --noEmit && npm run lint -- components/dashboard/nuevo-turno-form.tsx app/api/appointments/create/route.ts test/manual-booking.test.ts && grep -c "app/api/appointments/create/route" test/manual-booking.test.ts && grep -c "Ana Pérez" test/manual-booking.test.ts && grep -c "normalizeLastName(body.clientLastName)" app/api/appointments/create/route.ts && grep -c "last_name: clientLastName" app/api/appointments/create/route.ts && test "$(grep -c 'clientName: fullName' app/api/appointments/create/route.ts)" -ge 2 && test "$(grep -v '^\s*//' app/api/appointments/create/route.ts | grep -c 'createAdminClient')" -eq 0 && grep -c "clientLastName: client.last_name" components/dashboard/nuevo-turno-form.tsx && grep -c "name: clientFullName(c), last_name: null" components/dashboard/nuevo-turno-form.tsx && test "$(grep -c 'normalizeLastName(newClientLastName)' components/dashboard/nuevo-turno-form.tsx)" -ge 2 && grep -c "newClientLastName.trim()" components/dashboard/nuevo-turno-form.tsx && test "$(grep -c "setNewClientLastName('')" components/dashboard/nuevo-turno-form.tsx)" -ge 2 && test "$(grep -cE 'clientFullName\((pendingClient|selectedClient|dedupeMatch)\)' components/dashboard/nuevo-turno-form.tsx)" -ge 3 && grep -c -- "-last-name" components/dashboard/nuevo-turno-form.tsx && test "$(grep -c 'Nombre y apellido' components/dashboard/nuevo-turno-form.tsx)" -eq 0</automated>
  </verify>
  <done>
    Los 4 casos nuevos de manual-booking corren contra la base local (sin skipped) y pasan, con el rojo previo de los casos 1 y 4 anotado; el alta inline de Nuevo turno tiene «Apellido (opcional)», el resumen y la tarjeta muestran el nombre completo, y el handler guarda last_name y el snapshot completo per A-01/A-04; el camino del cliente existente y el dedupe quedan como estaban per A-05; candados verdes; tsc sin salida; eslint de los 3 archivos sin problemas nuevos frente a la cuenta anotada. Commit con `261124-nxz` en el mensaje, solo con estos 3 archivos.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: un abono con cliente nuevo inline guarda el apellido y sus turnos lo llevan</name>
  <files>test/abono-create.test.ts, app/api/abonos/create/route.ts, components/dashboard/nuevo-abono-form.tsx</files>
  <precondition>Task 1 commiteada. Ninguno de los 3 archivos tiene cambios sin commitear de otra sesión. El Supabase local sigue arriba.</precondition>
  <behavior>
    - (carril db, POST real) cliente nuevo inline 'Ana' + clientLastName ' Pérez ' con teléfono único, servicio/profesional/consultorio del tenant, lunes a las 10:00 → 200 ok y generated ≥ 1; el cliente del abono tiene name 'Ana' y last_name 'Pérez'; TODOS los turnos con ese abono_id tienen client_name 'Ana Pérez'
    - (carril db, POST real) clientLastName de solo espacios → last_name null y todos los turnos con client_name 'Ana'
    - Los casos existentes del archivo (1-7 y m1-m4) siguen verdes sin cambios
  </behavior>
  <action>
    Orden TDD: primero los dos casos nuevos (el 1 tiene que fallar antes de tocar el handler; el 2 es guarda), después el handler, después el form. Antes de editar, eslint sobre los 3 archivos y anotar la cuenta.

    1) test/abono-create.test.ts (per A-04) — SIN tocar altaAbono ni los casos existentes:
       - Sumar `vi.hoisted` con el holder de sesión, el mock PARCIAL de `next/server` que descarta las tareas de `after` (el mail de alta va en after y no se manda; los casos m1-m4 siguen probando el template aparte) y el mock de `@/lib/supabase/server` devolviendo `h.session.current` — mismo molde que la Task 1. NO mockear `@/lib/email` (m1-m4 usan el template REAL). Importar el `POST` de `@/app/api/abonos/create/route` con alias y un helper de Request como el de la Task 1.
       - Comentario en español junto a los casos nuevos: el handler no acepta fechas, así que la primera tanda sale del reloj real (hoy hora AR + la ventana del negocio); por eso no se fijan fechas y la guarda de honestidad es generated ≥ 1 (con el bloque del lunes 08-20 sembrado y la ventana por defecto siempre hay lunes por delante). El afterEach existente borra turnos y abonos; los clientes nuevos los limpia teardownOneTenant (CASCADE). Confirmar antes con grep que ningún caso del archivo cuenta clientes.
       - Dos `it` nuevos dentro del describe de la base, arrancando con `h.session.current = ownerAnon`: los dos del behavior, con dayOfWeek DOW_MON, time START, teléfonos únicos '11 7000-000N', sin email (así el handler no encola el mail). Leer el abono, el cliente y los turnos con t.admin, filtrando turnos por business_id y abono_id.
       - Actualizar la cabecera del archivo con una línea sobre los casos del handler real (quick 261124-nxz).

    2) app/api/abonos/create/route.ts (per A-04, A-05, A-07) — edición parcial:
       - Importar clientFullName y normalizeLastName de @/lib/client-name.
       - Debajo del parseo de clientName: `clientLastName = normalizeLastName(body.clientLastName)`, con el mismo comentario que en appointments/create.
       - El guard de missing_fields NO cambia.
       - resolveClientId: input suma `clientLastName: string | null`, la llamada lo pasa, el insert del paso (3) suma `last_name: clientLastName`. Pasos (1) y (2) sin cambios.
       - El mail de alta (sendAbonoConfirmation dentro del after) recibe `clientName: clientFullName({ name: clientName, last_name: clientLastName })`.
       - El snapshot de cada ocurrencia NO se arma acá: lo arma lib/abono-generation.ts leyendo name y last_name del cliente (ya hecho en 261124-lfd). Dejarlo dicho en un comentario corto en el ítem 3 de la cabecera («Resuelve/crea el cliente…»), junto con el apellido opcional. Nada más cambia.

    3) components/dashboard/nuevo-abono-form.tsx (per A-02, A-05, A-06) — las mismas ediciones que la Task 1 hizo en nuevo-turno-form, adaptadas (no hay paso de confirmación):
       - Import de normalizeLastName; `SelectedClient` con `last_name: string | null` y el mismo comentario; estado `newClientLastName`; isDirty con `newClientLastName.trim()`.
       - pickClient con exactamente `{ id: c.id, name: clientFullName(c), last_name: null, phone: c.phone, email: c.email }`.
       - confirmNewClient y el cliente que arma doSubmit suman `last_name: normalizeLastName(newClientLastName)`; el body suma `clientLastName: client.last_name`.
       - La tarjeta del elegido usa `clientFullName(selectedClient)` y el aviso de dedupe `clientFullName(dedupeMatch)`.
       - «Editar» restaura `setNewClientLastName(selectedClient.last_name || '')`; los dos «Crear nuevo cliente» suman `setNewClientLastName('')`.
       - Alta inline: la misma fila Nombre/Apellido de la Task 1, con ids basados en `fieldId` (`${fieldId}-last-name`), placeholder «Nombre» en el Nombre y «Apellido» en el campo nuevo, sin clases de tamaño.
       - Ninguna otra línea cambia.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && npm test -- abono-create > "C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/nxz-abono-create.log" 2>&1 && ! grep -qE "[0-9]+ skipped" "C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/852caa9d-96c1-4359-9d60-05639393cb6a/scratchpad/nxz-abono-create.log" && npm test -- abono-generation client-name panel-draft-guard-coverage panel-input-zoom-ios forms-no-get-leak overlay-history && node node_modules/typescript/bin/tsc --noEmit && npm run lint -- components/dashboard/nuevo-abono-form.tsx app/api/abonos/create/route.ts test/abono-create.test.ts && grep -c "app/api/abonos/create/route" test/abono-create.test.ts && grep -c "Ana Pérez" test/abono-create.test.ts && test "$(grep -c "vi.mock('@/lib/email'" test/abono-create.test.ts)" -eq 0 && grep -c "normalizeLastName(body.clientLastName)" app/api/abonos/create/route.ts && grep -c "last_name: clientLastName" app/api/abonos/create/route.ts && grep -c "clientName: clientFullName(" app/api/abonos/create/route.ts && test "$(grep -v '^\s*//' app/api/abonos/create/route.ts | grep -c 'createAdminClient')" -eq 0 && grep -c "clientLastName: client.last_name" components/dashboard/nuevo-abono-form.tsx && grep -c "name: clientFullName(c), last_name: null" components/dashboard/nuevo-abono-form.tsx && test "$(grep -c 'normalizeLastName(newClientLastName)' components/dashboard/nuevo-abono-form.tsx)" -ge 2 && grep -c "newClientLastName.trim()" components/dashboard/nuevo-abono-form.tsx && test "$(grep -c "setNewClientLastName('')" components/dashboard/nuevo-abono-form.tsx)" -ge 2 && test "$(grep -cE 'clientFullName\((selectedClient|dedupeMatch)\)' components/dashboard/nuevo-abono-form.tsx)" -ge 2 && grep -c -- "-last-name" components/dashboard/nuevo-abono-form.tsx && test "$(grep -c 'Nombre y apellido' components/dashboard/nuevo-abono-form.tsx)" -eq 0</automated>
  </verify>
  <done>
    Los 2 casos nuevos de abono-create corren contra la base local (sin skipped) y pasan, con el rojo previo del caso 1 anotado; los casos 1-7 y m1-m4 siguen verdes; el alta inline de Nuevo abono tiene «Apellido (opcional)» y la tarjeta muestra el nombre completo per A-02; el handler guarda last_name y los turnos generados llevan el nombre completo per A-04; camino existente y dedupe sin cambios per A-05; tsc sin salida; eslint sin problemas nuevos. Commit con `261124-nxz`, solo con estos 3 archivos.
  </done>
</task>

<task type="auto">
  <name>Task 3: la venta de Finanzas carga el apellido del cliente nuevo, y verificación completa</name>
  <files>app/(dashboard)/finances/finances-client.tsx</files>
  <precondition>Tasks 1 y 2 commiteadas. `git status --porcelain -- "app/(dashboard)/finances/finances-client.tsx"` vacío (la otra sesión tiene modificado finances/page.tsx, no este archivo; si este apareciera modificado por otro, PARAR y reportarlo).</precondition>
  <action>
    Antes de editar, eslint sobre el archivo y anotar la cuenta (261124-lfd midió 0). Ediciones SOLO estas (per A-03, A-06, A-07):

    1) `type NewClientDraft` suma `last_name: string` (después de name).
    2) saleFingerprint suma `ncLastName: nc.last_name` en la lista enumerada, después de ncName (el comentario del archivo ya dice que un campo nuevo se suma ahí, a mano; no hace falta tocarlo).
    3) Los cuatro literales del borrador vacío pasan a llevar `last_name: ''`: el useState de saleNewClient, resetSaleClientState, el de openNewSale y el de openEditSale. tsc obliga a no olvidarse ninguno (la huella pide NewClientDraft).
    4) saveSale: el insert del cliente nuevo suma `last_name: normalizeLastName(saleNewClient.last_name)` entre name y phone. La condición (modo 'new' y nombre con texto), el business_id, el `.select().single()` y el sort por name NO cambian. Importar normalizeLastName en la misma línea que clientFullName.
    5) Modo «Nuevo» (L1315-1325): el Input de Nombre deja de ir solo y pasa a una fila `grid grid-cols-2 gap-1.5` (la misma que usa Teléfono/Email debajo) con el Nombre como está (placeholder «Nombre *», mismas clases) y un Input nuevo con value saleNewClient.last_name, onChange que actualiza last_name con el mismo spread que los vecinos, placeholder «Apellido» y las clases `h-8 text-base sm:text-sm`. El «Crear nuevo →» de la búsqueda sigue poniendo el texto en name (el spread conserva last_name).
    6) Ninguna otra línea cambia.

    Después, la verificación completa del quick (ver <verification>): `npm test` entero, tsc, lint de los 7 archivos, `npm run build` y los gates de git. Si algo falla en un archivo que no es de este quick, seguir la regla de «Coordinación con otra sesión».
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && grep -c "last_name: string" "app/(dashboard)/finances/finances-client.tsx" && grep -c "ncLastName: nc.last_name" "app/(dashboard)/finances/finances-client.tsx" && test "$(grep -c "last_name: ''" "app/(dashboard)/finances/finances-client.tsx")" -ge 4 && grep -c "last_name: normalizeLastName(saleNewClient.last_name)" "app/(dashboard)/finances/finances-client.tsx" && grep -c "value={saleNewClient.last_name}" "app/(dashboard)/finances/finances-client.tsx" && node node_modules/typescript/bin/tsc --noEmit && npm run lint -- "app/(dashboard)/finances/finances-client.tsx" components/dashboard/nuevo-turno-form.tsx components/dashboard/nuevo-abono-form.tsx app/api/appointments/create/route.ts app/api/abonos/create/route.ts test/manual-booking.test.ts test/abono-create.test.ts && npm test && NXZ_FILES="$(git log --format= --name-only --grep='261124-nxz')" && test -n "$NXZ_FILES" && test "$(printf '%s\n' "$NXZ_FILES" | grep -cE '^app/\[slug\]|^app/api/booking|^supabase/')" -eq 0 && test "$(printf '%s\n' "$NXZ_FILES" | grep -cE 'finances/page\.tsx|negocio-del-dueno|panel-error-de-carga|dashboard\)/error\.tsx|tsconfig\.probe')" -eq 0 && npm run build</automated>
    <human-check>UAT del dueño (no bloquea): en Nuevo turno, Nuevo abono y una venta de Finanzas, crear un cliente nuevo con apellido y otro sin apellido (en mobile y en desktop): Apellido al lado de Nombre (apilado en mobile en turno/abono), sin zoom al enfocar en iPhone; el resumen del turno dice «Nombre Apellido»; después, en /clients, la ficha de cada uno muestra el apellido (o nada), y en la agenda el turno nuevo se ve con el nombre completo. Escribir solo el apellido y tocar afuera: tiene que avisar que hay cambios sin guardar.</human-check>
  </verify>
  <done>
    La venta de Finanzas carga el apellido del cliente nuevo (insert con last_name normalizado) y la huella del borrador lo vigila per A-03/A-06; `npm test` completo verde (salvo los canarios de reloj si se corre fuera de [01:00, 23:30] AR, declarado); tsc sin salida; eslint de los 7 archivos sin problemas nuevos; build ok; ningún commit del quick toca la reserva pública, migraciones ni archivos de la otra sesión. Commit con `261124-nxz`, solo con finances-client.tsx.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador del dueño → POST /api/appointments/create | body JSON no confiable (clientLastName nuevo) |
| navegador del dueño → POST /api/abonos/create | body JSON no confiable (clientLastName nuevo) |
| navegador del dueño → insert directo de clients (venta de Finanzas) | cliente anon+RLS; la base es la autoridad del tenant |
| datos de la DB → mails al cliente final y evento de Google Calendar | el apellido tipeado llega a HTML de mail y a un calendario externo |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-nxz-01 | Information disclosure | clients.last_name escrito desde los dos handlers (cruce entre negocios) | critical | mitigate | Los handlers siguen con anon+RLS y el negocio por owner_id de la sesión; resolveClientId conserva la re-validación del clientId por business_id y el dedupe filtrado por business_id (pasos 1 y 2 sin cambios); el insert usa el businessId resuelto, nunca uno del body; gate negativo contra el cliente de service role en los dos route files; los casos nuevos corren como el dueño (ownerAnon, RLS) contra el handler real |
| T-nxz-02 | Tampering | clientLastName en el body | medium | mitigate | normalizeLastName: solo string, recortado, vacío o no-string → null (cubierto en test/client-name.test.ts); caso db de solo espacios → null |
| T-nxz-03 | Tampering | clientId ajeno + clientLastName | low | accept | El clientId ajeno ya cae al flujo de datos nuevos (sin cambios); el apellido solo afecta el snapshot del propio turno del dueño, que igual puede tipear cualquier nombre |
| T-nxz-04 | Elevation of privilege | insert del cliente de la venta desde el navegador | high | mitigate | Sin cambios de forma: sigue siendo el cliente anon con la policy de insert de clients por business_id (WITH CHECK); solo se suma una columna de dato normalizada; el business_id es el que ya se usaba |
| T-nxz-05 | Tampering (inyección en HTML) | apellido en los mails de alta de turno/abono | medium | mitigate | Los templates escapan clientName con esc() en el HTML (sin cambios); el valor sigue siendo un string; no se agrega ningún template nuevo |
| T-nxz-06 | Denial of service | apellido muy largo | low | accept | Mismo criterio que name y que 261124-lfd: sin tope de largo ni CHECK; solo afecta filas del propio negocio |
| T-nxz-07 | Tampering | superficie pública (reserva por slug, sus route handlers, la RPC atómica) | high | mitigate | Ningún commit del quick toca esos archivos ni supabase/ — gate de git en la Task 3; el panel sigue pasando el nombre como string al core existente |
</threat_model>

<verification>
- `npm test` completo (carriles pure + db, contra el Supabase local). Mirar el reloj: 2 canarios fallan A PROPÓSITO fuera de [01:00, 23:30] hora AR; declararlo en el SUMMARY si pasa. Si falla algo de la otra sesión (quick 261124-neg), anotarlo y no tocarlo.
- `node node_modules/typescript/bin/tsc --noEmit` sin salida (NO `npx tsc`: en esta máquina sale 0 aunque haya errores).
- `npm run lint` sobre los 7 archivos: sin problemas nuevos frente a la cuenta anotada antes de editar cada uno.
- `npm run build` ok (no levanta navegador: no va con el turno).
- Gates de git (Task 3): ningún archivo tocado por los commits `261124-nxz` cae en la reserva pública ni en `supabase/`, ni es uno de los archivos de la otra sesión.
- No hacen falta pruebas de navegador; si alguna se corriera, va con `node scripts/con-turno.mjs`. El SUMMARY dice explícitamente que las pantallas no se probaron en un navegador.
</verification>

<success_criteria>
- Los 7 truths de must_haves comprobados por los casos nuevos de manual-booking y abono-create (contra el handler real) o por los gates de cada task.
- Candados estáticos verdes: panel-input-zoom-ios, panel-draft-guard-coverage, forms-no-get-leak, overlay-history; test/client-name.test.ts sin cambios y verde.
- Commits atómicos por task con `261124-nxz` en el mensaje, cada uno con solo sus archivos; nada se pushea; ninguna migración.
</success_criteria>

<output>
Crear `.planning/workstreams/panel-nav/quick/261124-nxz-apellido-opcional-en-el-alta-rapida-de-c/261124-nxz-SUMMARY.md` al terminar (requirements-completed: []). Tiene que incluir:
- Que cierra el ítem 1 del «Diferido / fuera de alcance» de 261124-lfd (alta rápida inline sin apellido). No editar el SUMMARY de 261124-lfd.
- Que NO hay migración ni paso manual antes del deploy: `clients.last_name` ya existe en local, staging y prod.
- El rojo previo de cada caso nuevo (cuáles fallaron antes del handler y cuáles eran guardas) y la cuenta de tests de manual-booking y abono-create sin skipped.
- La cuenta de eslint antes/después de cada archivo tocado.
- Las decisiones de criterio (nombre clientLastName, SelectedClient.last_name null para el existente, nombre completo en snapshot/calendario/mails de alta, texto de búsqueda sin partir, aviso de dedupe completo).
- Observación fuera de alcance para Franco: los tres inserts inline (turno, abono, venta) no mandan `origin`, así que el cliente queda con el default de la base; decidir si corresponde 'manual' en otro quick.
- Que las pantallas no se probaron en un navegador y quedan para la UAT del dueño (ver human-check de la Task 3).
</output>
