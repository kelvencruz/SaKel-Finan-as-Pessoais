'use client'

import { useTheme } from '@/contexts/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      title={dark ? 'Modo claro' : 'Modo escuro'}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-gray-100"
      style={{ color: 'var(--color-text-muted)' }}
    >
      <span className="text-base">{dark ? '☀️' : '🌙'}</span>
      <span style={{ letterSpacing: '-.01em' }}>{dark ? 'Modo claro' : 'Modo escuro'}</span>
    </button>
  )
}
