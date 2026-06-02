// src/lib/financial/creditCards.ts
//
// Mutation Layer — cartões de crédito
// Toda escrita na tabela credit_cards passa obrigatoriamente por este arquivo.
// Páginas e componentes são read-only — apenas consomem SELECTs e delegam
// escritas para estas funções.
//
// Padrão de retorno: MutationResult<T> — nunca lança exceção para a UI.
// Cliente Supabase: criado internamente via @/lib/supabase/client —
//   NUNCA importar de @/lib/supabase/server.
//   NUNCA receber supabase como argumento vindo da página.

import { createClient } from '@/lib/supabase/client'

// ── tipos ─────────────────────────────────────────────────────────────────────

export interface MutationResult<T = null> {
  data:  T | null
  error: string | null
}

export interface CreditCardRecord {
  id:           string
  user_id:      string
  name:         string
  limit_amount: number
  closing_day:  number
  due_day:      number
  account_id:   string | null
  color:        string | null
  icon:         string | null
  is_active:    boolean
  deleted_at:   string | null
  created_at:   string
}

export interface CreditCardPayload {
  user_id:      string
  name:         string
  limit_amount: number
  closing_day:  number
  due_day:      number
  account_id:   string | null
  color?:       string | null
  icon?:        string | null
}

export interface CreditCardUpdatePayload {
  name?:         string
  limit_amount?: number
  closing_day?:  number
  due_day?:      number
  account_id?:   string | null
  color?:        string | null
  icon?:         string | null
}

// ── createCreditCard ──────────────────────────────────────────────────────────

/**
 * Insere um novo cartão de crédito.
 * Retorna o id gerado em caso de sucesso.
 */
export async function createCreditCard(
  payload: CreditCardPayload
): Promise<MutationResult<{ id: string }>> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('credit_cards')
      .insert({ ...payload, is_active: true })
      .select('id')
      .single()

    if (error) return { data: null, error: error.message }
    return { data: { id: data.id }, error: null }
  } catch (err) {
    return { data: null, error: (err as Error).message ?? 'Erro inesperado ao criar cartão.' }
  }
}

// ── updateCreditCard ──────────────────────────────────────────────────────────

/**
 * Atualiza campos de um cartão existente.
 * Valida user_id para garantir ownership — nunca atualiza de outro usuário.
 */
export async function updateCreditCard(
  id:     string,
  userId: string,
  patch:  CreditCardUpdatePayload
): Promise<MutationResult<CreditCardRecord>> {
  try {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('credit_cards')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select()
      .single()

    if (error) return { data: null, error: error.message }
    return { data: data as CreditCardRecord, error: null }
  } catch (err) {
    return { data: null, error: (err as Error).message ?? 'Erro inesperado ao atualizar cartão.' }
  }
}

// ── toggleCreditCard ──────────────────────────────────────────────────────────

/**
 * Ativa ou desativa um cartão (is_active).
 * Não altera deleted_at — cartão permanece visível, apenas inativo.
 */
export async function toggleCreditCard(
  id:       string,
  userId:   string,
  isActive: boolean
): Promise<MutationResult> {
  try {
    const supabase = createClient()

    const { error } = await supabase
      .from('credit_cards')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: (err as Error).message ?? 'Erro inesperado ao alternar cartão.' }
  }
}

// ── softDeleteCreditCard ──────────────────────────────────────────────────────

/**
 * Soft delete — preenche deleted_at com o timestamp atual.
 * NUNCA usar .delete() físico em credit_cards.
 * Cartões deletados são filtrados via .is('deleted_at', null) nas queries de leitura.
 */
export async function softDeleteCreditCard(
  id:     string,
  userId: string
): Promise<MutationResult<null>> {
  try {
    const supabase = createClient()

    const { error } = await supabase
      .from('credit_cards')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)   // idempotente — não deleta duas vezes

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (err) {
    return { data: null, error: (err as Error).message ?? 'Erro inesperado ao excluir cartão.' }
  }
}