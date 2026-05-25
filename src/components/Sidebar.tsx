'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useThemeStore } from '@/stores/useThemeStore'
import ThemeToggle from './ThemeToggle'
import { getGamification, getLevelInfo } from '@/lib/gamification'
import {
  SquaresFour,
  ArrowsClockwise,
  Bank,
  CreditCard,
  Receipt,
  TrendUp,
  Tag,
  Trophy,
  DownloadSimple,
  Gear,
  SignOut,
} from '@phosphor-icons/react'

const navItems = [
  { href: '/dashboard',               label: 'Dashboard',     Icon: SquaresFour },
  { href: '/dashboard/transacoes',    label: 'Transações',    Icon: ArrowsClockwise },
  { href: '/dashboard/recorrencias',  label: 'Recorrências',  Icon: ArrowsClockwise },
  { href: '/dashboard/contas',        label: 'Contas',        Icon: Bank },
  { href: '/dashboard/cartoes',       label: 'Cartões',       Icon: CreditCard },
  { href: '/dashboard/faturas',       label: 'Faturas',       Icon: Receipt },
  { href: '/dashboard/investimentos', label: 'Investimentos', Icon: TrendUp },
  { href: '/dashboard/categorias',    label: 'Categorias',    Icon: Tag },
  { href: '/dashboard/conquistas',    label: 'Conquistas',    Icon: Trophy },
  { href: '/dashboard/importar',      label: 'Importar CSV',  Icon: DownloadSimple },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [open,       setOpen]       = useState(false)
  const [gamEnabled, setGamEnabled] = useState(false)
  const [xp,         setXp]         = useState(0)
  const [streakDays, setStreakDays] = useState(0)

  const isDark = useThemeStore(s => s.themeMode === 'dark')

  useEffect(() => {
    async function loadGam() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prefs } = await supabase
        .from('user_preferences').select('gamification_enabled').eq('user_id', user.id).single()
      if (!prefs?.gamification_enabled) return
      setGamEnabled(true)
      const gam = await getGamification(user.id)
      if (gam) { setXp(gam.xp); setStreakDays(gam.streakDays) }
    }
    loadGam()
  }, [])

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
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium relative transition-colors"
        style={{
          color:      active ? 'var(--primary)'        : 'var(--text-secondary)',
          background: active ? 'var(--primary-glow)'   : 'transparent',
          fontWeight: active ? '600' : '500',
          // Etapa 8 — nav-item indicator: border-left no item ativo
          // Apenas border-color e opacity no hover — sem transform scale
          borderLeft: active ? '2px solid var(--primary)' : '2px solid transparent',
          paddingLeft: '10px', // compensa o border-left de 2px (px-3 = 12px → 12-2 = 10px)
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

  const levelInfo = getLevelInfo(xp)

  const SidebarContent = () => (
    <aside
      className="flex flex-col w-56 h-full"
      style={{
        // Etapa 8 — glassmorphism Luminous
        background:    'var(--glass-bg)',
        backdropFilter:'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        borderRight:   '1px solid var(--glass-border)',
        fontFamily:    'var(--font-main)',
        overflow:      'hidden',
      }}
    >
      {/* Logo */}
      <div
        className="px-5 py-3 mb-1 shrink-0"
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

      {/* Mini card XP — só se gamificação ativa */}
      {gamEnabled && (
        <a
          href="/dashboard/conquistas"
          onClick={() => setOpen(false)}
          className="mx-3 mb-2 px-3 py-1.5 rounded-xl block shrink-0"
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            // Hover apenas opacity — sem transform scale (regra inviolável)
            transition: 'opacity 200ms',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-white/80 uppercase tracking-wider">
              Nível {levelInfo.level}
            </span>
            {streakDays > 0 && (
              <span className="text-[10px] text-white/70">🔥 {streakDays}d</span>
            )}
          </div>
          <div className="w-full bg-white/20 rounded-full h-1.5 mb-1">
            <div
              className="bg-white rounded-full h-1.5 transition-all duration-500"
              style={{ width: `${levelInfo.progress}%` }}
            />
          </div>
          <p className="text-[10px] text-white/50">{xp.toLocaleString('pt-BR')} XP · {levelInfo.name}</p>
        </a>
      )}

      {/* Nav label */}
      <p
        className="px-5 mb-1 text-[10px] font-semibold tracking-widest uppercase shrink-0"
        style={{ color: 'var(--text-muted)' }}
      >
        Menu
      </p>

      {/* Nav items */}
      <nav className="flex flex-col gap-0 px-2 overflow-y-auto flex-1 min-h-0">
        {navItems.map(item => <NavLink key={item.href} item={item} />)}
      </nav>

      {/* Rodapé */}
      <div
        className="shrink-0 px-2 pb-3 pt-1"
        style={{ borderTop: '1px solid var(--glass-border)' }}
      >
        {/* Settings */}
        <a
          href="/dashboard/settings"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            color:      isActive('/dashboard/settings') ? 'var(--primary)'      : 'var(--text-secondary)',
            background: isActive('/dashboard/settings') ? 'var(--primary-glow)' : 'transparent',
            fontWeight: isActive('/dashboard/settings') ? '600' : '500',
            borderLeft: isActive('/dashboard/settings') ? '2px solid var(--primary)' : '2px solid transparent',
            paddingLeft: '10px',
          }}
        >
          <Gear
            size={18}
            weight={isActive('/dashboard/settings') ? 'duotone' : 'regular'}
            style={{ color: isActive('/dashboard/settings') ? 'var(--primary)' : 'var(--text-secondary)', flexShrink: 0 }}
          />
          <span style={{ letterSpacing: '-.01em' }}>Configurações</span>
        </a>

        <ThemeToggle />

        {/* Logout — hover apenas background e color, sem transform */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{
            color:      'var(--text-muted)',
            transition: 'background 200ms, color 200ms',
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
          background:    'var(--glass-bg)',
          backdropFilter:'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          borderColor:   'var(--glass-border)',
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
