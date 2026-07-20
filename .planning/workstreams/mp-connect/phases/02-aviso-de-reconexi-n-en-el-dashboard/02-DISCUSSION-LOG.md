# Phase 2 — Discussion Log

**Date:** 2026-07-19 · Human reference only (no lo consumen los agentes downstream).

## Gray areas discutidas

### 1. Tono visual del aviso
- Opciones: ámbar/warning (recomendado) vs rojo/destructivo.
- **Elección:** ámbar/warning — accionable y recuperable. → D-02.

### 2. Copy del aviso
- Opciones: usar el del roadmap tal cual (recomendado) vs ajustar.
- **Elección:** tal cual — "Tu conexión con MercadoPago se interrumpió, reconectá tu cuenta para seguir cobrando señas." → D-03.

### 3. Alcance de dónde aparece
- Opciones: solo la card de Integraciones (recomendado) vs + aviso global en el dashboard.
- **Elección:** **+ aviso global** (banner en el layout del dashboard, además de la card). Amplía el scope
  respecto de los Success Criteria originales — registrado explícitamente en el CONTEXT (D-05). → D-05, D-06.

## Decisiones técnicas (Claude, dentro de convenciones)
- Banner global = componente nuevo espejando `PlanBanner`, montado en `app/(dashboard)/layout.tsx`, persistente, ámbar, solo si `mp_connection_status==='error' && mp_user_id`. CTA Reconectar → OAuth existente.
- `mpConnected = !!mp_user_id && mp_connection_status !== 'error'`.

## Deferred
- Mail al negocio al caer · aviso específico en Finanzas.
