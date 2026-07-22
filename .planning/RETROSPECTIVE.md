# Retrospective — Forjo App

## Milestone: v0.9 — Security Hardening

**Shipped:** 2026-06-17
**Phases:** 5 | **Plans:** 11 | **Tasks:** ~20

### What Was Built
Cierre de 4 agujeros de seguridad auditados + red de tests anti-regresión, pre-lanzamiento:
- SEC-01: RLS lockdown + `business_secrets` (vistas acotadas, secretos owner-only; migraciones 027/028).
- SEC-02: `verifyMPSignature` compartido fail-closed + chequeo de monto en ambos webhooks MP.
- SEC-03: endpoints admin header-only + `timingSafeEqual`; `setup-plans` movido a script local (superficie web eliminada).
- SEC-04: gating de `plan_status` (blocklist) en booking público.
- TEST-01: suite Vitest (7 webhooks + 3 aislamiento) en CI.
- Extra (029): cierre de `public read appointments USING(true)`, agujero cross-tenant que el test de aislamiento detectó.

### What Worked
- Discuss → research → plan → plan-check → execute → verify → secure → ship por fase, manejado a mano por el usuario: control total entre pasos.
- El orden (DB → pagos → superficies independientes → tests) respetó la dependencia dura SEC-01→SEC-02 y dejó los tests para el final, contra comportamiento correcto.
- Los checkpoints humanos en las migraciones destructivas (027/028) y el env de webhooks evitaron deploys rotos.
- TEST-01 cumplió su razón de ser: cazó un agujero real de producción (029) que las migraciones versionadas no cubrían.

### What Was Inefficient
- El plan-checker falsamente bloqueó por VALIDATION.md/Nyquist en fases tempranas (premisa "no config" equivocada); se resolvió pre-anunciando que Nyquist está off.
- El helper `gsd query commit` reporta `skipped_gitignored` para código trackeado a veces → hubo que commitear con `git` directo.

### Patterns Established
- `.planning/` gitignored + flujo direct-to-main + Vercel: "ship" = `git push origin main`, sin PR (gh no autenticado).
- Worktrees deshabilitados (incompatibles con `.planning/` gitignored): ejecución secuencial en main.
- Vistas públicas acotadas + secretos en tabla owner-only como patrón de aislamiento.

### Key Lessons
- Las policies permissive de Postgres se combinan con OR: una `USING(true)` abierta anula la restrictiva. Auditar TODAS las tablas, no solo las del schema versionado (el agujero 029 vivía out-of-band).
- Tests de RLS DEBEN asertar con anon-key autenticado, nunca service_role (bypassa RLS → falso verde).
- `schema.sql` desactualizado puede recrear agujeros al bootstrappear: mantenerlo en sync con las migraciones.

### Deuda / follow-ups
- Versionar el esquema (el agujero 029 no estaba trackeado) — considerar Supabase CLI migrations (estaba en out-of-scope v2).
- Cargar los 4 GitHub Secrets para que los tests de aislamiento corran en CI (hoy skipean sin creds).

## Milestone: v0.18 — CMS Publish / Go-live

**Shipped:** 2026-07-16
**Phases:** 3 (15-17) | **Plans:** 8 | **Tasks:** 15

### What Was Built
Guardar dejó de publicar, y el CMS se abrió a clientes reales:
- PUB-03..08 (Phase 15): `landing_draft` vs `landing_config` (migración 050, aditiva con backfill). Guardar persiste el borrador; publicar/descartar son copia **server-side** (nunca se acepta el config del body); editor de 3 estados con compare canónico inmune al reorden de claves del `jsonb`; go-live implícito.
- SKILL-07/08 (Phase 16): `scripts/setup-landing.ts` escribe el BORRADOR (`--publish` opt-in), `--inspect` separa al-aire de pendiente-de-aprobación, key de Storage derivada del contenido (sha256) → escritura idempotente.
- PUB-01 (Phase 17): retiro del kill-switch `CMS_ENABLED`; `has_web_custom` queda como ÚNICO gate; upsell "Web a medida" para no-entitled; migración 051 cierra el upload en la RLS del bucket.

### What Worked
- **El orden LOCKED (15 → 16 → 17) ERA el contenido del milestone**, no una preferencia. Poner PUB-01 último fue la decisión de diseño central: exponer el editor mientras cada guardado salía al aire era exactamente el bug que el milestone venía a evitar.
- **El research de la Phase 17 encontró un agujero que el CONTEXT no sabía que existía**: el upload de imágenes NO gateaba `has_web_custom` (sube directo browser→Storage, sin Server Action; su único gate era la RLS del bucket, que chequeaba `owner_id` pero no el add-on). Sin ese hallazgo, el milestone shipeaba con SC2 incompleto. Lo forzó el ítem MANDATORY del CONTEXT: *"verificar, no asumir"*.
- El **checkpoint blocking-human** de la migración 051 evitó auto-aprobar una verificación de producción que nadie había hecho.
- Verificar el gate **directo en prod** (staging pausado) fue seguro porque el cambio era puramente restrictivo + reversible, y el orden DB-first lo permitía.

### What Was Inefficient
- **El CONTEXT de la Phase 17 estaba stale**: citaba `NAV_ITEMS` como el mecanismo del sidebar, cuando hoy es `NAV_GROUPS` + `buildNavGroups` filtrando contra `resolveVertical(business).menu` (y ningún vertical tenía `'web'`). El research lo cazó, pero un CONTEXT desactualizado casi manda al planner por el camino equivocado.
- El **gate de cobertura de decisiones** bloqueó por D-02b "sin citar" aunque estaba funcionalmente cubierto — fix de una línea, pero el gate no distingue *no implementado* de *no citado*.
- El **pre-close audit** marcó el UAT de la Phase 15 como gap siendo `status: passed` con 0 pending → falso positivo.
- `test/concurrency.test.ts` CONC-01 flakea por timeout de 5s bajo la carga de la suite full; pasa 6/6 aislado. Ruido recurrente que obliga a re-verificar cada vez.

### Patterns Established
- **Gate-first deploy ordering:** aplicar la migración restrictiva a prod ANTES de deployar el código que expone la superficie. Deja prod seguro durante toda la ventana entre ambos, y hace el rollback innecesario.
- **Migración con guard de existencia** (`to_regclass('storage.objects') IS NOT NULL`): permite DDL sobre un schema que no existe en local (Storage OFF) sin romper `supabase db reset` — no-opea local, aplica en prod, y el baseline sigue replayable.
- Cuando la única barrera **no-bypasseable** es la RLS (upload directo browser→Storage), el gate del add-on va EN la policy, no en la app.

### Key Lessons
- **Un flag global fail-closed enmascara gates faltantes.** Mientras `CMS_ENABLED` apagaba la ruta entera, nadie notó que el upload no chequeaba el add-on. Retirar un kill-switch no es solo borrar una env var: expone todo lo que tapaba. El threat note que exigía "el gate único tiene que sostener solo" fue lo que obligó a auditar las 4 superficies.
- **Un checkpoint que requiere acción del mundo real no es auto-aprobable, por definición.** En modo `--auto`, el default habría marcado SC2 "verificado" sin que nadie aplicara la migración ni tocara Storage.
- **"Verificar, no asumir" no es ceremonia**: se pidió confirmar el gate del upload y la confirmación devolvió que no existía.

### Deuda / follow-ups
- Rediseñar el upsell "Web a medida" — hoy funciona pero está diseñado para no romper, no para vender (todo capturado en `.planning/todos/pending/`).
- Borrar la env var `CMS_ENABLED` de Vercel (benigna; el código ya no la lee).
- CONC-01 flaky (timeout 5s bajo carga).
- **El norte:** auto-armado de la web al confirmarse el pago del add-on en MP — este milestone fue su prerequisito, ahora está desbloqueado.

## Milestone: v0.19 — Cuenta y acceso

**Shipped:** 2026-07-17
**Phases:** 3 (4-6) | **Plans:** 11 | **Workstream:** onboarding

### What Was Built
`/auth/callback` (canje de `token_hash`→sesión) + recuperación de contraseña + alta honesta (P4); entrar con Google con account linking a una sola cuenta (P5); mails de confirmación y recuperación con marca Forjo vía Resend SMTP (P6). Los 3 agujeros de la puerta de entrada, cerrados. Las 3 fases SECURED (22/22 · 9/9 · 6/6).

### What Worked
- **El UAT atrapó bugs reales que los tests no ven.** El más grave: D-14 (registrar un mail existente mostraba "User already registered" = oráculo de enumeration). El ciclo funcionó: el plan lo asumió mal, el UAT lo agarró, el fix lo cerró, secure-phase lo confirmó.
- **La "decisión de peso" resultó la más barata.** El account linking (P5) era el comportamiento default de Supabase, gateado por email verificado que P4 ya garantizaba — cero código, cero config. El research lo confirmó antes de planificar.
- **El split local+prod del UAT** (verificar template/link en Mailpit local, remitente/deliverability en prod) se reusó limpio en las 3 fases.

### What Was Inefficient
- **El defecto de los grep gates** pegó en 4 de 6 planes de P4 (criterios `grep -c "X" == 0` que chocan con el comentario que el mismo plan pide escribir). Se arregló en el `gsd-planner` a mitad del milestone (higiene language-aware) y no reapareció en P5/P6.
- **Fricción de scaffolding:** las fases 5 y 6 no tenían carpeta (`find-phase` es directory-based, no lee la tabla del ROADMAP) → hubo que `scaffold phase-dir` a mano antes de discuss-phase.

### Patterns Established
- **Checkpoint humano `autonomous: false` para config externa** (Dashboard de Supabase, Google Cloud, Resend): último plan de la fase, con el UAT prod-first. Consistente en P4/P5/P6.
- **Anti-enumeration estructural en el cliente:** no depender de que el backend ofusque (detectar `error.code`, mostrar siempre la misma pantalla).

### Key Lessons
- **Verificar las asunciones del plan contra el código/docs, no la letra.** El research corrigió D-07 (OAuth branch por `?code=`, no `oauth` en `ALLOWED_TYPES`); el "no llega el mail" del orden inverso era anti-enumeration por diseño, no un bug.
- **El host local importa:** `next dev` normaliza `request.url` a `localhost`, así que todo el flujo de auth local tiene que estar en `localhost` (no 127.0.0.1) o la cookie no cruza.

### Deuda / pendientes
- **Bug de onboarding (slug collision bajo RLS):** el chequeo de slug no ve otros tenants → error opaco al crear negocio. Para el milestone de onboarding, anotado en memoria.
- **Onboarding es un callejón sin salida** (no podés cambiar de cuenta una vez adentro) — surgió en el UAT de P5.

## Milestone: v0.20 — Onboarding pulido

**Shipped:** 2026-07-18
**Phases:** 2 (7-8) | **Plans:** 2 | **Workstream:** onboarding

### What Was Built
Onboarding más robusto (fix del slug ciego por RLS vía endpoint service-role que devuelve solo un booleano + salida del callejón), logo en el paso 1, paleta fuera del wizard (queda en Ajustes), y las pantallas de auth siempre con tema Forjo (ResetThemeScript pre-paint). Ambas fases SECURED (5/5 · 4/4). Cerró la deuda de onboarding que destaparon los UAT de v0.19.

### What Worked
- **Milestone corto y quirúrgico:** 2 fases, 3 tareas, todo autónomo (sin migración ni checkpoint humano — a diferencia de v0.19). El research confirmó la autonomía temprano (columna `logo_url` ya existía, buckets ya existían) → cero fricción de deploy.
- **El research corrigió decisiones antes de codear:** D-05 (el logo iba al bucket `logos`, no `landing-assets`) y el uso de `businesses.logo_url` existente — se ajustó el CONTEXT antes del planner, no en ejecución.
- **Threat model honesto en Phase 8:** superficie casi nula documentada como accept/N-A con rationale, no threats manufacturados; secure-phase lo confirmó rápido.

### What Was Inefficient
- **Scaffolding manual de fases** (7 y 8, como 5 y 6 antes): `find-phase` es directory-based y no lee la tabla del ROADMAP → `scaffold phase-dir` a mano antes de cada discuss-phase. Fricción recurrente del workstream.

### Patterns Established
- **Endpoint service-role para chequeos multi-tenant que RLS ciega:** devolver SOLO el dato mínimo (un booleano de existencia), nunca el row — el molde de `booking/availability` reusado para el slug.
- **ResetThemeScript:** espejo invertido de PaletteScript para fijar el tema del producto en superficies que no deben heredar la paleta del tenant.

### Key Lessons
- **La "decisión de peso" no siempre es la cara:** el bug de slug parecía pedir una migración RPC; el research mostró que un endpoint service-role sin migración lo resolvía igual, con la misma invariante de seguridad.
- **UAT diferido honesto:** los efectos de runtime que el entorno local no puede probar (upload de logo con Storage off; theming cross-nav) se marcan explícitamente como UAT de staging, no se fingen unit-testeados.

### Deuda / pendientes
- **UAT de staging pendiente:** el upload real del logo (Phase 7) y el reset de tema cross-nav (Phase 8) se validan en staging con un negocio de paleta custom.
- **Rediseño del login mobile:** capturado ([[rediseno-login-mobile-pendiente]]), próximo trabajo del workstream — amerita UI-SPEC.

## Milestone: v0.23 — Resiliencia de MercadoPago Connect

**Shipped:** 2026-07-20
**Phases:** 2 | **Plans:** 3 | **Workstream:** `mp-connect` (nuevo)

### What Was Built
Se cerró el fallback silencioso del refresh del token OAuth del negocio (MercadoPago Connect): el
resolver deja de devolver el token vencido/no persistido, marca la conexión caída (flag durable
`businesses.mp_connection_status`, migr. 053), auto-sana al refrescar OK, detecta el 401 del cobro y
limpia el flag al reconectar — todo logueado server-side sin exponer tokens. El dashboard refleja el
estado real: card de 3 estados + banner global de reconexión. SECURED 13/13 (P1) + 5/5 (P2).

### What Worked
- El diagnóstico técnico previo (leer el código real antes de scopear) hizo que discuss/plan fueran
  directos y sin research. El faseo backend→UI dejó el gate de secure-phase justo en la parte sensible.
- Los PNG oficiales del usuario recortados con sharp resolvieron los logos de marca que el SVG rendía mal.

### What Was Inefficient
- **Logos de marca:** varias iteraciones perdidas intentando SVG inline (MP: aro navy grueso por
  `fill-rule`; GCal: "31" mal reconstruido). Lección: para logos de marca, pedir el PNG oficial y
  recortarlo con sharp en chip blanco, no reconstruir SVG. (Anotado en la memoria de la sesión.)
- El `human_needed` de la UAT visual quedó abierto hasta el cierre; se resolvió marcándolo passed tras
  la UAT informal extensa del usuario en prod.

### Patterns Established
- Logo de marca = PNG oficial recortado con sharp (`public/*.png`) en chip blanco `size-6` vía `next/image`.
- Flag de estado de integración durable en `businesses` (no en `business_secrets`) para que el dashboard lo lea sin query nuevo.
- OAuth con retorno al origen vía `?from=` mapeado contra lista cerrada (anti open-redirect).

### Key Lessons
- Los SVG oficiales de marca no siempre rinden fiel en navegador (fill-rule / paths complejos) — el raster oficial es más confiable.
- La migración a prod se coordina a mano ANTES del deploy del código (053 aplicada por el usuario antes del merge).

## Milestone: v0.24 — Turnos fijos / Abonos recurrentes

**Shipped:** 2026-07-22
**Phases:** 2 (6-7) | **Plans:** 20 | **Commits:** 118

### What Was Built
Capacidad nueva sobre el motor de reservas de v0.12, sin reconstruirlo:
- Modelo del abono (migr. 054): tabla `abonos` con RLS owner-only, `appointments.abono_id`, ventana de generación por negocio. Extensible al cobro recurrente sin re-migrar.
- Generación forward vía `createAppointmentCore` — el mismo núcleo atómico anti-doble-booking. Skip-and-record ante conflicto, nunca pisa.
- Extensión de la ventana rolling como piggyback del cron diario existente (Vercel Hobby no admite más crons).
- Panel `/abonos`: alta por día+hora, semanas salteadas con su razón, duración propia (indefinido / N sesiones).
- Baja de la serie por dos vías (link del mail + panel) con UNA sola implementación, `cancelAbonoSeries`.
- Gap closure de 15 hallazgos de code review en 7 planes, más migraciones 055 (CHECK de ventana) y 056 (índice UNIQUE del token).

### What Worked
- **El code review encontró un blocker real (CR-01) que ninguna suite había detectado**: el reintento de una baja parcial devolvía "ya cancelado" dejando turnos vivos. La cadena review → 7 planes de gap closure → verify lo cerró con test de concurrencia contra Postgres real.
- **La UAT humana encontró dos bugs que el pipeline automatizado no podía encontrar**: un `catch` faltante que solo se manifiesta con la red caída, y un abono finito que se archivaba al crearlo con todos sus turnos por delante. Ninguno era detectable por grep ni por la suite (que corre en `environment: node`, sin DOM).
- Los checkpoints humanos bloqueantes hicieron su trabajo: el de la migración 056 forzó verificar duplicados contra producción ANTES de crear un índice UNIQUE.
- Separar el flag del motor (`completed` = "el cron ya no extiende") de la lectura de negocio ("terminado") resultó ser un fix de UI de un archivo, en vez de tocar el cron, el alta y la baja.

### What Was Inefficient
- **El aislamiento por worktree destruyó `node_modules`.** El worktree nace sin dependencias, el ejecutor creó un junction al `node_modules` real, y `git worktree remove --force` borró a través del enlace: 560 paquetes de 807. Se recuperó con `npm install`, pero las Waves 2 y 3 se corrieron en modo secuencial sobre el árbol principal para no repetirlo.
- **`npx tsc` dio un falso verde.** Sin `node_modules/.bin/`, npx resuelve del registry un paquete llamado `tsc` que no es el compilador y **siempre sale 0**. Un plan entero se verificó así. Desde entonces todos los prompts de ejecutor prohíben `npx tsc` explícitamente.
- Un ejecutor se colgó en el watchdog (600 s) corriendo la suite completa; el orquestador tuvo que correr el gate por fuera y despachar un agente de continuación acotado.
- `milestone.complete` no es workstream-aware: generó la entrada de MILESTONES.md con las 7 fases del workstream (40 planes) en vez de las 2 del milestone, y con logros de v0.12. Hubo que reescribirla a mano.

### Patterns Established
- **Planes que dependen de la DB local o de `.env*` se despachan sin worktree**, secuencialmente sobre el árbol principal. El aislamiento no compensa cuando el plan necesita el entorno real.
- **Verificación con binarios locales, nunca `npx`**, como restricción escrita en el prompt del ejecutor.
- Una enmienda a una decisión LOCKED se registra **como enmienda con fecha y motivo**, no reescribiendo la decisión original (D-14/D-15).
- Cuando el gate de un plan es imposible de satisfacer por construcción, el ejecutor lo reporta y verifica el invariante que ese gate protegía, en vez de aflojarlo.

### Key Lessons
- **Un chequeo de seguridad puede ser más angosto que el invariante que dice verificar.** El auditor dio D-07 ("las dos vías producen el mismo efecto") por verificado porque ninguna ruta escribía `appointments` directo. La UAT después encontró que las vías diferían en notificaciones — dentro del alcance literal de D-07, fuera del alcance del chequeo. Terminó siendo una decisión de producto, pero el hueco de verificación era real.
- **La UAT humana no es ceremonia.** Los dos bugs que encontró eran invisibles para tests y greps por naturaleza: uno vive en el camino de red degradada, el otro en la lectura de un flag del motor como si fuera estado de negocio.
- **Un falso positivo bien diagnosticado vale tanto como un bug.** El operador reportó "me archivó los dos abonos" como corrupción de datos; era `completed` vs `cancelled` bajo el mismo tab. Confirmarlo contra la base evitó un fix innecesario — y la confusión misma quedó registrada como deuda de UX.

### Cost Observations
- Modelo: opus para planner/executor/auditor, sonnet para verifier/checker.
- Sesiones: 1 sesión larga para la Phase 7 completa (ejecución + review + gap closure + secure + UAT + 2 quick tasks + cierre de milestone).
- Notable: el gap closure de 7 planes salió en 3 waves; las 2 primeras en paralelo con worktrees hasta el incidente, el resto secuencial. El modo secuencial resultó **más lento pero sin incidentes**, y con verificación real contra la DB local.

---


## Cross-Milestone Trends

| Milestone | Phases | Plans | Shipped | Nota |
|-----------|--------|-------|---------|------|
| v0.9 Security Hardening | 5 | 11 | 2026-06-17 | Primer milestone GSD; pre-lanzamiento |
| v0.18 CMS Publish / Go-live | 3 | 8 | 2026-07-16 | Borrador/publicar + CMS abierto a clientes; 2 de 3 fases security-sensitive (SECURED 18/18 y 10/10) |
| v0.19 Cuenta y acceso | 3 | 11 | 2026-07-17 | Auth completo (reset + Google + mails branded); las 3 fases SECURED; UAT atrapó D-14 (enumeration) |
| v0.20 Onboarding pulido | 2 | 2 | 2026-07-18 | Onboarding robusto (slug fix + salida) + logo + auth siempre Forjo; ambas SECURED; 100% autónomo, sin checkpoint |

> Nota: v0.10–v0.17 no tienen sección de retrospective (no se corrió `/gsd:complete-milestone` con este archivo en su momento). La tabla salta de v0.9 a v0.18 a propósito.
