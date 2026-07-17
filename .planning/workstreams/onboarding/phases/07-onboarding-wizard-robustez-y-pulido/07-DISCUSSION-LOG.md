# Phase 7: Onboarding wizard — robustez + pulido — Discussion Log

**Date:** 2026-07-17 · **Mode:** discuss

> Referencia humana. Lo que consumen los agentes es el CONTEXT.md.

## Áreas discutidas

### ONB-01 — chequeo de slug
- Opciones: endpoint service-role (recomendada) · RPC security definer.
- Elegido: **endpoint service-role** (sin migración, patrón booking/availability; devuelve solo booleano). → D-01/D-02/D-03.

### ONB-03 — timing del logo
- Opciones: subir al finalizar (recomendada) · staging temporal.
- Elegido: **subir al finalizar** (respeta RLS del bucket, sin huérfanos). → D-05.

## Directos (no discutidos)
- ONB-02: botón cerrar sesión → /login (salida del callejón). → D-04.
- ONB-04: sacar el selector de paleta del wizard; queda en Ajustes, default al crear. → D-06.

## Flags para research
Confirmar: firma de editor-upload.ts, policy RLS del bucket landing-assets (migr. 030), shape de booking/availability. ONB-01 lleva threat model (multi-tenant, service-role).
