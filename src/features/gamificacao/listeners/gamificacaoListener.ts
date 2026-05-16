// src/features/gamificacao/listeners/gamificacaoListener.ts
// Registra o listener de gamificação no Event Bus client-side.
// REGRA CRÍTICA (DT-003): registrado uma única vez via flag de módulo.
// HMR no dev duplica listeners a cada hot reload — a flag previne isso.
// Chamado uma vez em dashboard/layout.tsx, fora de qualquer hook.
// SEM cleanup no layout — o layout vive enquanto o app vive.

import { eventBus } from '@/lib/events/eventBus'
import { processTransactionCreated } from '@/features/gamificacao/services/gamificacaoService'
import { toastManager } from '@/components/core/ToastManager'

let initialized = false

export function initGamificacaoListener(): void {
  if (initialized) return
  initialized = true

  eventBus.on('transaction.created', async ({ userId, isFirstTx }) => {
    try {
      const { totalXP, badgeEarned } = await processTransactionCreated(userId, isFirstTx)
      if (totalXP > 0) {
        toastManager.push({ kind: 'xp', xp: totalXP, badge: badgeEarned })
      }
    } catch (err) {
      // Gamificação nunca pode quebrar o fluxo principal
      console.error('[gamificacaoListener] erro ao processar XP:', err)
    }
  })
}
