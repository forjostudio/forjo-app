---
phase: 14-cierre-de-backlog
workstream: motor-reservas
reviewed: 2026-08-11T00:00:00Z
depth: standard
status: fixed
fixed: 2026-08-11T00:00:00Z
fix_commits: f077ed2..11e72e9
findings_fixed: 15
findings_deferred: 12
files_reviewed: 25
files_excluded:
  - supabase/schema.sql  # artefacto regenerado, no código escrito a mano
findings_critical: 2
findings_warning: 15
findings_info: 13
clusters:
  - id: A
    scope: "scope de shell, diálogos del CRM y remediación de T-14-41"
    detail: 14-REVIEW-A.md
    files: 12
  - id: B
    scope: "abonos, settings, agenda, clientes y la migración 066"
    detail: 14-REVIEW-B.md
    files: 13
---

# Phase 14 — Cierre de backlog · Code review

**Veredicto: `issues_found` — 2 críticos, 15 warnings, 13 info.**

## Cómo se corrió

El review se dividió en **dos clusters paralelos**. No es una preferencia de estilo: una primera
corrida con los 25 archivos en un solo agente murió por error de API a los **215k tokens** sin escribir
nada. Cada cluster escribió su propio archivo de detalle; este documento es el índice canónico y
renumera los hallazgos para que no haya dos `CR-01`.

| Cluster | Alcance | Detalle | Archivos |
|---|---|---|---|
| A | Scope de shell, diálogos del CRM, remediación de T-14-41 | `14-REVIEW-A.md` | 12 |
| B | Abonos, settings, agenda, clientes, migración 066 | `14-REVIEW-B.md` | 13 |

**Exclusión declarada:** `supabase/schema.sql` quedó fuera a propósito — es un artefacto regenerado.
Ningún otro archivo del scope se recortó.

---

## Críticos

### CR-01 — El outline destructivo pierde la señal de peligro al recibir foco *(cluster A)*

**Archivo:** `components/crm/confirm-dialog.tsx:253` · **Verificado de forma independiente por el orquestador.**

`buttonVariants` (`components/ui/button.tsx:7`) trae en su base
`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`. La rama outline declara
`border-2 border-[var(--danger)]` y **no** la pisa. tailwind-merge deja convivir las dos clases —mismo
grupo, distinto modificador— y en CSS el selector con `:focus-visible` (0,2,0) gana contra el plano
(0,1,0).

Como en la rama outline **el borde es la única señal de peligro** (texto en `--foreground`, fondo
transparente), al tabular hasta el botón de confirmar el borde se pinta con `--ring`, que **es la
paleta del negocio**: `[data-palette="green"] { --ring:#2f8a5b }`, `emerald` → `#10b981`.

Es el mismo defecto que T-14-41 vino a cerrar, reaparecido en el estado de foco. Se alcanza con **un
solo `Tab`**: en los ConfirmDialog simples del panel (`abonos-client.tsx:644` y `:668`, `risk="alto"`
+ `destructive`, sin `confirmWord`) el orden del DOM es `Cancelar` → confirmar.

**Por qué el guard no lo atrapó:** el test hace `not.toMatch(/primary/)` sobre el **string que devuelve
el helper**, no sobre el elemento renderizado. La clase que rompe vive en otro archivo. Es la misma
lección que la auditoría ya había señalado una capa más arriba — el guard prueba el contrato, no el
resultado.

**Fix propuesto:** `focus-visible:border-[var(--danger)] focus-visible:ring-[var(--danger)]/40` en la
rama outline.

### CR-02 — El endpoint que emite el link de baja no declara `Cache-Control: no-store` *(cluster B)*

**Archivo:** `app/api/abonos/cancel-link/[id]/route.ts:88` · **Verificado de forma independiente por el orquestador.**

La respuesta devuelve la URL que contiene el `cancel_token` —una credencial que **no rota ni vence**—
en un `Response.json` sin cabecera de cacheo. La cabecera del propio archivo declara que el endpoint
existe justamente para sacar ese secreto de la caché del navegador y del bfcache: se movió del payload
RSC a una respuesta HTTP que tampoco declara que no se debe almacenar.

El repo ya aplica `no-store` en endpoints **mucho** menos sensibles: `agent/context`,
`agent/inbox/state`, `booking/availability`, `onboarding/slug-available`.

**Fix:** una línea.

---

## Warnings

### Cluster A — fragilidad de los guards escritos en esta misma fase

| ID | Hallazgo |
|---|---|
| WR-A1 | La guarda de contraste lee **solo `app/globals.css`**. `app/themes.css` declara su propio `--destructive` (`#e5484d` / `#c0876b` / `#ff2e7e`) y su `--popover` es un `color-mix` que depende de la paleta. El comentario promete una cobertura que no existe. |
| WR-A2 | Los tests miden contra `--popover`, pero el botón se renderiza sobre el `DialogFooter` (`bg-muted/50`, `dialog.tsx:118`). El par medido no es el par que se pinta. |
| WR-A3 | La aserción anti-fuga solo mira `app/(dashboard)/layout.tsx`: montar el proveedor en cualquier otro archivo pasa sin test rojo. |
| WR-A4 | `lastIndexOf('portalScopeClass(') > popupAt` (`shell-scope.test.ts:82`) es tan laxo que mover el scope al `DialogTitle` deja la suite **verde**. |
| WR-A5 | El proveedor alcanza `/admin/negocios/[id]/ver`, la página que escapa del shell a propósito (`.impersonation-view`, D-12). Hoy latente —no hay diálogos ahí—, sin nada que lo impida mañana. |
| WR-A6 | `handleConfirm` trata el early-return de `buildSubmitGuard` como éxito y cierra con `onOpenChange`, salteando el guard de `handleOpenChange`. |
| WR-A7 | **Falso rojo latente:** `[^)]*` en las regex de cableado rompe con `confirmButtonClass(Boolean(x), shellScope)`, y `shellScope:\s*string\s*\)` rompe con trailing comma o un tercer parámetro. |
| WR-A8 | Ver `14-REVIEW-A.md` para el detalle restante. |

### Cluster B

| ID | Hallazgo |
|---|---|
| WR-B1 | Las dos queries de `cancel-link` **descartan el `error`**: una caída de Postgres se disfraza de `404 not_found`. |
| WR-B2 | La emisión de una credencial permanente no deja **ni una línea de log**, contra la convención del repo. Un dueño con dos filas en `businesses` con su `owner_id` queda con 404 permanente y mudo por el `maybeSingle()`. |
| WR-B3 | **La 066 afirma "la BASE es la autoridad", y se puede esquivar en dos llamadas.** La policy `abonos tenant update` permite `PATCH status='cancelled'` → `DELETE`: el trigger ve `OLD.status = 'cancelled'` y deja pasar el borrado, salteando el motor de baja y dejando turnos futuros vivos con `abono_id = NULL`. **Requiere una migración correctiva 067 — no se edita la 066, que ya está aplicada en producción.** No es cross-tenant (el dueño actúa sobre su propio negocio); es integridad de datos. |
| WR-B4 | `canchas-manager.tsx:175-181`: `setDelPending(count ?? 0)` con el `error` descartado convierte un pre-check fallido en "0 reservas próximas", y el modal de hard-delete oculta el aviso. Es la regresión exacta de la lección que la Phase 13 ya arregló en `d6c8ef8`. |
| WR-B5 | El fallback de "Copiar link" pinta el token en un `toast.error({ description: url })`, reintroduciendo el vector de session replay / screenshot que el endpoint on-demand existe para cerrar. |
| WR-B6 | Ver `14-REVIEW-B.md` para el detalle restante. |

---

## Lo que se verificó y está bien

No todo el review es hallazgo. Estas afirmaciones se comprobaron contra el código, no se asumieron:

**Cluster A**
- **Anti-fuga sólida:** `ShellScopeProvider` se monta en un único archivo de todo el repo. `.crm-shell`
  (`globals.css:235-262`) y `.dark` (`:142-175`) declaran **solo** custom properties, así que aplicar el
  scope al popup es inocuo.
- **Orden de `cn()` correcto:** los 33 `<DialogContent>` pasan como mucho `sm:max-w-*`; cero colisión.
- **`--danger` resuelve fuera del shell:** `:root { --danger: var(--destructive) }` (`globals.css:99`),
  así que el outline no queda sin borde en el panel.
- **`contrastRatioHex` no duplica matemática:** reusa los helpers internos; parseo de 3/6 dígitos,
  mayúsculas, con y sin `#`.

**Cluster B**
- El gate `.neq('status','cancelled')` viaja **dentro** de la query, sobre una columna `NOT NULL` con
  `CHECK` de 3 valores: no puede perder filas por NULL.
- Los tres rechazos del endpoint comparten cuerpo, status y forma de query — **sin oráculo de
  existencia**, ni por mensaje ni por timing.
- Aislamiento doble (RLS + `.eq('business_id')`), con el tenant resuelto por `owner_id` del actor.
- El trigger de la 066 no puede cancelar el borrado en silencio, y su cascade-guard es correcto:
  `abonos_business_id_fkey` es `ON DELETE CASCADE` y el padre se borra antes de la acción referencial.
- La limpieza de `showExtra` / `proExtraOpen` / `ServiceTab` / `SERVICE_TABS` es **completa** (0
  huérfanos), y los campos visibles siguen cableados vía `proToPayload`.
- La migración de Servicios a `active-tabs` es equivalente byte a byte.

---

## Contexto de entorno (no son hallazgos de código)

- `npx vitest run` completo falla hoy con ~9 tests y 23 suites caídas, **todas** por
  `Test timed out in 5000ms` contra el Supabase LOCAL, que tarda 2.16s al root (3 stacks levantados a
  la vez). Diagnóstico cerrado, ajeno al código.
- Gates verificados de forma independiente: `./node_modules/.bin/tsc --noEmit` exit 0 ·
  `npm run build` exit 0 · suites unitarias tocadas 46/46.
- Residuales de contraste ya registrados en `14-SECURITY.md` §7 (borde en `spa` claro 2.72:1; par
  relleno del CRM 3.15:1): **deuda pre-existente**, requiere `app/globals.css` / `app/themes.css`.

---

## Ronda de fixes — 2026-08-11 (`--fix`, alcance críticos + warnings)

14 commits (`f077ed2`..`11e72e9`), 10 archivos. Dos fixers en paralelo sobre archivos disjuntos.
**Gates verificados de forma independiente sobre el árbol combinado:** `./node_modules/.bin/tsc --noEmit`
exit **0** · `npm run build` exit **0** · **62/62** en las 4 suites tocadas. Ningún archivo prohibido en
el diff (`globals.css`, `themes.css`, `risk-badge.tsx`, `066_*.sql`, `package*.json`).

| ID | Estado | Commit | Nota |
|---|---|---|---|
| CR-01 | **fixed** | `ef596d3` | La rama outline pisa el foco. Prueba de mutación con `twMerge` real: sin el fix, `focus-visible:border-ring` sobrevivía al merge. |
| CR-02 | **fixed** | `f077ed2` | `no-store` en las **6** respuestas del handler, incluidos el 401 y los cuatro 404 — si no, la cabecera sería un oráculo. |
| WR-A1 + WR-A2 | **fixed** | `6bc21d4` | Cobertura extendida a 32 contextos y a la superficie real (`bg-muted/50` compuesto sobre `--popover`). Corrige dos números de `14-SECURITY.md` §7. |
| WR-A3 | **fixed** | `481aec0` | La anti-fuga afirma **unicidad de montaje** en todo el repo, no ausencia en un archivo. |
| WR-A4 | **fixed** | `c4d39d7` | La aserción ata el scope al Popup. Mutación verificada: mover el scope al `DialogTitle` ahora pone la suite roja. |
| WR-A5 | **fixed** | `160af57` | `<ShellScopeProvider scope="">` en la vista de impersonación. Se eligió el fix sobre el test que solo avisa después. |
| WR-A6 | **fixed** | `02905b1` | El guard devuelve `boolean`; el cierre pasa por `handleOpenChange`. |
| WR-A7 | **fixed** | `06ac972` | `callArgs()` balancea paréntesis. Limitación documentada: un `)` dentro de un string literal descuadraría el conteo (ningún call-site pasa strings). |
| WR-B1 | **fixed** | `c348d8a` | `500 server_error` para fallo de infra; `22P02` sigue siendo 404 a propósito. |
| WR-B2 | **fixed** | `25b99a9`, `11e72e9` | Logging de la emisión **sin token ni URL**. `maybeSingle()` → `order + limit(2)`; desempate por `id` porque `created_at` es nullable. |
| WR-B3 | **fixed (migración escrita, NO aplicada a prod)** | `4004be9` | Ver abajo. |
| WR-B4 | **fixed** | `42c29c9` | Fail-closed espejando `d6c8ef8`: sentinela `'error'`, no un `0`. |
| WR-B5 | **fixed** | `af46856` | La credencial sale del toast. |

### El enfoque propuesto por el review para WR-B3 era incorrecto

El review proponía un trigger `BEFORE UPDATE` que rechazara `active → cancelled` con turnos futuros
vivos. **Habría roto todas las bajas legítimas en producción:** el motor (`lib/abono-cancel.ts`) escribe
el estado **primero** (`:210-216` — ahí vive el gate atómico anti-doble-mail de D-05/T-07-03) y recién
después cancela los turnos en masa (`:277-284`). El instante que el trigger habría bloqueado es
exactamente el de una baja normal.

La 067 pone la regla del lado del **DELETE** y la hace mirar *qué le cuelga* a la serie, no *cómo llegó*
a su estado: si tiene turnos con `abono_id = OLD.id`, del tenant, `date >= hoy AR` y
`status IS NULL OR status NOT IN ('cancelled','completed')` ⇒ `RAISE 'abono_has_future_turns'`
(`P0001`). Independiente del camino, así que el bypass no se rearma con `PATCH status='completed'`.
La rama `status IS NULL` es obligatoria: sin ella, `NOT IN` sobre NULL abre el gate (la trampa que ya
pagó la 065).

**Consumidor del bypass dentro del repo:** `purgeAbonos` (`test/helpers/booking-fixtures.ts`) hacía
`UPDATE status='cancelled'` + `DELETE` sin tocar los turnos. Corregido en el mismo commit; sin eso la
067 habría roto los cleanups de las suites de abonos.

**Cambio de comportamiento aprobado por el dueño (2026-08-11):** D-17 decía que una serie `completed`
se borra aunque tenga turnos futuros vivos. Con la 067 ese borrado se **rechaza** hasta que no queden.
No deja sin salida — `completed → cancelled` está permitido (D-21), esa baja cancela los turnos, y
después la serie se borra. El dueño eligió esto sobre acotar la regla a `cancelled`, que habría dejado
el mismo agujero con otra palabra.

### Abierto a propósito

| Ítem | Motivo |
|---|---|
| **067 sin aplicar a producción** ni espejada en `supabase/schema.sql` | Las migraciones de este repo se aplican a mano y en orden. Aplicada solo al Postgres **local** (`docker exec … psql`, sin `db reset`). Pasos en la respuesta de la ronda. |
| **UAT visual del estado de foco** (R-3 de `14-SECURITY.md` §7) | CR-01 cambia el foco de los 5 modales destructivos del panel; el halo pasa de `--ring`/50 a `--danger`/40. Nadie lo miró en un navegador. |
| WR-05, WR-07, WR-08 y IN-01..IN-07 | Fuera del alcance de `--fix` sin `--all` (críticos + warnings del índice). WR-05 es un one-liner en un archivo ya tocado: `hideConfirm={delPending === null \|\| delPending === 'error'}`. |
| Flakiness de `abono-generation` bajo ejecución paralela | Pre-existente y ajena: esa suite no importa `purgeAbonos` ni borra abonos, y pasa 11/11 corrida sola. |

---

*Phase: 14-cierre-de-backlog · Workstream: motor-reservas · Review: 2026-08-11 · Fixes: 2026-08-11 · Detalle: `14-REVIEW-A.md`, `14-REVIEW-B.md`*
