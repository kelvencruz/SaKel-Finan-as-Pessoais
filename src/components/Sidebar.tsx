'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useThemeStore } from '@/stores/useThemeStore'
import ThemeToggle from './ThemeToggle'
import {
  SquaresFour,
  ArrowsClockwise,
  Bank,
  CreditCard,
  Receipt,
  TrendUp,
  Tag,
  Gear,
  SignOut,
  DownloadSimple,
} from '@phosphor-icons/react'

// ─── Navegação principal ──────────────────────────────────────────────────────
// Ordem: operacional diário → estrutura financeira
// Conquistas e XP: removidos — pertencem ao Experience Profile Arcade (futuro)
// Importar CSV: movido para rodapé — ferramenta secundária, não navegação recorrente

const NAV_CORE = [
  { href: '/dashboard',               label: 'Dashboard',     Icon: SquaresFour    },
  { href: '/dashboard/transacoes',    label: 'Transações',    Icon: ArrowsClockwise },
  { href: '/dashboard/faturas',       label: 'Faturas',       Icon: Receipt        },
  { href: '/dashboard/recorrencias',  label: 'Recorrências',  Icon: ArrowsClockwise },
]

const NAV_ESTRUTURA = [
  { href: '/dashboard/contas',        label: 'Contas',        Icon: Bank       },
  { href: '/dashboard/cartoes',       label: 'Cartões',       Icon: CreditCard },
  { href: '/dashboard/categorias',    label: 'Categorias',    Icon: Tag        },
  { href: '/dashboard/investimentos', label: 'Investimentos', Icon: TrendUp    },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isDark = useThemeStore(s => s.themeMode === 'dark')

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === href
    return pathname.startsWith(href)
  }

  const NavLink = ({ item }: { item: { href: string; label: string; Icon: React.ElementType } }) => {
    const active = isActive(item.href)
    return (
      <a
        href={item.href}
        onClick={() => setOpen(false)}
        className="flex items-center gap-2 rounded-lg text-sm font-medium transition-colors"
        style={{
          color:       active ? 'var(--primary)'      : 'var(--text-secondary)',
          background:  active ? 'var(--primary-glow)' : 'transparent',
          fontWeight:  active ? '600' : '500',
          borderLeft:  active ? '2px solid var(--primary)' : '2px solid transparent',
          padding:     '6px 12px 6px 10px',
        }}
      >
        <item.Icon
          size={18}
          weight={active ? 'duotone' : 'regular'}
          style={{ color: active ? 'var(--primary)' : 'var(--text-secondary)', flexShrink: 0 }}
        />
        <span style={{ letterSpacing: '-.01em' }}>{item.label}</span>
      </a>
    )
  }

  const NavSection = ({ label, items }: { label: string; items: typeof NAV_CORE }) => (
    <div className="px-2">
      <p
        className="px-3 mb-1 text-[10px] font-semibold tracking-widest uppercase"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </p>
      <div className="flex flex-col gap-0">
        {items.map(item => <NavLink key={item.href} item={item} />)}
      </div>
    </div>
  )

  const SidebarContent = () => (
    <aside
      className="flex flex-col w-56 h-full"
      style={{
        background:           'var(--glass-bg)',
        backdropFilter:       'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        borderRight:          '1px solid var(--glass-border)',
        fontFamily:           'var(--font-main)',
        overflow:             'hidden',
      }}
    >
      {/* Logo */}
      <div
        className="px-5 py-3 mb-2 shrink-0"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <img
          src={isDark ? '/sakel-logo-dark.png' : '/sakel-logo-ligth.png'}
          alt="SaKel Finanças"
          className="w-full"
          style={{ maxWidth: 140, height: 'auto', objectFit: 'contain', display: 'block' }}
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement
            target.style.display = 'none'
            const fallback = target.nextElementSibling as HTMLElement
            if (fallback) fallback.style.display = 'flex'
          }}
        />
        {/* Fallback logo */}
        <div style={{ display: 'none' }} className="items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
          >S</div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>SaKel</p>
            <p className="text-[10px]"       style={{ color: 'var(--text-muted)' }}>Finanças Pessoais</p>
          </div>
        </div>
      </div>

      {/* Nav — agrupada semanticamente */}
      <nav className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 py-1">
        <NavSection label="Menu"      items={NAV_CORE}      />
        <NavSection label="Estrutura" items={NAV_ESTRUTURA} />
      </nav>

      {/* Rodapé */}
      <div
        className="shrink-0 px-2 pb-3 pt-2 flex flex-col gap-0"
        style={{ borderTop: '1px solid var(--glass-border)' }}
      >
        {/* Configurações */}
        <a
          href="/dashboard/settings"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            color:       isActive('/dashboard/settings') ? 'var(--primary)'      : 'var(--text-secondary)',
            background:  isActive('/dashboard/settings') ? 'var(--primary-glow)' : 'transparent',
            fontWeight:  isActive('/dashboard/settings') ? '600' : '500',
            borderLeft:  isActive('/dashboard/settings') ? '2px solid var(--primary)' : '2px solid transparent',
            padding:     '6px 12px 6px 10px',
          }}
        >
          <Gear
            size={18}
            weight={isActive('/dashboard/settings') ? 'duotone' : 'regular'}
            style={{ color: isActive('/dashboard/settings') ? 'var(--primary)' : 'var(--text-secondary)', flexShrink: 0 }}
          />
          <span style={{ letterSpacing: '-.01em' }}>Configurações</span>
        </a>

        {/* Importar CSV — ferramenta secundária, peso visual reduzido */}
        <a
          href="/dashboard/importar"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            color:       isActive('/dashboard/importar') ? 'var(--primary)'      : 'var(--text-muted)',
            background:  isActive('/dashboard/importar') ? 'var(--primary-glow)' : 'transparent',
            fontWeight:  '500',
            borderLeft:  isActive('/dashboard/importar') ? '2px solid var(--primary)' : '2px solid transparent',
            padding:     '6px 12px 6px 10px',
            opacity:     isActive('/dashboard/importar') ? 1 : 0.65,
          }}
        >
          <DownloadSimple
            size={18}
            weight={isActive('/dashboard/importar') ? 'duotone' : 'regular'}
            style={{ color: isActive('/dashboard/importar') ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }}
          />
          <span style={{ letterSpacing: '-.01em' }}>Importar CSV</span>
        </a>

        <ThemeToggle />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 rounded-lg text-sm font-medium"
          style={{
            color:      'var(--text-muted)',
            transition: 'background 200ms, color 200ms',
            padding:    '6px 12px 6px 10px',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement
            el.style.background = isDark ? '#3f1010' : '#fff1f0'
            el.style.color = '#ef4444'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement
            el.style.background = 'transparent'
            el.style.color = 'var(--text-muted)'
          }}
        >
          <SignOut size={18} weight="regular" style={{ flexShrink: 0 }} />
          <span style={{ letterSpacing: '-.01em' }}>Sair</span>
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex w-56 h-screen sticky top-0 shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile — botão hambúrguer */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 w-9 h-9 flex items-center justify-center rounded-lg shadow border"
        style={{
          background:           'var(--glass-bg)',
          backdropFilter:       'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          borderColor:          'var(--glass-border)',
        }}
        aria-label="Abrir menu"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect y="2"  width="18" height="2" rx="1" fill="currentColor" style={{ color: 'var(--text-secondary)' }}/>
          <rect y="8"  width="18" height="2" rx="1" fill="currentColor" style={{ color: 'var(--text-secondary)' }}/>
          <rect y="14" width="18" height="2" rx="1" fill="currentColor" style={{ color: 'var(--text-secondary)' }}/>
        </svg>
      </button>

      {/* Mobile — overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
      )}

      {/* Mobile — drawer */}
      <div
        className={`md:hidden fixed top-0 left-0 z-50 h-full transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <SidebarContent />
      </div>
    </>
  )
}
