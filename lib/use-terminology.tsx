'use client'

import { createContext, useContext } from 'react'
import { ResolvedVertical, VERTICALS, VerticalTerminology } from './verticals'

// Default to the `general` vertical so consumers outside a provider still work.
const DEFAULT: ResolvedVertical = { key: 'general', ...VERTICALS.general }

const VerticalContext = createContext<ResolvedVertical>(DEFAULT)

export function VerticalProvider({
  vertical,
  children,
}: {
  vertical: ResolvedVertical
  children: React.ReactNode
}) {
  return <VerticalContext.Provider value={vertical}>{children}</VerticalContext.Provider>
}

// Full resolved vertical (key, label, menu, features, terminology).
export function useVertical(): ResolvedVertical {
  return useContext(VerticalContext)
}

// Just the terminology map (client/clients/appointment/service…).
export function useTerminology(): VerticalTerminology {
  return useContext(VerticalContext).terminology
}
