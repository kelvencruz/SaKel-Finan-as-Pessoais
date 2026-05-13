'use client'
import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'arcade'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const THEME_ORDER: Theme[] = ['light', 'dark', 'arcade']

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('sakel-theme') as Theme | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const resolved: Theme = saved ?? (prefersDark ? 'dark' : 'light')
    applyTheme(resolved)
    setThemeState(resolved)
  }, [])

  function applyTheme(t: Theme) {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('sakel-theme', t)
  }

  function toggleTheme() {
    const currentIndex = THEME_ORDER.indexOf(theme)
    const next = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length]
    setThemeState(next)
    applyTheme(next)
  }

  function setTheme(t: Theme) {
    setThemeState(t)
    applyTheme(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  return ctx
}
