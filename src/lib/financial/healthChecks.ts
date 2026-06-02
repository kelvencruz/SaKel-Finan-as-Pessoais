// src/lib/financial/healthChecks.ts
// Health Checks — Sakel Finanças Sprint 3
// Detecta inconsistências financeiras antes do usuário
// Retorno sempre compatível com Operational Inbox — nunca só log de desenvolvedor

import { createClient } from '@/lib/supabase/client'
import { subDays, differenceInDays, parseISO } from 'date-fns'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type HealthCheckSeverity = 'low' | 'medium' | 'high' | 'critical'

type InvoiceMismatchResult = {
  type:           'invoice_mismatch'
  severity:       HealthCheckSeverity
  entity_id:      string
  title:          string
  recommendation: string
  created_at:     string
  metadata: {
    invoiceTotal:     number
    transactionTotal: number
    difference:       number
  }
}

type RecurrenceStalledResult = {
  type:           'recurrence_stalled'
  severity:       HealthCheckSeverity
  entity_id:      string
  title:          string
  recommendation: string
  created_at:     string
  metadata: {
    next_due_date: string
    days_overdue:  number
  }
}

type DuplicateCandidateResult = {
  type:           'duplicate_candidate'
  severity:       HealthCheckSeverity
  entity_id:      string
  title:          string
  recommendation: string
  created_at:     string
  metadata: {
    transaction_ids: string[]
    amount:          number
    description:     string
  }
}

export type HealthCheckResult =
  | InvoiceMismatchResult
  | RecurrenceStalledResult
  | DuplicateCandidateResult

// ─── Constantes ───────────────────────────────────────────────────────────────

const STALLED_THRESHOLD_DAYS    = 30   // recurrence_stalled: next_due_date < hoje - 30 dias
const DUPLICATE_WINDOW_DAYS     = 3    // duplicate_candidate: mesma transação em < 3 dias

// ─── Checks ───────────────────────────────────────────────────────────────────

async function checkInvoiceMismatch(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  now: string
): Promise<InvoiceMismatchResult[]> {
  const results: InvoiceMismatchResult[] = []

  // Busca faturas abertas — paid e cancelled são imutáveis, não geram ruído
  const { data: invoices } = await supabase
    .from('credit_card_invoices')
    .select('id, total_amount')
    .eq('user_id', userId)
    .eq('status', 'open')

  if (!invoices?.length) return results

  for (const invoice of invoices) {
    const { data: transactions } = await supabase
      .from('transactions')
      .select('amount')
      .eq('invoice_id', invoice.id)
      .is('deleted_at', null)

    const transactionTotal = (transactions ?? []).reduce(
      (sum, t) => sum + Number(t.amount),
      0
    )

    const invoiceTotal  = Number(invoice.total_amount)
    const difference    = Math.abs(invoiceTotal - transactionTotal)

    // Tolerância de 1 centavo — evita falso positivo por ponto flutuante
    if (difference > 0.01) {
      results.push({
        type:           'invoice_mismatch',
        severity:       'high',
        entity_id:      invoice.id,
        title:          'Total da fatura divergente',
        recommendation: 'Recalcular total da fatura',
        created_at:     now,
        metadata: {
          invoiceTotal,
          transactionTotal,
          difference,
        },
      })
    }
  }

  return results
}

async function checkRecurrenceStalled(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  now: string
): Promise<RecurrenceStalledResult[]> {
  const results: RecurrenceStalledResult[] = []

  const threshold = subDays(new Date(), STALLED_THRESHOLD_DAYS)
    .toISOString()
    .slice(0, 10)

  // is_active = true AND next_due_date < hoje - 30 dias
  const { data: stalled } = await supabase
    .from('recurrences')
    .select('id, next_due_date, description')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('next_due_date', threshold)

  for (const r of stalled ?? []) {
    const daysOverdue = differenceInDays(
      new Date(),
      parseISO(r.next_due_date)
    )

    results.push({
      type:           'recurrence_stalled',
      severity:       'high',
      entity_id:      r.id,
      title:          'Recorrência parada',
      recommendation: 'Verificar se o processamento automático está funcionando',
      created_at:     now,
      metadata: {
        next_due_date: r.next_due_date,
        days_overdue:  daysOverdue,
      },
    })
  }

  return results
}

async function checkDuplicateCandidate(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  now: string
): Promise<DuplicateCandidateResult[]> {
  const results: DuplicateCandidateResult[] = []

  const windowStart = subDays(new Date(), DUPLICATE_WINDOW_DAYS)
    .toISOString()
    .slice(0, 10)

  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, amount, description, date')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gte('date', windowStart)
    .order('description')
    .order('amount')
    .order('date')

  if (!transactions?.length) return results

  // Agrupa por amount + description — janela de 3 dias já está filtrada na query
  const groups = new Map<string, typeof transactions>()

  for (const t of transactions) {
    const key = `${Number(t.amount).toFixed(2)}|${t.description}`
    const group = groups.get(key) ?? []
    group.push(t)
    groups.set(key, group)
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue

    // Verifica se algum par está dentro da janela de 3 dias
    let hasPairInWindow = false
    for (let i = 0; i < group.length - 1; i++) {
      const diff = differenceInDays(
        parseISO(group[i + 1].date),
        parseISO(group[i].date)
      )
      if (Math.abs(diff) < DUPLICATE_WINDOW_DAYS) {
        hasPairInWindow = true
        break
      }
    }

    if (!hasPairInWindow) continue

    // entity_id = primeira transação do grupo — ancora o item no Inbox
    results.push({
      type:           'duplicate_candidate',
      severity:       'medium',
      entity_id:      group[0].id,
      title:          'Possível lançamento duplicado',
      recommendation: 'Verifique se estes lançamentos representam operações distintas.',
      created_at:     now,
      metadata: {
        transaction_ids: group.map(t => t.id),
        amount:          Number(group[0].amount),
        description:     group[0].description,
      },
    })
  }

  return results
}

// ─── Função principal ─────────────────────────────────────────────────────────

export async function runFinancialHealthChecks(
  userId: string
): Promise<HealthCheckResult[]> {
  if (!userId) return []

  const supabase = createClient()

  // created_at gerado uma vez na origem — uniforme em todos os checks da execução
  const now = new Date().toISOString()

  const [invoiceMismatches, stalledRecurrences, duplicateCandidates] =
    await Promise.all([
      checkInvoiceMismatch(supabase, userId, now),
      checkRecurrenceStalled(supabase, userId, now),
      checkDuplicateCandidate(supabase, userId, now),
    ])

  return [...invoiceMismatches, ...stalledRecurrences, ...duplicateCandidates]
}