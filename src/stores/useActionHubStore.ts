// src/stores/useActionHubStore.ts
//
// Store de orquestração de ações globais do Sakel.
//
// RESPONSABILIDADE:
//  - Receber dispatches de qualquer componente (FAB, ActionHub, botões de página)
//  - Manter a ação pendente até o ActionHubController consumi-la
//  - Garantir que APENAS UMA ação seja processada por vez
//
// FLUXO:
//  1. Componente chama dispatch('nova-transacao')
//  2. Store registra pendingAction = 'nova-transacao'
//  3. ActionHubController observa pendingAction, abre o modal correto
//  4. ActionHubController chama clear() após consumir
//
// IMPORTANTE: ActionKey é importada de fabRegistry para single-source de verdade.
// Não duplicar a union type aqui.

import { create } from 'zustand'
import type { ActionKey } from '@/lib/fabRegistry'

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
