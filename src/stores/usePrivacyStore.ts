import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'

interface PrivacyState {
  financialVisible:   boolean
  investmentsVisible: boolean
  hydrated:           boolean
  syncFromDB:         () => Promise<void>
  toggleFinancial:    () => Promise<void>
  toggleInvestments:  () => Promise<void>
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  financialVisible:   true,
  investmentsVisible: true,
  hydrated:           false,

  syncFromDB: async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('user_preferences')
      .select('privacy_financial, privacy_investments')
      .eq('user_id', user.id)
      .single()

    if (data) {
      set({
        financialVisible:   data.privacy_financial,
        investmentsVisible: data.privacy_investments,
        hydrated:           true,
      })
    } else {
      set({ hydrated: true })
    }
  },

  toggleFinancial: async () => {
    const next = !get().financialVisible
    set({ financialVisible: next })

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('user_preferences')
      .update({ privacy_financial: next })
      .eq('user_id', user.id)
  },

  toggleInvestments: async () => {
    const next = !get().investmentsVisible
    set({ investmentsVisible: next })

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('user_preferences')
      .update({ privacy_investments: next })
      .eq('user_id', user.id)
  },
}))