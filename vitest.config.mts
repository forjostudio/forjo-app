import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import react from '@vitejs/plugin-react'

// Config base del runner (D-01).
// - tsconfigPaths(): resuelve el alias @/* de tsconfig.json en los tests. Sin esto, todo
//   import desde '@/lib/...' o '@/app/...' falla (no hay otra fuente de verdad del alias).
// - react(): opcional acá — esta suite no renderiza JSX y el environment es 'node', pero es
//   inofensivo y alinea con el setup oficial de Next 16 + Vitest. Se pinea @^5 (no @^6: su peer
//   vite:^8 exclusivo choca con el Vite que bundlea Vitest 4 — ver RESEARCH §Alternatives).
// - environment 'node': no se testea UI (D-01).
// - setupFiles: carga .env.local antes de cualquier test (Vitest no lo auto-carga, Pitfall 4).
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
})
