// src/components/ActionHub.tsx
//
// ActionHub desktop — launcher discreto único no header.
//
// REDESIGN (sessão 8):
//  - Removido o botão primário grande roxo — era visualmente dominante demais
//  - Um único trigger minimalista: ícone Plus + "Nova" (sem cor de fundo dominante)
//  - Ao clicar: dropdown contextual com ação da página em destaque no topo
//  - Ação da página aparece com accent visual sutil no dropdown — não no header
//  - Produto premium: o dado domina, não a ação
//
// COMPORTAMENTO:
//  - Visível apenas em desktop (hidden md:flex via className no layout)
//  - Ação primária da página aparece primeiro no dropdown, separada visualmente
//  - QUICK_ACTIONS secundárias abaixo com divisor
//  - Enter (fora de input) → dispara ação primária da página
//  - Escape → fecha dropdown
//
// DESIGN (Luminous):
//  - Trigger: glass sutil, sem var(--primary) dominante no header
//  - Dropdown: glass-card com backdrop-filter
//  - Hover em items: onMouseEnter/onMouseLeave — NUNCA hover:bg-white/5
//  - Sem framer-motion, sem transform

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Plus, CaretDown } from '@phosphor-icons/react'
import { QUICK_ACTIONS } from '@/lib/quickActions'
import { useActionHubStore } from '@/stores/useActionHubStore'
import { resolveFabConfig } from '@/lib/fabRegistry'

export default function ActionHub() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dispatch = useActionHubStore(s => s.dispatch)

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

  // ─── Ações secundárias — exclui a ação primária da página (já está no topo do dropdown) ──
  const secondaryActions = QUICK_ACTIONS.filter(a =>
    !pageConfig || a.key !== pageConfig.actionKey
  )

  return (
    // hidden md:flex — ActionHub é exclusivamente desktop
    <div ref={ref} className="relative hidden md:flex items-center">

      {/* ── Trigger único e discreto ── */}
      <button
        onClick={() => setOpen(prev => !prev)}
        title={pageConfig ? `${pageConfig.label} (Enter) ou ver mais ações` : 'Nova ação'}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        style={{
          background:  open ? 'var(--glass-bg)' : 'transparent',
          border:      '1px solid',
          borderColor: open ? 'var(--glass-hover-border)' : 'var(--glass-border)',
          color:       'var(--color-text-secondary)',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.borderColor = 'var(--glass-hover-border)'
            e.currentTarget.style.background = 'var(--glass-bg)'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = 'var(--glass-border)'
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        <Plus size={13} weight="bold" style={{ color: 'var(--primary)' }} />
        <span>Nova</span>
        <CaretDown
          size={10}
          weight="bold"
          style={{
            transition: 'transform 150ms',
            transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
            opacity: 0.5,
          }}
        />
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-56 rounded-xl py-1.5 z-50"
          style={{
            background:           'var(--glass-bg)',
            backdropFilter:       'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            border:               '1px solid var(--glass-border)',
            boxShadow:            '0 8px 32px rgba(0,0,0,0.12)',
          }}
        >

          {/* ── Ação primária da página — destaque sutil no topo ── */}
          {pageConfig && (
            <>
              <div className="px-3 pt-1 pb-0.5">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}
                >
                  Esta página
                </span>
              </div>
              <button
                onClick={() => handleAction(pageConfig.actionKey)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition-colors"
                style={{ color: 'var(--color-text-primary)', background: 'transparent' }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(var(--primary-rgb, 124,58,237),0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <pageConfig.Icon
                  size={15}
                  weight="duotone"
                  style={{ color: 'var(--primary)', flexShrink: 0 }}
                />
                <span className="font-medium">{pageConfig.label}</span>
                <span
                  className="ml-auto text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{
                    background: 'var(--glass-border)',
                    color:      'var(--color-text-muted)',
                  }}
                >
                  Enter
                </span>
              </button>

              {/* Divisor entre ação da página e ações globais */}
              {secondaryActions.length > 0 && (
                <div
                  className="my-1.5 mx-3"
                  style={{ borderTop: '1px solid var(--glass-border)' }}
                />
              )}
            </>
          )}

          {/* ── Ações secundárias globais ── */}
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
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left transition-colors"
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

          {/* Estado vazio — rota sem config (settings, perfil, etc.) */}
          {!pageConfig && secondaryActions.length === 0 && (
            <p
              className="px-4 py-3 text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Nenhuma ação disponível.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
