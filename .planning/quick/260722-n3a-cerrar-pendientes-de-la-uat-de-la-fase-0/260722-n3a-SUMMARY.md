---
quick_id: 260722-n3a
slug: cerrar-pendientes-de-la-uat-de-la-fase-0
date: 2026-07-22
status: complete
type: execute
workstream: motor-reservas
phase_ref: 07-cancelaci-n-del-abono-mail-panel
one_liner: "Los 4 pendientes de la UAT de la Phase 07 cerrados: un catch de red en copyCancelLink (único cambio de código) + D-14/D-15 enmendadas con rastro fechado + el comentario de la vía panel alineado + T-07-19 con disposición por vía"
tasks_completed: 3
tasks_total: 3
key_files:
  modified:
    - "app/(dashboard)/abonos/abonos-client.tsx"
    - "app/api/abonos/cancel/route.ts"
    - ".planning/workstreams/motor-reservas/phases/07-cancelaci-n-del-abono-mail-panel/07-CONTEXT.md"
    - ".planning/workstreams/motor-reservas/phases/07-cancelaci-n-del-abono-mail-panel/07-SECURITY.md"
commits:
  - hash: b24e24a
    message: "fix(quick-260722-n3a): toast de error ante fallo de red al copiar el link de baja"
  - hash: e7a998c
    message: "docs(quick-260722-n3a): enmendar D-14/D-15 y alinear el comentario de la via panel"
  - hash: c23257e
    message: "docs(quick-260722-n3a): disposicion de T-07-19 por via (panel = rastro de datos)"
decisions:
  - "El aviso al dueño es un RECIBO de algo que le OCURRIÓ: por la vía del panel la baja la ejecuta él mismo, así que no se le avisa. El código ya lo hacía; lo que faltaba era el registro (D-14/D-15 enmendadas, no reescritas)."
  - "El rastro de repudiation de la vía panel (T-07-19) es de DATOS — cancelled_at + status + fila en Archivados — no de mail."
metrics:
  duration: "~12min"
  completed: 2026-07-22
---

# Quick 260722-n3a: cerrar pendientes de la UAT de la Phase 07 — Summary

Cierra los 4 pendientes que dejó la UAT de la Phase 07 (`07-UAT.md`, tests 4 y 11). Uno era código
(un `catch` faltante); los otros tres eran registro: alinear las decisiones escritas y la disposición
de seguridad con el comportamiento que el usuario ya decidió que es el correcto.

## Qué se hizo

### Tarea 1 — `catch` de red en `copyCancelLink` (commit `b24e24a`)

`app/(dashboard)/abonos/abonos-client.tsx`. El bloque era `try { … } finally { … }` sin `catch`: el
`toast.error('No se pudo obtener el link de baja. Probá de nuevo.')` solo cubría el fallo HTTP
(`!res.ok || !data?.ok || !url`). Ante un fallo de RED el `fetch` rechaza **antes** de que exista
`res`, así que la promesa quedaba sin capturar (`Uncaught (in promise) TypeError: Failed to fetch`,
reproducido en la UAT con DevTools → Offline) y el dueño no veía ningún mensaje.

Se agregó el `catch` entre el `try` y el `finally` con el **mismo** toast genérico de la rama HTTP —
el error capturado **no** se interpola en la UI (T-Q1-01) — más un comentario en español explicando
por qué existe el bloque.

Intactos, como pedía el plan: el `finally { setCopyingLink(false) }`, el `try/catch` interno del
portapapeles (no re-lanza, así que el `catch` nuevo no lo duplica), el no-escribir-nada al
portapapeles ante fallo (D-17), y toda otra función del archivo.

### Tarea 2 — D-14/D-15 enmendadas + comentario de la vía panel (commit `e7a998c`)

**(a) `07-CONTEXT.md`.** D-14 y D-15 conservan su texto original y llevan cada una un sub-bullet que
arranca con el marcador literal `**ENMENDADA 2026-07-22**`. Cada enmienda dice: el criterio del
recibo, la matriz por vía (cliente → mail al cliente + aviso al dueño; dueño → solo mail al cliente),
qué parte de la decisión original sigue en pie (en D-14 el anti-avalancha sigue **LOCKED** e intacto —
UN mail por baja, nunca uno por turno; en D-15 el cliente sigue recibiendo SIEMPRE su mail, lo que se
cae es la paridad total de notificaciones), el origen (UAT test 11 + decisión del usuario del
2026-07-22), que el **código no cambia**, y que la enmienda ALINEA ambas con D-13 — que ya acotaba el
aviso al dueño a la vía del cliente. Ninguna otra decisión (D-01..D-13, D-16..D-21) se tocó.

**(b) `app/api/abonos/cancel/route.ts`.** El comentario del bloque (8) citaba D-14/D-15 para
justificar lo contrario de lo que decían. Ahora enuncia el criterio del recibo y mantiene la cita
(que después de (a) ya dice esto) y lo que ya explicaba bien: best-effort en `after()`, captura previa
en consts para el closure, y que si el mail falla se loguea sin romper la baja. **Cero lógica:** el
gate del plan confirmó que el diff del archivo no tiene una sola línea que no sea comentario.

### Tarea 3 — disposición de T-07-19 por vía (commit `c23257e`)

`07-SECURITY.md`. La fila de T-07-19 se editó **en su lugar**: ahora distingue la vía pública (aviso a
`businesses.notification_email`, D-13, + el rastro en datos) de la vía panel, donde ese mail no existe
**por diseño** y el rastro es de datos: `abonos.cancelled_at` + `abonos.status = 'cancelled'` + la fila
visible bajo el tab **Archivados** de `/abonos`. Evidencia citada: `lib/abono-cancel.ts:211-216`,
`app/(dashboard)/abonos/page.tsx:39`, `app/(dashboard)/abonos/abonos-client.tsx:129`.

`Disposition` sigue `mitigate` y `Status` sigue `closed`: se precisa una amenaza ya cerrada, no se
abre una nueva. Se agregó una fila fechada al `Security Audit Trail` (`Run By` = `quick 260722-n3a
(Claude)`) con el origen. El frontmatter quedó **exactamente igual** (`68/68/0`) porque no se
agregaron filas al registro (T-Q1-03). No se tocaron el `Accepted Risks Log`, R-01/R-02/R-03, los
`Unregistered Flags` ni el `Sign-Off`.

## Verificación

| Gate | Comando | Resultado |
|------|---------|-----------|
| Typecheck (tras T1 y tras T2) | `./node_modules/.bin/tsc --noEmit` | exit 0 (las dos veces) |
| Lint | `./node_modules/.bin/eslint "app/(dashboard)/abonos/abonos-client.tsx"` | exit 0 |
| Toast duplicado (HTTP + red) | `grep -c "No se pudo obtener el link de baja"` | 2 |
| `finally` intacto | `grep -c "setCopyingLink(false)"` | 1 |
| Enmiendas fechadas | `grep -c "ENMENDADA 2026-07-22"` en `07-CONTEXT.md` | 2 |
| Cita conservada | `grep -c "D-14/D-15"` en `route.ts` | 1 |
| Diff de `route.ts` solo comentarios | `git diff -U0 … \| grep -vcE "^[+-]\s*(//\|\*\|/\*)"` | 0 |
| Contadores de amenazas | `grep -cE "^threats_(total\|closed): 68"` · `grep -c "^threats_open: 0"` | 2 · 1 |
| Fila nueva del audit trail | `grep -c "260722-n3a"` en `07-SECURITY.md` | 1 |
| Alcance del cambio | `git diff HEAD~3 HEAD --name-only` | exactamente los 4 archivos de `files_modified` |
| Archivos prohibidos | `lib/abono-cancel.ts` y `app/api/abonos/cancel/[token]/route.ts` | ausentes del diff |

Se usaron **siempre** los binarios locales. No se corrió `npx tsc` (resuelve un paquete del registry
que siempre sale exit 0 — falso verde que ya invalidó una verificación en esta misma fase). No se
corrió la suite completa: ningún gate del plan la pedía.

**Pendiente de verificación humana (test 4 de la UAT):** `npm run dev` → `/abonos` → DevTools →
Network → Offline → "Copiar link de baja". Debe aparecer el toast de error, la consola **no** debe
mostrar `Uncaught (in promise)`, el botón vuelve de "Copiando..." y el portapapeles conserva lo que
tenía.

## Desviaciones del plan

Ninguna. El plan se ejecutó exactamente como estaba escrito: 3 tareas, 3 commits, 4 archivos, un solo
cambio de comportamiento (el `catch`).

## Notas

- No se modificó `STATE.md` ni `ROADMAP.md`: el orquestador maneja el commit de documentación de las
  quick tasks y las quick tasks no se trackean en el roadmap.
- `git status` quedó limpio salvo el propio directorio de la quick task (PLAN + este SUMMARY), que
  commitea el orquestador.

## Self-Check: PASSED

Los 4 archivos declarados existen en disco y los 3 commits (`b24e24a`, `e7a998c`, `c23257e`) están en
el historial.

## Threat Flags

Ninguna superficie de seguridad nueva. Las tres amenazas del `<threat_model>` del plan quedaron
cubiertas: el toast no interpola el error capturado (T-Q1-01), el fallo de red ya no es silencioso y
el portapapeles sigue sin ensuciarse (T-Q1-02), y `threats_open: 0` no subió (T-Q1-03).
`package.json` / `package-lock.json` no se tocaron (T-07-SC).
