// src/components/ActionHub.tsx
//
// ActionHub desktop — botão de ação contextual no header.
//
// COMPORTAMENTO:
//  - Visível apenas em desktop (hidden md:flex via className no layout)
//  - Botão primário reflete a ação da página atual (via FAB_REGISTRY)
//  - Dropdown "▾ Mais" com ações globais secundárias (QUICK_ACTIONS)
//  - Em rotas sem FAB (settings, perfil), exibe apenas dropdown secundário
//
// DESIGN (Luminous):
//  - Botão primário: var(--primary) sólido
//  - Dropdown: glass-card com var(--glass-bg) e var(--glass-border)
//  - Hover em items: onMouseEnter/onMouseLeave — NUNCA hover:bg-white/5
//  - Sem framer-motion, sem transform
//
// KEYBOARD:
//  - Enter (fora de input/textarea) → dispara ação primária da página
//  - Escape → fecha dropdown

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Plus, CaretDown, DotsThree } from '@phosphor-icons/react'
import { QUICK_ACTIONS } from '@/lib/quickActions'
import { useActionHubStore } from '@/stores/useActionHubStore'
import { resolveFabConfig } from '@/lib/fabRegistry'

export default function ActionHub() {
  const pathname = usePathname()
  const [open,  setOpen]  = useState(false)
  const ref               = useRef<HTMLDivElement>(null)
  const dispatch          = useActionHubStore(s => s.dispatch)

  const pageConfig = resolveFabConfig(pathname)

  // ─── Fechar ao clicar fora ────────────────────────────────────────────────
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    // Enter → ação primária da página (se existir)
    if (e.key === 'Enter' && !open && pageConfig) {
      e.preventDefault()
      dispatch(pageConfig.actionKey)
    }
    if (e.key === 'Escape') setOpen(false)
  }, [open, dispatch, pageConfig])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  function handleAction(key: string) {
    setOpen(false)
    dispatch(key as any)
  }

  // ─── Filtra QUICK_ACTIONS removendo a ação já exposta no botão primário ──
  // Evita duplicação visual: se a página é /investimentos, o botão já diz
  // "Novo Investimento" — o dropdown não precisa repetir.
  const secondaryActions = QUICK_ACTIONS.filter(a =>
    !pageConfig || a.key !== pageConfig.actionKey
  )

  return (
    // hidden md:flex — ActionHub é exclusivamente desktop
    <div ref={ref} className="relative hidden md:flex items-center gap-2">

      {/* ── Botão primário contextual ── */}
      {pageConfig && (
        <button
          onClick={() => dispatch(pageConfig.actionKey)}
          title={`${pageConfig.label} (Enter)`}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--primary)' }}
        >
          <pageConfig.Icon size={14} weight="duotone" />
          {pageConfig.label}
        </button>
      )}

      {/* ── Botão dropdown secundário ("Mais ▾") ── */}
      {secondaryActions.length > 0 && (
        <button
          onClick={() => setOpen(prev => !prev)}
          title="Mais ações"
          className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background:  'var(--glass-bg)',
            border:      '1px solid var(--glass-border)',
            color:       'var(--color-text-secondary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--glass-hover-border)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
        >
          {/* Quando não tem botão primário, o secundário ganha ícone + label */}
          {!pageConfig ? (
            <>
              <Plus size={14} weight="bold" />
              <span>Novo</span>
            </>
          ) : (
            <DotsThree size={16} weight="bold" />
          )}
          <CaretDown
            size={11}
            weight="bold"
            style={{
              transition: 'transform 150ms',
              transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>
      )}

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-52 rounded-xl py-1.5 z-50"
          style={{
            background:         'var(--glass-bg)',
            backdropFilter:     'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            border:             '1px solid var(--glass-border)',
            boxShadow:          '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >
          {secondaryActions.map(action => (
            <div key={action.key}>
              {action.dividerBefore && (
                <div
                  className="my-1.5 mx-3"
                  style={{ borderTop: '1px solid var(--glass-border)' }}
                />
              )}
              <button
                onClick={() => handleAction(action.key)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors"
                style={{ color: 'var(--color-text-primary)', background: 'transparent' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(var(--primary-rgb, 124,58,237),0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <div className="flex items-center gap-2.5">
                  <action.icon
                    size={15}
                    weight="duotone"
                    style={{ color: 'var(--primary)', flexShrink: 0 }}
                  />
                  {action.label}
                </div>
                {action.shortcut && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                    style={{
                      background: 'var(--glass-border)',
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
