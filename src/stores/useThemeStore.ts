import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'

export type ThemeMode = 'dark' | 'light'
export type UIMode = 'standard' | 'arcade'

interface ThemeState {
  themeMode: ThemeMode
  uiMode: UIMode
  isLoading: boolean
  load: (userId: string) => Promise<void>
  setThemeMode: (mode: ThemeMode, userId: string) => Promise<void>
  setUIMode: (mode: UIMode, userId: string) => Promise<void>
}

function applyToDOM(themeMode?: ThemeMode, uiMode?: UIMode) {
  if (themeMode) {
    document.documentElement.setAttribute('data-theme', themeMode)
  }
  if (uiMode) {
    document.documentElement.setAttribute('data-ui-mode', uiMode)
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeMode: 'dark',
  uiMode: 'standard',
  isLoading: true,

  load: async (userId) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('theme_mode, ui_mode')
      .eq('id', userId)
      .single()

    const themeMode = (data?.theme_mode ?? 'dark') as ThemeMode
    const uiMode = (data?.ui_mode ?? 'standard') as UIMode

    set({ themeMode, uiMode, isLoading: false })
    applyToDOM(themeMode, uiMode)
  },

  setThemeMode: async (mode, userId) => {
    set({ themeMode: mode })
    applyToDOM(mode)
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ theme_mode: mode })
      .eq('id', userId)
  },

  setUIMode: async (mode, userId) => {
    set({ uiMode: mode })
    applyToDOM(undefined, mode)
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ ui_mode: mode })
      .eq('id', userId)
  },
}))