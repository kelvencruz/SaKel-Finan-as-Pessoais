'use client'

import { useCallback } from 'react'
import { toastManager } from '@/components/core/ToastManager'
import { processTransactionCreated } from '@/features/gamificacao/services/gamificacaoService'

export function useGamification() {
  /**
   * Dispara o toast de XP após uma transação ser criada.
   * Chame apenas em criações — nunca em edições (regra inviolável).
   */
  const pushXPToast = useCallback(
    async (userId: string, isFirstTx: boolean): Promise<void> => {
      try {
        const { totalXP, badgeEarned } = await processTransactionCreated(
          userId,
          isFirstTx,
        )
        if (totalXP > 0) {
          toastManager.push({ kind: 'xp', xp: totalXP, badge: badgeEarned })
        }
      } catch (err) {
        // Gamificação nunca pode quebrar o fluxo principal
        console.error('[useGamification] erro ao processar XP:', err)
      }
    },
    [],
  )

  return { pushXPToast }
}
