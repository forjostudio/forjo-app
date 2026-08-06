---
phase: 14-cierre-de-backlog
plan: 07
subsystem: testing
tags: [uat, verificacion-humana, migracion, produccion, riskbadge, abonos, canchas, clientes]
status: complete

# Dependency graph
requires:
  - plan: 14-01
    provides: "POLISH-04 (17 botones) + POLISH-05 (RiskBadge 'Alto' con relleno de peligro) — lo que esta UAT mira"
  - plan: 14-02
    provides: "POLISH-07 (lib/client-status.ts, umbral 60 días, labels en masculino) + POLISH-04 en Clientes"
  - plan: 14-03
    provides: "POLISH-06 (gate server-side del cancel-link con 404 genérico)"
  - plan: 14-04
    provides: "migración 066 + runbook del apply manual en producción"
  - plan: 14-05
    provides: "EXTRA-A (módulo compartido de tabs; Servicios sin regresión, Canchas con paridad)"
  - plan: 14-06
    provides: "EXTRA-B (botón Eliminar sobre serie archivada) y los 4 pasos manuales que dejó pendientes por no tener navegador"
provides:
  - "las 23 observaciones humanas de la UAT (10 visuales + 13 funcionales) con la evidencia real, no una aprobación"
  - "estado declarado del apply de la migración 066 en producción: APLICADA el 2026-08-06, con el rechazo del gate verificado en prod"
  - "cierre end-to-end de T-14-16 (camino de rechazo del gate con el modal abierto), que 14-06 dejó explícitamente pendiente"
  - "la lista de gaps abiertos que abre el plan 14-08 dentro de esta misma fase"
affects: [14-08, cierre-de-milestone, deploy, crm, equipo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "una UAT que exige observaciones transcritas encuentra regresiones que el pipeline verde no ve (tsc/vitest/build no dicen si dos chips se ven del mismo color)"
    - "verificar un gate de borrado en producción exige forzar la fila dentro de una transacción abortada: un DELETE que no matchea filas sale limpio y es indistinguible de un gate roto"

key-files:
  created:
    - .planning/workstreams/motor-reservas/phases/14-cierre-de-backlog/14-07-SUMMARY.md
  modified: []

key-decisions:
  - "El botón 'Eliminar' y el badge 'Alto' compartiendo la familia de color de --danger se DEJA COMO ESTÁ (decisión del dueño): D-05 se cumple, el badge es chico y el botón es la acción."
  - "D-01 NO se reabre: los dos paneles laterales angostos marcados como riesgo por 14-01 y 14-02 se ven deliberados en pantalla."
  - "La falla del punto 2.3 (Alto ≡ Medio dentro de los modales del CRM) NO se parchea desde este plan: se abre el plan 14-08 dentro de esta misma fase, como manda el objetivo del 14-07."
  - "La 066 se aplicó a producción a mano, ANTES del deploy del código de 14-06 — la base va adelante del código, que es el orden correcto del runbook."

patterns-established:
  - "Contaminación de datos entre pasos de una UAT: si un paso borra la fila que el siguiente necesita, el resultado del siguiente es INVÁLIDO aunque 'pase' — se resiembra y se re-corre."
  - "Producción no tiene libro de migraciones (supabase_migrations.schema_migrations no existe): el 'última aplicada = NNN' se lleva por convención y documentación, no por la base."

requirements-completed: [POLISH-04, POLISH-05, POLISH-06, POLISH-07, EXTRA-A, EXTRA-B]

# Metrics
duration: sesión interactiva (3 checkpoints humanos bloqueantes)
completed: 2026-08-06
---

# Phase 14 Plan 07: UAT visual y funcional + apply de la 066 en producción Summary

**Las 23 observaciones de la UAT se levantaron mirando la aplicación: 13/13 pasan en lo funcional (incluido el camino de rechazo del gate con el modal abierto, que 14-06 no había podido correr), la migración 066 quedó aplicada en producción con su rechazo verificado en vivo, y la UAT visual cerró CON UNA FALLA — dentro de los modales del CRM el chip "Alto" y el "Medio" se ven del mismo color, que es una regresión de 14-01 y abre el plan 14-08.**

## Estado por task

| Task | Qué | Resultado |
|---|---|---|
| 1 | Entorno de UAT y sembrado de casos | Hecho — los casos quedaron identificados por nombre en pantalla |
| 2 | UAT visual (10 puntos, POLISH-04 / POLISH-05 / EXTRA-A) | **CERRADO CON 1 FALLA** (punto 3) — 9 puntos OK, 1 regresión |
| 3 | UAT funcional (13 puntos, POLISH-06 / POLISH-07 / EXTRA-B) | **13/13 PASA** |
| 4 | Apply manual de la migración 066 en producción | **APLICADA el 2026-08-06**, con el rechazo verificado en prod |

⚠ **Este plan no modificó una sola línea de `app/`, `lib/` ni `components/`.** Es un plan de evidencia. La falla del punto 2.3 se registra, no se parchea.

## Task 1 — Entorno y datos del caso

Entorno local levantado y sembrado por el orquestador con un script **idempotente**, que resultó indispensable: hubo que resembrar a mitad de la Task 3 (ver el punto 13). Los casos quedaron con nombre visible en pantalla y son los que se citan en las observaciones:

| Caso | Nombre en pantalla | Para qué punto |
|---|---|---|
| Cliente sin ningún turno, creado hoy | **UAT Sin Turnos** (ficha #005) | 3.1, 3.3 (D-10) |
| Cliente con última visita ~50 días | **UAT Ultima Visita 50 Dias** | 3.4 (D-11) |
| Serie de abono dada de baja | serie archivada del tab Archivados | 3.6, 3.8, 3.10 |
| Serie con todas las sesiones asignadas | **UAT Abono Completo** (`completed`, 4 sesiones) | 3.12 |
| Serie activa | **Juan Cliente** | 3.7, 3.9 |
| Cancha activa + cancha desactivada | **Cancha A** y su par | 2.10 (D-15) |

**Desbloqueo necesario para la Task 2:** `test@forjo.local` no tenía rol admin y `/admin/auditoria` no abría. El orquestador seteó `raw_app_meta_data.is_admin = true` en el Supabase **LOCAL** para poder verificar el shell del CRM. Producción no se tocó.

## Task 2 — UAT visual — 10 observaciones (CERRADO CON 1 FALLA)

### A — POLISH-05, los dos shells (D-06)

**1. `/admin/auditoria` (shell del CRM).** El chip "Alto" se ve **rojo** y **sin puntito** a la izquierda.

**2. Los 4 ConfirmDialog.** El chip "Alto" se ve **igual en los cuatro**; ninguno quedó gris. Observación extra del dueño: el botón "Eliminar" comparte la familia de color del badge — los dos resuelven `--danger`. **Decisión del dueño: se deja como está.** D-05 se cumple; el badge es chico y el botón es la acción.

**3. ⛔ FALLA — regresión de esta fase.** Comparado contra un chip "Medio" (modal "Cambiar plan" en `/admin/negocios`), **"Alto" y "Medio" se ven DEL MISMO COLOR**. El criterio de aceptación de D-05 ("Alto pesa más que Medio") **NO se cumple dentro de los modales del CRM**.

  **Causa raíz diagnosticada.** `.crm-shell` se aplica sobre un `<div>` en `app/(crm)/layout.tsx:47`, pero `DialogContent` se monta dentro de `<DialogPortal>` (el `Portal` de base-ui), o sea en la raíz del documento, **fuera de ese div**. Adentro del modal ni `--primary` ni `--danger` toman los valores del CRM: `alto` (`--danger`) cae a `--destructive` y `medio` (`bg-primary`) cae al primary de la app — los dos rojos. Antes de 14-01, `alto` era `bg-secondary` (pill oscuro con puntito) y se distinguía igual; el cambio a relleno de peligro los hizo colisionar.

  **Efecto colateral descubierto.** El comentario de `components/crm/confirm-dialog.tsx:200-202` afirma que se reusa el RiskBadge "para que Medio se vea amarillo" — **Medio NUNCA se vio amarillo dentro de un modal**. Ese pedazo ya estaba roto de antes y nadie lo había mirado. Es la misma clase de bug que el gap 13-05 #1 que el JSDoc del RiskBadge cita.

  **`bajo`:** el dueño no encontró un chip Bajo en pantalla. Por código usa `bg-secondary` + `text-muted-foreground`, neutrales en los dos shells → no afectado por esta falla.

  **Destino: plan 14-08, prioridad 1.**

**4.** Se lee bien en tema **claro y oscuro**.

### B — POLISH-04, ancho de botones (375px y ≥1280px)

**5.** `Negocio → Cobros`: "Guardar" y "Liberar horarios vencidos" quedan a **ancho de contenido en desktop** y siguen cómodos de tocar en mobile. OK.

**6.** Resto de Ajustes: **0 botones** ocupando todo el ancho de su tarjeta en desktop (esperado). *Hallazgo fuera de alcance:* en `Equipo`, el toggle "Al reservar, ¿preseleccionar «Cualquiera»?" ocupa el ancho completo. `app/(dashboard)/equipo/` **no está entre los 5 archivos de POLISH-04** y ningún plan de la fase lo tocó → **gap de cobertura, no regresión**.

**7. Veredicto sobre los dos paneles laterales angostos (D-01).** Los dos puntos que 14-01 y 14-02 marcaron como riesgo — el panel angosto de `Agenda → Días especiales` y el panel lateral de `/clients` con Exportar/Importar CSV + "Nuevo cliente" — **se ven bien y deliberados**. **La decisión D-01 NO se reabre.** *Hallazgo fuera de alcance:* algunos botones "+ Agregar" de `Equipo` se ven sin centrar verticalmente.

**8.** Los dos "Guardar" de la ventana de reserva (Agenda y Abonos) se ven **idénticos**. El sub-punto del "aviso de duplicado" **no se entendió** — defecto de redacción del plan, no de la implementación. *Hallazgo fuera de alcance:* en el modal "Nuevo abono" el selector de **Profesional** lista canchas ("Cancha A"); es el modelo de v0.13 (cancha = `professional` con `service_id`) sobre un negocio de vertical *general*. El dueño: "en la práctica no pasa, solo aviso".

### C — EXTRA-A

**9.** `/servicios` se ve **igual que antes de la fase** → **cero regresión visual de EXTRA-A confirmada por ojo**, no solo por código. *Hallazgo fuera de alcance:* aparece un aviso amarillo ("«Recurso simultáneo» no está disponible: este servicio se atiende en una agenda con un espacio asignado…") al existir una cancha, y la cancha se agrega sola como espacio compartido en `Equipo`. Lo introdujo `052d875 fix(12)` en **Phase 12**, no esta fase; es el cruce v0.12 (espacios) × v0.13 (cancha = professional).

**10.** Canchas: aparecen las **dos píldoras con contadores correctos**, al desactivar una cancha **se mueve sola de tab**, el tab vacío muestra el **panel punteado**, y **ninguna cancha desactivada quedó tachada** → **D-15 cerrado**.

## Task 3 — UAT funcional — 13 observaciones (13/13 PASA)

### D — POLISH-07

**1.** **UAT Sin Turnos** aparece en el tab **Nuevos**, con badge `NUEVO` y ficha **#005** → **D-10 cerrado**: 0 visitas ya no cae en Pausa.

**2.** Las 5 píldoras: **`Todos · Frecuentes · Activos · Nuevos · Pausa`** — todas en masculino salvo "Frecuentes" y "Pausa", que es lo esperado.

**3.** La ficha muestra `CLIENTE RECIENTE — "Pocas visitas, pedile feedback y ofrecele su segundo servicio con descuento"`: la sugerencia de **reciente**, NO la de pausado.

**4.** **UAT Ultima Visita 50 Dias** (última visita hace ~50 días) cayó en **Activos**, fuera de "Pausa" → **D-11 confirmado con dato real** (umbral unificado en 60 días).

**5.** N/A: el negocio de prueba es de vertical *general*, el filtro de obras sociales no aparece. Sin cambio.

### E — POLISH-06

**6.** Serie dada de baja: **NO** aparece el botón "Copiar link de baja" ni el párrafo de mandarlo por WhatsApp; sin texto huérfano ni hueco raro. OK.

**7.** Serie activa: el botón y su párrafo **siguen ahí**. OK — la acción solo desaparece para las dadas de baja.

**8. El núcleo de POLISH-06.** `/api/abonos/cancel-link/<id-de-serie-dada-de-baja>` y `/api/abonos/cancel-link/<id-inventado>` devolvieron **exactamente el mismo cuerpo**:

```json
{ "ok": false, "error": "not_found" }
```

**El rechazo es indistinguible de un id inexistente** (D-09 / T-14-08: el endpoint no es oráculo de existencia).

### F — EXTRA-B

**9.** Serie activa (**Juan Cliente**): **NO** ofrece "Eliminar". OK.

**10.** Serie archivada: **SÍ** ofrece "Eliminar"; al confirmar desaparece de la lista y **los contadores de los dos tabs se actualizan**. OK.

**11. D-16 cumplido.** Tras borrar la serie, sus turnos **siguen en Finanzas** con nombre de servicio y precio (`Corte $5.000`, 6 turnos del mes) y **en la ficha del cliente** (historial de 10 visitas). La diferencia 6 vs 10 es el corte por mes de Finanzas contra el histórico de la ficha, **no un faltante**.

**12.** **UAT Abono Completo** (`completed`, 4 sesiones asignadas): **también se borra**. OK.

**13. Camino de rechazo — el backstop del gate 066, y el paso que 14-06 dejó explícitamente pendiente por no tener navegador.** Con el modal de eliminar abierto sobre una serie archivada, se cambió su estado a `active` por SQL y se confirmó: **el modal NO cerró** y apareció el toast:

> *"No se puede eliminar: la serie sigue activa. Dala de baja primero y después eliminala."*

→ **T-14-16 cerrado end-to-end.**

  **NOTA DE PROCESO.** La primera corrida de este punto fue **INVÁLIDA**: la serie `…00a2` ya había sido borrada en el punto 10, así que el `UPDATE` afectó **0 filas** y el modal borró legítimamente otra serie archivada. El orquestador detectó la contaminación, resembró con el script idempotente de la Task 1 y el punto se re-corrió limpio. **El resultado registrado arriba es el de la corrida válida.**

## Task 4 — Apply de la migración 066 en producción

**Estado: 066 APLICADA EN PRODUCCIÓN el 2026-08-06.** Cero comandos `db push` (T-14-18 / T-14-28 cumplidos).

- **Pre-check.** `select version from supabase_migrations.schema_migrations` falló con **`42P01: relation does not exist`**. Es **esperado** y vale registrarlo como observación operativa del proyecto: las migraciones se aplican a mano y nunca por `db push`, y esa tabla la crea el CLI — **producción no tiene libro de migraciones**. El "última aplicada = 065" se lleva por convención y documentación, no por la base.
- **(a) Trigger.** `abonos_block_delete_trg`, `tgenabled = 'O'` → **HABILITADO en producción**.
- **(b) Rechazo de serie activa — VERIFICADO EN PRODUCCIÓN.** Dentro de una transacción abortada (`begin; update … set status='active'; delete …; rollback;`), el borrado devolvió:

  ```
  ERROR: P0001: abono_is_active
  CONTEXT: PL/pgSQL function abonos_block_delete() line 38 at RAISE
  ```

  **Ningún dato real se modificó:** la transacción quedó abortada y se revirtió.

  *Nota metodológica.* La primera versión de esta prueba (`delete` directo sobre `where status='active'`) devolvió "Success" y fue declarada **INCONCLUSA** por el orquestador — un `DELETE` que no matchea ninguna fila sale limpio sin que el trigger corra, así que era **indistinguible de un gate roto**. Se rehízo forzando la existencia de una fila activa dentro de la transacción.
- **(c) Borrado de serie archivada:** **NO ejercitado en producción.** Cubierto por `test/abono-delete-gate.test.ts` (7 casos) contra el Postgres local y por la lógica del trigger, que solo levanta con `status = 'active'`.
- **Orden respecto del deploy.** La base quedó **adelante** del código, que es el orden correcto del runbook de 14-04. El gate está vivo en prod rechazando borrados que hoy nadie puede pedir, **porque el botón "Eliminar" de 14-06 todavía no está deployado**.

## Gaps abiertos → plan 14-08

El plan 14-07 declara: *"Si un checkpoint encuentra un problema, se abre un plan de cierre."* El dueño eligió **abrir un plan 14-08 dentro de esta misma fase**.

| # | Ítem | Origen | Destino |
|---|---|---|---|
| 1 | "Alto" y "Medio" indistinguibles dentro de los modales del CRM: el `DialogPortal` monta fuera de `.crm-shell` y los dos tokens caen a rojos de la app. Rompe el criterio de aceptación de D-05. | **Regresión de 14-01** | **14-08 · prioridad 1** |
| 2 | Toggle "Al reservar, ¿preseleccionar «Cualquiera»?" de `Equipo` a ancho completo | Gap de cobertura de POLISH-04 | 14-08 |
| 3 | Centrado vertical de los botones "+ Agregar" de `Equipo` | Gap de cobertura de POLISH-04 | 14-08 |
| — | Canchas en el selector de Profesional del modal "Nuevo abono" | Modelo v0.13, no pulido | Backlog |
| — | Aviso amarillo de "Recurso simultáneo" + cancha auto-agregada como espacio compartido | Phase 12 (`052d875`) × v0.13 | Backlog |

**Pista para el ítem 1 (no es el diseño del arreglo, eso es trabajo del 14-08):** el patrón ya existente en el repo para esta misma clase de bug es `confirmButtonClass()` en `components/crm/confirm-dialog.tsx` (gap 13-05 #1) — la indirección vive en `globals.css` y un componente compartido **nunca** nombra el token de un shell puntual. El arreglo probablemente tenga que hacer que **el portal herede los tokens del shell**, no cambiar el RiskBadge. **No se diseña acá.**

## Decisions Made

- **El badge "Alto" y el botón "Eliminar" compartiendo familia de color se deja como está.** D-05 se cumple; el badge es chico y el botón es la acción. Decisión explícita del dueño ante la observación del punto 2.2.
- **D-01 no se reabre.** El punto 7 era el único de la UAT donde una respuesta negativa podía revisar una decisión LOCKED; los dos paneles angostos se ven deliberados.
- **La falla del punto 2.3 no se parchea desde este plan.** El objetivo del 14-07 lo prohíbe explícitamente ("este plan no modifica código"). Se abre 14-08 dentro de la misma fase en vez de mandarlo al backlog, porque es una **regresión** introducida por 14-01 y no un ítem de higiene.
- **La 066 va antes que el deploy.** Se aplicó con el código de 14-06 todavía sin servir, siguiendo el orden del runbook: el gate más restrictivo primero, la capacidad después.

## Deviations from Plan

**Ninguna desviación de código — el plan no toca código.** Dos apartamientos del guion de los checkpoints, los dos hacia más rigor:

**1. [Regla 3 — blocking] `/admin/auditoria` no abría: faltaba el rol admin**
- **Encontrado en:** Task 2, punto 1.
- **Issue:** `test@forjo.local` no tenía `raw_app_meta_data.is_admin`, así que el shell del CRM era inalcanzable y el punto 1 no se podía observar.
- **Fix:** se seteó `is_admin = true` en el Supabase **LOCAL**. Producción intacta.
- **Impacto:** ninguno sobre el código; era un pre-requisito del entorno que el plan no había previsto.

**2. [Rigor] La verificación (b) de la Task 4 se rehízo por INCONCLUSA**
- **Encontrado en:** Task 4, paso 4 del runbook.
- **Issue:** el `delete` directo sobre `where status='active'` en prod devolvió "Success" — pero sin filas que matchear el trigger nunca corre, así que el resultado era indistinguible de un gate roto. Declararlo verde habría sido un falso verde en producción.
- **Fix:** se rehízo dentro de una transacción abortada que **fuerza** la existencia de una fila activa, y ahí sí devolvió `P0001 / abono_is_active`.
- **Impacto:** ninguno sobre datos reales (la transacción se revirtió). Es la evidencia real del gate en prod.

**3. [Rigor] El punto 13 de la Task 3 se re-corrió por contaminación de datos**
- Ver la NOTA DE PROCESO del punto 13. La primera corrida fue inválida y se descartó; el resultado registrado es el de la corrida limpia sobre datos resembrados.

## Issues Encountered

- **El sub-punto del "aviso de cliente duplicado" (punto 2.8) no se entendió** — defecto de redacción del plan, no de la implementación. Queda sin verificar; no bloquea nada.
- **Producción no tiene tabla de migraciones** (`supabase_migrations.schema_migrations` no existe). El pre-check (a) del runbook de 14-04 **no es ejecutable tal cual está escrito** contra este proyecto. Conviene corregir el runbook para futuras migraciones: el baseline se lleva por documentación (STATE.md / SUMMARY), no por la base.

## User Setup Required

**Ninguna pendiente.** La única acción externa que este plan requería —el apply manual de la 066 en producción— **está hecha** (2026-08-06). No queda ningún bloqueante operativo de base de datos para el deploy de la fase.

## Next Phase Readiness

- **Los 4 Success Criteria de Phase 14 en el ROADMAP están verificados mirando la aplicación.** El único criterio que **no** queda satisfecho en su totalidad es el 2 (POLISH-05): funciona fuera del CRM, pero **dentro de los modales del CRM** "Alto" no pesa más que "Medio".
- **Phase 14 NO está cerrada:** queda el plan **14-08** con los 3 ítems de la tabla de gaps. El ítem 1 es la única regresión de la fase.
- **Base de producción lista:** la 066 está aplicada y el gate verificado en vivo. El deploy del código de 14-06 puede salir cuando se quiera, en el orden correcto.
- **Deuda registrada para el cierre del milestone:** los 2 ítems de backlog de la tabla (canchas en el selector de "Nuevo abono", aviso de "Recurso simultáneo") vienen de v0.13 y de Phase 12, no de esta fase.

## Self-Check: PASSED

Artefacto verificado en disco:
- `.planning/workstreams/motor-reservas/phases/14-cierre-de-backlog/14-07-SUMMARY.md` — FOUND

Contenido verificado contra los `acceptance_criteria` del plan:
- Task 2 — **10 observaciones numeradas**, cada una con lo visto en pantalla · punto 1 con color concreto (rojo) y ausencia de puntito · punto 3 con el veredicto de peso relativo (**FALLA**) · punto 6 con el número de botones estirados (**0**) · punto 7 con veredicto explícito sobre los dos paneles · punto 9 con el veredicto de regresión (**ninguna**) · punto 10 con canchas tachadas (**ninguna**)
- Task 3 — **13 observaciones numeradas** · punto 1 con tab (Nuevos) y badge (`NUEVO`) · punto 2 con las 5 píldoras transcritas · punto 8 con el cuerpo de las **dos** respuestas y la declaración de que son idénticos · punto 11 con nombre de servicio y precio · punto 13 con el estado del modal y el mensaje literal
- Task 4 — estado declarado **sin ambigüedad**: "066 aplicada en producción el 2026-08-06", con el resultado del paso 4 registrado · **ningún comando `db push`**
- Sección `## Gaps abiertos → plan 14-08` presente con la tabla completa
- Link a `14-04-SUMMARY.md` §Runbook satisfecho (patrón `066` presente)

Restricciones del plan:
- `git diff --name-only` de este plan: **0 archivos** en `app/`, `lib/` o `components/`
- ningún `git stash`, ningún `git clean`, ningún `supabase db push`

---
*Phase: 14-cierre-de-backlog*
*Completed: 2026-08-06*
