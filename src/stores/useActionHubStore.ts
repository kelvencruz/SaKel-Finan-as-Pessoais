// src/stores/useActionHubStore.ts
import { create } from 'zustand'
import type { ActionKey } from '@/lib/quickActions'

interface ActionHubState {
  pendingAction: ActionKey | null
  dispatch: (action: ActionKey) => void
  clear:    () => void
}

export const useActionHubStore = create<ActionHubState>((set) => ({
  pendingAction: null,
  dispatch: (action) => set({ pendingAction: action }),
  clear:    ()       => set({ pendingAction: null }),
}))