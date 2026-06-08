// src/lib/financial/recurrences.ts
// Mutation Layer — Sakel Finanças Sprint 3
// Boundary de segurança para escrita em recurrences
// CRÍTICO: tabela recurrences NÃO tem deleted_at — nunca usar soft delete aqui
// TD-002 RESOLVIDO — MutationResult unificado com transactions.ts — sessão 39

import { createClient } from '@/lib/supabase/client'
import { parseISO, isValid, differenceInDays } from 'date-fns'
import type { MutationResult } from '@/lib/financial/transactions'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurrenceStatus    = 'active' | 'paused' | 'cancelled'

export type RecurrencePayload = {
  user_id:         string
  description:     string
  amount:          number
  type:            'income' | 'expense'
  frequency:       RecurrenceFrequency
  start_date:      string           // YYYY-MM-DD
  end_date?:       string | null    // YYYY-MM-DD — opcional — INC-S30-002 resolvido Sprint 3.5 D4
  account_id?:     string | null
  credit_card_id?: string | null
  category_id?:    string | null
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const MAX_PAST_DAYS = 90
const VALID_FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']

// ─── Helpers de validação ─────────────────────────────────────────────────────

function validateDate(dateStr: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return 'start_date deve estar no formato YYYY-MM-DD'
  }
  const parsed = parseISO(dateStr)
  if (!isValid(parsed)) {
    return 'start_date não é uma data real'
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysAgo = differenceInDays(today, parsed)
  if (daysAgo > MAX_PAST_DAYS) {
    return `start_date não pode ser anterior a ${MAX_PAST_DAYS} dias atrás`
  }
  return null
}

// ─── createRecurrence ─────────────────────────────────────────────────────────

export async function createRecurrence(
  payload: RecurrencePayload
): Promise<MutationResult<{ id: string }>> {
  try {
    if (!payload.user_id)
      return { data: null, error: 'user_id obrigatório' }
    if (!payload.amount || payload.amount <= 0)
      return { data: null, error: 'amount deve ser maior que zero' }
    if (!VALID_FREQUENCIES.includes(payload.frequency))
      return { data: null, error: `frequency inválida: ${payload.frequency}` }
    if (!payload.start_date)
      return { data: null, error: 'start_date obrigatório' }
    const dateError = validateDate(payload.start_date)
    if (dateError)
      return { data: null, error: dateError }

    const supabase = createClient()

    const { data, error } = await supabase
      .from('recurrences')
      .insert({
        user_id:        payload.user_id,
        description:    payload.description,
        amount:         payload.amount,
        type:           payload.type,
        frequency:      payload.frequency,
        start_date:     payload.start_date,
        end_date:       payload.end_date       ?? null,
        next_due_date:  payload.start_date,
        account_id:     payload.account_id     ?? null,
        credit_card_id: payload.credit_card_id ?? null,
        category_id:    payload.category_id    ?? null,
        status:         'active',
        is_active:      true,
      })
      .select('id')
      .single()

    if (error) return { data: null, error: error.message }
    return { data: { id: data.id }, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

// ─── pauseRecurrence ──────────────────────────────────────────────────────────

export async function pauseRecurrence(
  recurrenceId: string,
  userId: string
): Promise<MutationResult<void>> {
  try {
    if (!recurrenceId) return { data: null, error: 'recurrenceId obrigatório' }
    if (!userId)       return { data: null, error: 'userId obrigatório' }

    const supabase = createClient()

    const { data: current, error: fetchError } = await supabase
      .from('recurrences')
      .select('is_active, status')
      .eq('id', recurrenceId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !current)
      return { data: null, error: 'Recorrência não encontrada' }
    if (!current.is_active && current.status === 'paused')
      return { data: null, error: null }
    if (current.status === 'cancelled')
      return { data: null, error: 'Recorrência cancelada não pode ser pausada' }

    const { error } = await supabase
      .from('recurrences')
      .update({ is_active: false, status: 'paused' })
      .eq('id', recurrenceId)
      .eq('user_id', userId)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

// ─── reactivateRecurrence ─────────────────────────────────────────────────────
// INC-002 resolvido — Sprint 3.5 D4.

export async function reactivateRecurrence(
  recurrenceId: string,
  userId: string
): Promise<MutationResult<void>> {
  try {
    if (!recurrenceId) return { data: null, error: 'recurrenceId obrigatório' }
    if (!userId)       return { data: null, error: 'userId obrigatório' }

    const supabase = createClient()

    const { data: current, error: fetchError } = await supabase
      .from('recurrences')
      .select('is_active, status')
      .eq('id', recurrenceId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !current)
      return { data: null, error: 'Recorrência não encontrada' }
    if (current.is_active && current.status === 'active')
      return { data: null, error: null }
    if (current.status === 'cancelled')
      return { data: null, error: 'Recorrência cancelada não pode ser reativada' }

    const { error } = await supabase
      .from('recurrences')
      .update({ status: 'active', is_active: true })
      .eq('id', recurrenceId)
      .eq('user_id', userId)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

// ─── cancelRecurrence ─────────────────────────────────────────────────────────

export async function cancelRecurrence(
  recurrenceId: string,
  userId: string
): Promise<MutationResult<void>> {
  try {
    if (!recurrenceId) return { data: null, error: 'recurrenceId obrigatório' }
    if (!userId)       return { data: null, error: 'userId obrigatório' }

    const supabase = createClient()

    const { data: current, error: fetchError } = await supabase
      .from('recurrences')
      .select('status')
      .eq('id', recurrenceId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !current)
      return { data: null, error: 'Recorrência não encontrada' }
    if (current.status === 'cancelled')
      return { data: null, error: null }

    const { error } = await supabase
      .from('recurrences')
      .update({ status: 'cancelled', is_active: false })
      .eq('id', recurrenceId)
      .eq('user_id', userId)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

// ─── updateRecurrence ─────────────────────────────────────────────────────────
//
// Atualiza campos editáveis de uma recorrência.
// NÃO permite alterar status — usar pauseRecurrence() / cancelRecurrence() / reactivateRecurrence().
// NÃO permite alterar is_active diretamente — mesmo motivo.
// user_id em todo .eq() — boundary multi-usuário.

export type RecurrenceUpdatePayload = Partial<{
  description:    string
  amount:         number
  frequency:      RecurrenceFrequency
  end_date:       string | null        // INC-S31-001 resolvido Sprint 3.5 D5
  account_id:     string | null
  credit_card_id: string | null
  category_id:    string | null
  next_due_date:  string               // YYYY-MM-DD
}>

export async function updateRecurrence(
  recurrenceId: string,
  userId: string,
  payload: RecurrenceUpdatePayload
): Promise<MutationResult<void>> {
  try {
    if (!recurrenceId) return { data: null, error: 'recurrenceId obrigatório' }
    if (!userId)       return { data: null, error: 'userId obrigatório' }

    if (payload.amount !== undefined && payload.amount <= 0)
      return { data: null, error: 'amount deve ser maior que zero' }
    if (payload.frequency !== undefined && !VALID_FREQUENCIES.includes(payload.frequency))
      return { data: null, error: `frequency inválida: ${payload.frequency}` }
    if (payload.next_due_date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(payload.next_due_date))
      return { data: null, error: 'next_due_date deve estar no formato YYYY-MM-DD' }
    if (payload.description !== undefined && !payload.description.trim())
      return { data: null, error: 'description não pode ser vazia' }

    const supabase = createClient()

    const { data: current, error: fetchError } = await supabase
      .from('recurrences')
      .select('status')
      .eq('id', recurrenceId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !current)
      return { data: null, error: 'Recorrência não encontrada' }
    if (current.status === 'cancelled')
      return { data: null, error: 'Recorrência cancelada não pode ser editada' }

    const { error } = await supabase
      .from('recurrences')
      .update({
        ...payload,
        description: payload.description?.trim(),
      })
      .eq('id', recurrenceId)
      .eq('user_id', userId)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}