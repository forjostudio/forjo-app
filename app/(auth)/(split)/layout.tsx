import Image from 'next/image'

// Layout del route group anidado (split): el panel Bauhaus + la columna del form que comparten
// /login, /forgot-password y /reset-password (D-07). El markup se EXTRAJO de login/page.tsx:48-86,
// no se reescribió: el recorrido login → olvidé → contraseña nueva → login tiene que sentirse una
// sola cosa, y el panel vive una sola vez en vez de duplicarse en 3 archivos.
//
// Por qué el grupo es ANIDADO y no un app/(auth)/layout.tsx: ese envolvería a TODOS los hijos de
// (auth) y arrastraría /register al split, violando D-10 (el rediseño visual de login/register está
// fuera de scope). Los route groups no aportan segmento de URL → /login sigue siendo /login.
//
// Es Server Component (sin 'use client'): no tiene interactividad, solo Image. Las páginas hijas
// siguen siendo 'use client'.
export default function SplitAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-stretch bg-background text-foreground">
      {/* Panel izquierdo Bauhaus — bg-primary + formas geométricas (oculto en mobile) */}
      <div className="hidden md:flex flex-1 relative overflow-hidden bg-primary text-primary-foreground p-12 flex-col justify-between">
        <svg className="absolute inset-0 w-full h-full opacity-90" viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="420" cy="120" r="90" fill="rgba(255,255,255,.10)" />
          <rect x="60" y="430" width="120" height="120" fill="rgba(0,0,0,.12)" />
          <path d="M360 480 L470 480 L470 590 Z" fill="rgba(255,255,255,.08)" />
          <rect x="300" y="300" width="50" height="50" fill="rgba(255,255,255,.12)" />
        </svg>
        {/* Variante crema FULL y FIJA, sin swap dark/light: el panel es siempre bg-primary (naranja
            saturado de marca), así que nunca hay fondo claro posible. Va la "full" y no la crema
            bicolor (la de register): en esa, "gestión" es gris/topo — pensado para fondo neutro
            oscuro — y sobre el naranja se pierde. La full lleva "forjo" Y "gestión" en crema. */}
        <div className="relative">
          <Image src="/brand/forjo-gestion-lockup-crema-full.png" alt="Forjo Gestión" width={781} height={190} priority className="h-10 w-auto" />
        </div>
        {/* El headline queda hard-coded acá y NO lo aporta cada página (D-08): el panel es identidad
            de marca, no copy contextual → las 3 pantallas del split dicen lo mismo y se define una
            sola vez. */}
        <h2 className="relative font-[family-name:var(--font-heading)] font-black uppercase leading-none tracking-tight text-[clamp(30px,4vw,46px)]">
          Tu agenda,<br />clientes y<br />finanzas en<br />un solo lugar.
        </h2>
        {/* Crédito "hecho con Forjo Studio" — mismo copy/link que el footer de la página de reservas
            (app/[slug]/booking-client.tsx). El estilo NO se copia: aquel vive sobre fondo neutro y usa
            text-muted-foreground/foreground; acá el panel es bg-primary, así que va opacidad sobre
            primary-foreground. Sin la marca F del original: su rect rojo se pierde sobre el naranja. */}
        <p className="relative text-sm opacity-80">
          hecho con{' '}
          <a
            href="https://www.forjo.studio"
            target="_blank"
            rel="noopener noreferrer"
            className="font-[family-name:var(--font-archivo)] opacity-100 hover:opacity-80 transition-opacity"
          >
            <span className="font-semibold">Forjo</span> Studio
          </a>
        </p>
      </div>

      {/* Columna derecha — formulario (lo aporta cada página hija) */}
      <div className="w-full md:w-[440px] flex items-center justify-center p-8 sm:p-10">
        <div className="w-full max-w-[340px]">
          {children}
        </div>
      </div>
    </div>
  )
}
