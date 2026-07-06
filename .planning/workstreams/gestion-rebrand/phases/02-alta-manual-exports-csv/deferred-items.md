# Deferred Items — Phase 02 (alta-manual-exports-csv)

## Pre-existing lint baseline en clients-client.tsx (out of scope 02-02)

Detectados al correr `npx eslint app/(dashboard)/clients/clients-client.tsx` durante 02-02.
Ambos son PRE-EXISTENTES (confirmado con `git stash`): no los introdujo esta fase.

- **`react-hooks/set-state-in-effect` (error)** — L347, `useEffect` que sincroniza el cliente
  seleccionado (`setNotes/setEditMode/setEditForm` dentro del effect). Es un patrón viejo del
  archivo, no tocado por 02-02. Refactor pendiente (mover a event handler / derivar estado).
- **`@typescript-eslint/no-unused-vars` (warning)** — `TrendingUp` importado y sin usar. Import
  huérfano pre-existente.

No se corrigen en 02-02 (scope boundary: solo se arregla lo que introduce el task). Candidatos a
un cleanup transversal del archivo.
