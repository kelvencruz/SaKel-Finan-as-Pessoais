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
  amount:        number           // computedTotal — nunca total_amount bruto
  cardName:      string           // para descrição da transaction
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

// ─── Invariantes ──────────────────────────────────────────────────────────────

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function assertInvoiceInvariant(condition: boolean, message: string): void {
  if (!condition) throw new Error(`[InvoiceLayer] ${message}`)
}

// ─── updateInvoiceStatus ─────────────────────────────────────────────────────
//
// Atualiza o status de uma fatura.
// Uso principal: fechar fatura manualmente (open → closed) ou cancelar.
// Para marcar como paga, usar payInvoice() — que também cria a transaction de débito.
//
// Transições permitidas:
//   open      → closed | cancelled
//   closed    → open   | paid | cancelled   (reabertura ou correção)
//   paid      → (bloqueado — fatura paga é imutável)
//   cancelled → (bloqueado — fatura cancelada é imutável)

export async function updateInvoiceStatus(
  payload: UpdateInvoiceStatusPayload,
): Promise<MutationResult<InvoiceRecord>> {
  const supabase = createClient()

  try {
    // INV-INV-001: campos obrigatórios
    assertInvoiceInvariant(!!payload.invoiceId, 'invoiceId é obrigatório')
    assertInvoiceInvariant(!!payload.userId,    'userId é obrigatório — boundary multi-usuário')
    assertInvoiceInvariant(!!payload.status,    'status é obrigatório')

    // Busca fatura atual para validar transição
    const { data: current, error: fetchErr } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('id',      payload.invoiceId)
      .eq('user_id', payload.userId)       // garante ownership
      .maybeSingle()

    if (fetchErr) return { data: null, error: fetchErr.message }
    if (!current) return { data: null, error: 'Fatura não encontrada.' }

    // INV-INV-002: fatura paga é imutável
    assertInvoiceInvariant(
      current.status !== 'paid',
      `Fatura já paga não pode ter status alterado. Use payInvoice() para registrar pagamento.`,
    )

    // INV-INV-003: fatura cancelada é imutável
    assertInvoiceInvariant(
      current.status !== 'cancelled',
      `Fatura cancelada não pode ser reaberta ou alterada.`,
    )

    // INV-INV-004: não usar updateInvoiceStatus para marcar como paga
    assertInvoiceInvariant(
      payload.status !== 'paid',
      `Para marcar fatura como paga, use payInvoice() — que cria a transaction de débito obrigatoriamente.`,
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
//
// Marca fatura como paga E cria a transaction de débito na conta informada.
// Os dois writes são dependentes: se a transaction falhar, o status NÃO é atualizado.
// Ordem: transaction primeiro → depois atualiza status.
// Motivo: é mais seguro ter a transaction sem o status atualizado do que o inverso.
//
// Side-effects centralizados aqui:
//   1. createTransaction() — débito na conta (via Mutation Layer — nunca .insert() direto)
//   2. UPDATE credit_card_invoices → status = 'paid', paid_at, paid_account_id

export async function payInvoice(
  payload: PayInvoicePayload,
): Promise<MutationResult<InvoiceRecord>> {
  const supabase = createClient()

  try {
    // INV-INV-005: campos obrigatórios
    assertInvoiceInvariant(!!payload.invoiceId,   'invoiceId é obrigatório')
    assertInvoiceInvariant(!!payload.userId,       'userId é obrigatório — boundary multi-usuário')
    assertInvoiceInvariant(!!payload.accountId,    'accountId é obrigatório para debitar o pagamento')
    assertInvoiceInvariant(!!payload.cardName,     'cardName é obrigatório para descrição da transaction')
    assertInvoiceInvariant(Number.isFinite(payload.amount) && payload.amount > 0, 'amount deve ser número finito positivo')
    assertInvoiceInvariant(payload.invoiceMonth >= 1 && payload.invoiceMonth <= 12, 'invoiceMonth inválido')
    assertInvoiceInvariant(payload.invoiceYear > 2000, 'invoiceYear inválido')

    // Busca fatura atual para validar estado
    const { data: current, error: fetchErr } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('id',      payload.invoiceId)
      .eq('user_id', payload.userId)
      .maybeSingle()

    if (fetchErr) return { data: null, error: fetchErr.message }
    if (!current) return { data: null, error: 'Fatura não encontrada.' }

    // INV-INV-006: não pagar fatura já paga (idempotência)
    assertInvoiceInvariant(current.status !== 'paid',      'Fatura já foi paga.')
    assertInvoiceInvariant(current.status !== 'cancelled', 'Fatura cancelada não pode ser paga.')

    // ── Step 1: cria transaction de débito via Mutation Layer ─────────────────
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
      credit_card_id: null,   // pagamento de fatura não é lançamento no cartão
      invoice_id:     null,   // idem — não contamina o total da fatura
    })

    if (txResult.error) {
      return { data: null, error: `Erro ao registrar pagamento: ${txResult.error}` }
    }

    // ── Step 2: atualiza status da fatura ─────────────────────────────────────
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
      // Transaction já foi criada — logar inconsistência para Health Check detectar
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