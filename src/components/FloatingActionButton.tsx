// src/components/FloatingActionButton.tsx
//
// FAB contextual — ação primária mobile adaptada à rota atual.
//
// COMPORTAMENTO:
//  - Visível apenas em mobile (hidden md:hidden via className)
//  - Lê o pathname atual e resolve a ação via FAB_REGISTRY
//  - Exibe ícone + label curto em pill (não apenas ícone)
//  - Desaparece em rotas sem ação primária (settings, perfil, conquistas)
//  - Posição: bottom-right, acima da área de gesto iOS (safe-area)
//
// DESIGN (Luminous):
//  - Glass leve com backdrop-filter — consistente com o design system
//  - Hover: apenas opacity e box-shadow — NUNCA transform scale
//  - Cor de fundo: var(--primary) com gradiente suave
//  - Sem framer-motion
//
// MOBILE ERGONOMIA:
//  - Altura mínima 52px — zona de toque segura
//  - Padding lateral generoso para label legível
//  - bottom: calc(1.5rem + env(safe-area-inset-bottom)) — respeita iOS notch

'use client'

import { usePathname } from 'next/navigation'
import { Plus } from '@phosphor-icons/react'
import { useActionHubStore } from '@/stores/useActionHubStore'
import { resolveFabConfig } from '@/lib/fabRegistry'

export default function FloatingActionButton() {
  const pathname = usePathname()
  const dispatch = useActionHubStore(s => s.dispatch)

  const config = resolveFabConfig(pathname)

  // Rota sem ação primária → FAB não é renderizado
  if (!config) return null

  const { actionKey, shortLabel, Icon } = config

  return (
    <button
      onClick={() => dispatch(actionKey)}
      aria-label={config.label}
      title={config.label}
      // md:hidden: FAB é exclusivamente mobile
      // O header desktop já tem o ActionHub com dropdown
      className="md:hidden fixed z-40 flex items-center gap-2 text-white font-semibold text-sm"
      style={{
        // Pill com label — mais contextual que ícone isolado
        bottom:       'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        right:        '1.25rem',
        height:       '52px',
        paddingLeft:  '1.125rem',
        paddingRight: '1.375rem',
        borderRadius: '26px',

        // Luminous: glass com gradiente primário
        background:         'linear-gradient(135deg, rgba(var(--primary-rgb, 124,58,237),0.95), rgba(var(--primary-rgb, 124,58,237),0.85))',
        backdropFilter:     'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border:             '1px solid rgba(var(--primary-rgb, 124,58,237),0.4)',

        // Sombra atmosférica — sem glow excessivo
        boxShadow: '0 4px 24px rgba(var(--primary-rgb, 124,58,237),0.35), 0 1px 4px rgba(0,0,0,0.12)',

        // Transição: apenas opacity e box-shadow (regra inviolável — sem transform)
        transition: 'opacity 150ms, box-shadow 150ms',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.opacity   = '0.92'
        e.currentTarget.style.boxShadow = '0 6px 32px rgba(var(--primary-rgb, 124,58,237),0.45), 0 1px 4px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.opacity   = '1'
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(var(--primary-rgb, 124,58,237),0.35), 0 1px 4px rgba(0,0,0,0.12)'
      }}
    >
      {/* Ícone contextual — não mais Plus genérico */}
      <Icon size={18} weight="duotone" />

      {/* Label curto — identifica o contexto claramente */}
      <span style={{ letterSpacing: '-0.01em' }}>{shortLabel}</span>

      {/* Plus decorativo à direita — indica "adicionar" sem ambiguidade */}
      <Plus
        size={14}
        weight="bold"
        style={{ opacity: 0.75, marginLeft: '0.125rem' }}
      />
    </button>
  )
}
