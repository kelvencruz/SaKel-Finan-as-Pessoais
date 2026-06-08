// src/stores/usePreferencesStore.ts
import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface UserPreferences {
  id: string
  user_id: string
  full_name: string | null
  timezone: string | null
  theme: string | null
  accent_color: string | null
  sidebar_collapsed: boolean | null
  compact_mode: boolean | null
  currency: string | null
  hide_balances: boolean | null
  number_format: string | null
  created_at: string | null
  updated_at: string | null
  kaldiz_enabled: boolean
  gamification_enabled: boolean
  privacy_financial: boolean
  privacy_investments: boolean
  show_insights: boolean
}

// Colunas booleanas que têm toggle dedicado
export type BooleanPreferenceKey = Extract<keyof UserPreferences,
  | 'sidebar_collapsed'
  | 'compact_mode'
  | 'hide_balances'
  | 'kaldiz_enabled'
  | 'gamification_enabled'
  | 'privacy_financial'
  | 'privacy_investments'
  | 'show_insights'
>

// ─── Estado da store ──────────────────────────────────────────────────────────

interface PreferencesState {
  preferences: UserPreferences | null
  loading: boolean
  error: string | null

  loadPreferences: () => Promise<void>
  updatePreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => Promise<void>
  togglePreference: (key: BooleanPreferenceKey) => Promise<void>
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: null,
  loading: false,
  error: null,

  // Carrega preferências do usuário autenticado
  loadPreferences: async () => {
    set({ loading: true, error: null })

    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      set({ loading: false, error: 'Usuário não autenticado.' })
      return
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error) {
      set({ loading: false, error: error.message })
      return
    }

    set({ preferences: data as UserPreferences, loading: false })
  },

  // Atualiza qualquer coluna de user_preferences
  updatePreference: async (key, value) => {
    const { preferences } = get()
    if (!preferences) return

    // Otimismo: atualiza local imediatamente
    set({
      preferences: { ...preferences, [key]: value },
    })

    const supabase = createClient()
    const { error } = await supabase
      .from('user_preferences')
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq('id', preferences.id)

    if (error) {
      // Reverte em caso de falha
      set({ preferences, error: error.message })
    }
  },

  // Toggle para campos booleanos — nunca lança exceção se valor for null
  togglePreference: async (key) => {
    const { preferences, updatePreference } = get()
    if (!preferences) return

    const current = preferences[key]
    // Campos NOT NULL têm valor garantido; nullable boolean trata null como false
    const next = current === null ? true : !current
    await updatePreference(key, next as UserPreferences[typeof key])
  },
}))