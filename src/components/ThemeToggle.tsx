'use client'
import { Sun, Moon, GameController } from '@phosphor-icons/react'
import { useTheme, type Theme } from '@/contexts/ThemeContext'

const THEME_CONFIG: Record<Theme, { icon: React.ReactNode; label: string; next: string }> = {
  light: {
    icon: <Sun weight="duotone" size={16} />,
    label: 'Modo claro',
    next: 'Modo escuro',
  },
  dark: {
    icon: <Moon weight="duotone" size={16} />,
    label: 'Modo escuro',
    next: 'Kal Arcade',
  },
  arcade: {
    icon: <GameController weight="duotone" size={16} />,
    label: 'Kal Arcade',
    next: 'Modo claro',
  },
}

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const config = THEME_CONFIG[theme]

  return (
    <button
      onClick={toggleTheme}
      title={`Próximo: ${config.next}`}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
      style={{
        color: 'var(--text-muted)',
        backgroundColor: 'transparent',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--sidebar-hover-bg)'
        ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
        ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
      }}
    >
      <span style={{ color: 'var(--primary)' }}>{config.icon}</span>
      <span style={{ letterSpacing: '-.01em' }}>{config.label}</span>
    </button>
  )
}
