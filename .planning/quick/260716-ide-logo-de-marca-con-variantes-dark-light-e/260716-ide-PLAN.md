---
phase: quick/260716-ide
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(auth)/login/page.tsx
  - app/(auth)/register/page.tsx
  - proxy.ts
  - public/forjo-lockup.png
autonomous: true
requirements: [BRAND-01]
must_haves:
  truths:
    - "El logo de /login y /register es el lockup real de marca, no cambia de color con la paleta del negocio"
    - "En /register el lockup se ve en tinta con tema claro y en crema con tema oscuro"
    - "En /login el lockup se ve siempre en crema sobre el panel bg-primary"
    - "La página de mantenimiento del kill switch sigue mostrando su logo"
  artifacts:
    - path: "app/(auth)/login/page.tsx"
      provides: "Lockup crema fijo en el panel izquierdo"
      contains: "forjo-gestion-lockup-crema"
    - path: "app/(auth)/register/page.tsx"
      provides: "Lockup con swap dark/light dentro del h1"
      contains: "forjo-gestion-lockup"
  key_links:
    - from: "app/(auth)/register/page.tsx"
      to: "public/brand/forjo-gestion-lockup-tinta.png"
      via: "next/image src"
      pattern: "brand/forjo-gestion-lockup"
    - from: "proxy.ts"
      to: "public/brand/forjo-gestion-lockup-crema.png"
      via: "img src en SUSPENDED_HTML"
      pattern: "brand/forjo-gestion-lockup-crema"
---

<objective>
Reemplazar el logo de marca de las dos pantallas de auth (`/login` y `/register`) por el lockup real
"forjo | gestión" servido desde `public/brand/`, para que deje de tomar la paleta activa del negocio.

Purpose: hoy `/register` pinta el wordmark con `text-primary` y `/login` dibuja la marca F a mano con
`currentColor` + hexes sueltos, así que el logo cambia de color según el tenant. La marca tiene que ser
fija.
Output: dos pantallas de auth con el lockup oficial (variante correcta según fondo) y el asset
duplicado de `public/` eliminado sin romper la página de mantenimiento.
</objective>

<discrepancy_found>
## ⚠ El brief tiene un dato falso — leer antes de ejecutar

El brief afirma (punto 6): *"`/public/forjo-lockup.png` … **no lo referencia nadie** (huérfano,
verificado por grep). Borrarlo."*

**Es incorrecto.** El grep sobre todo el repo devuelve una referencia viva:

- `proxy.ts:15` → `SUSPENDED_HTML`, la página de mantenimiento autocontenida del kill switch, la sirve
  con `<img class="logo" src="/forjo-lockup.png" alt="Forjo Gestión">`.

Borrarlo a secas deja la página de mantenimiento con la imagen rota — y esa página es justamente la que
ven **todos** los usuarios cuando la app está suspendida.

**El plan resuelve el intent real del brief (deduplicar, que nadie use el asset equivocado) apuntando
`proxy.ts` al asset canónico de `public/brand/` ANTES de borrar el duplicado (Task 3).** El fondo de la
página de mantenimiento es oscuro (`--bg` casi negro), así que la variante crema es la correcta y el
render no cambia.

Si el usuario prefiere no tocar `proxy.ts`, la alternativa es **saltear Task 3 por completo** y dejar el
duplicado como está. Tasks 1 y 2 son independientes y no lo necesitan.
</discrepancy_found>

<context>
@app/(onboarding)/onboarding/page.tsx   # PATRÓN A ESPEJAR — líneas 416-417, source of truth
@app/(auth)/login/page.tsx
@app/(auth)/register/page.tsx
@proxy.ts
</context>

<constraints>
- Usar **Edit**, nunca Write, sobre los tres archivos existentes. Cambiar solo lo indicado.
- `next/image` con `width={781}` `height={190}` explícitos (dimensiones reales del asset → sin CLS) +
  `priority` (above-the-fold) + `alt="Forjo Gestión"`.
- Altura de render `h-10 w-auto`, igual que el onboarding.
- Sin componente nuevo: el patrón inline de dos `<Image>` ya es la convención del repo (2 usos).
- Sin dependencias nuevas. Sin hexes nuevos hardcodeados.
- NO tocar: el layout de auth, los forms, el `<svg>` de FONDO del panel de login (el `absolute inset-0`
  con las formas Bauhaus), ni el onboarding.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Lockup crema fijo en el panel izquierdo de /login</name>
  <files>app/(auth)/login/page.tsx</files>
  <action>
    Agregar `import Image from 'next/image'` junto a los imports de next ya presentes.

    En el bloque del logo (aprox. líneas 56-64), dentro del panel izquierdo: eliminar los DOS hijos
    actuales y reemplazarlos por un único `<Image>`.

    Los dos hijos que se van son:
    1. El `<svg>` de la marca F dibujada a mano (el de viewBox 64×80, con `rect`/`path`/`circle` que usan
       `currentColor`, un hex amarillo hardcodeado y varios `rgba(...)`). Este es el que hereda la paleta
       del tenant vía `currentColor` — es la causa raíz del bug.
    2. El `<span>` con el wordmark de texto "Forjo Studio".

    Los reemplaza:
    `<Image src="/brand/forjo-gestion-lockup-crema.png" alt="Forjo Gestión" width={781} height={190} priority className="h-10 w-auto" />`

    Variante **crema FIJA, sin swap dark/light**: el contenedor del panel es `bg-primary
    text-primary-foreground` (línea 49), o sea siempre un color saturado de marca — nunca hay fondo claro
    posible, así que `dark:hidden`/`dark:block` acá no aplica.

    El wrapper `<div className="relative flex items-center gap-3">` queda con un solo hijo: dejarlo como
    `<div className="relative">`. El `relative` es load-bearing (los hermanos lo usan para apilarse por
    encima del svg de fondo que es `absolute inset-0`) — mantenerlo. `flex items-center gap-3` ya no
    tienen función con un hijo único: sacarlos.

    NO tocar el `<svg>` de FONDO (el `absolute inset-0` con viewBox 500×700, círculo/rects/path Bauhaus,
    líneas ~50-55). Ese se queda tal cual.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && test "$(grep -c 'forjo-gestion-lockup-crema' 'app/(auth)/login/page.tsx')" = "1" && test "$(grep -c 'dark:hidden\|dark:block' 'app/(auth)/login/page.tsx')" = "0" && test "$(grep -c '0 0 64 80' 'app/(auth)/login/page.tsx')" = "0" && test "$(grep -c 'f4c543' 'app/(auth)/login/page.tsx')" = "0" && test "$(grep -c 'Forjo <span' 'app/(auth)/login/page.tsx')" = "0" && test "$(grep -c '0 0 500 700' 'app/(auth)/login/page.tsx')" = "1" && test "$(grep -c "from 'next/image'" 'app/(auth)/login/page.tsx')" = "1" && echo OK</automated>
  </verify>
  <done>
    El panel izquierdo de /login muestra el lockup crema vía next/image; la marca F dibujada a mano y el
    wordmark de texto ya no existen en el archivo; el svg de fondo Bauhaus (viewBox 500×700) sigue
    intacto; no quedan hexes hardcodeados en el archivo.
  </done>
</task>

<task type="auto">
  <name>Task 2: Lockup con swap dark/light en el h1 de /register</name>
  <files>app/(auth)/register/page.tsx</files>
  <action>
    Agregar `import Image from 'next/image'` junto a los imports de next ya presentes.

    Reemplazar el contenido del `<h1>` (línea ~64) — hoy es el wordmark de texto "Forjo Studio" pintado
    con clases de paleta (`text-3xl font-bold text-primary` + un `<span>` con `font-medium opacity-85`).
    El `text-primary` de ese h1 es exactamente lo que hace que el logo cambie de color por negocio.

    Espejar el patrón del onboarding (`app/(onboarding)/onboarding/page.tsx:416-417`) **dentro** del h1:

    ```
    <h1 className="flex items-center justify-center">
      <Image src="/brand/forjo-gestion-lockup-tinta.png" alt="Forjo Gestión" width={781} height={190} priority className="h-10 w-auto dark:hidden" />
      <Image src="/brand/forjo-gestion-lockup-crema.png" alt="Forjo Gestión" width={781} height={190} priority className="hidden h-10 w-auto dark:block" />
    </h1>
    ```

    Acá SÍ va el par tinta/crema con swap: el fondo de /register es temático (`bg-background`), o sea
    claro u oscuro según el tema. `-tinta` (logotipo en tinta/negro) → fondo claro. `-crema` → fondo
    oscuro.

    Accesibilidad: mantener el `<h1>` como elemento (no degradar a `<div>`) para no romper la jerarquía
    de headings de la página. El nombre accesible del h1 lo aporta el `alt` de la imagen visible; la
    variante oculta usa `display:none` (vía `hidden`/`dark:hidden`), así que sale del árbol de
    accesibilidad y no duplica el texto.

    NO tocar el `<p>` "Creá tu negocio en minutos" de abajo, ni la Card, ni el form, ni el link
    "Iniciar sesión" (ese usa `text-primary` legítimamente, como link — debe quedar).
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && test "$(grep -c 'forjo-gestion-lockup' 'app/(auth)/register/page.tsx')" = "2" && test "$(grep -c 'font-bold text-primary' 'app/(auth)/register/page.tsx')" = "0" && test "$(grep -c 'Forjo <span' 'app/(auth)/register/page.tsx')" = "0" && test "$(grep -c '<h1' 'app/(auth)/register/page.tsx')" = "1" && test "$(grep -c 'text-primary hover:underline' 'app/(auth)/register/page.tsx')" = "1" && test "$(grep -c "from 'next/image'" 'app/(auth)/register/page.tsx')" = "1" && echo OK</automated>
  </verify>
  <done>
    /register muestra el lockup tinta en tema claro y crema en tema oscuro; queda exactamente un `<h1>`
    en la página y ya no tiene clases de color de paleta; el link "Iniciar sesión" conserva su
    `text-primary`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Deduplicar el asset — repuntar proxy.ts y borrar el duplicado</name>
  <files>proxy.ts, public/forjo-lockup.png</files>
  <action>
    LEER PRIMERO el bloque `<discrepancy_found>` de este plan. El brief decía que este asset era huérfano;
    NO lo es.

    Paso 1 — en `proxy.ts`, dentro de la constante `SUSPENDED_HTML` (línea ~15), cambiar el `src` del
    `<img class="logo">` para que apunte al asset canónico de la carpeta de marca:
    `/brand/forjo-gestion-lockup-crema.png`. Dejar intactos `class`, `alt` y todo el resto del HTML/CSS
    de la página de mantenimiento.

    <!-- planner-discipline-allow: forjo-lockup.png -->
    El asset viejo referenciado ahí es `/forjo-lockup.png` — byte-idéntico al lockup crema de `brand/`
    (ambos 21362 bytes), así que el render de la página de mantenimiento no cambia. La variante crema es
    la correcta: el fondo de esa página es casi negro (`--bg` oscuro definido inline en su `<style>`).

    Paso 2 — recién DESPUÉS de repuntar `proxy.ts`, borrar el archivo duplicado
    `public/forjo-lockup.png` con `git rm`. Ese es el objetivo del brief: que nadie lo use por error.

    Paso 3 — confirmar que no queda ninguna otra referencia en el repo (código, no artefactos de
    `.planning/`).
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && test ! -f public/forjo-lockup.png && test "$(grep -c 'brand/forjo-gestion-lockup-crema.png' proxy.ts)" = "1" && test -z "$(grep -rl 'src="/forjo-lockup' --include='*.ts' --include='*.tsx' --include='*.css' . )" && echo OK</automated>
  </verify>
  <done>
    `public/forjo-lockup.png` no existe; `proxy.ts` sirve el logo de mantenimiento desde
    `public/brand/forjo-gestion-lockup-crema.png`; no queda ninguna referencia al asset borrado en el
    código fuente.
  </done>
</task>

</tasks>

<threat_model>
Cambio puramente presentacional: sólo swap de assets estáticos públicos y clases de Tailwind. No cruza
ningún trust boundary nuevo — no toca auth, ni queries, ni `business_id`, ni RLS, ni entrada de usuario,
ni dependencias.

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Denial of Service | Página de mantenimiento (`proxy.ts` kill switch) | mitigate | Task 3 repunta el `src` ANTES de borrar el asset; el verify falla si el asset canónico no queda referenciado. Evita dejar la página de suspensión con imagen rota. |
</threat_model>

<verification>
Correr desde la raíz del repo, después de las 3 tareas:

1. `npx tsc --noEmit` → verde (imports de `next/image` resueltos, sin JSX roto).
2. `npm run lint` → verde (Core Web Vitals: `next/image` en vez de `<img>` en las pantallas de auth).
3. `npm run dev` → chequeo visual:
   - `/login`: el lockup crema se lee bien sobre el panel `bg-primary`, alineado arriba a la izquierda;
     las formas Bauhaus de fondo siguen ahí.
   - `/register` en tema claro: lockup en tinta. Cambiar a tema oscuro → lockup en crema.
   - En ambas: cambiar la paleta del negocio NO cambia el color del lockup.
</verification>

<success_criteria>
- El logo de `/login` y `/register` es el lockup oficial "forjo | gestión" y es inmune a la paleta activa.
- `/register` hace el swap tinta↔crema con el tema; `/login` es crema fijo.
- La jerarquía de headings de `/register` sigue con un único h1 accesible.
- `tsc --noEmit` y `npm run lint` en verde.
- La página de mantenimiento del kill switch sigue mostrando su logo.
</success_criteria>

<output>
Commit atómico por tarea. Al terminar, escribir el SUMMARY en
`.planning/quick/260716-ide-logo-de-marca-con-variantes-dark-light-e/260716-ide-SUMMARY.md`
</output>
