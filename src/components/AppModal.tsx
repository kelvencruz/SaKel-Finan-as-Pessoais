'use client'

import { useEffect, useRef, useCallback } from 'react'
import { X } from '@phosphor-icons/react'

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type ModalSize = 'sm' | 'md' | 'lg'
export type FooterAlign = 'start' | 'end' | 'between'

interface AppModalProps {
  /** Controla visibilidade — a página gerencia o estado */
  open: boolean
  /** Callback chamado ao clicar no overlay, botão X ou pressionar Escape */
  onClose: () => void
  /** Título exibido no cabeçalho — também usado como aria-label do dialog */
  title: string
  /** Conteúdo do modal */
  children: React.ReactNode
  /** Largura máxima do container — padrão 'md' (448px) */
  size?: ModalSize
  /** Slot para ações do rodapé — use AppModal.Footer para alinhamento consistente */
  footer?: React.ReactNode
  /** Exibe botão X no canto superior direito — padrão true */
  showCloseButton?: boolean
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',  // 384px — confirmações e ações simples
  md: 'max-w-md',  // 448px — formulários padrão
  lg: 'max-w-lg',  // 512px — formulários extensos
}

// Seletores de elementos focáveis — padrão WAI-ARIA
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])'

// ─── Subcomponentes ───────────────────────────────────────────────────────────

interface FooterProps {
  children: React.ReactNode
  align?: FooterAlign
}

const FOOTER_ALIGN: Record<FooterAlign, string> = {
  start:   'justify-start',
  end:     'justify-end',
  between: 'justify-between',
}

/**
 * AppModal.Footer
 * Slot de rodapé com alinhamento controlado via prop — nunca via className externo.
 *
 * @example
 * <AppModal.Footer align="end">
 *   <Button variant="ghost" onClick={onClose}>Cancelar</Button>
 *   <Button onClick={handleSave}>Salvar</Button>
 * </AppModal.Footer>
 */
function ModalFooter({ children, align = 'end' }: FooterProps) {
  return (
    <div
      className={`flex items-center gap-3 pt-5 mt-5 border-t ${FOOTER_ALIGN[align]}`}
      style={{ borderColor: 'var(--color-border)' }}
    >
      {children}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

/**
 * AppModal — componente base de modal do Sakel.
 *
 * PADRÃO ARQUITETURAL (imutável):
 * - Overlay : var(--overlay) — nunca bg-black/50 ou similar
 * - Surface : var(--color-surface) — nunca bg-white ou classe Tailwind
 * - Border  : var(--color-border)
 * - Animação: fade+scale dentro do componente, motion-safe, nunca nas páginas
 * - Props de estilo externas são proibidas — API fechada
 *
 * @example
 * <AppModal open={showModal} onClose={() => setShowModal(false)} title="Nova Conta">
 *   <AppModal.Footer align="end">
 *     <button onClick={() => setShowModal(false)}>Cancelar</button>
 *     <button onClick={handleSave}>Salvar</button>
 *   </AppModal.Footer>
 * </AppModal>
 */
export function AppModal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  showCloseButton = true,
}: AppModalProps) {
  const dialogRef    = useRef<HTMLDivElement>(null)
  const titleId      = useRef(`modal-title-${Math.random().toString(36).slice(2)}`)
  // Guarda o elemento que estava em foco antes de abrir o modal
  const previousFocus = useRef<HTMLElement | null>(null)

  // ── Restore focus ao fechar ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement
    } else {
      previousFocus.current?.focus()
    }
  }, [open])

  // ── Focus no primeiro elemento focável ao abrir ──────────────────────────
  useEffect(() => {
    if (!open) return
    // Aguarda o frame de animação para garantir que o DOM está renderizado
    const frame = requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
      first?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  // ── Escape ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // ── Focus trap ───────────────────────────────────────────────────────────
  const handleTab = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    )
    if (focusable.length === 0) return

    const first = focusable[0]
    const last  = focusable[focusable.length - 1]

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  // ── Scroll lock ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  // ── Não renderiza nada quando fechado ────────────────────────────────────
  if (!open) return null

  return (
    // Overlay — fade in
    <div
      className={[
        'fixed inset-0 flex items-center justify-center z-50 p-4',
        'motion-safe:animate-[fadeIn_200ms_ease-out]',
      ].join(' ')}
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}
      // aria-hidden para remover o overlay do tree de acessibilidade;
      // o dialog abaixo é o ponto de entrada correto para leitores de tela
      aria-hidden="true"
    >
      {/* Dialog — fade + scale in */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        className={[
          'w-full rounded-2xl shadow-xl border',
          'max-h-[90vh] overflow-y-auto',
          'motion-safe:animate-[modalIn_200ms_ease-out]',
          SIZE_CLASS[size],
        ].join(' ')}
        style={{
          background:  'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        // Remove aria-hidden herdado do overlay
        aria-hidden="false"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleTab}
      >
        {/* ── Cabeçalho ── */}
        <div
          className="flex items-center justify-between p-6 pb-0"
        >
          <h2
            id={titleId.current}
            className="text-lg font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {title}
          </h2>

          {showCloseButton && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 transition-colors hover:opacity-70 -mr-1"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Fechar modal"
            >
              <X size={20} weight="bold" />
            </button>
          )}
        </div>

        {/* ── Body ── */}
        <div className="p-6">
          {children}
        </div>

        {/* ── Footer opcional ── */}
        {footer && (
          <div className="px-6 pb-6 -mt-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// Subcomponente anexado ao namespace
AppModal.Footer = ModalFooter

// ─── Keyframes (adicionar ao globals.css ou tailwind.config) ─────────────────
//
// @keyframes fadeIn {
//   from { opacity: 0; }
//   to   { opacity: 1; }
// }
//
// @keyframes modalIn {
//   from { opacity: 0; transform: scale(0.96); }
//   to   { opacity: 1; transform: scale(1); }
// }
//
// No tailwind.config.ts:
// theme: {
//   extend: {
//     keyframes: {
//       fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
//       modalIn: { from: { opacity: '0', transform: 'scale(0.96)' },
//                  to:   { opacity: '1', transform: 'scale(1)' } },
//     }
//   }
// }
