// src/features/financas/services/transactionService.ts
// Adaptador sobre o Mutation Layer — não grava diretamente no Supabase.
// REGRA CRÍTICA (DT-003): o evento só é emitido APÓS commit confirmado sem erro.
// Nunca emitir antes — risco de XP creditado sem transação real (viola Regra #15).

import { createClient } from '@/lib/supabase/client'
import { eventBus } from '@/lib/events/eventBus'
import { createTransaction } from '@/lib/financial/transactions'
import type { TransactionPayload } from '@/lib/financial/transactions'

interface SaveTransactionParams {
  userId: string
  payload: TransactionPayload
}

interface SaveTransactionResult {
  error: string | null
  isFirstTx: boolean
}

export async function saveTransaction({
  userId,
  payload,
}: SaveTransactionParams): Promise<SaveTransactionResult> {
  const supabase = createClient()

  // Verifica se é a primeira transação antes de inserir
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)

  const isFirstTx = (count ?? 0) === 0

  // Grava via Mutation Layer — nunca .from('transactions').insert() direto
  const result = await createTransaction(payload)

  if (result.error) {
    return { error: result.error, isFirstTx }
  }

  // ✅ Só emite depois do commit confirmado — nunca antes
  eventBus.emit('transaction.created', { userId, isFirstTx })

  return { error: null, isFirstTx }
}