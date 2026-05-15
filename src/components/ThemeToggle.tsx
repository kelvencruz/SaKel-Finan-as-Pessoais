'use client'
import { Sun, Moon } from '@phosphor-icons/react'
import { useThemeStore } from '@/stores/useThemeStore'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const { themeMode, setThemeMode } = useThemeStore()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  function toggle() {
    if (!userId) return
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark', userId)
  }

  const isDark = themeMode === 'dark'

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
      style={{ color: 'var(--text-muted)', backgroundColor: 'transparent' }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.backgroundColor = 'var(--sidebar-hover-bg)'
        el.style.color = 'var(--text-secondary)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.backgroundColor = 'transparent'
        el.style.color = 'var(--text-muted)'
      }}
    >
      <span style={{ color: 'var(--primary)' }}>
        {isDark
          ? <Moon weight="duotone" size={16} />
          : <Sun weight="duotone" size={16} />
        }
      </span>
      <span style={{ letterSpacing: '-.01em' }}>
        {isDark ? 'Modo escuro' : 'Modo claro'}
      </span>
    </button>
  )
}