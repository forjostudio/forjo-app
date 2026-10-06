# Fuera de alcance — encontrado midiendo el quick 261006-iey

## 1. El login puede mandar la contraseña EN LA URL si se toca "Entrar" antes de hidratar

**Cómo apareció:** midiendo la pila real con CDP contra el dev server, una de las entradas del
historial quedó así:

```
/login · /login?email=test%40forjo.local&password=Forjo1234%21 · /dashboard · [/agenda]
```

**Por qué pasa:** `app/(auth)/(split)/login/page.tsx:83` es `<form onSubmit={handleSubmit(onSubmit)}>`
**sin `action` ni `method`**. Antes de que React hidrate, el handler no existe todavía y el submit lo
hace el navegador: GET a la MISMA URL con los campos como query string. La contraseña queda en la
URL, en el historial del navegador y en los logs del servidor/edge.

**Probabilidad real:** baja (hace falta tocar "Entrar" en la ventana entre el primer pintado y la
hidratación), pero en un celular con conexión mala esa ventana existe. Impacto: credencial filtrada.

**Por qué no se tocó acá:** está fuera del alcance del quick (nada que ver con el historial del panel
ni con el calendario) y toca el camino de autenticación, que merece su propio cambio y su propia
verificación. Candidato a quick propio: `method="post"` + `action` de server action, o un
`onSubmit` que prevenga el default aunque no haya hidratado (botón `disabled` hasta hidratar).

## 2. La suite combinada (`npx vitest run`) falla por saturación del Supabase local, no por código

Con el dev server del dueño corriendo contra el mismo Supabase local, una corrida combinada dio
**7 archivos / 5 casos fallados y 59 skipped** (del carril `db`), mientras que los dos carriles
corridos por separado dan **70/70 + 34/34 verdes**. Es el modo de falla que `test/suite-split.ts` ya
documenta (pool de PostgREST saturado → teardown que falla en silencio → contaminación del test
siguiente), agravado por el dev server. No se intentó arreglar: es de la instancia, no del repo.
