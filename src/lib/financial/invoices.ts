// src/lib/financial/invoices.ts
// Mutation Layer — faturas (credit_card_invoices)
//
// REGRAS INVIOLÁVEIS:
//   - Toda escrita em credit_card_invoices passa por aqui — páginas não chamam .from() para escrita
//   - payInvoice() cria a transaction de pagamento via createTransaction() — nunca .insert() direto
//   - user_id sempre validado — boundary multi-usuário
//   - Retorno uniforme MutationResult<T> — nunca lança exceção para a UI
//   - soft delete obrigatório se aplicável — invoices usam status 'cancelled', não deleted_at
//   - syncInvoiceTotal não se aplica aqui — invoice.total_amount é gerenciado pelo layer de transactions

import { createClient } from '@/lib/supabase/client'
import { createTransaction } from '@/lib/financial/transactions'
import type { MutationResult } from '@/lib/financial/transactions'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'open' | 'closed' | 'paid' | 'cancelled'

export interface PayInvoicePayload {
  invoiceId:     string
  userId:        string
  accountId:     string
  amount:        number
  cardName:      string
  invoiceMonth:  number
  invoiceYear:   number
}

export interface UpdateInvoiceStatusPayload {
  invoiceId: string
  userId:    string
  status:    InvoiceStatus
}

export interface InvoiceRecord {
  id:               string
  credit_card_id:   string
  user_id:          string
  month:            number
  year:             number
  total_amount:     number
  status:           InvoiceStatus
  due_date:         string
  paid_at:          string | null
  paid_account_id:  string | null
}

export interface InvoiceRef {
  cardId:     string
  date:       string
  userId:     string
  closingDay: number
  dueDay:     number
}

// ─── Invariantes ──────────────────────────────────────────────────────────────

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function assertInvoiceInvariant(condition: boolean, message: string): void {
  if (!condition) throw new Error(`[InvoiceLayer] ${message}`)
}

// ─── updateInvoiceStatus ──────────────────────────────────────────────────────

export async function updateInvoiceStatus(
  payload: UpdateInvoiceStatusPayload,
): Promise<MutationResult<InvoiceRecord>> {
  const supabase = createClient()

  try {
    assertInvoiceInvariant(!!payload.invoiceId, 'invoiceId é obrigatório')
    assertInvoiceInvariant(!!payload.userId,    'userId é obrigatório — boundary multi-usuário')
    assertInvoiceInvariant(!!payload.status,    'status é obrigatório')

    const { data: current, error: fetchErr } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('id',      payload.invoiceId)
      .eq('user_id', payload.userId)
      .maybeSingle()

    if (fetchErr) return { data: null, error: fetchErr.message }
    if (!current) return { data: null, error: 'Fatura não encontrada.' }

    assertInvoiceInvariant(
      current.status !== 'paid',
      'Fatura já paga não pode ter status alterado. Use payInvoice() para registrar pagamento.',
    )
    assertInvoiceInvariant(
      current.status !== 'cancelled',
      'Fatura cancelada não pode ser reaberta ou alterada.',
    )
    assertInvoiceInvariant(
      payload.status !== 'paid',
      'Para marcar fatura como paga, use payInvoice() — que cria a transaction de débito obrigatoriamente.',
    )

    const { data, error } = await supabase
      .from('credit_card_invoices')
      .update({ status: payload.status })
      .eq('id',      payload.invoiceId)
      .eq('user_id', payload.userId)
      .select()
      .single()

    if (error) return { data: null, error: error.message }

    return { data: data as InvoiceRecord, error: null }

  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao atualizar status da fatura.' }
  }
}

// ─── payInvoice ───────────────────────────────────────────────────────────────

export async function payInvoice(
  payload: PayInvoicePayload,
): Promise<MutationResult<InvoiceRecord>> {
  const supabase = createClient()

  try {
    assertInvoiceInvariant(!!payload.invoiceId,   'invoiceId é obrigatório')
    assertInvoiceInvariant(!!payload.userId,       'userId é obrigatório — boundary multi-usuário')
    assertInvoiceInvariant(!!payload.accountId,    'accountId é obrigatório para debitar o pagamento')
    assertInvoiceInvariant(!!payload.cardName,     'cardName é obrigatório para descrição da transaction')
    assertInvoiceInvariant(Number.isFinite(payload.amount) && payload.amount > 0, 'amount deve ser número finito positivo')
    assertInvoiceInvariant(payload.invoiceMonth >= 1 && payload.invoiceMonth <= 12, 'invoiceMonth inválido')
    assertInvoiceInvariant(payload.invoiceYear > 2000, 'invoiceYear inválido')

    const { data: current, error: fetchErr } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('id',      payload.invoiceId)
      .eq('user_id', payload.userId)
      .maybeSingle()

    if (fetchErr) return { data: null, error: fetchErr.message }
    if (!current) return { data: null, error: 'Fatura não encontrada.' }

    assertInvoiceInvariant(current.status !== 'paid',      'Fatura já foi paga.')
    assertInvoiceInvariant(current.status !== 'cancelled', 'Fatura cancelada não pode ser paga.')

    // ── Step 1: cria transaction de débito via Mutation Layer ──────────────────
    const monthLabel = MONTHS_PT[payload.invoiceMonth - 1] ?? String(payload.invoiceMonth)

    const txResult = await createTransaction({
      user_id:        payload.userId,
      account_id:     payload.accountId,
      type:           'expense',
      amount:         payload.amount,
      description:    `Pagamento fatura ${payload.cardName} ${monthLabel}/${payload.invoiceYear}`,
      date:           new Date().toISOString().split('T')[0],
      status:         'paid',
      category_id:    null,
      goal_id:        null,
      notes:          null,
      credit_card_id: null,
      invoice_id:     null,
    })

    if (txResult.error) {
      return { data: null, error: `Erro ao registrar pagamento: ${txResult.error}` }
    }

    // ── Step 2: atualiza status da fatura ──────────────────────────────────────
    const paidAt = new Date().toISOString()

    const { data, error: updateErr } = await supabase
      .from('credit_card_invoices')
      .update({
        status:          'paid',
        paid_at:         paidAt,
        paid_account_id: payload.accountId,
      })
      .eq('id',      payload.invoiceId)
      .eq('user_id', payload.userId)
      .select()
      .single()

    if (updateErr) {
      console.error('[InvoiceLayer] payInvoice: transaction criada mas status não atualizado', {
        invoiceId: payload.invoiceId,
        txId:      txResult.data?.id,
        error:     updateErr.message,
      })
      return { data: null, error: `Pagamento registrado, mas erro ao atualizar fatura: ${updateErr.message}` }
    }

    return { data: data as InvoiceRecord, error: null }

  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Erro ao processar pagamento da fatura.' }
  }
}

// ─── getOrCreateInvoice ───────────────────────────────────────────────────────
// Resolve a fatura de cartão para um dado (credit_card_id, date).
// Cria a fatura se ainda não existir para o mês/ano calculado a partir do
// closing_day do cartão. Retorna o invoice_id ou null em caso de falha.
// Segue o padrão do layer: createClient() interno — não recebe supabase externo.

export async function getOrCreateInvoice(
  ref: InvoiceRef,
): Promise<string | null> {
  const supabase = createClient()
  const { cardId, date, userId, closingDay, dueDay } = ref

  const d = new Date(date + 'T12:00:00')

  let month = d.getMonth() + 1
  let year  = d.getFullYear()

  if (d.getDate() > closingDay) {
    month = month === 12 ? 1 : month + 1
    year  = month === 1  ? year + 1 : year
  }

  const { data: existing } = await supabase
    .from('credit_card_invoices')
    .select('id')
    .eq('credit_card_id', cardId)
    .eq('user_id', userId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle()

  if (existing) return existing.id

  const dueMonth = month === 12 ? 1 : month + 1
  const dueYear  = month === 12 ? year + 1 : year
  const dueDate  = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`

  const { data: created } = await supabase
    .from('credit_card_invoices')
    .insert({
      credit_card_id: cardId,
      user_id:        userId,
      month,
      year,
      total_amount:   0,
      status:         'open',
      due_date:       dueDate,
    })
    .select('id')
    .single()

  return created?.id ?? null
}