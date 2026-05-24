'use client'

import { useCountUp } from '@/hooks/useCountUp'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Group = 'financial' | 'investment'

interface AnimatedValueProps {
  /** Valor numérico a animar (em reais, não centavos) */
  value: number
  /** Se true, inicia a animação (conectar ao !loading da página) */
  trigger?: boolean
  /** Grupo de privacidade: 'financial' | 'investment' (default: 'financial') */
  group?: Group
  /** Duração da animação em ms (default: 2000) */
  duration?: number
  /** Atraso em ms antes de iniciar (default: 0) */
  delay?: number
  /** Classes CSS adicionais no span externo */
  className?: string
  /** Se true, valores negativos ficam em vermelho (default: true) */
  colorize?: boolean
}

// ─── Helpers de formatação ────────────────────────────────────────────────────

/** Formata número como BRL sem precisar de Intl cada render */
const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
})

function fmt(value: number): string {
  return BRL.format(value)
}

// ─── Hook de privacidade ──────────────────────────────────────────────────────
// Lê o estado de privacidade do grupo via atributo data- no <html>.
// Isso evita acoplamento com qualquer store específico e funciona com SSR.
// O store de privacidade (Zustand) deve manter data-private-financial e
// data-private-investment no elemento <html>.

function useIsPrivate(group: Group): boolean {
  if (typeof document === 'undefined') return false
  const attr = group === 'investment'
    ? 'data-private-investment'
    : 'data-private-financial'
  return document.documentElement.hasAttribute(attr)
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Drop-in replacement para `fmt(valor)`.
 * Anima o número de 0 até `value` usando easeOutCubic.
 * Respeita o estado de privacidade do grupo via data-attributes no <html>.
 *
 * @example
 * // Antes:
 * <span>{fmt(saldoContas)}</span>
 *
 * // Depois:
 * <AnimatedValue value={saldoContas} trigger={!loading} />
 *
 * // Com grupo de investimentos:
 * <AnimatedValue value={patrimonio} group="investment" trigger={!loading} />
 *
 * // Com delay escalonado (stagger):
 * <AnimatedValue value={saldo} trigger={!loading} delay={200} />
 */
export function AnimatedValue({
  value,
  trigger = true,
  group = 'financial',
  duration = 2000,
  delay = 0,
  className = '',
  colorize = true,
}: AnimatedValueProps) {
  const isPrivate = useIsPrivate(group)
  const animated = useCountUp({ target: value, duration, delay, trigger })

  if (isPrivate) {
    return (
      <span
        className={`text-glow-value ${className}`}
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
      aria-live="polite"
      aria-atomic="true"
    >
      {fmt(animated)}
    </span>
  )
}
