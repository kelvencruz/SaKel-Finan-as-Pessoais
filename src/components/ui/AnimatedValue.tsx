'use client'

import { type CSSProperties } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import { usePrivacyStore } from '@/stores/usePrivacyStore'

// ─── Tipos ────────────────────────────────────────────────────────────────────

// Alinhado com PrivateValue.tsx — 'investments' (com s)
type Group = 'financial' | 'investments'

interface AnimatedValueProps {
  /** Valor numérico a animar (em reais, não centavos) */
  value: number
  /** Se true, inicia a animação (conectar ao !loading da página) */
  trigger?: boolean
  /** Grupo de privacidade: 'financial' | 'investments' (default: 'financial') */
  group?: Group
  /** Duração da animação em ms (default: 2000) */
  duration?: number
  /** Atraso em ms antes de iniciar (default: 0) */
  delay?: number
  /** Classes CSS adicionais no span externo */
  className?: string
  /** Estilos inline no span externo (ex: cor via kpi.color) */
  style?: CSSProperties
  /** Se true, valores negativos ficam em vermelho (default: true) */
  colorize?: boolean
}

// ─── Helpers de formatação ────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
})

function fmt(value: number): string {
  return BRL.format(value)
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Drop-in replacement para `fmt(valor)`.
 * Anima o número de 0 até `value` usando easeOutCubic.
 * Usa usePrivacyStore (Zustand) — mesma fonte de verdade que PrivateValue.tsx.
 *
 * @example
 * <AnimatedValue value={saldoContas} trigger={!loading} />
 * <AnimatedValue value={patrimonio} group="investments" trigger={!loading} />
 * <AnimatedValue value={saldo} trigger={!loading} delay={200} />
 */
export function AnimatedValue({
  value,
  trigger = true,
  group = 'financial',
  duration = 2000,
  delay = 0,
  className = '',
  style,
  colorize = true,
}: AnimatedValueProps) {
  // Mesmo store e mesma lógica do PrivateValue.tsx
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
    colorize && value < 0
      ? 'text-danger'
      : colorize && value > 0
      ? 'text-success'
      : ''

  return (
    <span
      className={`text-glow-value tabular-nums ${colorClass} ${className}`.trim()}
      style={style}
      aria-live="polite"
      aria-atomic="true"
    >
      {fmt(animated)}
    </span>
  )
}
