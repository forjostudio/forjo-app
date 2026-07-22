---
status: partial
phase: 07-cancelaci-n-del-abono-mail-panel
source: [07-06-SUMMARY.md, 07-07-SUMMARY.md, 07-08-SUMMARY.md, 07-09-SUMMARY.md, 07-10-SUMMARY.md, 07-11-SUMMARY.md, 07-12-SUMMARY.md]
started: 2026-07-22T00:00:00Z
updated: 2026-07-22T23:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Arranque en frío
expected: `supabase db reset` aplica hasta la 056 sin abortar (el bloque de verificación de duplicados no corta), `npm run dev` levanta sin errores y /abonos carga el listado con datos vivos.
result: pass
note: "Migraciones 055 y 056 aplicadas sin abortar. App levanta, /abonos carga. Los abonos de la prueba previa desaparecieron — esperado: db reset recrea desde seed.sql."

### 2. Panel — el token de baja ya no viaja al browser
expected: En /abonos, abrí el fuente de la página (Ctrl+U) o el DOM en DevTools y buscá `cancel_token`. No debe aparecer NI UNA vez, ni siquiera para series archivadas. Antes viajaba el token de todas las series en cada render.
result: pass
note: "Primer intento dio falso positivo por caché de view-source (payload con data del 21/07 ya borrada por db reset, y cancel_token en la posición del select viejo). Re-testeado con abono nuevo: view-source 0/0 y búsqueda en Response de Network sin matches."

### 3. Panel — copiar el link de baja se pide on-demand
expected: Tocá "Copiar link de baja" en una serie. El botón se deshabilita y el label cambia a "Copiando..." durante el viaje. Al volver, el portapapeles tiene la URL pública completa (`/abono/cancelar/<token>`), no el token suelto.
result: pass
note: "URL bien formada (/abono/cancelar/<uuid>), no el token suelto. OBSERVACIÓN (no gap): en local el host sale como gestion.forjo.studio por el fallback NEXT_PUBLIC_APP_URL → prod. Comportamiento preexistente, igual al del mail de alta; no es regresión de esta fase, pero hace que el link copiado sea inusable en dev sin editar el host a mano."

### 4. Panel — si falla el endpoint, el portapapeles no se ensucia
expected: Cortá la red (DevTools → Offline) y tocá "Copiar link de baja". Aparece un toast de error y el portapapeles queda con lo que tenía antes — NO se escribe un link viejo ni uno roto.
result: issue
reported: "En offline el portapapeles NO se ensucia (mitad buena), pero no aparece ningún toast: la consola muestra `Uncaught (in promise) TypeError: Failed to fetch` en abonos-client.tsx:147. Con throttling normal copia bien."
severity: minor
root_cause: "copyCancelLink (app/(dashboard)/abonos/abonos-client.tsx:145-166) tiene try/finally SIN catch. El toast.error solo cubre el fallo HTTP (!res.ok || !data.ok || !url). Un fallo de RED hace rechazar al propio fetch antes de devolver res, la rejection queda sin capturar y no se muestra feedback. El finally sí corre, así que el botón se recupera y el portapapeles queda intacto."

### 5. Panel — el diálogo de confirmación muestra el conteo exacto
expected: Abrí el diálogo de baja de una serie con varios turnos futuros. El número de turnos que anuncia coincide exactamente con los que realmente tiene la serie a futuro. Antes PostgREST podía recortar el set en silencio y subestimar el alcance.
result: pass
note: "Diálogo: 'Se cancelan 9 turnos futuros de esta serie, el último el 16 de septiembre. Esta acción no se puede deshacer.' Coincide con la ficha (9 de 12 sesiones, último mié 16 sep). Badge de severidad 'Alto' presente."

### 6. Público — la pantalla informa el resultado del servidor
expected: Abrí el link de baja en una ventana anónima y confirmá. El detalle muestra la cantidad de turnos que devolvió el servidor al ejecutar la baja, no la estimación con la que se cargó la página.
result: pass
note: "Pre-confirmación: 'Se cancelan 9 turnos futuros, el último el Miércoles 16 de septiembre' + aviso de que se da de baja el turno fijo COMPLETO y que no se puede deshacer. Post-confirmación: 'Turno fijo dado de baja', 9 turnos, mismo último. Cadena coherente. LIMITACIÓN DEL TEST: preview y respuesta del servidor coinciden (ambos 9), así que este caso no discrimina si la pantalla lee uno u otro — el caso discriminante es el test 7 (rama already_cancelled, donde divergen)."
observation: "Copy en presente tras una acción ya ejecutada: 'Se cancelan 9 turnos que tenías reservados' debería ser 'Se cancelaron'. Cosmético, no registrado como gap."

### 7. Público — el segundo uso del mismo link no se contradice
expected: Volvé a abrir el MISMO link ya usado y confirmá. La pantalla dice que el turno fijo ya fue dado de baja Y el detalle muestra 0. No puede decir "ya fue dado de baja" arriba y "se cancelan N turnos" abajo al mismo tiempo.
result: pass
note: "Pantalla: 'Este turno fijo ya fue dado de baja' + detalle SIN línea de conteo (ni 9 ni 0) + 'No hay nada que hacer: este turno fijo ya figuraba dado de baja'. Cero contradicción — invariante D-08 sostenido. ALCANCE REAL: se validó la rama already-cancelled RENDERIZADA EN SERVIDOR al cargar (no aparece botón de confirmar). La rama already_cancelled del POST es un caso de carrera no forzable a mano; queda cubierta por los tests de ruta de 07-12. El operador no pudo leer DevTools, así que (a) no se verificó."

### 8. Público — la página no es indexable
expected: En el fuente de /abono/cancelar/<token> buscá la meta de robots. Debe estar `noindex, nofollow`. La URL lleva la credencial y el token no vence, así que una indexación sería una fuga permanente.
result: pass
note: "Fuente confirma `<meta name=\"robots\" content=\"noindex, nofollow\"/>`."

### 8b. Falso positivo investigado — "me archivó los dos"
expected: (no era un test planificado — reporte espontáneo del operador durante el test 8)
result: pass
note: |
  El operador reportó que cancelar la serie del miércoles por link archivó TAMBIÉN la del jueves.
  NO es un bug. Verificado por código y por consulta directa a la base local:
  - lib/abono-cancel.ts:211-215 actualiza `abonos` con .eq('id', abonoId) + .eq('business_id'); los dos
    UPDATE de `appointments` (250-255, 278-283) llevan .eq('abono_id'). Imposible alcanzar otra serie.
  - `select status, cancelled_at from abonos`: miércoles = cancelled + cancelled_at presente;
    jueves = **completed** + cancelled_at **null**. La del jueves nunca se canceló.
  Causa real: abono finito de 7 sesiones con ventana de generación de 8 semanas → generó las 7 de una
  y pasó a `completed`. El tab "Archivados" filtra por `status !== 'active'`, que agrupa cancelled +
  completed (comportamiento intencional, documentado en abonos-client.tsx).
observation: |
  HALLAZGO DE UX (menor, no funcional): en la lista de Archivados una serie `cancelled` y una
  `completed` se ven idénticas — el único indicio es el contador de turnos (0 vs 7), que no comunica
  el estado. El propio autor del producto interpretó el estado como corrupción de datos. Falta un
  distintivo visible (chip "Cancelado"/"Completado", o separar los tabs).

### 9. Público — contraste y foco de los CTA sobre el color de marca
expected: Poné un color de marca CLARO en el negocio (ej. amarillo). En la pantalla pública de baja, el texto de los botones se ve legible en oscuro (no blanco sobre amarillo). Navegá con Tab: los 3 CTA muestran un anillo de foco visible que se ve igual de bien sea cual sea el color de marca.
result: pass
note: |
  Primer intento inválido: el operador cambió la PALETA (a green), no el color de marca. Verificado en
  base: palette=green, primary_color=#d94a2b (sin tocar). Eso explica los dos síntomas y CONFIRMA el
  diseño de IN-05: el botón sigue el accent (primary_color) y el anillo de foco sigue `ring-ring` del
  design system (la paleta) — es decir, el foco NO depende del color de marca, que es exactamente lo
  que la mitigación buscaba.
  Retest con primary_color = #f5d90a (amarillo claro, peor caso para texto blanco): el texto del CTA y
  del cuadrado del logo salieron en near-black. onAccentText funciona. Color revertido a #d94a2b.
observation: |
  `primary_color` NO es editable desde Configuración (solo theme y paleta, confirmado por el operador).
  El helper de contraste protege contra un valor que hoy el dueño no puede setear desde el panel: baja
  el riesgo real, pero deja abierto si el campo quedó huérfano o se setea desde otra superficie
  (skill del web builder / CMS). Fuera del alcance de esta fase.

### 10. Mails de baja — llegan los dos y el contenido está escapado
expected: Tras una baja llegan 2 mails: uno al cliente y uno al dueño, con el branding del negocio. Si el nombre del cliente tiene HTML (`<b>Ana</b>`), el mail muestra el texto literal `<b>Ana</b>`, NO "Ana" en negrita. La etiqueta del día es la correcta ("los martes").
result: blocked
blocked_by: third-party
reason: "No llegó ningún mail. Diagnóstico: RESEND_API_KEY está declarada pero VACÍA en .env.local (chequeo aislado contra api.resend.com → HTTP 401 'API key is invalid'). business_secrets no tiene fila, así que no hay key de tenant tampoco. resolveSender (lib/email.ts:24-27) lanza a propósito 'sin RESEND_API_KEY global...' y el catch de la ruta lo loguea sin romper la baja. NO es un defecto del código: es el comportamiento best-effort diseñado, con el entorno local sin configurar."
verified_anyway: "La baja SÍ se ejecutó (consulta a la base: tercera serie, jueves, indefinida, status=cancelled). El escapado de WR-02 queda cubierto por los 21 casos de test/abono-cancel-email.test.ts. La entrega real y el render del HTML hay que verificarlos en producción."

### 11. Invariante D-07 — las dos vías producen el mismo efecto
expected: Dá de baja una serie desde el PANEL y otra serie equivalente desde el LINK del mail. Las dos dejan la serie sin turnos futuros vivos, las dos frenan la generación del cron, y las dos mandan el mismo par de mails con la misma etiqueta de día. La única diferencia entre las vías debería ser quién autoriza.
result: issue
reported: "Divergencia encontrada por lectura de código durante la preparación del test 10: la vía del PANEL no manda el aviso al dueño; la vía pública sí."
severity: major
root_cause: |
  app/api/abonos/cancel/route.ts (panel) importa y envía SOLO `sendAbonoCancelledEmail` (al cliente).
  app/api/abonos/cancel/[token]/route.ts (público) envía `sendAbonoCancelledEmail` (:158) Y
  `sendAbonoCancelledAdminNotification` (:183).
  El comentario de cancel/route.ts:109 dice "UN solo mail al cliente (D-14/D-15)", pero D-14 está
  LOCKED y dice: "La baja manda UN solo mail de baja de serie al cliente Y UN aviso al dueño"; D-15
  cierra con "Esto mantiene las dos vías 100% consistentes también en notificaciones". El comentario
  cita la decisión y la trunca justo donde lo contradice.
  Impacto adicional: T-07-19 (Repudiation — "baja sin rastro para el negocio") queda sin mitigar en la
  vía del panel, porque el aviso al dueño ES el rastro.
  Nota de auditoría: 07-SECURITY.md dio D-07 por verificado con un chequeo más angosto (que ninguna
  ruta escriba `appointments` directo), que no cubre paridad de notificaciones.

## Summary

total: 11
passed: 8
issues: 2
pending: 0
skipped: 0
blocked: 1

## Gaps

- truth: "Ante un fallo del endpoint del link de baja, el dueño recibe feedback explícito y el portapapeles queda intacto"
  status: failed
  reason: "User reported: en offline el portapapeles no se ensucia, pero no aparece ningún toast — Uncaught (in promise) TypeError: Failed to fetch en abonos-client.tsx:147"
  severity: minor
  test: 4
  artifacts:
    - "app/(dashboard)/abonos/abonos-client.tsx:145-166"
  missing:
    - "Bloque catch en copyCancelLink que capture el rechazo de fetch (fallo de red) y muestre el mismo toast.error que ya cubre el fallo HTTP"

- truth: "Las dos vías de baja son 100% consistentes también en notificaciones (D-14 LOCKED + D-15): un mail al cliente y un aviso al dueño"
  status: failed
  reason: "Encontrado por lectura de código durante el test 10: app/api/abonos/cancel/route.ts (panel) manda SOLO el mail al cliente; app/api/abonos/cancel/[token]/route.ts (público) manda el del cliente Y el aviso al dueño. El comentario de cancel/route.ts:109 cita D-14/D-15 para justificar 'un solo mail al cliente', pero D-14 dice literalmente 'al cliente Y un aviso al dueño' y D-15 cierra con 'mantiene las dos vías 100% consistentes también en notificaciones'."
  severity: major
  test: 11
  artifacts:
    - "app/api/abonos/cancel/route.ts:5"
    - "app/api/abonos/cancel/route.ts:109-142"
    - "app/api/abonos/cancel/[token]/route.ts:182-183"
    - ".planning/workstreams/motor-reservas/phases/07-cancelaci-n-del-abono-mail-panel/07-CONTEXT.md:70-77"
  missing:
    - "Llamada a sendAbonoCancelledAdminNotification en el after() de la vía del panel, con el mismo molde que la vía pública — o, si la omisión es deliberada, una enmienda EXPLÍCITA de D-14/D-15 registrada como desvío, más la re-evaluación de T-07-19 (baja sin rastro para el negocio) para esa vía"

## Notas de entorno (no son gaps)

- Fixtures modificados en la base LOCAL durante la UAT (se revierten con `supabase db reset`):
  `clients.email` y `clients.name` → `francovellani@gmail.com` / `<b>Ana</b>`;
  `businesses.notification_email` → `francovellani@gmail.com`.
  `businesses.primary_color` fue puesto en `#f5d90a` para el test 9 y **revertido** a `#d94a2b`.
- `RESEND_API_KEY` vacía en `.env.local` → ningún mail sale desde el entorno local.
