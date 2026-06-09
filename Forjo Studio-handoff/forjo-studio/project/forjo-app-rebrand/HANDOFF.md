# Forjo App — Rebrand handoff

Rebrand of **forjostudio/forjo-app** (Next.js 16 · Tailwind v4 · shadcn) into the
Forjo Bauhaus identity, plus a **palette selector** in Configuración.

Files in this folder:
- `Forjo App Rebrand.html` + `theme.css` + `app.js` — live preview (Dashboard, Turnos,
  Clientes, Finanzas, Configuración/Apariencia, Reserva pública, Login). Toggle palettes &
  light/dark from the top bar; the real picker lives in **Configuración → Apariencia**.
- `globals.css` — production-ready, drop-in replacement for `app/globals.css`.

## What changes in the repo

### 1. Fonts — `app/layout.tsx`
Swap Geist for the brand pair (both via `next/font/google`):

```tsx
import { Archivo, Space_Grotesk } from "next/font/google";
const sans = Space_Grotesk({ variable: "--font-sans", subsets: ["latin"], weight: ["300","400","500","600","700"] });
const heading = Archivo({ variable: "--font-heading", subsets: ["latin"], weight: ["400","500","600","700","800","900"] });
// <html className={`${sans.variable} ${heading.variable} h-full antialiased`} ...>
```
Remove the hard-coded `dark` class on `<html>` and let **next-themes** drive it
(`<ThemeProvider attribute="class" defaultTheme="light">`), so the Tema toggle works.

### 2. Theme — `app/globals.css`
Replace the whole file with `globals.css` from this folder. Same shadcn token names,
so **no component edits needed** — Button/Card/Badge/Table/Tabs/Input inherit it.

### 3. Palette selector (the new feature)
- Add a `palette text default 'red'` column to `businesses` (migration in `supabase/`).
- New **Apariencia** tab in `settings-client.tsx` (first tab). Render 5 cards
  (red/blue/yellow/green/ink) — see the preview markup. On select:
  `await supabase.from('businesses').update({ palette }).eq('id', business.id)`.
- Apply it app-wide: in `app/(dashboard)/layout.tsx` and `app/[slug]/layout.tsx`
  set `<html data-palette={business.palette}>` (or a wrapper `<div data-palette>`),
  so both the panel **and** the public booking page follow the business's color.
- This **replaces the raw `primary_color` color-picker** in the Negocio tab — curated
  on-brand palettes instead of an arbitrary hex (keep the column for back-compat if needed).

### 4. Bauhaus accents (optional polish, already in the preview)
- Sidebar: "hecho con **Forjo**" footer with the constructivist F mark.
- Page eyebrows use a 3-primitive bullet (red square · yellow square · blue circle).
- One dashboard stat ("Ingresos del mes") rendered as a solid `bg-primary` block.
- Public `[slug]` hero: full-bleed `bg-primary` with geometric shapes + Archivo uppercase title.

## Palette tokens
Each palette only overrides the accent family (`--primary`, `--accent`, `--ring`,
`--sidebar-primary`, `--chart-1` + their foregrounds). Neutrals (cream/ink) are shared.
Yellow & ink use a dark `--primary-foreground`; the rest use cream.
