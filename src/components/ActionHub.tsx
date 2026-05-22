// src/components/ActionHub.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, CaretDown } from '@phosphor-icons/react'
import { QUICK_ACTIONS } from '@/lib/quickActions'
import { useActionHubStore } from '@/stores/useActionHubStore'

export default function ActionHub() {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)
  const dispatch        = useActionHubStore(s => s.dispatch)

  // Fecha ao clicar fora
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Enter → nova transação (quando dropdown fechado)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !open &&
        (e.target as HTMLElement).tagName !== 'INPUT' &&
        (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault()
      dispatch('nova-transacao')
    }
    if (e.key === 'Escape') setOpen(false)
  }, [open, dispatch])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  function handleAction(key: string) {
    setOpen(false)
    dispatch(key as any)
  }

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-95"
        style={{ background: 'var(--color-brand, #7C3AED)' }}
      >
        <Plus size={14} weight="bold" />
        Novo
        <CaretDown
          size={11}
          weight="bold"
          className="transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-52 rounded-xl py-1.5 z-50 shadow-xl border"
          style={{
            background:   'var(--color-surface)',
            borderColor:  'var(--color-border)',
          }}
        >
          {QUICK_ACTIONS.map(action => (
            <div key={action.key}>
              {action.dividerBefore && (
                <div className="my-1.5 mx-3" style={{ borderTop: '1px solid var(--color-border)' }} />
              )}
              <button
                onClick={() => handleAction(action.key)}
                className="w-full flex items-center justify-between px-4 py-2 text-sm transition-colors text-left"
                style={{ color: 'var(--color-text-primary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-brand-light, rgba(124,58,237,0.08))')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="flex items-center gap-2.5">
                  <action.icon size={15} weight="duotone" style={{ color: 'var(--color-brand, #7C3AED)', flexShrink: 0 }} />
                  {action.label}
                </div>
                {action.shortcut && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                    style={{
                      background: 'var(--color-border)',
                      color:      'var(--color-text-muted)',
                    }}
                  >
                    {action.shortcut}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}