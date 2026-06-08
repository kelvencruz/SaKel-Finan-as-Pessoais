// src/lib/dashboard/dashboardService.ts
//
// Pipeline de leitura do Dashboard — ETAPA-F + ETAPA-D
// Responsabilidade: buscar, agregar e retornar DashboardViewModel.
// Zero UI. Zero estado React. Consumido por dashboard/page.tsx.
//
// Regras invioláveis:
// - NUNCA importar de @/lib/supabase/server
// - NUNCA chamar syncInvoiceTotal() ou updateInvoiceStatus()
// - NUNCA adicionar lógica de renderização aqui

import { createClient } from '@/lib/supabase/client'
import {
  getMonthRange,
  getCurrentMonthKey,
  getLedgerStatuses,
  calcAccountsBalance,
  daysUntil,
  getForecastSummary,
  UNCATEGORIZED_LABEL,
  type CatSlice,
  type ForecastSummary,
} from '@/lib/financialEngine'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface InvoiceDue {
  id:             string
  card_name:      string
  card_color:     string
  due_date:       string
  total_amount:   number
  days_until_due: number
}

export interface RecentTx {
  id:             string
  description:    string
  amount:         number
  type:           'income' | 'expense' | 'transfer'
  category_name?: string
  category_icon?: string
  date:           string
}

export interface MonthLine {
  mes:   string
  saldo: number
}

export interface SyncStatus {
  ran_at:    string
  processed: number
  failed:    number
}

export interface FinancialDeltas {
  deltaRec:   number   // recMes - recMesAnterior
  deltaDesp:  number   // despMes - despMesAnterior
  deltaSaldo: number   // (recMes - despMes) - (recAnterior - despAnterior)
}

export interface FinancialTrends {
  currentMonthlyAporte: number   // recMes - despMes
  avgMonthlyExpense:    number   // média de despesas dos últimos 6 meses
}

export interface DashboardViewModel {
  // KPIs
  saldoContas:          number
  totalFaturas:         number
  patrimonioInvestido:  number
  recMes:               number
  despMes:              number

  // Deltas vs mês anterior — ETAPA-D
  deltas:               FinancialDeltas
  trends:               FinancialTrends

  // Projeção
  forecastSummary:      ForecastSummary
  instCount:            number

  // Listas
  invoicesDue:          InvoiceDue[]
  recentTxs:            RecentTx[]
  catSlices:            CatSlice[]
  monthLine:            MonthLine[]

  // Meta
  syncStatus:           SyncStatus | null
  hasAccounts:          boolean
}

// ─── Helper: mês anterior com tratamento de virada de ano ────────────────────

function getPrevMonthRange(year: number, month: number) {
  // month é 0-indexed — Janeiro (0) vira Dezembro do ano anterior
  const prevYear  = month === 0 ? year - 1 : year
  const prevMonth = month === 0 ? 11 : month - 1
  return getMonthRange(prevYear, prevMonth)
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// ─── fetchDashboard ───────────────────────────────────────────────────────────

export async function fetchDashboard(userId: string): Promise<DashboardViewModel> {
  const supabase = createClient()

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  const { inicioMes, fimMes }             = getMonthRange(year, month)
  const { inicioMes: inicioPrev,
          fimMes:    fimPrev }             = getPrevMonthRange(year, month)
  const monthKey                          = getCurrentMonthKey()
  const hoje                              = now.toISOString().split('T')[0]
  const limit30                           = new Date(now)
  limit30.setDate(limit30.getDate() + 30)
  const horizon30                         = limit30.toISOString().split('T')[0]

  // ── Contas ──────────────────────────────────────────────────────────────────
  const { data: acc, error: accErr } = await supabase
    .from('accounts').select('current_balance')
    .eq('user_id', userId).eq('is_active', true).neq('type', 'credit')
  if (accErr) throw accErr

  const accList = (acc ?? []) as { current_balance: number }[]
  if (accList.length === 0) {
    return emptyViewModel()
  }

  const saldoContas = calcAccountsBalance(accList)

  // ── Faturas abertas ─────────────────────────────────────────────────────────
  const { data: openInv } = await supabase
    .from('credit_card_invoices').select('total_amount')
    .eq('user_id', userId).in('status', ['open', 'overdue'])
  const totalFaturas = ((openInv ?? []) as { total_amount: number }[])
    .reduce((s, i) => s + Number(i.total_amount), 0)

  // ── Investimentos ───────────────────────────────────────────────────────────
  const { data: invData } = await supabase
    .from('investments').select('current_amount')
    .eq('user_id', userId).eq('is_active', true)
  const patrimonioInvestido = ((invData ?? []) as { current_amount: number }[])
    .reduce((s, i) => s + Number(i.current_amount), 0)

  // ── Transações mês atual ────────────────────────────────────────────────────
  const { data: txMes, error: txErr } = await supabase
    .from('transactions').select('type, amount')
    .eq('user_id', userId)
    .gte('date', inicioMes).lte('date', fimMes)
    .in('lifecycle_status', getLedgerStatuses())
    .in('type', ['income', 'expense'])
  if (txErr) throw txErr

  const txArr      = (txMes ?? []) as { type: string; amount: number }[]
  const recMes     = txArr.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
  const despMes    = txArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  // ── Transações mês anterior — ETAPA-D ──────────────────────────────────────
  const { data: txPrev } = await supabase
    .from('transactions').select('type, amount')
    .eq('user_id', userId)
    .gte('date', inicioPrev).lte('date', fimPrev)
    .in('lifecycle_status', getLedgerStatuses())
    .in('type', ['income', 'expense'])

  const txPrevArr   = (txPrev ?? []) as { type: string; amount: number }[]
  const recPrev     = txPrevArr.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
  const despPrev    = txPrevArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  const deltas: FinancialDeltas = {
    deltaRec:   recMes  - recPrev,
    deltaDesp:  despMes - despPrev,
    deltaSaldo: (recMes - despMes) - (recPrev - despPrev),
  }

  // ── Histórico 6 meses ───────────────────────────────────────────────────────
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - (5 - i), 1)
    return { key: d.toISOString().slice(0, 7), label: MONTH_NAMES[d.getMonth()] }
  })
  const { data: txHist } = await supabase
    .from('transactions').select('type, amount, date')
    .eq('user_id', userId)
    .gte('date', meses[0].key + '-01')
    .in('lifecycle_status', getLedgerStatuses())
    .in('type', ['income', 'expense'])
  const histArr = (txHist ?? []) as { type: string; amount: number; date: string }[]

  const monthLine: MonthLine[] = meses.map(({ key, label }) => {
    const txs  = histArr.filter(t => t.date.startsWith(key))
    const rec  = txs.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
    const desp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    return { mes: label, saldo: rec - desp }
  })

  // ── Trends — ETAPA-D ────────────────────────────────────────────────────────
  // avgMonthlyExpense: média das despesas dos 6 meses do histórico
  const totalHistDesp = histArr
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0)

  const trends: FinancialTrends = {
    currentMonthlyAporte: recMes - despMes,
    avgMonthlyExpense:    meses.length > 0 ? totalHistDesp / meses.length : 0,
  }

  // ── Categorias ──────────────────────────────────────────────────────────────
  const { data: catData } = await supabase
    .from('expenses_by_category')
    .select('category_id, category_name, total_amount')
    .eq('user_id', userId).eq('month_key', monthKey)
    .order('total_amount', { ascending: false }).limit(6)
  const catSlices: CatSlice[] = ((catData ?? []) as { category_id: string | null; category_name: string | null; total_amount: number }[])
    .map(row => ({
      categoryId: row.category_id,
      name:       row.category_name ?? UNCATEGORIZED_LABEL,
      value:      Number(row.total_amount),
    }))

  // ── Últimas transações ──────────────────────────────────────────────────────
  const { data: cats } = await supabase
    .from('categories').select('id, name, icon').eq('user_id', userId)
  const catNameMap = Object.fromEntries(
    ((cats ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])
  )
  const catIconMap = Object.fromEntries(
    ((cats ?? []) as { id: string; icon?: string }[]).map(c => [c.id, c])
  )

  const { data: recentData } = await supabase
    .from('transactions')
    .select('id, type, description, amount, date, category_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('lifecycle_status', getLedgerStatuses())
    .order('date', { ascending: false }).limit(5)
  const recentTxs: RecentTx[] = ((recentData ?? []) as { id: string; type: string; description: string; amount: number; date: string; category_id: string | null }[])
    .map(t => ({
      id:            t.id,
      type:          t.type as 'income' | 'expense' | 'transfer',
      description:   t.description,
      amount:        Number(t.amount),
      date:          t.date,
      category_name: t.category_id ? catNameMap[t.category_id] : undefined,
      category_icon: t.category_id ? (catIconMap[t.category_id] as any)?.icon : undefined,
    }))

  // ── Faturas próximas ────────────────────────────────────────────────────────
  const { data: dueInv } = await supabase
    .from('credit_card_invoices')
    .select('id, total_amount, status, due_date, credit_card_id')
    .eq('user_id', userId).in('status', ['open', 'overdue'])
    .lte('due_date', horizon30).order('due_date')
  const { data: cards } = await supabase
    .from('credit_cards').select('id, name, color').eq('user_id', userId)
  const cardMap = Object.fromEntries(
    ((cards ?? []) as { id: string; name: string; color: string }[]).map(c => [c.id, c])
  )
  const invoicesDue: InvoiceDue[] = ((dueInv ?? []) as { id: string; total_amount: number; due_date: string; credit_card_id: string }[])
    .map(inv => ({
      id:             inv.id,
      card_name:      cardMap[inv.credit_card_id]?.name  ?? 'Cartão',
      card_color:     cardMap[inv.credit_card_id]?.color ?? '#7C3AED',
      due_date:       inv.due_date,
      total_amount:   Number(inv.total_amount),
      days_until_due: daysUntil(inv.due_date),
    }))

  // ── Recorrências — getForecastSummary ───────────────────────────────────────
  const { data: recRules } = await supabase
    .from('recurrences')
    .select('id, type, amount, frequency, next_due_date, end_date, is_active, description')
    .eq('user_id', userId).eq('is_active', true)
    .or(`next_due_date.lte.${horizon30},end_date.is.null,end_date.gte.${hoje}`)
  const forecastSummary = getForecastSummary({
    recurrences:       (recRules ?? []) as any[],
    horizonDays:       30,
    currentBalance:    saldoContas,
    openInvoicesTotal: totalFaturas,
  })

  // ── Parcelas ─────────────────────────────────────────────────────────────────
  const { data: instData } = await supabase
    .from('transactions').select('type, amount')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .not('installment_total', 'is', null)
    .in('lifecycle_status', getLedgerStatuses())
    .gte('date', hoje).lte('date', horizon30)
    .in('type', ['income', 'expense'])
  const instCount = (instData ?? []).length

  // ── Última sincronização ────────────────────────────────────────────────────
  const { data: syncLog } = await supabase
    .from('lifecycle_engine_logs')
    .select('ran_at, processed, failed')
    .order('ran_at', { ascending: false }).limit(1).maybeSingle()

  return {
    saldoContas,
    totalFaturas,
    patrimonioInvestido,
    recMes,
    despMes,
    deltas,
    trends,
    forecastSummary,
    instCount,
    invoicesDue,
    recentTxs,
    catSlices,
    monthLine,
    syncStatus: syncLog ?? null,
    hasAccounts: true,
  }
}

// ─── ViewModel vazio — sem contas cadastradas ─────────────────────────────────

function emptyViewModel(): DashboardViewModel {
  return {
    saldoContas:         0,
    totalFaturas:        0,
    patrimonioInvestido: 0,
    recMes:              0,
    despMes:             0,
    deltas:              { deltaRec: 0, deltaDesp: 0, deltaSaldo: 0 },
    trends:              { currentMonthlyAporte: 0, avgMonthlyExpense: 0 },
    forecastSummary:     { projectedIncome: 0, projectedExpense: 0, projectedBalance: 0, recurrenceCount: 0, items: [] },
    instCount:           0,
    invoicesDue:         [],
    recentTxs:           [],
    catSlices:           [],
    monthLine:           [],
    syncStatus:          null,
    hasAccounts:         false,
  }
}