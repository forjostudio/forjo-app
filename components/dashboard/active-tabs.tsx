'use client'

// components/dashboard/active-tabs.tsx — píldoras "Activos / Desactivados" del dashboard (D-13).
//
// POR QUÉ EXISTE: es la TERCERA aparición del mismo molde en el repo (el listado de /ajustes, el de
// /abonos y ahora el manager del vertical de canchas). Copiarlo una vez más garantizaba que las tres
// versiones divergieran en clases, contadores y estado vacío; extraerlo lo vuelve una sola cosa y
// hace que las pantallas se lean como un solo sistema (D-14).
//
// QUÉ HACE: el estado del tab, el filtro, los contadores, las dos píldoras y el panel de estado
// vacío por tab. Las clases son copia LITERAL del molde ya shipeado y validado en UAT — este archivo
// no rediseña nada, solo mueve de lugar.
//
// QUÉ NO HACE: no sabe qué está filtrando. Es genérico sobre `T`, no importa tipos de dominio ni
// clientes de datos, y no decide el copy del estado vacío (lo recibe). El predicado de "activo" se
// queda SIEMPRE en el call-site.
//
// QUIÉN QUEDA AFUERA A PROPÓSITO: /abonos. Sus tabs son `activos`/`archivados` (semántica distinta:
// "archivado" incluye series terminadas sin turnos futuros, no un booleano de la fila) y su predicado
// depende de un conteo, no de una columna. Meterlo acá volvería este tipo genérico de más. Si alguna
// vez se unifica, es una decisión propia, no un efecto colateral de este archivo.

import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ActiveTab = 'activos' | 'desactivados'

// Las etiquetas NO son configurables a propósito (D-14): las dos pantallas que consumen este módulo
// tienen que decir exactamente lo mismo. Lo que sí varía por pantalla es el estado vacío (icono +
// copy), porque ahí sí se nombra la entidad.
const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'activos', label: 'Activos' },
  { key: 'desactivados', label: 'Desactivados' },
]

export interface ActiveTabsState<T> {
  tab: ActiveTab
  setTab: (tab: ActiveTab) => void
  /** La lista filtrada según el tab abierto. */
  visible: T[]
  /** Cuántos elementos hay en cada tab (los dos suman `items.length`). */
  counts: Record<ActiveTab, number>
}

/**
 * Estado + filtro + contadores de las píldoras. Arranca siempre en el tab de activos.
 *
 * El filtro y los contadores llaman al MISMO predicado a propósito (invariante heredado del molde
 * original): si cada uno decidiera por su cuenta, el tab podría decir "Activos (1)" sobre una lista
 * vacía. Por eso el predicado entra una sola vez, acá, y no se recalcula en el JSX.
 *
 * `isActive` se memoiza como dependencia: convine declararlo a nivel de módulo en el call-site
 * (identidad estable) para que los `useMemo` no se invaliden en cada render.
 */
export function useActiveTabs<T>(items: T[], isActive: (item: T) => boolean): ActiveTabsState<T> {
  const [tab, setTab] = useState<ActiveTab>('activos')

  const counts = useMemo(() => {
    const activos = items.filter(item => isActive(item)).length
    return { activos, desactivados: items.length - activos }
  }, [items, isActive])

  const visible = useMemo(
    () => items.filter(item => isActive(item) === (tab === 'activos')),
    [items, tab, isActive],
  )

  return { tab, setTab, visible, counts }
}

/** Las dos píldoras con su contador. Clases copia literal del molde original. */
export function ActiveTabs({
  tab,
  onChange,
  counts,
}: {
  tab: ActiveTab
  onChange: (tab: ActiveTab) => void
  counts: Record<ActiveTab, number>
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {TABS.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-pressed={tab === t.key}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
            tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label} ({counts[t.key]})
        </button>
      ))}
    </div>
  )
}

/** Copy del panel de estado vacío: título + línea de ayuda. Uno por tab. */
export interface ActiveTabsEmptyCopy {
  title: string
  help: string
}

/**
 * Panel de borde punteado para cuando el tab abierto no tiene ni un elemento. Existe para que un tab
 * vacío no quede en blanco: el dueño tiene que entender qué va a ver ahí, no dudar de si se rompió.
 * El icono y los dos pares de copy los pone el call-site — son lo único que cambia por pantalla.
 */
export function ActiveTabsEmptyState({
  tab,
  icon: Icon,
  activos,
  desactivados,
}: {
  tab: ActiveTab
  icon: LucideIcon
  activos: ActiveTabsEmptyCopy
  desactivados: ActiveTabsEmptyCopy
}) {
  const copy = tab === 'desactivados' ? desactivados : activos
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
      <Icon className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">{copy.title}</p>
      <p className="text-xs text-muted-foreground">{copy.help}</p>
    </div>
  )
}
