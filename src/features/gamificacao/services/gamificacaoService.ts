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

  // ── Badge: first_transaction / XP base ───────────────────────────────────
  const r1 = await awardXP(
    userId,
    'transaction_created',
    isFirstTx ? 'first_transaction' : undefined,
  )
  if (r1.newBadge) badgeEarned = r1.newBadge

  // ── Contagem total de transações ─────────────────────────────────────────
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const txCount = count ?? 0

  // ── Badge: ten_transactions ───────────────────────────────────────────────
  if (txCount >= 10) {
    const { data: gam } = await supabase
      .from('user_gamification')
      .select('badges')
      .eq('user_id', userId)
      .single()
    const badges: string[] = Array.isArray(gam?.badges) ? gam.badges : []

    if (!badges.includes('ten_transactions')) {
      const r2 = await awardXP(userId, 'transaction_created', 'ten_transactions')
      if (r2.newBadge && !badgeEarned) badgeEarned = r2.newBadge
    }
  }

  // ── Badge: fifty_transactions — >= 50 com guard de duplicata ─────────────
  if (txCount >= 50) {
    const { data: gam } = await supabase
      .from('user_gamification')
      .select('badges')
      .eq('user_id', userId)
      .single()
    const badges: string[] = Array.isArray(gam?.badges) ? gam.badges : []

    if (!badges.includes('fifty_transactions')) {
      const r3 = await awardXP(userId, 'transaction_created', 'fifty_transactions')
      if (r3.newBadge && !badgeEarned) badgeEarned = r3.newBadge
    }
  }

  // ── Badge: all_categorized — todas as despesas do mês têm categoria ───────
  try {
    const now       = new Date()
    const inicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const fimMes    = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString().split('T')[0]

    const { count: uncategorized } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'expense')
      .is('category_id', null)
      .gte('date', inicioMes)
      .lte('date', fimMes)

    const { count: totalExpenses } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('date', inicioMes)
      .lte('date', fimMes)

    // Só concede se há pelo menos 1 despesa e todas estão categorizadas
    if ((totalExpenses ?? 0) > 0 && (uncategorized ?? 0) === 0) {
      const { data: gam } = await supabase
        .from('user_gamification')
        .select('badges')
        .eq('user_id', userId)
        .single()
      const badges: string[] = Array.isArray(gam?.badges) ? gam.badges : []

      if (!badges.includes('all_categorized')) {
        const r4 = await awardXP(userId, 'transaction_categorized', 'all_categorized')
        if (r4.newBadge && !badgeEarned) badgeEarned = r4.newBadge
      }
    }
  } catch (e) {
    console.error('[gamificacaoService] all_categorized error:', e)
  }

  // ── Badge: budget_goal — algum orçamento do mês foi cumprido ─────────────
  try {
    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()

    const { data: budgets } = await supabase
      .from('budgets')
      .select('id, category_id, amount')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)

    if (budgets && budgets.length > 0) {
      const inicioMes = `${year}-${String(month).padStart(2, '0')}-01`
      const fimMes    = new Date(year, month, 0).toISOString().split('T')[0]

      // Soma despesas por categoria no mês
      const { data: txCat } = await supabase
        .from('transactions')
        .select('category_id, amount')
        .eq('user_id', userId)
        .eq('type', 'expense')
        .gte('date', inicioMes)
        .lte('date', fimMes)

      const spentMap: Record<string, number> = {}
      ;(txCat ?? []).forEach((t: { category_id: string | null; amount: number }) => {
        if (!t.category_id) return
        spentMap[t.category_id] = (spentMap[t.category_id] ?? 0) + Number(t.amount)
      })

      // Verifica se algum orçamento foi cumprido (gasto ≤ limite)
      const goalMet = budgets.some(
        (b: { id: string; category_id: string; amount: number }) =>
          (spentMap[b.category_id] ?? 0) <= Number(b.amount)
      )

      if (goalMet) {
        const { data: gam } = await supabase
          .from('user_gamification')
          .select('badges')
          .eq('user_id', userId)
          .single()
        const badges: string[] = Array.isArray(gam?.badges) ? gam.badges : []

        if (!badges.includes('budget_goal')) {
          const r5 = await awardXP(userId, 'budget_goal', 'budget_goal')
          if (r5.newBadge && !badgeEarned) badgeEarned = r5.newBadge
        }
      }
    }
  } catch (e) {
    console.error('[gamificacaoService] budget_goal error:', e)
  }

  return { totalXP, badgeEarned }
}
