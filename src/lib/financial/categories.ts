// src/lib/financial/categories.ts
// Mutation Layer — categorias
//
// REGRAS INVIOLÁVEIS:
//   - Toda escrita em categories passa por aqui — páginas não chamam .from() para escrita
//   - NUNCA .delete() físico — soft delete via deleted_at obrigatório
//   - user_id sempre validado — boundary multi-usuário
//   - Retorno uniforme MutationResult<T> — nunca lança exceção para a UI

import { createClient } from '@/lib/supabase/client'
import type { MutationResult } from '@/lib/financial/transactions'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CategoryType = 'income' | 'expense' | 'both' | 'investment'

export interface CategoryPayload {
  user_id:   string
  name:      string
  type:      CategoryType
  color:     string | null
  icon:      string | null
  parent_id: string | null
}

export interface CategoryUpdatePayload {
  name?:  string
  type?:  CategoryType
  color?: string | null
  icon?:  string | null
}

export interface CategoryRecord {
  id:         string
  user_id:    string
  parent_id:  string | null
  name:       string
  type:       CategoryType
  color:      string | null
  icon:       string | null
  created_at: string
  deleted_at: string | null
}

// ─── createCategory ───────────────────────────────────────────────────────────

export async function createCategory(
  payload: CategoryPayload,
): Promise<MutationResult<{ id: string }>> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase
      .from('categories')
      .insert({
        user_id:   payload.user_id,
        name:      payload.name.trim(),
        type:      payload.type,
        color:     payload.color,
        icon:      payload.icon,
        parent_id: payload.parent_id,
      })
      .select('id')
      .single()

    if (error) return { data: null, error: error.message }
    return { data: { id: data.id }, error: null }

  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao criar categoria.' }
  }
}

// ─── updateCategory ───────────────────────────────────────────────────────────

export async function updateCategory(
  id: string,
  userId: string,
  patch: CategoryUpdatePayload,
): Promise<MutationResult<CategoryRecord>> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase
      .from('categories')
      .update({
        ...(patch.name  !== undefined && { name:  patch.name.trim() }),
        ...(patch.type  !== undefined && { type:  patch.type }),
        ...(patch.color !== undefined && { color: patch.color }),
        ...(patch.icon  !== undefined && { icon:  patch.icon }),
      })
      .eq('id',      id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select()
      .single()

    if (error) return { data: null, error: error.message }
    return { data: data as CategoryRecord, error: null }

  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao atualizar categoria.' }
  }
}

// ─── softDeleteCategory ───────────────────────────────────────────────────────

export async function softDeleteCategory(
  id: string,
  userId: string,
): Promise<MutationResult<null>> {
  const supabase = createClient()

  try {
    const { error } = await supabase
      .from('categories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id',      id)
      .eq('user_id', userId)
      .is('deleted_at', null)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }

  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao excluir categoria.' }
  }
}

// ─── restoreCategory ──────────────────────────────────────────────────────────

export async function restoreCategory(
  id: string,
  userId: string,
): Promise<MutationResult<null>> {
  const supabase = createClient()

  try {
    const { error } = await supabase
      .from('categories')
      .update({ deleted_at: null })
      .eq('id',      id)
      .eq('user_id', userId)

    if (error) return { data: null, error: error.message }
    return { data: null, error: null }

  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao restaurar categoria.' }
  }
}