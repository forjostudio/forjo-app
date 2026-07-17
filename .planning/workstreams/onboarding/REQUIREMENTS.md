# Requirements: Forjo App — Onboarding (workstream `onboarding`)

## Milestone: v0.20 "Onboarding pulido"

**Objetivo:** un onboarding más robusto y simple para negocios nuevos, y que las pantallas de auth siempre se vean Forjo (nunca la paleta del tenant).

**Contexto:** v0.19 "Cuenta y acceso" cerró el auth (reset + Google + mails branded). Sus UAT destaparon dos bugs de onboarding que se difirieron acá, más pulido de UX que veníamos anotando.

## v1 Requirements

### Robustez / bugs

- [ ] **ONB-01** (slug-collision): El chequeo de disponibilidad del nombre/slug del negocio ve **todos** los slugs, no solo los del propio owner. Hoy corre bajo RLS (`businesses` solo tiene policy `owner access`), así que no ve los slugs de otros tenants → dice "disponible" y recién falla en el insert con "Error al crear el negocio" (constraint `businesses_slug_key`). Fix: chequeo que vea el espacio global (RPC `security definer` / endpoint público, patrón del booking público) → feedback temprano al escribir el nombre + un mensaje claro si está tomado, nunca el error opaco al final del wizard. Ref: [[onboarding-slug-collision-rls]].

- [ ] **ONB-02** (callejón sin salida): Un usuario autenticado **sin negocio** puede salir del onboarding / cambiar de cuenta (cerrar sesión) sin quedar obligado a crear el negocio. Surgió en el UAT de Phase 5: entrar con la cuenta de Google equivocada te dejaba atrapado. Debe haber una salida clara (cerrar sesión / volver al login).

### UX del onboarding

- [ ] **ONB-03** (logo): El dueño puede **subir el logo del negocio en el primer paso** del onboarding. Reusar el bucket de storage y el patrón de upload de imágenes que ya existe (web-builder / landing-assets).

- [ ] **ONB-04** (sacar paleta): Se **quita el selector de paleta de colores del wizard** de onboarding (simplificar). La paleta sigue configurable en **Ajustes** y el negocio nuevo arranca con el default — NO se elimina la feature, solo se saca del onboarding inicial.

### Theming de auth

- [ ] **ONB-05** (auth-theme Forjo): Las pantallas de **login, register, forgot-password y reset-password** usan **siempre el tema Forjo** (respetando claro/oscuro según la preferencia del usuario), **nunca la paleta del tenant**. Al cerrar sesión, la paleta/tema del dashboard del negocio no se traslada a esas pantallas. Racional: las pantallas de auth son chrome del producto Forjo, no del negocio — la paleta del tenant aplica solo a su dashboard y a su página pública `/[slug]`.

## Out of Scope (v0.20)

- Rediseño del wizard más allá de los 2 cambios (logo, sacar paleta) — el flujo y los pasos quedan como están.
- Eliminar la paleta como feature (queda en Ajustes).
- Otros proveedores de auth / MFA / magic link (diferidos en v0.19).

## Traceability

| Req | Fase | Estado |
|-----|------|--------|
| ONB-01 | Phase 7 | Pending |
| ONB-02 | Phase 7 | Pending |
| ONB-03 | Phase 7 | Pending |
| ONB-04 | Phase 7 | Pending |
| ONB-05 | Phase 8 | Pending |
