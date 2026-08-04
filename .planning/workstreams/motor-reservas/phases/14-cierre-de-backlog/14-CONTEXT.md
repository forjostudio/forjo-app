# Phase 14: Cierre de backlog - Context

**Gathered:** 2026-08-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Última fase del milestone **v0.26** y del workstream `motor-reservas`. Drena el backlog chico
acumulado **sin tocar el motor de reservas** (`book_slot_atomic`, constraints 011/013, availability,
`createAppointmentCore`) ni el aislamiento por tenant.

**Los 4 POLISH del ROADMAP:**

- **POLISH-04** — Ancho consistente de los botones de acción del dashboard, según un criterio único
  (el ROADMAP delega el criterio explícitamente a este discuss).
- **POLISH-05** — El `RiskBadge` "Alto" se ve con relleno semántico de peligro, también fuera del CRM.
- **POLISH-06** — Una serie de abono `cancelled` deja de mostrar "Copiar link de baja".
- **POLISH-07** — Un cliente recién creado sin turnos cae en "Nuevos", no en "Pausa".

**Dos ítems foldeados desde `todos/pending/` (elegidos por el usuario en este discuss):**

- **EXTRA-A** — Tabs Activos/Desactivados en Canchas (paridad con Servicios, Phase 13 D-14).
- **EXTRA-B** — Borrado definitivo de un abono **archivado**. ⚠ **NO es polish:** es capacidad nueva
  + migración **066** (trigger de gate). El planner debe aislarlo en su(s) propio(s) plan(es) y
  tratarlo con el rigor de una feature, no de un pulido.

**UI hint: yes.** Riesgo bajo salvo EXTRA-B (toca la base). POLISH-06 solo oculta un botón del panel
**autenticado** — la pantalla pública de baja (`/abono/cancelar/[token]`) está endurecida (404
genérico, token no adivinable, `noindex`, contraste por luminancia) y **no se toca**.

</domain>

<decisions>
## Implementation Decisions

### POLISH-04 — Ancho de botones app-wide

- **D-01 (criterio único LOCKED):** todo botón de acción del dashboard usa **`w-full sm:w-auto`** —
  full-width en mobile (<640px), ancho por contenido en desktop. Es el patrón que **ya existe** en
  `abonos-client.tsx:480` y `appointments-client.tsx:275`; el resto se alinea a él. Regla única, sin
  excepciones por contenedor.

- **D-02 (LOCKED — hallazgo del scout, cambia el alcance):** POLISH-04 tiene **DOS causas
  independientes** y el criterio cubre **las dos**. Un grep de `w-full` **NO** encuentra la segunda —
  y la segunda es justamente la que motivó el pedido del usuario.

  **Causa 1 — `w-full` explícito (10 casos):**

  | Archivo | Líneas |
  |---|---|
  | `app/(dashboard)/agenda/agenda-client.tsx` | 1035, 1037, 1047, 1156 |
  | `app/(dashboard)/clients/clients-client.tsx` | 601, 607 |
  | `components/dashboard/nuevo-turno-form.tsx` | 455, 460 |
  | `components/dashboard/nuevo-abono-form.tsx` | 417, 422 |

  → `className="w-full"` pasa a `className="w-full sm:w-auto"`.

  **Causa 2 — estirados por el contenedor, SIN ninguna clase de ancho:** `components/ui/card.tsx:15`
  declara `flex flex-col`, así que todo hijo directo de `<Card>` se estira a `align-items: stretch`.
  Los botones que el usuario reportó (**"Guardar"** `settings-client.tsx:2165` y **"Liberar horarios
  vencidos"** `:2175`, en Negocio → Cobros) son full-width **sin un solo `w-full`**. Mismo caso en
  `:1446`, `:2248`, `:2325`, `:2359` y otros `<Button>` hijos directos de `<Card>` en
  `settings-client.tsx` — el planner debe **auditarlos, no asumir la lista**.

  → Fix: `self-start` (o `w-full sm:w-auto` si además se quiere full en mobile). **Precedente ya en el
  repo:** `settings-client.tsx:1568` ya usa `className="self-start"` para exactamente este problema —
  mirror ese patrón, no inventar uno nuevo.

- **D-03 (discreción del planner):** la **alineación** en desktop de los botones que dejan de
  estirarse se decide caso por caso — derecha (`justify-end`) en footers de formulario, izquierda
  (`self-start`) cuando el botón es una acción sobre una lista o un card de configuración. El usuario
  delegó esto explícitamente.

### POLISH-05 — RiskBadge "Alto"

- **D-04 (contexto: la causa original YA está arreglada):** el bug que describe el ROADMAP
  (`--crm-danger` no resuelve fuera de `.crm-shell` → badge gris) **se cerró en Phase 13, gap 13-05
  #1**: `app/globals.css:96` introdujo la indirección `--danger` (`:root` → `--destructive`,
  `.crm-shell` → `--crm-danger`) y `components/crm/risk-badge.tsx:58` ya la consume. **No re-abrir ese
  diagnóstico ni volver a tocar los tokens.**

- **D-05 (LOCKED):** la variante `alto` pasa de *pill oscuro + dot rojo* a **relleno semántico de
  peligro**: `border-transparent bg-[var(--danger)] text-[var(--danger-foreground)]`, **sin dot** (el
  relleno ya marca el nivel). Queda coherente con `medio`, que ya es un pill relleno
  (`bg-primary text-primary-foreground`), y resuelve que hoy `medio` pese visualmente más que `alto`.

- **D-06 (LOCKED — pisa una restricción del ROADMAP):** el cambio aplica en **los DOS shells**. Sigue
  habiendo **UN solo componente** (`components/crm/risk-badge.tsx`), sin variantes por shell ni
  bifurcación por scope. **El CRM cambia de aspecto** (`/admin/auditoria` y los ConfirmDialog del CRM)
  y **el usuario lo aceptó explícitamente** en este discuss — esto **supersede** la nota del ROADMAP
  §Phase 14 ("sin alterar cómo se ve el badge dentro del CRM"). No es una desviación a reportar.

- **D-07 (invariante):** nunca referenciar `--crm-danger` desde un componente compartido. La
  indirección `--danger` es el punto único de resolución (lección de 13-05 #1, documentada en
  `globals.css:90-97` y `confirm-dialog.tsx:184`). El contraste del par `--danger` /
  `--danger-foreground` ya está resuelto por theme en `app/themes.css` — reusarlo, no recalcularlo.

### POLISH-06 — "Copiar link de baja" en serie cancelada

- **D-08 (LOCKED, UI):** en una serie con `status === 'cancelled'` se oculta el **bloque completo**:
  el `<Button>` **y** el párrafo de ayuda ("Mandáselo por WhatsApp si tu cliente no tiene mail
  cargado…"). Dejar el texto huérfano describiendo un botón inexistente es peor que el bug original.
  Archivo: `app/(dashboard)/abonos/abonos-client.tsx:479-483`. **No** se agrega un estado vacío
  sustituto: el detalle ya muestra arriba "Serie dada de baja el … No genera turnos nuevos".

- **D-09 (LOCKED, servidor):** `GET /api/abonos/cancel-link/[id]` también rechaza la serie cancelada
  — un filtro más sobre la query ya scopeada (`.eq('id')`, `.eq('business_id')` + `.neq('status',
  'cancelled')`), devolviendo el **mismo 404 genérico** que un id ajeno (no revela que la serie existe
  pero está muerta). Ocultar UI no es un control: el endpoint es la autoridad y hoy entrega la
  credencial de una serie muerta. Alineado con el patrón del workstream (el servidor no confía en el
  cliente) y con WR-07/D-25 de Phase 07 (el token sale on-demand, no en el payload del listado).

### POLISH-07 — Clasificación de clientes

- **D-10 (LOCKED, causa raíz):** `app/(dashboard)/clients/clients-client.tsx:405` hace
  `daysSinceLast = lastDate ? differenceInDays(…) : 999` → un cliente con **0 turnos** hereda 999 días
  y cae en `paused`. Regla nueva: **`visits === 0` ⇒ `'new'`, siempre**, sin importar hace cuánto se
  dio de alta y **sin leer `created_at`** (no se thread nada nuevo a `clientStats`). El guard va
  **antes** del chequeo de `daysSinceLast`. "Pausa" pasa a significar literalmente *vino y dejó de
  venir*.

- **D-11 (LOCKED, umbral):** se **unifica en 60 días** ("2 meses") con una **constante única a nivel
  de módulo** consumida por los dos lugares que hoy discrepan: el status del filtro (`:406`, hoy 45) y
  el copy de `getSuggestion` (`:150`, hoy 60, "Hace más de 2 meses que no viene"). Coincide con cómo
  `REQUIREMENTS.md` describe el tab ("Pausa (>2 meses sin venir)"). **Efecto esperado y aceptado:** los
  clientes con 46-60 días sin venir salen del tab "Pausa" y pasan a "Activos"/"En desarrollo".

- **D-12 (LOCKED, copy — pedido explícito del usuario):** la clasificación pasa a **masculino**, los
  **8 labels**:

  | Constante | Antes | Después |
  |---|---|---|
  | `STATUS_LABEL.new` (`:48`) | `NUEVA` | `NUEVO` |
  | `STATUS_LABEL.active` (`:49`) | `ACTIVA` | `ACTIVO` |
  | `STATUS_LABEL.frequent` (`:50`) | `FRECUENTE` | *(igual)* |
  | `STATUS_LABEL.paused` (`:51`) | `PAUSA` | *(igual)* |
  | `FILTER_TABS.all` (`:54`) | `Todas` | `Todos` |
  | `FILTER_TABS.frequent` (`:55`) | `Frecuentes` | *(igual)* |
  | `FILTER_TABS.active` (`:56`) | `Activas` | `Activos` |
  | `FILTER_TABS.new` (`:57`) | `Nuevas` | `Nuevos` |

  Verificado contra `lib/verticals.ts`: **todos** los verticales usan sustantivo masculino
  (`Cliente` / `Paciente`, líneas 45-46 y 69-70), así que no hay conflicto por rubro.
  **NO se toca** `:649` `"Todas las obras sociales"` — ahí el femenino es correcto.

### EXTRA-A — Tabs Activos/Desactivados en Canchas (folded todo)

- **D-13 (LOCKED):** se **extrae el patrón a un componente compartido** en `components/dashboard/` y
  lo consumen **Servicios** (`settings-client.tsx`) y **Canchas** (`components/dashboard/canchas-manager.tsx`).
  Es la tercera aparición del mismo patrón — umbral de extracción — y evita que vuelvan a divergir.
  El componente cubre: las 2 píldoras con **contadores reales**, el filtro por `service.active`, y el
  **empty state por tab** (borde punteado + icono + texto) para que un tab vacío no quede en blanco.
- **D-14:** reusar el molde **literal** de Servicios (misma variante, tamaño y espaciado) para que las
  dos pantallas se lean como un solo sistema.
- **D-15:** una vez que las inactivas viven en su propio tab, evaluar si el `line-through
  text-muted-foreground` de la fila inactiva en `canchas-manager.tsx` **sobra** (probablemente sí).
- ⚠ **Riesgo a manejar:** el refactor toca `settings-client.tsx`, código que **acaba de shippear en
  Phase 13** (13-03, D-14). Cero regresión visual en Servicios es requisito.

### EXTRA-B — Borrado definitivo de un abono archivado (folded todo — capacidad NUEVA)

- **D-16 (LOCKED, historial):** camino **"conservar los turnos, soltar el puntero"**. Al borrar el
  abono, sus turnos quedan como cualquier otro en el historial. **No requiere migración para el FK:**
  `appointments.abono_id` **ya está en `ON DELETE SET NULL`** desde `supabase/migrations/054_abonos.sql:107`
  (verificado también en `supabase/schema.sql:1543`). Es exactamente el precedente de Phase 13
  (HIST-03): borrar la entidad de configuración **nunca** destruye la historia. Finanzas y la ficha
  del cliente siguen mostrando esos turnos con su snapshot de nombre/precio.
- **D-17 (DESCARTADO):** borrar también los turnos futuros no cancelados. Abría una decisión extra
  (¿se le avisa al cliente?) y es capacidad distinta de "limpiar la lista de archivados". Un abono
  `completed` puede tener turnos futuros vivos — no se los toca.
- **D-18 (LOCKED, gate):** la regla "solo se borran los archivados" vive en un **trigger `BEFORE
  DELETE`** en la base (**migración 066**), calcado del gate de borrado de servicio de Phase 13
  (`065_service_snapshot_and_delete_gate.sql`, D-08/D-09/D-10): rechaza con `RAISE EXCEPTION` +
  `ERRCODE 'P0001'` si `OLD.status = 'active'`. **La base es la autoridad**; la UI hace un pre-check
  que solo evita el viaje. Consistente con lo que la fase anterior acaba de establecer.
- **D-19 (UI):** el botón vive **solo** en el tab **Archivados** y confirma con el `ConfirmDialog` de
  dos estados que ya existe (mismo molde que el borrado de servicio de 13-03). Aplica la lección de
  13-03: `onConfirm` **lanza** ante el rechazo tardío del trigger para que el modal **no cierre**.
- ⚠ **Operativo (bloqueante para el deploy):** la migración **066** es idempotente y numerada, se
  aplica **A MANO** al Supabase de prod coordinada con el deploy (+ `NOTIFY pgrst, 'reload schema'`),
  **nunca** por el flujo GSD. Última en prod = **065**. Local se valida con `supabase db reset`.
- ⚠ **Aislamiento:** el DELETE es una acción autenticada del dueño sobre SU serie — RLS +
  `.eq('business_id', business.id)` obligatorio, nunca service-role.

### Claude's Discretion

- **D-03** — alineación en desktop de los botones desestirados (derecha en footers de form, izquierda
  en cards de config), caso por caso.
- **POLISH-04 causa 2** — la **lista exacta** de `<Button>` hijos directos de `<Card>` que hoy se
  estiran: el planner la **audita**, no la asume de las líneas citadas acá (que son ejemplos
  verificados, no un inventario cerrado).
- **EXTRA-A** — nombre y API exacta del componente compartido de píldoras.
- **POLISH-06** — el código de error / status exacto que devuelve el endpoint (dentro de la forma
  `{ ok: false, error: '<snake>' }` del proyecto), respetando el 404 genérico de D-09.

### Folded Todos

- **EXTRA-A** ← `.planning/workstreams/motor-reservas/todos/pending/2026-08-03-canchas-sin-tabs-activos-desactivados.md`
  — Canchas quedó fuera del D-14 de Phase 13: sigue con una lista única y las inactivas inline
  tachadas. Encaja como polish visual con molde ya existente en el repo.
- **EXTRA-B** ← `.planning/workstreams/motor-reservas/todos/pending/2026-08-03-borrar-definitivamente-abonos-archivados.md`
  — Los abonos archivados se acumulan sin forma de sacarlos de la lista. **Capacidad nueva**, pedida
  por el dueño en la UAT visual de Phase 13. El propio todo la marcaba como "candidata a fase propia";
  el usuario eligió meterla acá — el planner la aísla en su(s) propio(s) plan(es).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Alcance y criterios de la fase
- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 14: Cierre de backlog" (líneas 521-536) —
  goal, los 4 success criteria, nota de Security. ⚠ Su restricción "sin alterar cómo se ve el badge
  dentro del CRM" queda **superseded por D-06** de este CONTEXT.
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — POLISH-04, POLISH-05, POLISH-06, POLISH-07
  (líneas 63-66) + §"Decisiones LOCKED" (migraciones a mano) + §"Out of Scope".
- `.planning/workstreams/motor-reservas/STATE.md` — decisiones acumuladas de Phases 12 y 13 (las que
  este cierre no puede contradecir).

### Precedentes de fases previas (leer antes de codear)
- `.planning/workstreams/motor-reservas/phases/13-borrado-de-servicio-preservando-historial/13-CONTEXT.md`
  — D-08/D-09/D-10 (gate por trigger `BEFORE DELETE`) y D-14 (píldoras Activos/Desactivados). **Molde
  directo de EXTRA-A y EXTRA-B.**
- `.planning/workstreams/motor-reservas/phases/11-cierre-de-backlog/11-CONTEXT.md` — la fase gemela
  del milestone anterior: paleta semántica sin hex sueltos (D-01), pantallas de cancelación como
  gemelas (D-03).
- `supabase/migrations/065_service_snapshot_and_delete_gate.sql` — el trigger de gate a calcar para la
  066 (EXTRA-B / D-18).
- `supabase/migrations/054_abonos.sql:107` — prueba de que `appointments.abono_id` ya es
  `ON DELETE SET NULL` (D-16: no hace falta migrar el FK).

### Superficies a tocar
- `app/(dashboard)/settings/settings-client.tsx` — botones estirados por `<Card>` (`:2165`, `:2175`,
  `:1446`, `:2248`, `:2325`, `:2359`, …) + el precedente `self-start` en `:1568` (POLISH-04 / D-02);
  las píldoras Activos/Desactivados a extraer (EXTRA-A / D-13).
- `app/(dashboard)/agenda/agenda-client.tsx` (`:1035`, `:1037`, `:1047`, `:1156`),
  `app/(dashboard)/clients/clients-client.tsx` (`:601`, `:607`),
  `components/dashboard/nuevo-turno-form.tsx` (`:455`, `:460`),
  `components/dashboard/nuevo-abono-form.tsx` (`:417`, `:422`) — los 10 `w-full` explícitos (D-01).
- `components/ui/card.tsx:15` — el `flex flex-col` que causa la causa 2 de POLISH-04. **Leer, NO
  modificar**: cambiarlo afectaría toda la app.
- `components/crm/risk-badge.tsx` — variante `alto` (`:27`) y el dot (`:52-60`) (POLISH-05 / D-05).
- `app/globals.css:88-110` y `:246-258` + `app/themes.css:34-42, 105-110, 173-178` — la indirección
  `--danger` / `--danger-foreground` / `--danger-hover` por shell y por theme. **Leer para consumir,
  no redeclarar** (D-07).
- `components/crm/confirm-dialog.tsx:180-200` — por qué se referencia `--danger` y nunca
  `--crm-danger`; y `confirmButtonClass` como molde de la clase de relleno de peligro.
- `app/(dashboard)/abonos/abonos-client.tsx:479-483` — bloque de "Copiar link de baja" (POLISH-06 /
  D-08); `:533-560` — el `ConfirmDialog` de la baja (molde para EXTRA-B / D-19).
- `app/api/abonos/cancel-link/[id]/route.ts` — el gate server-side de D-09.
- `app/(dashboard)/clients/clients-client.tsx:38-58` (labels) y `:394-413` (`clientStats`) —
  POLISH-07 / D-10, D-11, D-12.
- `components/dashboard/canchas-manager.tsx` — tabs + empty states (EXTRA-A); `:362-370` el
  `ConfirmDialog` ya cableado.
- `lib/verticals.ts:45-46, 69-70, 90-91, 108-109` — confirma que todos los verticales usan sustantivo
  masculino (respalda D-12).

### Skills obligatorias
- `.claude/skills/convenciones-forjo/SKILL.md` — stack, naming, manejo de errores
  (`{ ok:false, error:'<snake>' }`), patrón `page.tsx` + `*-client.tsx`.
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — **obligatoria para EXTRA-B** (migración 066 +
  DELETE autenticado con RLS + `business_id`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`w-full sm:w-auto` ya existe** en `abonos-client.tsx:480` y `appointments-client.tsx:275` — D-01
  no inventa un patrón, alinea 10 casos a uno que ya está en el repo (3 ocurrencias hoy).
- **`self-start` ya existe** en `settings-client.tsx:1568` para el botón "Guardar cambios" — es el fix
  exacto de la causa 2 de POLISH-04, ya validado visualmente en producción.
- **Indirección `--danger` completa y dark/theme-aware**: `globals.css` (`:root` + `.crm-shell`) y
  `themes.css` (3 themes con su par `--danger-foreground` + `--danger-hover` derivados por contraste
  WCAG). POLISH-05 solo consume tokens; **no hay contraste nuevo que calcular**.
- **`ConfirmDialog` de dos estados** (`components/crm/confirm-dialog.tsx`) ya reusado en el dashboard
  desde 13-03, con `risk="alto"` en los 4 usos del panel (`abonos-client.tsx:551`,
  `settings-client.tsx:2491` y `:2530`, `canchas-manager.tsx:368`) — son exactamente las 4 pantallas
  donde se ve el efecto de POLISH-05.
- **`GET /api/abonos/cancel-link/[id]`** ya valida sesión + `business_id`; D-09 agrega un `.neq` a una
  query ya scopeada, sin superficie nueva.
- **Píldoras Activos/Desactivados** ya implementadas en Servicios (Phase 13, D-14) — EXTRA-A extrae, no
  diseña.
- **`appointments.abono_id ON DELETE SET NULL`** ya vigente desde la 054 — EXTRA-B/D-16 sale gratis.

### Established Patterns
- **Nunca nombrar el token de un shell puntual** desde un componente compartido: la indirección es el
  punto único de resolución (lección 13-05 #1). Vale para POLISH-05.
- **Gate autoritativo en la base + pre-check de UX en el cliente** (Phase 13, 13-03/13-01). Vale para
  EXTRA-B. Y el `onConfirm` **lanza** ante el rechazo tardío para que el modal no cierre.
- **Migraciones numeradas idempotentes, aplicadas A MANO a prod** coordinadas con el deploy; local se
  valida con `npx supabase db reset`. Última en prod = **065** → EXTRA-B es la **066**.
- **Copy en español, comentarios densos explicando el *por qué*** de lo no obvio.
- **Errores de dominio** `{ ok:false, error:'<snake_case>' }` con status HTTP coherente; el 404
  genérico no revela existencia (patrón de las superficies públicas de Phase 07).

### Integration Points
- **`components/ui/card.tsx` es transversal** — POLISH-04 se resuelve en los **call-sites**, nunca
  tocando `Card` (rompería toda la app).
- **`risk-badge.tsx` es un componente único de dos shells** — el cambio de D-05 impacta
  `/admin/auditoria`, `plan-price-card.tsx` (usa `risk="medio"`, no afectado) y los 4 ConfirmDialog del
  panel. Verificación visual en **ambos** shells.
- **`settings-client.tsx` es el archivo más disputado** de la fase: lo tocan POLISH-04 (causa 2) y
  EXTRA-A (extracción de píldoras). El planner debe **serializar** esos dos trabajos o cortarlos por
  regiones sin solape — es el conflicto clásico del workstream.
- **EXTRA-B toca la base** → aunque no toca el motor de reservas, la migración 066 y el DELETE
  autenticado son la única superficie de esta fase con relevancia de seguridad.

### Tests
- Suites existentes a no romper: `test/abono-cancel*.test.ts` (estados de la serie, carrera del token),
  y las de concurrencia del motor (que esta fase **no** debe tocar en absoluto).
- POLISH-04/05/12 son visuales → verificación por UAT visual, no por test unitario. ⚠ Ver
  `.planning/.../12-CONTEXT` y el aprendizaje del workstream: **`auto_advance` auto-aprueba los
  checkpoints `human-verify`** — si esta fase lleva UAT visual, hay que abrirla de verdad en el
  navegador, no confiar en el checkpoint.
- POLISH-07 (D-10/D-11) es lógica pura sobre `clientStats` → **testeable sin DB**, buen candidato a
  test unitario si la lógica se extrae a un helper.
- EXTRA-B (D-18) es un trigger → se prueba **por integración contra el Supabase LOCAL**
  (`.env.test.local` → `127.0.0.1:54321`), igual que 13-04: el mecanismo vive en la base, no hay
  función de TS que testear.

</code_context>

<specifics>
## Specific Ideas

- **POLISH-04:** "se leen poco intencional / poco premium en desktop" — el objetivo es que el botón se
  vea deliberado, no estirado por accidente. Los dos casos que dispararon el pedido son "Guardar" y
  "Liberar horarios vencidos" en **Negocio → Cobros**, y **ninguno de los dos tiene `w-full`** (D-02).
- **POLISH-05:** el usuario lo marcó como "falla general" — quiere que "Alto" **se vea rojo**, no un
  pill gris con un puntito. Aceptó que el CRM cambie de aspecto con tal de mantener un solo componente.
- **POLISH-07:** el pedido textual fue **`"Nuevo" siempre. En masculino`** — de ahí salen D-10
  (siempre) y D-12 (masculino en los 8 labels).
- **EXTRA-B:** el disparador fue ver en la UAT de Phase 13 un abono archivado ("Juan Cliente · Cancha
  de 6 · Todos los miércoles · 0 turnos", Cancelado) **sin ninguna acción disponible**.

</specifics>

<deferred>
## Deferred Ideas

- **Finanzas en mobile oculta el nombre del servicio** — el span existe y lee el snapshot correcto
  (`apptServiceName`, Phase 13) pero está oculto por `hidden sm:block` en `finances-client.tsx:890`.
  El fix correcto **no** es un `sm:` más permisivo sino cambiar la forma de la fila en mobile (dos
  líneas, molde de la tarjeta mobile de Turnos). **Diferido a propósito:** el dueño ya avisó que quiere
  rehacer Finanzas entera ("Cashflow → Actividad estilo MercadoPago"), así que se resuelve ahí adentro
  y no como parche suelto.
- **Alineación de botones como decisión de sistema de diseño** — D-03 la deja caso por caso. Si en
  algún momento se quiere una regla dura app-wide, es una revisión de patrón visual completa, no de
  esta fase.
- **Suavizar/quitar el borde lateral acentuado app-wide** — heredado de Phase 11 (D-03): se mantiene
  el patrón; cambiarlo sería una revisión de toda la app.

### Reviewed Todos (not folded)
- **`2026-08-03-finanzas-mobile-oculta-el-servicio.md`** — revisado y **NO** foldeado: pertenece al
  rediseño de Finanzas (ver arriba).
- **`2026-07-22-cupo-por-solape-…`** — ya **resuelto** por Phase 12 (el archivo sigue en `pending/`;
  candidato a archivar).
- **`2026-07-27-mensaje-borrado-servicio-…`** — ya **resuelto** por Phase 11 (EXTRA-A) y Phase 13.
- **`2026-07-28-hallazgos-uat-phase11-pre-existentes.md`** — es la **fuente** de POLISH-05, POLISH-06 y
  POLISH-07; su ítem 3 (borrado de servicio con historial) ya lo cerró Phase 13. Archivable al cerrar
  esta fase.
- **`2026-07-30-el-cupo-vive-en-dos-lugares-y-falta-el-modo-individual.md`**,
  **`2026-07-30-indicador-de-modo-en-la-lista-de-servicios.md`**,
  **`2026-07-30-ocupacion-grupal-no-visible-en-la-grilla-de-la-agenda.md`** — revisados y **NO**
  foldeados: son follow-ups del motor de cupos (Phase 12), no polish. Candidatos a un milestone
  posterior.

</deferred>

---

*Phase: 14-Cierre de backlog*
*Context gathered: 2026-08-04*
</content>
</invoke>
