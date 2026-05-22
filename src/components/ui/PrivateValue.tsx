'use client'

import { Eye, EyeSlash } from '@phosphor-icons/react'
import { usePrivacyStore } from '@/stores/usePrivacyStore'

interface Props {
  value:       string
  group:       'financial' | 'investments'
  className?:  string
  style?:      React.CSSProperties
  showToggle?: boolean
}

const MASK = 'R$ ••••••'

export function PrivateValue({ value, group, className, style, showToggle = false }: Props) {
  const financialVisible   = usePrivacyStore(s => s.financialVisible)
  const investmentsVisible = usePrivacyStore(s => s.investmentsVisible)
  const toggleFinancial    = usePrivacyStore(s => s.toggleFinancial)
  const toggleInvestments  = usePrivacyStore(s => s.toggleInvestments)

  const visible = group === 'financial' ? financialVisible : investmentsVisible
  const toggle  = group === 'financial' ? toggleFinancial  : toggleInvestments

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`} style={style}>
      <span style={{ minWidth: '7ch', display: 'inline-block' }}>
        {visible ? value : MASK}
      </span>
      {showToggle && (
        <button
          onClick={toggle}
          className="transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-muted)', lineHeight: 1 }}
          aria-label={visible ? 'Ocultar valor' : 'Mostrar valor'}
        >
          {visible
            ? <Eye weight="duotone" size={14} />
            : <EyeSlash weight="duotone" size={14} />
          }
        </button>
      )}
    </span>
  )
}