'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { href: '/dashboard',               label: 'Dashboard',     emoji: '📊' },
  { href: '/dashboard/transacoes',    label: 'Transações',    emoji: '💸' },
  { href: '/dashboard/recorrencias',  label: 'Recorrências',  emoji: '🔁' },
  { href: '/dashboard/contas',        label: 'Contas',        emoji: '🏦' },
  { href: '/dashboard/cartoes',       label: 'Cartões',       emoji: '💳' },
  { href: '/dashboard/faturas',       label: 'Faturas',       emoji: '📄' },
  { href: '/dashboard/investimentos', label: 'Investimentos', emoji: '📈' },
  { href: '/dashboard/categorias',    label: 'Categorias',    emoji: '🏷️' },
  { href: '/dashboard/importar',      label: 'Importar CSV',  emoji: '📥' },
]

const bottomItems = [
  { href: '/dashboard/settings', label: 'Configurações', emoji: '⚙️' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === href
    return pathname.startsWith(href)
  }

  const NavLink = ({ item }: { item: { href: string; label: string; emoji: string } }) => {
    const active = isActive(item.href)
    return (
      <a
        href={item.href}
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium relative transition-colors"
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
  }

  const SidebarContent = () => (
    <aside
      className="flex flex-col w-56 h-full"
      style={{ background: 'var(--color-surface)', borderRight: '1px solid var(--color-border)', fontFamily: 'var(--font-main)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 mb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
          >S</div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)', letterSpacing: '-.01em' }}>SaKel</p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Finanças Pessoais</p>
          </div>
        </div>
      </div>

      {/* Nav label */}
      <p className="px-5 mb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>
        Menu
      </p>

      {/* Nav items principais */}
      <nav className="flex flex-col gap-0.5 px-2 flex-1 overflow-y-auto">
        {navItems.map(item => <NavLink key={item.href} item={item} />)}
      </nav>

      {/* Divider */}
      <div className="mx-4 my-2" style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* Bottom: Configurações + ThemeToggle + Sair */}
      <div className="px-2 pb-4 space-y-0.5">
        {bottomItems.map(item => <NavLink key={item.href} item={item} />)}
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ color: 'var(--color-text-muted)' }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#fff1f0'; el.style.color = '#ef4444' }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--color-text-muted)' }}
        >
          <span className="text-base">🚪</span>
          <span style={{ letterSpacing: '-.01em' }}>Sair</span>
        </button>
      </div>
    </aside>
  )

  return (
    <>
      <div className="hidden md:flex w-56 min-h-screen shrink-0">
        <SidebarContent />
      </div>

      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 flex items-center justify-center rounded-lg shadow border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        aria-label="Abrir menu"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect y="2"  width="18" height="2" rx="1" fill="#475467"/>
          <rect y="8"  width="18" height="2" rx="1" fill="#475467"/>
          <rect y="14" width="18" height="2" rx="1" fill="#475467"/>
        </svg>
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
      )}

      <div className={`md:hidden fixed top-0 left-0 z-50 h-full transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </div>
    </>
  )
}
