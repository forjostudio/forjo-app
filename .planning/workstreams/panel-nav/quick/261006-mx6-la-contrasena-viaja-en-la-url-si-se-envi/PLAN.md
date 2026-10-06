---
quick_id: 261006-mx6
slug: la-contrasena-viaja-en-la-url-si-se-envi
date: 2026-10-06
type: quick
severity: seguridad
surface: los 5 formularios de auth + el alta de cliente
files_modified:
  - app/(auth)/(split)/login/page.tsx
  - app/(auth)/(split)/register/page.tsx
  - app/(auth)/(split)/reset-password/page.tsx
  - app/(auth)/(split)/forgot-password/page.tsx
  - components/auth/mobile-login-hero.tsx
  - app/(dashboard)/clients/clients-client.tsx
  - test/forms-no-get-leak.test.ts
---

# La contraseña viaja en la URL si se envía el form antes de hidratar

**Esto está en producción y afecta a los clientes, no sólo al dueño.**

Apareció **de rebote**, mirando el historial del navegador durante la medición del quick `261006-iey`:

```
/login?email=test%40forjo.local&password=Forjo1234%21
```

## El mecanismo

Los formularios son `<form onSubmit={handleSubmit(...)}>` **sin `action` ni `method`**. `onSubmit` sólo
existe **después de que React hidrata**. Antes de eso, un tap en el botón hace el **submit nativo**:
sin `method`, el default es **GET**, y el navegador serializa **todos los campos en el query string**.

⇒ La contraseña queda en el **historial del navegador** y en los **logs de acceso** del servidor, el
proxy y el CDN. Los bodies de POST no se loguean; las URLs sí.

**Reproducido dos veces** durante la medición, sin buscarlo.

## Alcance — medido, es mayor de lo que parecía

| Archivo | Qué expone |
|---|---|
| `app/(auth)/(split)/login/page.tsx` | email + **contraseña** |
| `components/auth/mobile-login-hero.tsx` | email + **contraseña** ← ⚠ **el peor**: es el login **mobile**, donde una conexión lenta hace más probable tocar antes de hidratar |
| `app/(auth)/register/page.tsx` | email + **contraseña** |
| `app/(auth)/(split)/reset-password/page.tsx` | **contraseña** (dos campos) |
| `app/(auth)/(split)/forgot-password/page.tsx` | email |
| `app/(dashboard)/clients/clients-client.tsx:1033` | nombre, teléfono y mail **de un cliente** — datos personales de un tercero |

⚠ Verificá las rutas exactas antes de editar: el barrido las ubicó en `app/(auth)/(split)/` salvo
`register`. **Si alguna no coincide, corregí el frontmatter.**

Falsos positivos descartados: `booking-client.tsx` y `time-field.tsx` — sus coincidencias de "form"
están **dentro de comentarios** (el primero dice explícitamente que esa pantalla **no** tiene `<form>`).

## El arreglo, ya medido contra el dev server

**`method="post"` en cada `<form>`.** La contraseña pasa a viajar en el **cuerpo**, nunca en la URL.

**Medido antes de escribir el plan:**
- `GET /login?email=…&password=…` → **200** (lo que pasa hoy: la página carga y la URL queda grabada)
- `POST /login` con los campos en el body → **200**

⇒ El usuario que toca antes de hidratar **ve la página de login de nuevo**, sin página de error y sin
fuga. Después de hidratar, `handleSubmit` hace `preventDefault()` y el `method` queda inerte.

⚠ **No cambia nada del flujo normal.** Si al medirlo ves que sí, pará y decilo.

## Task 1 — `method="post"` en los 6

Una palabra por formulario. **No toques nada más**: ni el `onSubmit`, ni los campos, ni la validación,
ni el botón, ni las clases.

⚠ **No agregues `action`**: sin él, el submit nativo va a la **URL actual**, que es lo que se midió en
200. Un `action` apuntando a otro lado abre una superficie nueva que nadie pidió.

## Task 2 — Un gate que impida la cuarta vez

Barrido sobre el fuente que exija que **todo `<form>` del repo** declare `method` (o `action`).

- ⚠ **Descontá los comentarios**: el molde es `sinComentarios` en `test/catalog-public.test.ts:35-40`.
  Sin eso, `booking-client.tsx` y `time-field.tsx` dan falsos positivos — **lo comprobé**.
- ⚠ **Guarda de "no encontró nada"**: un barrido que no matchea ningún `<form>` **no puede pasar por
  vacío**. Es la regla que el repo ya aplica en sus otros gates.
- El mensaje de fallo tiene que **explicar el porqué** (submit nativo pre-hidratación ⇒ GET ⇒ campos en
  la URL), no sólo decir "falta method". El que lo lea dentro de un año tiene que entender el riesgo.

## Prohibiciones

- **No** cambies el flujo de autenticación ni toques Supabase Auth.
- **No** conviertas los formularios a server actions: es otro trabajo y otra decisión.
- **No** deshabilites el botón hasta hidratar: cambia la UX y no hace falta — `method="post"` ya cierra
  la fuga.
- **Cero paquetes nuevos**, **cero migraciones** (siguen **41**), **cero cambio visual**.

## Verificación

- `./node_modules/.bin/tsc --noEmit` — ⚠ **nunca `npx tsc`**. Buscá `error TS` en la SALIDA, filtrando
  `^\.next/`.
- `npx vitest run` — piso **1616 passed / 104 archivos** más tu caso. ⚠ **Dos canarios de reloj fallan a
  propósito fuera de `[01:00, 23:30]` AR** y lo anuncian: **mirá el reloj**.
  ⚠ El carril `db` **flakea por contención** cuando hay otro proceso pegándole al Supabase local
  (`Hook timed out`): si da rojo ahí, **repetí el carril solo** antes de concluir nada.
- `./node_modules/.bin/eslint <archivos>` → 0 problemas nuevos (hay **1 preexistente** en
  `agenda-client.tsx`).
- **Comprobá la fuga y su cierre** contra el dev server: un POST con credenciales **no** deja nada en la
  URL. Los números de arriba son el antes.
- ⚠ Hay un **dev server en el puerto 80** que el dueño usa. **NO lo mates** (corre desacoplado).
- ⚠ El **CI está rojo por infraestructura** (el Supabase de **staging** no responde), no por código.
  **No intentes arreglarlo.**

## UAT

1. Login normal (desktop y mobile) ⇒ entra igual que siempre.
2. Registro, recuperar contraseña y restablecer ⇒ igual que siempre.
3. Alta de cliente nuevo desde el panel ⇒ igual que siempre.
4. **La prueba del bug**, si se puede: con la red en 3G lenta desde las herramientas del navegador,
   tocar "Entrar" apenas aparece el botón ⇒ la URL **no** tiene que mostrar `?email=…&password=…`.
