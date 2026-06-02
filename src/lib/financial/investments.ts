import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type MutationResult<T = void> = {
  data: T | null
  error: string | null
}

export type InvestmentPayload = {
  user_id: string
  name: string
  type: string
  initial_amount: number
  current_amount: number
  goal_id?: string | null
  profitability?: string | null
  liquidity_type?: string | null
  liquidity_date?: string | null   // ISO date 'YYYY-MM-DD'
  institution?: string | null
  notes?: string | null
  start_date?: string | null       // ISO date 'YYYY-MM-DD'
}

export type InvestmentUpdatePayload = Partial<Omit<
  InvestmentPayload,
  'user_id'                        // imutável após criação
>>

export type InvestmentRecord = {
  id: string
  user_id: string
  goal_id: string | null
  name: string
  type: string
  initial_amount: number
  current_amount: number
  profitability: string | null
  liquidity_type: string | null
  liquidity_date: string | null
  institution: string | null
  notes: string | null
  is_active: boolean
  start_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// ---------------------------------------------------------------------------
// createInvestment
// ---------------------------------------------------------------------------

export async function createInvestment(
  payload: InvestmentPayload
): Promise<MutationResult<{ id: string }>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('investments')
      .insert({
        ...payload,
        is_active: true,
        deleted_at: null,
      })
      .select('id')
      .single()

    if (error) return { data: null, error: error.message }

    return { data: { id: data.id }, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

// ---------------------------------------------------------------------------
// updateInvestment
// ---------------------------------------------------------------------------

export async function updateInvestment(
  id: string,
  userId: string,
  patch: InvestmentUpdatePayload
): Promise<MutationResult<InvestmentRecord>> {
  try {
    if (!userId) return { data: null, error: 'user_id obrigatório' }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('investments')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select()
      .single()

    if (error) return { data: null, error: error.message }

    return { data: data as InvestmentRecord, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

// ---------------------------------------------------------------------------
// toggleInvestment
// ---------------------------------------------------------------------------

export async function toggleInvestment(
  id: string,
  userId: string,
  isActive: boolean
): Promise<MutationResult> {
  try {
    if (!userId) return { data: null, error: 'user_id obrigatório' }

    const supabase = await createClient()

    const { error } = await supabase
      .from('investments')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)

    if (error) return { data: null, error: error.message }

    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

// ---------------------------------------------------------------------------
// softDeleteInvestment
// ---------------------------------------------------------------------------

export async function softDeleteInvestment(
  id: string,
  userId: string
): Promise<MutationResult> {
  try {
    if (!userId) return { data: null, error: 'user_id obrigatório' }

    const supabase = await createClient()

    const { error } = await supabase
      .from('investments')
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)        // idempotência — não reescreve se já deletado

    if (error) return { data: null, error: error.message }

    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}