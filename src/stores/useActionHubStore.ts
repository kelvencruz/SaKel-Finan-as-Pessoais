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
// PAYLOAD OPCIONAL (modo edição):
//  Páginas que precisam abrir um modal em modo edição passam o payload:
//    dispatch('novo-cartao', cardPayload)
//  O ActionHubController lê actionPayload e repassa ao modal via prop (ex: editCard).
//  Dispatches sem payload continuam funcionando normalmente (payload = null).
//
// IMPORTANTE: ActionKey é importada de fabRegistry para single-source de verdade.
// Não duplicar a union type aqui.

import { create } from 'zustand'
import type { ActionKey } from '@/lib/fabRegistry'

interface ActionHubState {
  pendingAction: ActionKey | null
  actionPayload: unknown
  dispatch: (action: ActionKey, payload?: unknown) => void
  clear:    () => void
}

export const useActionHubStore = create<ActionHubState>((set) => ({
  pendingAction: null,
  actionPayload: null,
  dispatch: (action, payload = null) => set({ pendingAction: action, actionPayload: payload }),
  clear:    ()                       => set({ pendingAction: null,   actionPayload: null }),
}))
