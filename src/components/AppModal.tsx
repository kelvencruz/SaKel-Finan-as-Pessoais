// src/components/AppModal.tsx
'use client'

import { useEffect, useRef, useCallback } from 'react'
import { X } from '@phosphor-icons/react'

export type ModalSize = 'sm' | 'md' | 'lg'
export type FooterAlign = 'start' | 'end' | 'between'

interface AppModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: ModalSize
  footer?: React.ReactNode
  showCloseButton?: boolean
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])'

interface FooterProps {
  children: React.ReactNode
  align?: FooterAlign
}

const FOOTER_ALIGN: Record<FooterAlign, string> = {
  start:   'justify-start',
  end:     'justify-end',
  between: 'justify-between',
}

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

export function AppModal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  showCloseButton = true,
}: AppModalProps) {
  const dialogRef     = useRef<HTMLDivElement>(null)
  const titleId       = useRef(`modal-title-${Math.random().toString(36).slice(2)}`)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement
    } else {
      previousFocus.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
      first?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const handleTab = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last  = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus() }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      className={[
        'fixed inset-0 flex items-center justify-center z-50 p-4',
        'motion-safe:animate-[fadeIn_200ms_ease-out]',
      ].join(' ')}
      style={{
        // BUG-02 fix: rgba direto evita o token --glass-bg opaco em dark/arcade
        background:           'rgba(0, 0, 0, 0.55)',
        backdropFilter:       'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        aria-hidden="false"
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
        onClick={e => e.stopPropagation()}
        onKeyDown={handleTab}
      >
        <div className="flex items-center justify-between p-6 pb-0">
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

        <div className="p-6">
          {children}
        </div>

        {footer && (
          <div className="px-6 pb-6 -mt-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

AppModal.Footer = ModalFooter