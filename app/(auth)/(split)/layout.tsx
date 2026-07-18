// Layout del route group anidado (split): el hero de marca + la columna del form que comparten
// /login, /forgot-password y /reset-password (D-07). Vive una sola vez en vez de duplicarse en 3
// archivos, y el recorrido login → olvidé → contraseña nueva → login se siente una sola cosa.
//
// Por qué el grupo es ANIDADO y no un app/(auth)/layout.tsx: ese envolvería a TODOS los hijos de
// (auth) y arrastraría /register al split, violando D-10. Los route groups no aportan segmento de URL
// → /login sigue siendo /login.
//
// DISEÑO FIJO (dark hero + form crema): el panel izquierdo es dark con colores hardcodeados de marca;
// el derecho es el tema crema FIJADO con .auth-cream-panel (globals.css) aunque el usuario esté en
// dark. No sigue claro/oscuro; el reset de tenant de ONB-05 se mantiene (todo es color Forjo, no
// hereda paleta de negocio). En mobile el panel izquierdo se oculta: /login lo cubre con
// <MobileLoginHero /> (hero + bottom sheet); forgot/reset muestran el form crema a pantalla completa.
//
// Es Server Component (sin 'use client'): no tiene interactividad. Las páginas hijas siguen 'use client'.
export default function SplitAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-stretch bg-[#141110]">
      {/* Panel izquierdo — hero dark con formas rojas (oculto en mobile). */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-[#141110] p-12 text-[#f3ead8] min-[760px]:flex">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="1160" cy="40" r="180" fill="#d94a2b" fillOpacity=".14" />
          <rect x="860" y="300" width="150" height="150" fill="#d94a2b" fillOpacity=".10" />
          <rect x="360" y="180" width="64" height="64" fill="rgba(243,234,216,.08)" />
          <path d="M170 690 L350 690 L350 870 Z" fill="#d94a2b" fillOpacity=".10" />
          <circle cx="110" cy="420" r="42" fill="rgba(243,234,216,.06)" />
          <rect x="1060" y="640" width="200" height="200" fill="#d94a2b" fillOpacity=".08" />
        </svg>

        {/* Marca — ícono F + wordmark */}
        <div className="relative flex items-center gap-3">
          <svg width="38" height="48" viewBox="0 0 64 80" aria-hidden="true">
            <rect x="6" y="6" width="14" height="68" fill="#f3ead8" />
            <rect x="20" y="6" width="38" height="14" fill="#d94a2b" />
            <path d="M 20 34 L 50 34 L 36 48 L 20 48 Z" fill="#7aa6d6" />
            <path d="M 6 6 L 58 6 L 58 8 A 5 5 0 0 1 58 18 L 58 20 L 20 20 L 20 34 L 50 34 L 36 48 L 20 48 L 20 74 L 6 74 Z" fill="none" stroke="#1a1714" strokeWidth="0.5" strokeLinejoin="miter" />
            <circle cx="58" cy="13" r="5" fill="#f4c543" />
          </svg>
          <span className="font-[family-name:var(--font-archivo)] text-[22px] font-bold tracking-[-.02em]">
            forjo <span className="font-normal opacity-70">| gestión</span>
          </span>
        </div>

        {/* Headline con acento rojo en "un solo lugar." (D-08: mismo copy en las 3 pantallas). */}
        <h1 className="relative max-w-[12ch] font-[family-name:var(--font-archivo)] text-[clamp(40px,4.5vw,64px)] font-black uppercase leading-[1.02] tracking-[-.03em]">
          Tu agenda, clientes y finanzas en <span className="text-[#d94a2b]">un solo lugar.</span>
        </h1>

        {/* Crédito "hecho con Forjo Studio" — mismo copy/link que el footer de la página de reservas. */}
        <p className="relative text-[13px] text-[#a39989]">
          hecho con{' '}
          <a
            href="https://www.forjo.studio"
            target="_blank"
            rel="noopener noreferrer"
            className="font-[family-name:var(--font-archivo)] transition-opacity hover:opacity-80"
          >
            <span className="font-bold text-[#f3ead8]">Forjo</span> Studio
          </a>
        </p>
      </div>

      {/* Panel derecho — form crema (skin fijo .auth-cream-panel; lo aporta cada página hija). */}
      <div className="auth-cream-panel flex w-full items-center justify-center p-10 min-[760px]:w-[440px]">
        <div className="w-full max-w-[330px]">
          {children}
        </div>
      </div>
    </div>
  )
}
