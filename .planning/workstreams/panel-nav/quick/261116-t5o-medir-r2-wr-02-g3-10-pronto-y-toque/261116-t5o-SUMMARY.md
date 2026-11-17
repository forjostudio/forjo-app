---
phase: quick-261116-t5o
plan: "01"
subsystem: panel-nav / aviso de salida (medición)
tags: [medicion, sonda, g3-10, r2-wr-02, intervencion-de-historial]
status: complete
veredicto: arma
outcome: "R2-WR-02 cerrado por medición: desde `pronto`, un toque en Inicio después del cierre deja el atrás avisando (entradas_salteadas=0); el toque no empuja (none por regla-4-topIsOurs(E-6)), lo arregla Chrome. La regla de parar NO se disparó."
requirements-completed: []
requires:
  - "la sonda de la app (`panel-exit-en-la-app.mjs`) en b90a7d1"
provides:
  - "el recorrido R-G3-10-pronto-y-toque en la sonda"
  - "veredicto R2-WR-02: arma en la sección (i) del registro"
  - "la viñeta de G3-10 corregida con el número"
affects:
  - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-DECISION-UAT-3.md"
tech-stack:
  added: []
  patterns: ["esperado commiteado antes de medir (test → docs)"]
key-files:
  created: []
  modified:
    - .planning/debug/probes/panel-exit-en-la-app.mjs
    - .planning/debug/la-absorcion-que-no-absorbe-medida.md
    - .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-DECISION-UAT-3.md
decisions:
  - "R2-WR-02 cerrado por medición con veredicto arma: el aviso tras un toque desde `pronto` lo restituye el navegador (Chrome deja de saltear la entrada tras la activación nueva), no el módulo"
commits:
  - "2281a0c test(quick-261116-t5o): el recorrido R-G3-10-pronto-y-toque con su esperado antes de medir"
  - "8f58a54 docs(quick-261116-t5o): R2-WR-02 medido — veredicto arma en (i) y la viñeta de G3-10 corregida"
plan_head_before: b90a7d1afd15b561968ece49ae0c4f8a69945136
metrics:
  duration: 15min
  completed: 2026-11-16
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Quick 261116-t5o: R2-WR-02 medido — `R-G3-10-pronto-y-toque` Summary

**Desde `pronto` (el reintento de G3-7 empuja `#salir` y Chrome lo saltea), un toque en Inicio después del cierre
deja el atrás siguiente avisando (`entradas_salteadas=0`, aviso visible, cae en `/dashboard`); el toque no empuja
nada (`none` por `regla-4-topIsOurs(E-6)`, como predijo el revisor), así que el aviso lo restituye Chrome, no el
módulo. Veredicto `arma`; la regla de parar no se disparó.**

## El entorno

- Contenedores antes y después (`docker ps --format '{{.Names}}'`): los mismos 22 —pila de forjo-app (7, sin
  studio/storage), forjo-consultorios (6) y erp-forjo-studio (9)—; ninguna pila parada ni reseteada.
- La API local respondió `200` en 127.0.0.1:54321; no hizo falta `supabase start`. `negocio-prueba` en `trial`
  (lectura con `psql`, sin escrituras).
- Servidor: `next dev` **propio** en el 3031 levantado por la sonda (modo estricto activo); el `next dev` del dueño no
  estaba corriendo, nada se mató ni reinició. Puertos 3031 y 9335 libres al salir.
- Navegador: `Chrome/157.0.8103.52`, node v24.15.0, gesto `interfaz` (`chrome.tabs.goBack`).
- Turno de pantalla: tomado por nuestra corrida (PID 32300), soltado al terminar; `estado` final: LIBRE.

## La corrida

- 2026-11-16, 21:19:13 → 21:20:28 hora local, una sola invocación en segundo plano por `node scripts/con-turno.mjs`,
  sólo el control `R-G3-10-primer-toque-atras-pronto` y el nuevo `R-G3-10-pronto-y-toque`.
- rc 1 (coherente: una `FALLA`, la del control, que reproduce `(i)`), cero fallos del instrumento, la activación al
  cerrar afirmada en `si` en los dos (522 ms y 518 ms desde el toque), el toque después del cierre llegado como click
  con `isActive=true`. **Sin re-corrida por P-1.**
- Log: `/tmp/tmp.P0hSdshacw/sonda-app-261116-t5o.txt` (copia sin `\r` en el scratchpad de la sesión).
- Tal como quedaron en `(i)`:

```text
veredicto R2-WR-02: arma
medido R2-WR-02: entradas_salteadas=0 aviso_visible=si ruta_despues=/dashboard armado_del_toque=none/regla-4-topIsOurs(E-6) control_pronto_entradas_salteadas=1 control_pronto_atras_siguiente=sale
```

## Lo que dice

La predicción del revisor sobre el **mecanismo** se cumplió: el toque pide `arm`, pero `armarSentinel` devuelve `none`
por la cuarta regla (`topIsOurs`, `vivo_antes=true vivo_despues=true`): no hay un empuje nuevo y el `#salir`
salteable sigue donde estaba. Pero el **desenlace** fue el bueno: el atrás siguiente cae en `/dashboard` sin saltear
(`actual=2 → 1`), llega el `popstate` y el retroceso es `hint` con `holding=true`: avisa. O sea que Chrome le saca la
marca de salteable a la entrada cuando llega la activación nueva. **R2-WR-02 queda cerrado por medición; el que lo
arregla es el navegador, no el módulo.** No hay pregunta para el dueño.

## La viñeta (03-DECISION-UAT-3.md, viñeta de G3-10)

- **Vieja (L51):** «Un toque en Inicio después del cierre arma siempre y el atrás avisa (`atras-y-toque`).»
- **Nueva (L51-55):** «Un toque en Inicio después del cierre deja el atrás siguiente avisando en las dos variantes,
  medido: desde `tarde` el toque arma y empuja `#salir` (`atras-y-toque`); desde `pronto` (`pronto-y-toque`, quick
  `261116-t5o`, 2026-11-16, veredicto `arma`, `entradas_salteadas=0`) el toque no empuja nada (`none` por la cuarta
  regla: el `#salir` de arriba ya es nuestro) y el aviso vuelve porque Chrome deja de saltear la entrada tras la
  activación nueva: lo hace el navegador, no el módulo.» L52 («con la X o tocando el fondo sigue armando…») quedó
  byte-idéntica; la cabeza (50 líneas) y la cola desde `## Lo que esta decisión NO cambia` también.

Las notas del 3.3 (`03-UAT-GUION-3.md` L384-388: «Con un toque en Inicio después de cerrar, el atrás avisa») y del
3.4 (L404-406) quedan **coherentes con lo medido**; no se editaron.

## Lo que esta medición no cierra

Android y Safari reales (A11): que la activación nueva le quite la marca de salteable a una entrada ya empujada es
comportamiento del navegador, que el módulo no garantiza; la ventana de activación de Chrome de Android; el build de
producción (se midió en `next dev` con modo estricto); y fue UNA corrida, no repetida.

## Gates

- Task 1, estático: 0 líneas quitadas de la sonda, 29 recorridos (28 + 1), `R-G3-8-rebote` último, la entrada de
  `QUE_CIERRA`, el `esperado` y la llamada textuales, eslint rc 0 — **verde**.
- Task 1, corrida: reportados 1 y 1, activación afirmada 2, toque 1, fallos 0, control reproduce `(i)` = si,
  veredicto `arma` — **verde**.
- Task 2: veredicto y línea `medido` recalculados de lo pegado e iguales, 5 veredictos `G3-` intactos, 0 líneas
  quitadas del registro, 1 de la viñeta, `test` (2281a0c) ancestro del `docs` (8f58a54) — **verde**.

## Deviations from Plan

None - plan executed exactly as written. (El commit del SUMMARY lo hace el orquestador, según sus instrucciones, en
vez del `git add` del SUMMARY que pedía el `<output>` del plan.)

## Lo intacto

`app/`, `components/`, `lib/`, `test/`, `scripts/` (incluido `scripts/con-turno.mjs`), `proxy.ts` y `next.config.ts`
sin cambios desde `b90a7d1` (sha1 `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`); `lib/panel-branch.ts` sólo leído;
nada subido; MOB-04/05/06 sin marcar; ROADMAP, REQUIREMENTS y STATE sin tocar.

## Self-Check: PASSED

- FOUND: 2281a0c (test), 8f58a54 (docs); los tres archivos modificados existen; `git rev-list --count b90a7d1..HEAD` = 2.
