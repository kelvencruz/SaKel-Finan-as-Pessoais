import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'

export interface GamificationResult {
  totalXP: number
  badgeEarned: string | null
}

/**
 * Executa toda a lógica de XP e badges após uma transação ser criada.
 * Não concede XP em edições — apenas em criações.
 */
export async function processTransactionCreated(
  userId: string,
  isFirstTx: boolean,
): Promise<GamificationResult> {
  const supabase = createClient()

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('gamification_enabled')
    .eq('user_id', userId)
    .single()

  const gamEnabled = prefs?.gamification_enabled ?? true
  if (!gamEnabled) return { totalXP: 0, badgeEarned: null }

  const totalXP = 10
  let badgeEarned: string | null = null

  const r1 = await awardXP(
    userId,
    'transaction_created',
    isFirstTx ? 'first_transaction' : undefined,
  )
  if (r1.newBadge) badgeEarned = r1.newBadge

  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (count === 10) {
    const r2 = await awardXP(userId, 'transaction_created', 'ten_transactions')
    if (r2.newBadge && !badgeEarned) badgeEarned = r2.newBadge
  }

  if (count === 50) {
    const r3 = await awardXP(userId, 'transaction_created', 'fifty_transactions')
    if (r3.newBadge && !badgeEarned) badgeEarned = r3.newBadge
  }

  return { totalXP, badgeEarned }
}
