
## Plan 01-03 — pre-existing eslint errors in settings-client.tsx (out of scope)

Discovered during Task 2 (adding the /ayuda link). `npx eslint app/(dashboard)/settings/settings-client.tsx`
reports 10 pre-existing React Compiler errors (react-hooks/set-state-in-effect, react-hooks/immutability,
react-hooks/purity) on lines 165, 179, 187, 188, 196, 205, 329, 444 — all present in the HEAD version
before this plan's edits (verified: HEAD copy = 10 errors, same count). NOT caused by the two lines added
in this plan (Link import + gated Ayuda link near L1730). Left untouched per SCOPE BOUNDARY.
