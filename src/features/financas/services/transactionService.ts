// src/features/financas/services/transactionService.ts
// Responsável por gravar transações no Supabase e emitir eventos financeiros.
// REGRA CRÍTICA (DT-003): o evento só é emitido APÓS commit confirmado sem erro.
// Nunca emitir antes — risco de XP creditado sem transação real (viola Regra #15).

import { createClient } from '@/lib/supabase/client'
import { eventBus } from '@/lib/events/eventBus'

interface SaveTransactionParams {
  userId: string
  payload: Record<string, unknown>
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

  const isFirstTx = (count ?? 0) === 0

  // Grava no Supabase — para aqui se houver erro
  const { error } = await supabase.from('transactions').insert(payload)

  if (error) {
    return { error: error.message, isFirstTx }
  }

  // ✅ Só emite depois do commit confirmado — nunca antes
  eventBus.emit('transaction.created', { userId, isFirstTx })

  return { error: null, isFirstTx }
}
