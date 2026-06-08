// src/components/dashboard/InsightsSection.tsx
//
// Etapa 5 do pipeline de leitura — síntese visual da interpretação financeira.
// Props: hero + recommendation + visible.
// ZERO lógica de negócio. ZERO queries. Só renderização.
//
// TD-009 — ETAPA-G — sessão 42

'use client'

import { CheckCircle, Warning, XCircle, Sparkle } from '@phosphor-icons/react'
import type { HeroInterpretation, HeroState } from '@/lib/financial/heroInterpretation'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface InsightsSectionProps {
  hero:           HeroInterpretation
  recommendation: string | null
  visible:        boolean
}

// ─── Config visual por estado ─────────────────────────────────────────────────

const STATE_CONFIG: Record<HeroState, {
  Icon:   typeof CheckCircle
  color:  string
  bg:     string
  border: string
}> = {
  excellent: {
    Icon:   CheckCircle,
    color:  'var(--success, #16A34A)',
    bg:     'rgba(22,163,74,0.07)',
    border: 'rgba(22,163,74,0.18)',
  },
  healthy: {
    Icon:   CheckCircle,
    color:  'var(--primary)',
    bg:     'var(--primary-glow)',
    border: 'rgba(99,102,241,0.18)',
  },
  attention: {
    Icon:   Warning,
    color:  '#f59e0b',
    bg:     'rgba(245,158,11,0.07)',
    border: 'rgba(245,158,11,0.18)',
  },
  critical: {
    Icon:   XCircle,
    color:  'var(--danger, #DC2626)',
    bg:     'rgba(220,38,38,0.07)',
    border: 'rgba(220,38,38,0.18)',
  },
}

// ─── InsightsSection ─────────────────────────────────────────────────────────

export function InsightsSection({ hero, recommendation, visible }: InsightsSectionProps) {
  if (!visible) return null

  const { Icon, color, bg, border } = STATE_CONFIG[hero.state]

  return (
    <div
      className="glass-card rounded-xl p-5 cursor-default"
      style={{ borderColor: border, borderWidth: 1, borderStyle: 'solid' }}
    >

      {/* Cabeçalho — estado + headline */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: bg }}
        >
          <Icon weight="duotone" size={18} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>
            {hero.headline}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {hero.narrative}
          </p>
        </div>
      </div>

      {/* Detalhe */}
      {hero.summary && (
        <p
          className="text-[11px] leading-relaxed mb-3 pl-12"
          style={{ color: 'var(--text-muted)' }}
        >
          {hero.summary}
        </p>
      )}

      {/* Highlights */}
      {hero.highlights.length > 0 && (
        <div className="flex flex-col gap-1.5 pl-12 mb-3">
          {hero.highlights.map((hl, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="w-1 h-1 rounded-full shrink-0"
                style={{ background: color }}
              />
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {hl}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Recomendação — só renderiza se existir */}
      {recommendation && (
        <div
          className="rounded-lg px-3 py-2.5 flex items-start gap-2 mt-1"
          style={{ background: 'var(--surface-raised, var(--surface))' }}
        >
          <Sparkle weight="duotone" size={14} className="shrink-0 mt-0.5" style={{ color }} />
          <p className="text-[11px] leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
            {recommendation}
          </p>
        </div>
      )}

    </div>
  )
}
