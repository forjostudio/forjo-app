# 10-05 — SUMMARY (UAT humano end-to-end)

**Plan:** 10-05 (checkpoint humano, autonomous: false)
**Fecha:** 2026-07-26/27
**Resultado:** APROBADO por el operador (los 5 success criteria), con 3 desvíos detectados y cerrados + 1 hardening pedido.

## UAT — resultado
El operador ejercitó la reserva pública real (Supabase local, vista 059 viva) y confirmó:
- Tarjeta "Cualquiera" ("El primero disponible") arriba del step 2, gateada por 2+ capaces (D-02/D-03). ✓
- Grilla agregada: horario libre si algún capaz lo tiene libre, sin exponer counts ni per-pro (DISP-01/03/D-06). ✓
- Confirmación muestra el profesional asignado por el server (ASIGN-05). ✓
- Profesional específico idéntico a hoy (DISP-02) y gemelo canchas sin "Cualquiera" (SC5/D-09). ✓

## Desvíos detectados en UAT → cerrados (fix(10-05))
1. **Label del profesional** en confirmación + mail era el literal "Profesional"; la pantalla es compartida con canchas → se hizo **vertical-aware** (`professionalLabel`: "Te atiende" en staff / terminología `resource`="Cancha" en canchas). Commit `48e418c`. VERIFICADO.
2. **Servicio sin cobertura** de staff seguía siendo reservable en público (caía a "Sin preferencia") → helper puro `bookableServices()` en `lib/staff-services.ts` (guarda: 0 profesionales nombrados → todos; comodín → todos; filtra solo cuando hay staff mapeado y el servicio no lo cubre nadie), aplicado en `page.tsx` solo a `BookingClient`. Commits `43a9c40` + test `d64c864` (`test/service-coverage-public.test.ts`, 3 casos). VERIFICADO.
3. **Resumen del paso 4** no mostraba el profesional elegido (se perdía al pasar de 3→4) → agregada la línea espejando el paso 3. Commit `f0b383f`. VERIFICADO.

## Hardening pedido por el operador
- **Migr. 060** `public_professionals_exclude_canchas`: la vista pública de staff pasa a filtrar `active = true AND service_id IS NULL`, para que una cancha (guardada en `professionals` con `service_id`) nunca se cuele en la lista de staff si un negocio cambia de vertical canchas→staff. Commits `fd8031c` + test `138e121` (`test/public-professionals-excludes-canchas.test.ts`). Sin regresión de staff (service_id NULL) ni canchas.

## Ítems diferidos (fuera de scope, no son bug de Phase 10)
- No se puede borrar una cancha con turnos aunque se borren los turnos: los cancelados seguían contando hasta borrarlos definitivo (fricción pre-existente del guard de canchas v0.13). Entendido, no se toca.

## Pendiente operativo (deploy manual)
- Aplicar a PROD a mano las migraciones **059** y **060** + `NOTIFY pgrst, 'reload schema';`. Sin ellas la feature degrada fail-safe (no rompe el booking de hoy).
- secure-phase (mandatorio, superficie pública) corre a continuación.
</content>
