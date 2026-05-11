'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { href: '/dashboard',               label: 'Dashboard',     emoji: '📊' },
  { href: '/dashboard/transacoes',    label: 'Transacoes',    emoji: '💸' },
  { href: '/dashboard/recorrencias',  label: 'Recorrencias',  emoji: '🔁' },
  { href: '/dashboard/contas',        label: 'Contas',        emoji: '🏦' },
  { href: '/dashboard/cartoes',       label: 'Cartoes',       emoji: '💳' },
  { href: '/dashboard/faturas',       label: 'Faturas',       emoji: '📄' },
  { href: '/dashboard/investimentos', label: 'Investimentos', emoji: '📈' },
  { href: '/dashboard/categorias',    label: 'Categorias',    emoji: '🏷️' },
  { href: '/dashboard/importar',      label: 'Importar CSV',  emoji: '📥' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const SidebarContent = () => (
    <aside
      className="flex flex-col w-56 h-full"
      style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)', fontFamily: 'var(--font-main)' }}
    >
      {/* Logo */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <img
          src="/sakel-logo.png"
          alt="SaKel Finanças"
          className="h-10 w-auto"
        />
      </div>

      {/* Nav label */}
      <p className="px-5 mt-4 mb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
        Menu
      </p>

      {/* Nav items */}
      <nav className="flex flex-col gap-0.5 px-2 flex-1">
        {navItems.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium relative"
              style={{
                color:      active ? 'var(--color-brand)'       : 'var(--color-text-secondary)',
                background: active ? 'var(--color-brand-light)' : 'transparent',
                fontWeight: active ? '600' : '500',
              }}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: 'var(--color-brand)' }}
                />
              )}
              <span className="text-base">{item.emoji}</span>
              <span style={{ letterSpacing: '-.01em' }}>{item.label}</span>
            </a>
          )
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 my-3" style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Theme toggle + Logout */}
      <div className="px-2 pb-4 space-y-0.5">
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-red-50 hover:text-red-500"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <span className="text-base">🚪</span>
          <span style={{ letterSpacing: '-.01em' }}>Sair</span>
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop: sidebar fixa */}
      <div className="hidden md:flex w-56 min-h-screen shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile: botao hamburguer */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 flex items-center justify-center rounded-lg shadow border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        aria-label="Abrir menu"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect y="2" width="18" height="2" rx="1" fill="#475467"/>
          <rect y="8" width="18" height="2" rx="1" fill="#475467"/>
          <rect y="14" width="18" height="2" rx="1" fill="#475467"/>
        </svg>
      </button>

      {/* Mobile: overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile: drawer */}
      <div
        className={`md:hidden fixed top-0 left-0 z-50 h-full transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <SidebarContent />
      </div>
    </>
  )
}
