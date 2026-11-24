---
phase: quick-261124-obs
verified: 2026-11-24T21:05:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Quick 261124-obs: una cuenta de MercadoPago no puede quedar en dos negocios - Verificación

**Alcance:** commits ea1457e, d581ee3, f8593e9 (11 archivos, todos dentro de `files_modified`).
**Estado:** passed

## Verdades

| # | Verdad | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | Índice único parcial: 2 negocios no comparten mp_user_id (23505 aun con RLS); NULL conviven; reconexión propia no choca | VERIFICADO | 082 crea `businesses_mp_user_id_key` WHERE NOT NULL. Existe en el Postgres local (`pg_indexes`). Corrí `vitest --project db test/mp-user-id-unique.test.ts`: 5/5 pasan, con sesiones reales anon+signIn (a: NULL conviven, b: service-role 23505, c: sesión B sin ver A choca 23505 y conserva su cuenta, d: reconexión OK, e: liberar y retomar). |
| 2 | 082 no toca datos; guarda aborta con `082: ...` sin imprimir valores | VERIFICADO | El DO block solo cuenta, y el RAISE nombra únicamente las dos cantidades. Sin DELETE/UPDATE en la migración. La guarda se probó en rollback según el SUMMARY (no la repetí, no se resetea Supabase). Índice idempotente (IF NOT EXISTS). |
| 3 | 23505 en el update → `?mp=error&motivo=cuenta-en-uso`, cookies borradas, cero escrituras a business_secrets | VERIFICADO | `route.ts`: el `if (bizErr?.code === '23505') return fail('cuenta-en-uso')` está ANTES del upsert de business_secrets. `fail()` borra `mp_oauth_state` y `mp_oauth_from`. Tests de `oauth-return-routes` (con y sin cookie de destino, cero upserts) pasan. |
| 4 | Negocio por `negocioDelDueno` y update filtrado por `id` + `owner_id` | VERIFICADO | `negocioDelDueno(supabase, user.id, 'id')` reemplaza el `.single()`. El update lleva `.eq('id', biz.id).eq('owner_id', user.id)`. MPCONN-05 (`mp_connection_status: 'connected'`) intacto en el mismo update; el test del heal pasa. |
| 5 | Otros errores siguen en `?mp=error` sin motivo; anti-CSRF intacto; motivo solo de lista cerrada | VERIFICADO | El diff del callback no toca la línea `!code \|\| !state \|\| !saved \|\| state !== saved`. `fail(motivo?: MpErrorReason)` está tipado con la lista cerrada `['cuenta-en-uso']`. Un 42501 cae en `fail()` sin motivo. |
| 6 | Panel y onboarding muestran el mensaje específico; un motivo inventado cae al genérico; la URL se limpia | VERIFICADO | `resolveMpErrorReason` usa match exacto con `find` y devuelve una constante `MP_CUENTA_EN_USO_TEXTO`, nunca el valor de la URL. settings-client: toast específico y `drop: ['mp','google','motivo']`. integraciones-client: lee `motivo` antes del `replaceState`, `oauthReturnNotice(mp, mpConnected, motivo)`, toast y aviso en la tarjeta. Tests pure pasan. |
| 7 | Paso manual de prod escrito | VERIFICADO | La cabecera de la 082 tiene los pasos (a)-(d): SELECT previo, qué hacer si devuelve filas, aplicar DESPUÉS del deploy, post-chequeo. El SUMMARY los repite. |

## Chequeos transversales pedidos

| Chequeo | Resultado |
|---------|-----------|
| Anti-CSRF del state sin tocar | OK, la línea de validación no aparece en el diff |
| Sin secretos escritos en 23505 | OK, retorno antes del upsert; solo se loguea el código (`bizErr.code`), no el detail con el valor |
| Motivo de lista cerrada | OK, tipo `MpErrorReason` + `resolveMpErrorReason`; el texto mostrado es constante |
| Aislamiento de tenant | OK, update por `id` + `owner_id`, sin service role en el callback; la 082 no agrega policies |
| Archivos protegidos sin cambios (`lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs`, `next.config.ts`, `lib/onboarding-alta.ts`) | OK, `git diff ea1457e~1..f8593e9` vacío (también `lib/panel-tabs.ts`, `lib/panel-history.ts`, `lib/negocio-del-dueno.ts`) |
| `package.json` / lockfile | OK, sin cambios |
| `supabase/schema.sql` | OK, espejo quirúrgico de 4 líneas con el índice |

## Ejecución

| Comando | Resultado |
|---------|-----------|
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| `vitest run --project pure test/oauth-return-routes.test.ts test/mp-cobro-callback.test.ts lib/oauth-return.test.ts test/panel-tabs.test.ts` | 4 archivos, 217 passed |
| `vitest run --project db test/mp-user-id-unique.test.ts` | 5 passed (Postgres local, sin reset ni stop) |

## Anti-patrones

Sin TBD/FIXME/XXX ni stubs en los archivos tocados. El ESLint de settings-client.tsx tiene 10 errores preexistentes (react-hooks), ninguno en las líneas tocadas, según el SUMMARY. No lo corrí de nuevo.

## Observaciones (no bloqueantes)

- La 082 NO está aplicada en prod (a propósito, es un paso manual después del deploy). Hasta entonces, en prod la cuenta repetida no se rechaza, aunque el código nuevo anda igual. Está documentado en la cabecera de la 082 y en el SUMMARY.
- En local se aplicó por psql, no por `db reset`, así que no figura en el historial de migraciones del CLI. Es idempotente y el próximo reset la toma sola.
- El árbol tiene cambios sin commitear de otra sesión (abonos, appointments, finances, tests de manual-booking): no son de estos tres commits y no se tocaron.
- No se probó en navegador el aspecto visual del aviso en la tarjeta del onboarding (la lógica está cubierta por tests). Es un chequeo cosmético y no afecta el veredicto.

## Gaps

Ninguno.

_Verificado: 2026-11-24 — Claude (gsd-verifier)_
