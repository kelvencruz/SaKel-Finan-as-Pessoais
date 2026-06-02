// src/lib/financial/accounts.ts
//
// Mutation Layer — tabela accounts
// Todas as escritas em accounts passam obrigatoriamente por este arquivo.
// Páginas e componentes são read-only — nunca chamam .from('accounts') para escrita.
//
// REGRAS:
//  - createClient() chamado internamente — NUNCA receber supabase como argumento
//  - Soft delete obrigatório — NUNCA .delete() físico
//  - Retorno uniforme: MutationResult<T> — nunca lança exceção para a UI

import { createClient } from '@/lib/supabase/client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type MutationResult<T = null> = {
  data:  T | null
  error: string | null
}

export type AccountPayload = {
  user_id:         string
  name:            string
  type:            string
  initial_balance: number
  current_balance: number
  color:           string
  icon:            string | null
  is_active:       boolean
}

export type AccountUpdatePayload = {
  name?:      string
  type?:      string
  color?:     string
  icon?:      string | null
  is_active?: boolean
}

export type AccountRecord = {
  id:              string
  user_id:         string
  name:            string
  type:            string
  initial_balance: number
  current_balance: number
  color:           string
  icon:            string | null
  is_active:       boolean
  deleted_at:      string | null
  created_at:      string
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createAccount(
  payload: AccountPayload
): Promise<MutationResult<{ id: string }>> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('accounts')
      .insert(payload)
      .select('id')
      .single()

    if (error) return { data: null, error: error.message }
    return { data: { id: data.id }, error: null }
  } catch (e) {
    return { data: null, error: String(e) }
  }
}

export async function updateAccount(
  id:     string,
  userId: string,
  patch:  AccountUpdatePayload
): Promise<MutationResult<AccountRecord>> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('accounts')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) return { data: null, error: error.message }
    return { data: data as AccountRecord, error: null }
  } catch (e) {
    return { data: null, error: String(e) }
  }
}

export async function toggleAccount(
  id:       string,
  userId:   string,
  isActive: boolean
): Promise<MutationResult<null>> {
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('accounts')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (e) {
    return { data: null, error: String(e) }
  }
}

export async function softDeleteAccount(
  id:     string,
  userId: string
): Promise<MutationResult<null>> {
  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }
  } catch (e) {
    return { data: null, error: String(e) }
  }
}