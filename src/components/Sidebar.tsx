'use client'

import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard',            label: 'Dashboard',    icon: '▦',  emoji: '📊' },
  { href: '/dashboard/transacoes', label: 'Transações',   icon: '⇅',  emoji: '💸' },
  { href: '/dashboard/contas',     label: 'Contas',       icon: '◫',  emoji: '🏦' },
  { href: '/dashboard/categorias', label: 'Categorias',   icon: '◈',  emoji: '🏷️' },
  { href: '/dashboard/cartoes',    label: 'Cartões',      icon: '◻',  emoji: '💳' },
  { href: '/dashboard/faturas',    label: 'Faturas',      icon: '◻',  emoji: '📄' },
  { href: '/dashboard/importar',   label: 'Importar CSV', icon: '↓',  emoji: '📥' },
]

export default function Sidebar() {
  const pathname = usePathname()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  return (
    <aside
      className="flex flex-col w-56 min-h-screen shrink-0"
      style={{
        background: '#ffffff',
        borderRight: '1px solid var(--color-border)',
        fontFamily: 'var(--font-main)',
      }}
    >
      {/* Logo */}
      <div
        className="px-5 py-5 mb-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
          >
            S
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)', letterSpacing: '-.01em' }}>
              SaKel
            </p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              Finanças Pessoais
            </p>
          </div>
        </div>
      </div>

      {/* Nav label */}
      <p
        className="px-5 mb-1.5 text-[10px] font-semibold tracking-widest uppercase"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Menu
      </p>

      {/* Nav items */}
      <nav className="flex flex-col gap-0.5 px-2 flex-1">
        {navItems.map(item => {
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))

          return (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium relative group"
              style={{
                color:      active ? 'var(--color-brand)'      : 'var(--color-text-secondary)',
                background: active ? 'var(--color-brand-light)' : 'transparent',
                fontWeight: active ? '600' : '500',
              }}
            >
              {/* Indicador ativo */}
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

      {/* Logout */}
      <div className="px-2 pb-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium"
          style={{ color: 'var(--color-text-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = '#fff1f0'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--color-danger)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'
          }}
        >
          <span className="text-base">🚪</span>
          <span style={{ letterSpacing: '-.01em' }}>Sair</span>
        </button>
      </div>
    </aside>
  )
}
