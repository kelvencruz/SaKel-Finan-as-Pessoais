// src/lib/financial/transactions.ts
//
// Mutation Layer — boundary único para escrita em `transactions`.
// REGRA ARQUITETURAL: nenhuma página ou componente chama .from('transactions')
// para escrita diretamente. Toda mutation passa por aqui.
//
// Princípios:
//   1. Valida payload antes de tocar o banco
//   2. Verifica invariantes financeiros em código — não só por disciplina humana
//   3. Side-effects vivem aqui (updateInvoiceTotal) — não nas páginas
//   4. user_id sempre validado — boundary de segurança multi-usuário
//   5. Soft delete obrigatório — nunca .delete() em tabelas financeiras
//   6. Toda função retorna { data, error } — nunca lança exceção para a UI

import { createClient } from '@/lib/supabase/client'
import type { TransactionType, TransactionStatus } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos do Mutation Layer
// ─────────────────────────────────────────────────────────────────────────────

export interface TransactionPayload {
  user_id:                string
  type:                   TransactionType
  description:            string
  amount:                 number
  date:                   string           // ISO: YYYY-MM-DD
  status:                 TransactionStatus
  account_id:             string | null
  destination_account_id?: string | null
  category_id:            string | null
  goal_id:                string | null
  notes:                  string | null
  credit_card_id:         string | null
  invoice_id:             string | null
  is_recurring?:          boolean
  recurrence_id?:         string | null
  is_installment?:        boolean
  installment_group?:     string | null
  installment_current?:   number | null
  installment_total?:     number | null
}

export interface MutationResult<T = null> {
  data:  T | null
  error: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariantes financeiras
// Verificadas em código — falha ruidosa, nunca silenciosa.
// ─────────────────────────────────────────────────────────────────────────────

function assertLedgerInvariant(payload: TransactionPayload): string | null {
  // INV-001: CANCELLED nunca entra no ledger como novo registro
  if (payload.status === 'cancelled') {
    return 'INV-001: Transação com status CANCELLED não pode ser criada diretamente.'
  }

  // INV-002: valor deve ser positivo
  if (!isFinite(payload.amount) || payload.amount <= 0) {
    return 'INV-002: Valor deve ser um número finito maior que zero.'
  }

  // INV-003: transfer exige account_id e destination_account_id distintos
  if (payload.type === 'transfer') {
    if (!payload.account_id || !payload.destination_account_id) {
      return 'INV-003: Transferência exige conta de origem e destino.'
    }
    if (payload.account_id === payload.destination_account_id) {
      return 'INV-003: Conta de origem e destino não podem ser iguais.'
    }
  }

  // INV-004: expense/income sem cartão exige account_id
  if (payload.type !== 'transfer' && !payload.credit_card_id && !payload.account_id) {
    return 'INV-004: Transação sem cartão exige account_id.'
  }

  // INV-005: expense com cartão exige invoice_id
  if (payload.type === 'expense' && payload.credit_card_id && !payload.invoice_id) {
    return 'INV-005: Despesa no cartão exige invoice_id — fatura não resolvida.'
  }

  // INV-006: recurrence_id exige is_recurring = true
  if (payload.recurrence_id && !payload.is_recurring) {
    return 'INV-006: recurrence_id exige is_recurring = true.'
  }

  // INV-007: parcelamento exige campos de installment completos
  if (payload.is_installment) {
    if (!payload.installment_group || !payload.installment_current || !payload.installment_total) {
      return 'INV-007: Parcelamento exige installment_group, installment_current e installment_total.'
    }
    if (payload.installment_current < 1 || payload.installment_current > payload.installment_total) {
      return 'INV-007: installment_current fora do intervalo válido.'
    }
  }

  // INV-008: user_id não pode ser vazio — boundary multi-usuário
  if (!payload.user_id?.trim()) {
    return 'INV-008: user_id é obrigatório.'
  }

  // INV-009: descrição não pode ser vazia
  if (!payload.description?.trim()) {
    return 'INV-009: Descrição é obrigatória.'
  }

  // INV-010: date deve estar no formato YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    return 'INV-010: Data deve estar no formato YYYY-MM-DD.'
  }

  return null // todas as invariantes passaram
}

// ─────────────────────────────────────────────────────────────────────────────
// Side-effect: atualiza total da fatura após escrita em transactions
// Copiado de NovaTransacaoModal e centralizado aqui.
// Todas as mutations que tocam invoice_id devem chamar este side-effect.
// ─────────────────────────────────────────────────────────────────────────────

async function syncInvoiceTotal(invoiceId: string): Promise<void> {
  const supabase = createClient()
  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)                      // FIN-001: soft-delete consistente

  const total = (data ?? []).reduce((s, t) => s + Number(t.amount), 0)
  await supabase
    .from('credit_card_invoices')
    .update({ total_amount: total })
    .eq('id', invoiceId)
}

// ─────────────────────────────────────────────────────────────────────────────
// createTransaction
// Única entrada válida para INSERT em transactions.
// ─────────────────────────────────────────────────────────────────────────────

export async function createTransaction(
  payload: TransactionPayload
): Promise<MutationResult<{ id: string }>> {
  // 1. Invariantes
  const invariantError = assertLedgerInvariant(payload)
  if (invariantError) return { data: null, error: invariantError }

  const supabase = createClient()

  // 2. Escrita no banco
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id:                payload.user_id,
      type:                   payload.type,
      description:            payload.description.trim(),
      amount:                 payload.amount,
      date:                   payload.date,
      status:                 payload.status,
      account_id:             payload.account_id ?? null,
      destination_account_id: payload.destination_account_id ?? null,
      category_id:            payload.category_id ?? null,
      goal_id:                payload.goal_id ?? null,
      notes:                  payload.notes?.trim() || null,
      credit_card_id:         payload.credit_card_id ?? null,
      invoice_id:             payload.invoice_id ?? null,
      is_recurring:           payload.is_recurring ?? false,
      recurrence_id:          payload.recurrence_id ?? null,
      is_installment:         payload.is_installment ?? false,
      installment_group:      payload.installment_group ?? null,
      installment_current:    payload.installment_current ?? null,
      installment_total:      payload.installment_total ?? null,
    })
    .select('id')
    .single()

  if (error) return { data: null, error: error.message }

  // 3. Side-effect: sincroniza total da fatura se aplicável
  if (payload.invoice_id) {
    await syncInvoiceTotal(payload.invoice_id)
  }

  return { data: { id: data.id }, error: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// updateTransaction
// Atualiza campos editáveis. Nunca altera user_id ou campos de auditoria.
// ─────────────────────────────────────────────────────────────────────────────

export type TransactionUpdatePayload = Partial<
  Pick<
    TransactionPayload,
    | 'description'
    | 'amount'
    | 'date'
    | 'status'
    | 'account_id'
    | 'category_id'
    | 'goal_id'
    | 'notes'
    | 'invoice_id'
    | 'credit_card_id'
  >
>

export async function updateTransaction(
  id: string,
  userId: string,
  patch: TransactionUpdatePayload
): Promise<MutationResult> {
  // Guarda de segurança: user_id sempre validado
  if (!userId?.trim()) return { data: null, error: 'INV-008: user_id é obrigatório.' }
  if (!id?.trim())     return { data: null, error: 'id da transação é obrigatório.' }

  // Validações locais do patch
  if (patch.amount !== undefined && (isNaN(patch.amount) || patch.amount <= 0)) {
    return { data: null, error: 'INV-002: Valor deve ser maior que zero.' }
  }
  if (patch.status === 'cancelled') {
    return { data: null, error: 'INV-001: Use softDeleteTransaction para cancelar — não updateTransaction.' }
  }
  if (patch.description !== undefined && !patch.description.trim()) {
    return { data: null, error: 'INV-009: Descrição não pode ser vazia.' }
  }

  const supabase = createClient()

  // Busca invoice_id anterior para re-sync se invoice mudar
  const { data: current } = await supabase
    .from('transactions')
    .select('invoice_id')
    .eq('id', id)
    .eq('user_id', userId)                       // boundary multi-usuário
    .is('deleted_at', null)
    .single()

  if (!current) return { data: null, error: 'Transação não encontrada ou sem permissão.' }

  const { error } = await supabase
    .from('transactions')
    .update({
      ...patch,
      description: patch.description?.trim(),
      notes:       patch.notes?.trim() || null,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)                       // boundary multi-usuário
    .is('deleted_at', null)

  if (error) return { data: null, error: error.message }

  // Side-effect: re-sync fatura anterior e nova (se mudou)
  const invoicesBefore = new Set<string>()
  if (current.invoice_id)  invoicesBefore.add(current.invoice_id)
  if (patch.invoice_id)    invoicesBefore.add(patch.invoice_id)

  for (const invoiceId of invoicesBefore) {
    await syncInvoiceTotal(invoiceId)
  }

  return { data: null, error: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// softDeleteTransaction
// Marca deleted_at — NUNCA chama .delete().
// Regra inviolável: NUNCA .delete() em tabelas financeiras.
// ─────────────────────────────────────────────────────────────────────────────

export async function softDeleteTransaction(
  id: string,
  userId: string
): Promise<MutationResult> {
  if (!userId?.trim()) return { data: null, error: 'INV-008: user_id é obrigatório.' }
  if (!id?.trim())     return { data: null, error: 'id da transação é obrigatório.' }

  const supabase = createClient()

  // Busca invoice_id antes de deletar para re-sync depois
  const { data: current } = await supabase
    .from('transactions')
    .select('invoice_id')
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()

  if (!current) return { data: null, error: 'Transação não encontrada ou já deletada.' }

  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)                       // boundary multi-usuário

  if (error) return { data: null, error: error.message }

  // Side-effect: re-sync fatura (transação deletada sai do total)
  if (current.invoice_id) {
    await syncInvoiceTotal(current.invoice_id)
  }

  return { data: null, error: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// restoreTransaction
// Limpa deleted_at. Restaura transação previamente soft-deleted.
// Atenção: se houver conflito de unique constraint, resolver antes de restaurar.
// ─────────────────────────────────────────────────────────────────────────────

export async function restoreTransaction(
  id: string,
  userId: string
): Promise<MutationResult> {
  if (!userId?.trim()) return { data: null, error: 'INV-008: user_id é obrigatório.' }
  if (!id?.trim())     return { data: null, error: 'id da transação é obrigatório.' }

  const supabase = createClient()

  // Confirma que o registro existe e está de fato deletado
  const { data: current } = await supabase
    .from('transactions')
    .select('id, invoice_id')
    .eq('id', id)
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)               // só restaura se estiver deletado
    .single()

  if (!current) return { data: null, error: 'Transação não encontrada ou não está deletada.' }

  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return { data: null, error: error.message }

  // Side-effect: re-sync fatura (transação restaurada volta ao total)
  if (current.invoice_id) {
    await syncInvoiceTotal(current.invoice_id)
  }

  return { data: null, error: null }
}