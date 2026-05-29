'use client'

import { type CSSProperties } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import { usePrivacyStore } from '@/stores/usePrivacyStore'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Group  = 'financial' | 'investments'
type Format = 'currency' | 'percent' | 'number'

interface AnimatedValueProps {
  value:      number
  trigger?:   boolean
  group?:     Group
  format?:    Format   // ← novo (default: 'currency')
  duration?:  number
  delay?:     number
  className?: string
  style?:     CSSProperties
  colorize?:  boolean
}

// ─── Helpers de formatação ────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', {
  style:                 'currency',
  currency:              'BRL',
  minimumFractionDigits: 2,
})

const NUM = new Intl.NumberFormat('pt-BR')

function fmt(value: number, format: Format = 'currency'): string {
  if (format === 'percent') return `${value.toFixed(1)}%`
  if (format === 'number')  return NUM.format(value)
  return BRL.format(value)
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function AnimatedValue({
  value,
  trigger   = true,
  group     = 'financial',
  format    = 'currency',
  duration  = 2000,
  delay     = 0,
  className = '',
  style,
  colorize  = true,
}: AnimatedValueProps) {
  const financialVisible   = usePrivacyStore(s => s.financialVisible)
  const investmentsVisible = usePrivacyStore(s => s.investmentsVisible)
  const visible = group === 'financial' ? financialVisible : investmentsVisible

  const animated = useCountUp({ target: value, duration, delay, trigger })

  if (!visible) {
    return (
      <span
        className={`text-glow-value ${className}`}
        style={style}
        aria-label="Valor oculto"
        data-private="true"
      >
        R$&nbsp;••••••
      </span>
    )
  }

  const colorClass =
    colorize && value < 0 ? 'text-danger'
    : colorize && value > 0 ? 'text-success'
    : ''

  return (
    <span
      className={`text-glow-value tabular-nums ${colorClass} ${className}`.trim()}
      style={style}
      aria-live="polite"
      aria-atomic="true"
    >
      {fmt(animated, format)}
    </span>
  )
}