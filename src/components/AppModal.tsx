'use client'

import { useEffect } from 'react'
import { X } from '@phosphor-icons/react'

interface AppModalProps {
  /** Título exibido no cabeçalho do modal */
  title: string
  /** Callback chamado ao clicar no overlay ou no botão X */
  onClose: () => void
  /** Conteúdo do modal */
  children: React.ReactNode
  /** Largura máxima do container — padrão 'md' (448px) */
  maxWidth?: 'sm' | 'md' | 'lg'
  /** Exibe botão X no canto superior direito — padrão true */
  showCloseButton?: boolean
}

const MAX_WIDTH: Record<string, string> = {
  sm: 'max-w-sm',   // 384px — modais de confirmação/ação simples
  md: 'max-w-md',   // 448px — formulários padrão
  lg: 'max-w-lg',   // 512px — formulários extensos
}

/**
 * AppModal — componente base de modal do Sakel.
 *
 * PADRÃO OBRIGATÓRIO (decisão arquitetural):
 * - Overlay: var(--overlay) sólido — nunca bg-black/50 ou similar
 * - Surface: var(--color-surface) sólido — nunca bg-white ou bg-surface classe Tailwind
 * - Border: var(--color-border)
 * - Fechar ao clicar no overlay (stopPropagation no container)
 * - Fechar com Escape
 *
 * USO:
 * <AppModal title="Nova Conta" onClose={() => setShowModal(false)}>
 *   {conteúdo do formulário}
 * </AppModal>
 */
export function AppModal({
  title,
  onClose,
  children,
  maxWidth = 'md',
  showCloseButton = true,
}: AppModalProps) {
  // Fecha com Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Trava scroll do body enquanto modal está aberto
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}
    >
      <div
        className={`w-full ${MAX_WIDTH[maxWidth]} rounded-2xl p-6 shadow-xl border max-h-[90vh] overflow-y-auto`}
        style={{
          background:   'var(--color-surface)',
          borderColor:  'var(--color-border)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {title}
          </h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Fechar modal"
            >
              <X size={20} weight="bold" />
            </button>
          )}
        </div>

        {/* Conteúdo injetado pela página */}
        {children}
      </div>
    </div>
  )
}
