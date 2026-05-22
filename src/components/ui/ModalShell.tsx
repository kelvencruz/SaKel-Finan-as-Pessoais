// src/components/ui/ModalShell.tsx
'use client'

import { useEffect } from 'react'
import { X } from '@phosphor-icons/react'

interface Props {
  open:      boolean
  onClose:   () => void
  title:     string
  children:  React.ReactNode
  maxWidth?: string
}

export function ModalShell({ open, onClose, title, children, maxWidth = 'max-w-md' }: Props) {

  // ESC → fecha
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    // Backdrop — clique fora fecha
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--overlay, rgba(0,0,0,0.5))' }}
      onClick={onClose}
    >
      {/* Painel — stopPropagation impede fechamento ao clicar dentro */}
      <div
        className={`relative w-full ${maxWidth} rounded-2xl shadow-xl max-h-[90vh] flex flex-col`}
        style={{ background: 'var(--color-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-border)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            aria-label="Fechar modal"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Conteúdo — scroll interno */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}