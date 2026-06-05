---
name: supabase-multitenant-rls
description: >
  Usar SIEMPRE que se cree o modifique una tabla, una query, una policy de RLS, un route
  handler o una server action que toque datos de un negocio en Forjo Gestión. El objetivo
  es garantizar el aislamiento por tenant: un negocio NUNCA debe poder ver ni modificar
  datos de otro. Triggers: "tabla nueva", "migración", "RLS", "policy", "Supabase",
  "query", "business_id", "multi-tenant", "aislamiento", "página pública", "booking
  público", "anon key", "service role". Trabaja en conjunto con convenciones-forjo.
---

# Supabase — multi-tenancy y RLS en Forjo Gestión

Forjo Gestión es multi-tenant: cada negocio (`businesses`) tiene sus turnos, clientes,
finanzas, etc. El riesgo más caro del proyecto es una **fuga entre tenants** (que un
negocio acceda a datos de otro). En el vertical salud esto incluye historia clínica y
obra social, o sea datos sensibles de salud. Tratar el aislamiento como requisito de
seguridad, no como detalle.

## Principio: defensa en profundidad

No confiar en una sola capa. Siempre las dos:

1. **RLS en la base** como red de seguridad de último recurso.
2. **Filtro explícito por `business_id`** en las queries de la app.

Si una falla, la otra contiene el daño. Nunca asumir "ya hay RLS, no hace falta filtrar"
ni al revés.

## Reglas duras

### 1. Toda tabla con datos de tenant lleva RLS habilitada

El error clásico y más peligroso: crear una tabla nueva y olvidarse de habilitar RLS.
Sin RLS habilitada, las policies no aplican y la tabla queda accesible. **Al crear
cualquier tabla con un `business_id` (o equivalente), en la misma migración:**

```sql
alter table public.<tabla> enable row level security;
```

Y acto seguido definir las policies. Una tabla con `business_id` y sin RLS habilitada
es un bug de seguridad, aunque "funcione".

### 2. Las policies se escriben contra el vínculo usuario → negocio

El usuario logueado (`auth.uid()`) solo puede tocar filas de los negocios que administra.
Escribir las policies contra ese vínculo (campo `owner_id` en `businesses`, tabla de
memberships, o como esté modelado en este repo — verificar antes). Envolver `auth.uid()`
en un subselect para que Postgres lo evalúe una sola vez por query (performance):

```sql
create policy "tenant aísla select" on public.turnos
  for select using (
    business_id in (
      select id from public.businesses where owner_id = (select auth.uid())
    )
  );
```

### 3. Una policy por operación, con la cláusula correcta

No alcanza con una policy de SELECT. Cubrir cada operación que la app use:

- `select` → `using`
- `insert` → `with check`
- `update` → `using` (qué filas puede tocar) **y** `with check` (que no las reasigne a
  otro tenant)
- `delete` → `using`

El olvido típico es el `with check` en INSERT/UPDATE: sin él, alguien podría insertar o
mover una fila a un `business_id` ajeno.

### 4. La página pública de booking (`/[slug]`) es un caso aparte

La página pública necesita lectura ANÓNIMA de datos acotados (nombre del negocio,
servicios, disponibilidad) pero NUNCA de datos sensibles (clientes, finanzas, historia
clínica). No abrir la tabla entera a `anon`:

- Exponer solo lo público, idealmente vía una vista o columnas específicas, con policy de
  lectura para el rol `anon` limitada a eso.
- La **creación de un turno desde la página pública** la hace un cliente final NO
  autenticado como dueño: manejarla por un **route handler / server action server-side**
  con validaciones (slug válido, horario disponible, reCAPTCHA), no dándole al cliente
  final permisos de escritura directos por RLS.

### 5. `service_role` solo en el servidor, jamás en el cliente

- La **anon key respeta RLS** → es la que puede llegar al browser.
- La **service role key bypasea RLS por completo** → solo en código server-side (route
  handlers, server actions, webhooks). Nunca exponerla al cliente, ni en `NEXT_PUBLIC_*`,
  ni en un componente client.
- Cuando se usa service role en el server (ej. el webhook de MercadoPago), RLS no protege:
  ahí el filtro por `business_id` / `external_reference` en la query es obligatorio.

## Checklist antes de cerrar un cambio de datos

- [ ] ¿La tabla nueva tiene `business_id` (o equivalente) y `enable row level security`?
- [ ] ¿Hay policy para cada operación que usa la app (select/insert/update/delete)?
- [ ] ¿Los INSERT/UPDATE tienen `with check` que impide asignar a otro tenant?
- [ ] ¿La query de la app filtra explícitamente por `business_id` además de confiar en RLS?
- [ ] ¿Algún dato sensible (historia clínica, finanzas) quedó expuesto a `anon` por la
      página pública?
- [ ] ¿La service role key está SOLO en server-side?
- [ ] ¿Se probó la policy con un usuario de otro negocio para confirmar que NO ve nada?
