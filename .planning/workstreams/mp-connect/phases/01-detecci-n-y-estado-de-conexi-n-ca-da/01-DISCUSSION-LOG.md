# Phase 1 — Discussion Log

**Date:** 2026-07-19 · Human reference only (no lo consumen los agentes downstream).

## Gray areas discutidas

### 1. Forma del flag de estado de conexión
- Opciones: text-enum `'connected'|'error'` (recomendado) vs boolean.
- **Elección:** text-enum `mp_connection_status text default 'connected'`. Extensibilidad barata. → D-01.

### 2. Detección extra además de los fallos de refresh
- Opciones (multiSelect): 401 en el cobro · auto-sanar · solo lo mínimo.
- **Elección:** 401 en el cobro **+** auto-sanar. (El usuario marcó también "solo lo mínimo", que
  contradice; se interpretó como querer las dos mejoras concretas y se dejó nota en la respuesta para
  corrección.) → D-04, D-05.

### 3. Scope OAuth explícito (deuda #2)
- Opciones: sumarlo a Phase 1 (recomendado) vs diferir.
- **Elección:** sumarlo — `scope=offline_access read write` en la URL de autorización. → D-07.

### 4. Cliente público con conexión caída
- Opciones: solo log sin cambiar el flujo (recomendado) · mensaje/código de error más claro · caer a reservar sin seña.
- **Elección:** solo log server-side, sin cambiar el flujo público. → D-08.

## Deferred
- Mail al negocio al caer · reintento automático de cobros · cifrado de tokens (deuda #3).
