# Prompt para Claude Code (copiar y pegar)

> Copiá este bloque en Claude Code, con la carpeta `design_handoff_forjo_rebrand/`
> agregada al contexto del proyecto `forjo-app`.

---

Quiero aplicar el rebrand de marca **Forjo** a esta app (Next.js 16 + Tailwind v4 + shadcn).
Toda la spec está en `design_handoff_forjo_rebrand/README.md` y los assets en esa carpeta.
Seguila al pie. Resumen de lo que hay que hacer:

1. **Fuentes** — en `app/layout.tsx`, reemplazá Geist por `Archivo` (--font-heading) y
   `Space_Grotesk` (--font-sans) vía `next/font/google`. Quitá el `dark` hardcodeado del
   `<html>` y envolvé con `next-themes` `ThemeProvider attribute="class" defaultTheme="light"`.

2. **Theme** — reemplazá `app/globals.css` por `design_handoff_forjo_rebrand/globals.css`
   (mismos nombres de token shadcn; no hace falta tocar componentes).

3. **Feature selector de paleta**:
   - Migración Supabase: columna `palette text not null default 'red'` en `businesses`.
   - En `app/(dashboard)/layout.tsx` y `app/[slug]/layout.tsx`, poné `data-palette={business.palette}`
     en el `<html>`/wrapper raíz.
   - En `settings-client.tsx`, agregá un tab **Apariencia** (primero) con 5 tarjetas de paleta
     (red/blue/yellow/green/ink) + segmented Claro/Oscuro (usá `useTheme()`). Al elegir paleta:
     `update({ palette })` en `businesses` + setear `document.documentElement.dataset.palette`.
   - Quitá el color-picker libre `primary_color` del tab Negocio (la paleta lo reemplaza).

4. **Retoques Bauhaus** (ver README sección 4): footer "hecho con Forjo" + marca F en el sidebar;
   card "Ingresos del mes" como bloque `bg-primary`; hero `bg-primary` con formas en la página
   pública `[slug]`. Verificá que el tab Negocio ya muestre Tipo (select) + aviso de Rubro.

5. **Favicons** — copiá `design_handoff_forjo_rebrand/favicons/icon.png` → `app/icon.png` y
   `apple-icon.png` → `app/apple-icon.png`. Regenerá `app/favicon.ico` desde los PNG 16/32.

Importante: los archivos en `preview/` son SOLO referencia visual (HTML plano), no los copies.
La fuente de verdad del tema es `globals.css`. Trabajá con los componentes shadcn existentes.

Antes de empezar, listame el plan de cambios por archivo y esperá mi OK.
