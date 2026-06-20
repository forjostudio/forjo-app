import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Primitivas editoriales compartidas del landing premium (F8.1) ──────────────────
// Vocabulario visual del mock (D81-08): eyebrows mono con punto de acento, números
// fantasma de sección, scaffold editorial, CTAs pill con flecha y campo de color con
// grano/anillos para los heros/cierres SIN foto (D81-05: nunca un bloque plano).
//
// Por qué RSC sin 'use client': son render PURO de presentación, sin estado ni
// interactividad propia. Los CTAs son anclas nativas (#reservar) que funcionan sin JS
// (D7-11). Cero hex hardcodeado: todo color sale de los tokens (.frj-* / shadcn vía
// las clases definidas en la capa .frj-site de app/globals.css). Sin
// dangerouslySetInnerHTML. Las 7 secciones (Wave 2) componen estas primitivas.

// ── Icono flecha (inline, sin dependencia) ───────────────────────────────────────
// SVG nativo como JSX (no dangerouslySetInnerHTML). currentColor → hereda el color del
// contenedor, así respeta el token de cada variante del PillButton.
function ArrowRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      width="1em"
      height="1em"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Kicker ───────────────────────────────────────────────────────────────────────
// Eyebrow mono + uppercase + letterspaced con un punto de acento color --primary
// delante (el "PSICOLOGÍA CLÍNICA · ..." del hero). Usa la fuente mono del Task 1.
export function Kicker({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn('frj-kicker', className)}>
      {/* punto de acento decorativo (el color real lo pinta la clase via --primary) */}
      <span className="frj-kicker-dot" aria-hidden="true" />
      {children}
    </span>
  )
}

// ── GhostIndex ─────────────────────────────────────────────────────────────────────
// Número fantasma (01/02/03...) display, gigante, opacity ~0.05, posicionado para
// decorar la esquina de una sección. Decorativo → aria-hidden.
export function GhostIndex({
  n,
  className,
}: {
  n: number | string
  className?: string
}) {
  // Padding a 2 dígitos para el look editorial (1 → "01").
  const label = typeof n === 'number' ? String(n).padStart(2, '0') : n
  return (
    <span className={cn('frj-bigindex', className)} aria-hidden="true">
      {label}
    </span>
  )
}

// ── SectionShell ─────────────────────────────────────────────────────────────────
// Scaffold editorial de sección: padding fluido + head con kicker (eyebrow) + display
// h2 + GhostIndex opcional. NO renderiza <h1> (eso es exclusivo del Hero, D7-02/D7-09):
// el title de SectionShell es SIEMPRE <h2>.
export function SectionShell({
  index,
  eyebrow,
  title,
  children,
  className,
}: {
  index?: number | string
  eyebrow?: ReactNode
  title: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('frj-sec', className)}>
      {index != null && <GhostIndex n={index} />}
      <div className="frj-sec-head">
        {eyebrow != null && <Kicker>{eyebrow}</Kicker>}
        <h2 className="frj-display">{title}</h2>
      </div>
      {children}
    </section>
  )
}

// ── PillButton ───────────────────────────────────────────────────────────────────
// CTA pill con flecha en un círculo (el patrón .frj-btn + .circ del mock). Renderiza
// un <a> nativo → funciona sin JS (anclas #reservar o externos con rel=noopener).
// min-h-11 (>=44px touch) y focus-visible:ring vienen de la clase .frj-btn + utilidades
// (WCAG AA). Variantes: primary (bg-primary), ghost (outline), on-photo (claro sobre foto).
export function PillButton({
  href,
  children,
  variant = 'primary',
  external = false,
  className,
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'ghost' | 'on-photo' | 'ghost-photo'
  external?: boolean
  className?: string
}) {
  const variantClass =
    variant === 'ghost'
      ? 'frj-btn-ghost'
      : variant === 'on-photo'
        ? 'frj-btn-on-photo'
        : variant === 'ghost-photo'
          ? 'frj-btn-ghost-photo'
          : ''
  // Externos: target nueva pestaña + rel seguro (noopener evita window.opener hijack).
  const externalProps = external
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {}
  return (
    <a
      href={href}
      className={cn(
        'frj-btn',
        variantClass,
        // focus visible (WCAG AA) vía utilidades del proyecto, sin hex
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...externalProps}
    >
      {children}
      <span className="frj-btn-circ" aria-hidden="true">
        <ArrowRight />
      </span>
    </a>
  )
}

// ── NoiseField ───────────────────────────────────────────────────────────────────
// Capa decorativa para hero-sin-foto y cta: campo de color radial
// (var(--primary) → --frj-primary-deep), anillos constructivistas (1px border, baja
// opacidad) y grano (var(--frj-noise)). aria-hidden + pointer-events:none. NUNCA un
// bloque plano (D81-05). El grano no se anima → reduced-motion no aplica acá.
//
// `rings` permite posicionar los anillos por sección (el hero y el cta los ubican
// distinto en el mock). Cada anillo se dimensiona con padding-bottom para mantener el
// aspect-ratio 1:1 sin depender de unidades de viewport.
export function NoiseField({
  tone = 'primary',
  rings = DEFAULT_RINGS,
  className,
}: {
  tone?: 'primary' | 'hair'
  rings?: RingSpec[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'frj-noisefield',
        tone === 'hair' && 'frj-noisefield-hair',
        className,
      )}
      aria-hidden="true"
    >
      <div className="frj-noisefield-field" />
      <div className="frj-noisefield-rings">
        {rings.map((r, i) => (
          <span
            key={i}
            className="frj-noisefield-ring"
            style={{
              width: r.size,
              height: 0,
              paddingBottom: r.size,
              right: r.right,
              left: r.left,
              top: r.top,
              bottom: r.bottom,
            }}
          />
        ))}
      </div>
      <div className="frj-noisefield-grain" />
    </div>
  )
}

// Spec serializable de un anillo (todas las medidas son strings CSS para SSR).
export type RingSpec = {
  size: string
  right?: string
  left?: string
  top?: string
  bottom?: string
}

// Disposición por defecto (anillos del hero-sin-foto del mock: esquina inferior derecha).
const DEFAULT_RINGS: RingSpec[] = [
  { size: '60%', right: '-12%', bottom: '-18%' },
  { size: '90%', right: '-26%', bottom: '-34%' },
  { size: '128%', right: '-44%', bottom: '-54%' },
]
