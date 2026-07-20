---
slug: integraciones-followups
date: 2026-07-20
status: complete
commit: 8dddfd2
branch: fix/integraciones-followups
---

# Follow-up de la card de Integraciones (Negocio) — post v0.23

Ejecutado inline (sin subagentes). 4 cambios en `app/(dashboard)/settings/settings-client.tsx`
+ `app/(dashboard)/negocio/page.tsx`:

1. **FIX logo MP:** removido el `MpLogo` (SVG a mano, se veía como un blob) y sus 2 usos. "MercadoPago"
   queda limpio. ⏳ Pendiente: inlinear el **SVG oficial** que va a pasar el usuario.
2. **FIX tabs:** TabsList del hub Negocio en mobile → `grid-cols-2 gap-1` + `py-1.5` en los triggers
   (2×2 más cohesivo). El TabsList de Configuración NO se tocó.
3. **FEAT Google Calendar en Integraciones:** card nueva (conectar/sincronizar/desconectar) que comparte
   la conexión/estado con el control de la Agenda (endpoints `/api/google/*`). `negocio/page` pasa
   `googleEnabled`/`googleConnected` (booleano derivado de `secrets.google_refresh_token`, nunca el token).
   ⚠ El callback de Google redirige a `/agenda` (hardcodeado) → conectar desde acá aterriza en Agenda.
4. **FEAT autocarga de mail:** `Notificaciones/Mails` precarga `notification_email` con el email del dueño
   (sesión, `ownerEmail`) cuando el negocio aún no tiene uno; no pisa un valor guardado.

## Verificación
- `tsc --noEmit`: exit 0.
- `eslint`: 10 errores preexistentes del React Compiler (mismo count que main, verificado por stash);
  **cero errores nuevos**. Ninguna línea de error cae en las regiones tocadas.

## Pendiente
- Inlinear el SVG oficial de MercadoPago (el usuario lo va a pasar) → reponer el logo en el header de la
  card + el botón "Conectar".
- UAT visual del usuario. Merge a main = release del usuario.
