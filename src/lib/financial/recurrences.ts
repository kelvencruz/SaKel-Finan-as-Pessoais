// src/lib/financial/recurrences.ts
// Mutation Layer — Sakel Finanças Sprint 3
// Boundary de segurança para escrita em recurrences
// CRÍTICO: tabela recurrences NÃO tem deleted_at — nunca usar soft delete aqui

import { createClient } from '@/lib/supabase/client'
import { parseISO, isValid, differenceInDays } from 'date-fns'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurrenceStatus    = 'active' | 'paused' | 'cancelled'

export type RecurrencePayload = {
  user_id:        string
  description:    string
  amount:         number
  type:           'income' | 'expense'
  frequency:      RecurrenceFrequency
  start_date:     string          // YYYY-MM-DD
  account_id?:    string | null
  credit_card_id?: string | null
  category_id?:   string | null
}

export type MutationResult<T> = {
  success: boolean
  data?:   T
  error?:  string
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/**
 * Janela máxima de start_date no passado.
 * Evita recurrence_stalled imediato — ruído criado pela própria aplicação.
 */
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
    // Invariantes
    if (!payload.user_id) {
      return { success: false, error: 'user_id obrigatório' }
    }
    if (!payload.amount || payload.amount <= 0) {
      return { success: false, error: 'amount deve ser maior que zero' }
    }
    if (!VALID_FREQUENCIES.includes(payload.frequency)) {
      return { success: false, error: `frequency inválida: ${payload.frequency}` }
    }
    if (!payload.start_date) {
      return { success: false, error: 'start_date obrigatório' }
    }
    const dateError = validateDate(payload.start_date)
    if (dateError) {
      return { success: false, error: dateError }
    }

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
        next_due_date:  payload.start_date,   // engine começa pelo start_date
        account_id:     payload.account_id    ?? null,
        credit_card_id: payload.credit_card_id ?? null,
        category_id:    payload.category_id   ?? null,
        status:         'active',
        is_active:      true,
      })
      .select('id')
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ─── pauseRecurrence ──────────────────────────────────────────────────────────

export async function pauseRecurrence(
  recurrenceId: string,
  userId: string
): Promise<MutationResult<void>> {
  try {
    if (!recurrenceId) return { success: false, error: 'recurrenceId obrigatório' }
    if (!userId)       return { success: false, error: 'userId obrigatório' }

    const supabase = createClient()

    // Lê estado atual — pré-condição: is_active === true
    const { data: current, error: fetchError } = await supabase
      .from('recurrences')
      .select('is_active, status')
      .eq('id', recurrenceId)
      .eq('user_id', userId)         // boundary multi-usuário
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Recorrência não encontrada' }
    }

    // Idempotência: já pausada → success sem reescrita
    if (!current.is_active && current.status === 'paused') {
      return { success: true }
    }

    // Cancelada é imutável — não pode pausar
    if (current.status === 'cancelled') {
      return { success: false, error: 'Recorrência cancelada não pode ser pausada' }
    }

    const { error } = await supabase
      .from('recurrences')
      .update({ is_active: false, status: 'paused' })
      .eq('id', recurrenceId)
      .eq('user_id', userId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ─── cancelRecurrence ─────────────────────────────────────────────────────────
//
// Estratégia dupla intencional — cada campo tem papel distinto:
//   is_active = false → para o process-recurrences (único filtro da engine)
//   status = 'cancelled' → semântica para a UI
//
// Confirmado via leitura direta de process-recurrences/index.ts (sessão 22):
// a engine filtra SOMENTE por is_active — status não é lido na query de seleção.

export async function cancelRecurrence(
  recurrenceId: string,
  userId: string
): Promise<MutationResult<void>> {
  try {
    if (!recurrenceId) return { success: false, error: 'recurrenceId obrigatório' }
    if (!userId)       return { success: false, error: 'userId obrigatório' }

    const supabase = createClient()

    const { data: current, error: fetchError } = await supabase
      .from('recurrences')
      .select('status')
      .eq('id', recurrenceId)
      .eq('user_id', userId)         // boundary multi-usuário
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Recorrência não encontrada' }
    }

    // Idempotência: já cancelada → success sem reescrita
    if (current.status === 'cancelled') {
      return { success: true }
    }

    const { error } = await supabase
      .from('recurrences')
      .update({
        status:    'cancelled',
        is_active: false,
      })
      .eq('id', recurrenceId)
      .eq('user_id', userId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
// ─── updateRecurrence ─────────────────────────────────────────────────────────
//
// Atualiza campos editáveis de uma recorrência.
// NÃO permite alterar status — usar pauseRecurrence() / cancelRecurrence().
// NÃO permite alterar is_active diretamente — mesmo motivo.
// user_id em todo .eq() — boundary multi-usuário.

export type RecurrenceUpdatePayload = Partial<{
  description:    string
  amount:         number
  frequency:      RecurrenceFrequency
  account_id:     string | null
  credit_card_id: string | null
  category_id:    string | null
  next_due_date:  string   // YYYY-MM-DD — ex: corrigir data após edição
}>

export async function updateRecurrence(
  recurrenceId: string,
  userId: string,
  payload: RecurrenceUpdatePayload
): Promise<MutationResult<void>> {
  try {
    if (!recurrenceId) return { success: false, error: 'recurrenceId obrigatório' }
    if (!userId)       return { success: false, error: 'userId obrigatório' }

    // Invariantes do payload
    if (payload.amount !== undefined && payload.amount <= 0) {
      return { success: false, error: 'amount deve ser maior que zero' }
    }
    if (payload.frequency !== undefined && !VALID_FREQUENCIES.includes(payload.frequency)) {
      return { success: false, error: `frequency inválida: ${payload.frequency}` }
    }
    if (payload.next_due_date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(payload.next_due_date)) {
      return { success: false, error: 'next_due_date deve estar no formato YYYY-MM-DD' }
    }
    if (payload.description !== undefined && !payload.description.trim()) {
      return { success: false, error: 'description não pode ser vazia' }
    }

    const supabase = createClient()

    // Confirma existência + boundary antes de escrever
    const { data: current, error: fetchError } = await supabase
      .from('recurrences')
      .select('status')
      .eq('id', recurrenceId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !current) {
      return { success: false, error: 'Recorrência não encontrada' }
    }

    // Cancelada é imutável — não edita
    if (current.status === 'cancelled') {
      return { success: false, error: 'Recorrência cancelada não pode ser editada' }
    }

    const { error } = await supabase
      .from('recurrences')
      .update({
        ...payload,
        description: payload.description?.trim(),
      })
      .eq('id', recurrenceId)
      .eq('user_id', userId)   // boundary multi-usuário

    if (error) return { success: false, error: error.message }

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}