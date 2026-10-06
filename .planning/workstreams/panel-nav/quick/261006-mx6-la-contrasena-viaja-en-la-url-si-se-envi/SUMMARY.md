---
quick_id: 261006-mx6
slug: la-contrasena-viaja-en-la-url-si-se-envi
date: 2026-10-06
status: complete
severity: seguridad
uat: PENDIENTE (los 4 puntos del PLAN, incluido el de red 3G lenta) — NO se corrió, por pedido explícito
commits:
  - 82c2c36
  - b40c9e4
plan_head_before: 9412ac0
actuals:
  commits: 2
  tasks: 2
  nota_commits: "MEDIDO: `git rev-list --count 9412ac0..HEAD` = 2 (los 2 de código). El commit de este SUMMARY va encima."
key-files:
  created:
    - test/forms-no-get-leak.test.ts
  modified:
    - app/(auth)/(split)/login/page.tsx
    - app/(auth)/(split)/reset-password/page.tsx
    - app/(auth)/(split)/forgot-password/page.tsx
    - app/(auth)/register/page.tsx
    - components/auth/mobile-login-hero.tsx
    - app/(dashboard)/clients/clients-client.tsx
decisions:
  - El arreglo es `method="post"` y nada más — una palabra por formulario. Cero `action`: sin él el submit nativo va a la URL actual, que es lo que se midió en 200.
  - El gate exige `method` LITERAL y además prohíbe `get`. "Declarar method (o action)" dejaba pasar `method="get"` y `action="/x"` sin method, que filtran igual. Escape hatch explícito en `GET_PERMITIDO`, hoy vacía.
  - La ruta de `register` del frontmatter del PLAN estaba mal: es `app/(auth)/register/page.tsx`, NO `app/(auth)/(split)/register/page.tsx` (eslint lo confirmó con "No files matching the pattern").
---

# La contraseña deja de viajar en la URL

Dos Tasks, dos commits. Cero paquetes, cero migraciones (siguen **41**), cero cambio visual. No se
tocó el flujo de auth, ni Supabase Auth, no se convirtió nada a server actions y no se deshabilitó
ningún botón hasta hidratar. En los 6 archivos el único cambio de código es la palabra
`method="post"` dentro de la etiqueta: `onSubmit`, campos, validación, botón y clases quedaron
idénticos (verificable en `git show 82c2c36`).

## Los 6 formularios, con su ruta real

| Archivo (ruta verificada) | Línea | Qué exponía |
|---|---|---|
| `app/(auth)/(split)/login/page.tsx` | 90 | email + **contraseña** |
| `components/auth/mobile-login-hero.tsx` | 200 | email + **contraseña** (el peor: es el login mobile) |
| `app/(auth)/register/page.tsx` | 136 | email + **contraseña** |
| `app/(auth)/(split)/reset-password/page.tsx` | 116 | **contraseña** (los dos campos) |
| `app/(auth)/(split)/forgot-password/page.tsx` | 122 | email |
| `app/(dashboard)/clients/clients-client.tsx` | 1040 | nombre, teléfono y mail de un tercero |

⚠ **Corrección al frontmatter del PLAN**: `register` **no** vive en `(split)`. El PLAN listaba
`app/(auth)/(split)/register/page.tsx`; eslint falló con *"No files matching the pattern"* y la ruta
real es `app/(auth)/register/page.tsx`. Las otras 5 coincidían.

Falsos positivos del barrido original, confirmados: `app/[slug]/booking-client.tsx` y
`components/ui/time-field.tsx` — y uno más que el PLAN no listaba, `components/landing/gallery.tsx:63`.
Las tres menciones están dentro de comentarios.

## La fuga, cerrada — con la evidencia

Medido contra el dev server del puerto 80 (**no se mató**, corre desacoplado). Lo que importa es el
**HTML que el navegador tiene ANTES de hidratar**, porque es ese markup el que decide el verbo del
submit nativo:

```
ANTES   curl -s http://localhost/login | grep -o '<form[^>]*>'
        <form class="space-y-4">      ← sin method ⇒ default del HTML = GET ⇒ campos en la URL
        <form>                        ← el login mobile, igual

DESPUÉS <form class="space-y-4" method="post">
        <form method="post">
        /forgot-password → <form class="space-y-4" method="post">
        /register        → <form class="space-y-4" method="post">
```

Y el camino normal no se rompe: `POST /login` con los campos en el body sigue dando **200** (igual
que antes del cambio), así que el usuario que toca antes de hidratar **vuelve a ver el login**, sin
página de error y sin nada en el query string. El `GET /login?email=…&password=…` que hoy devuelve
200 ya no lo puede producir el navegador desde estos formularios: no queda markup que lo genere.

## El gate, y por qué no da falsos positivos

`test/forms-no-get-leak.test.ts` — suite **pura** (no importa `./env`, así que el clasificador de
`test/suite-split.ts` la manda al carril paralelo). Barre **todas** las fuentes `.ts/.tsx` del repo
con el mismo walker de `catalog-public.test.ts`, y afirma tres cosas:

1. **Guarda de "no encontró nada"**: hay > 0 formularios **y** los 6 archivos conocidos siguen
   apareciendo. Un barrido roto (la marca mal escrita, un walker que no entra a `app/`) falla en vez
   de pasar por vacío.
2. **Todos declaran `method` literal.**
3. **Ninguno es `get`** — fuera de `GET_PERMITIDO`, hoy vacía a propósito. Esto va más allá de lo que
   pedía el PLAN ("declare `method` o `action`"), porque esa regla más laxa dejaba pasar los dos casos
   que filtran igual: `method="get"` siempre, y `action="/x"` sin `method` también (sigue siendo GET).

**Los dos controles que lo hacen honesto, corridos de verdad:**

- **Sin descontar comentarios** (anulando `sinComentarios` detrás de una env var, y revirtiendo
  después) el gate denuncia **5 falsos positivos** en 3 archivos: `booking-client.tsx` (1),
  `time-field.tsx` (3) y `gallery.tsx` (1). Con el descuento: **0**. El molde es el `sinComentarios`
  de `test/catalog-public.test.ts:35`, copiado tal cual.
- **Control negativo**: sacándole el `method` al login, el gate falla y el mensaje es el riesgo
  completo (GET pre-hidratación ⇒ campos en el query string ⇒ historial + logs de server/proxy/CDN,
  con el caso real de producción citado) y el arreglo — no un "falta method".

Dos detalles del barrido que no son adorno: la etiqueta se arma por **concatenación** (`'<' + 'form'`)
para que el propio archivo no se matchee en el barrido de todas las fuentes, y el recorte de la
etiqueta **balancea llaves** en vez de usar `[^>]*>`, porque el `>` de una arrow function
(`onSubmit={(e) => …}`) cortaría la etiqueta antes de llegar al `method`.

## Verificación — salida real

- `./node_modules/.bin/tsc --noEmit` → **0** líneas con `error TS` (filtrando `^\.next/`).
- `npx vitest run` → **105 archivos, 1619 passed | 4 expected fail | 1 skipped (1624)**, en 63.70s.
  Piso del PLAN: 1616 passed / 104 archivos ⇒ **+3 tests / +1 archivo**, los míos. Reloj al correr:
  **16:40 AR**, dentro de `[01:00, 23:30]` ⇒ los canarios de reloj no aplicaron. El carril `db` salió
  verde de una, sin repetición.
- `./node_modules/.bin/eslint` sobre los 7 archivos → **exit 0, cero salida**. (El preexistente de
  `agenda-client.tsx` no se tocó.)

## Qué quedó sin verificar

- **La UAT entera**: no se corrió, por pedido explícito. Incluye el punto 4, que es la prueba del bug
  (red 3G lenta + tap apenas aparece el botón ⇒ la URL no debe mostrar `?email=…&password=…`). Eso es
  lo único que comprueba el comportamiento **real** del navegador en la ventana de pre-hidratación;
  acá se comprobó el **markup servido**, que es lo que lo determina según el spec de HTML.
- **2 de los 6 formularios no se vieron servidos**: `/reset-password` responde 200 pero renderiza el
  aviso de link inválido sin el formulario (hace falta un token válido), y `/clients` redirige 307 sin
  sesión. En esos dos el cambio está verificado por fuente + por el gate, no por HTML servido.
- **El CI** sigue rojo por infraestructura (el Supabase de staging no responde). No se tocó.

## Self-Check: PASSED

Los 7 archivos existen en disco y los 2 commits existen en el historial (`git log --oneline --all`).
Los 6 formularios del repo declaran `method="post"` (`grep` sobre `app/` y `components/`).
