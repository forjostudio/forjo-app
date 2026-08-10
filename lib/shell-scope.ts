// ── Scope de shell para superficies portaleadas (POLISH-05, gap 1 de 14-VERIFICATION.md) ─────────
//
// CAUSA RAÍZ que este módulo resuelve. Los tokens visuales de un shell (el del super-admin, hoy) se
// declaran sobre un `<div>` del layout — `app/(crm)/layout.tsx` — y llegan a los componentes de
// adentro por HERENCIA del DOM, que es como viajan las custom properties de CSS. Pero el contenido
// portaleado (el `Popup` de `DialogContent`, que base-ui monta dentro de `<DialogPortal>`) se
// renderiza en la RAÍZ del documento: está dentro del árbol de React del CRM, pero FUERA de ese
// `<div>` en el árbol del DOM. Resultado observado en la UAT humana de 14-07: dentro de los 4
// ConfirmDialog del CRM la superficie de peligro cae al rojo de la app y el primario también, así
// que los chips "Alto" y "Medio" del RiskBadge se ven del mismo color. Un diálogo destructivo que
// deja de verse peligroso es un riesgo de UX-safety real (T-14-31), no un detalle cosmético.
//
// POR QUÉ NO SE ARREGLA "haciendo que el rojo global sea el correcto": la superficie de peligro
// compartida (`--danger`) se re-resuelve por tema — cada bloque de `app/themes.css` declara su
// propio par sobre el mismo `<html>`. Apoyarse en que el valor global "coincida" volvería a romper
// en cuanto un tema cambie, y además `medio` se apoya en `--primary`, que la paleta del negocio
// también mueve. Lo único estable es que el popup declare el MISMO scope que el shell.
//
// INVARIANTE D-05 / D-06 / D-07: acá se nombran SCOPES (clases de shell), nunca TOKENS. Ningún
// componente compartido referencia el token propio de un shell — esa es la lección del gap 13-05 #1
// que ya dejó escrita `confirmButtonClass()` en `components/crm/confirm-dialog.tsx`. Este módulo NO
// toca `components/crm/risk-badge.tsx` (que ya cumple D-05/D-06/D-07) ni redeclara custom properties.
//
// Sin directiva de cliente A PROPÓSITO: `app/(crm)/layout.tsx` es un Server Component async y
// necesita el VALOR de la constante. Los exports de un módulo marcado `'use client'` llegan al
// servidor como referencias, no como valores. Por eso la constante vive acá (neutral) y el contexto
// de React vive en `components/ui/shell-scope.tsx`.

/**
 * Clases que declaran el shell visual del super-admin (CRM).
 *
 * Son EXACTAMENTE las dos del wrapper de `app/(crm)/layout.tsx` — `dark` activa los neutrales
 * oscuros y `crm-shell` el acento amarillo + el rojo de marca del CRM (`app/globals.css:235-262`).
 * Los dos bloques de CSS involucrados declaran ÚNICAMENTE custom properties: no traen layout ni
 * posicionamiento, así que aplicarlos sobre el popup portaleado es inocuo y sus descendientes
 * (incluido el `RiskBadge`) los heredan igual que dentro del shell.
 *
 * Desde este plan es la FUENTE ÚNICA: el layout dejó de escribirlas a mano y el portal recibe
 * exactamente lo mismo, así que el shell y lo portaleado no pueden divergir.
 */
export const CRM_SHELL_CLASS = 'dark crm-shell'

/**
 * Devuelve la clase de scope que una superficie portaleada tiene que declarar, o `undefined` cuando
 * no hay ningún shell activo.
 *
 * El `undefined` es deliberado y es LA garantía anti-regresión: `cn()` descarta los valores falsy,
 * así que fuera de un `ShellScopeProvider` el `className` del popup queda byte-idéntico al de hoy —
 * el dashboard, el booking público y el landing no heredan nada del super-admin (T-14-32).
 */
export function portalScopeClass(scope: string | undefined): string | undefined {
  if (!scope || scope.trim().length === 0) return undefined
  return scope
}
