// ─────────────────────────────────────────────────────────────────────────────
// src/lib/financialEngine.ts
//
// Domain layer financeiro do Sakel — fonte de verdade para todas as telas.
//
// PRINCÍPIOS:
//   1. LEDGER_STATUSES é a única fonte de verdade para saldo real.
//      Nenhuma tela redefine isso localmente.
//   2. Forecast nunca contamina ledger.
//      Itens previstos existem apenas como camada derivada de visualização.
//   3. competencia é sempre YYYY-MM derivado do campo `date`.
//      Nunca de created_at ou updated_at.
//   4. O mesmo número calculado de formas diferentes em telas diferentes é um bug.
//      Dashboard, faturas, transações e reconciliação usam as mesmas funções daqui.
//   5. Engine nunca retorna dados de UI (cor, label, ícone, opacity, classes CSS).
//      A UI decide representação visual. Engine retorna semântica financeira.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Tipos base ───────────────────────────────────────────────────────────────

export type LifecycleStatus =
  | 'CONFIRMED'
  | 'PENDING_EXPECTED'
  | 'PENDING_REVIEW'
  | 'OVERDUE'
  | 'CANCELLED'

export type TxType = 'income' | 'expense' | 'transfer'

// ─── LEDGER_STATUSES — fonte de verdade para saldo real ───────────────────────
//
// Regra: transações nesses status entram no saldo real, KPIs do dashboard,
// total de fatura e base de reconciliação.
// CANCELLED e PENDING_EXPECTED NÃO entram — um é cancelado, o outro é previsão
// que ainda não virou fato.
//
// NUNCA alterar essa lista sem revisar dashboard, faturas e reconciliação.

export const LEDGER_STATUSES: LifecycleStatus[] = [
  'CONFIRMED',
  'OVERDUE',
  'PENDING_REVIEW',
]

export function getLedgerStatuses(): LifecycleStatus[] {
  return LEDGER_STATUSES
}

export function isLedgerStatus(status: LifecycleStatus): boolean {
  return LEDGER_STATUSES.includes(status)
}

// ─── OPERATIONAL_STATUSES ─────────────────────────────────────────────────────

export const OPERATIONAL_STATUSES: LifecycleStatus[] = [
  'PENDING_EXPECTED',
]

export function isOperationalStatus(status: LifecycleStatus): boolean {
  return OPERATIONAL_STATUSES.includes(status)
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

export function getMonthRange(
  year: number,
  month: number, // 0-indexed (Date.getMonth())
): { inicioMes: string; fimMes: string } {
  const pad     = (n: number) => String(n).padStart(2, '0')
  const m       = month + 1
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    inicioMes: `${year}-${pad(m)}-01`,
    fimMes:    `${year}-${pad(m)}-${pad(lastDay)}`,
  }
}

export function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function dateToCompetencia(date: string): string {
  return date.slice(0, 7)
}

/**
 * Retorna quantos dias até uma data YYYY-MM-DD.
 * Negativo = vencida. Zero = hoje.
 *
 * Extraído do dashboard — centralizado aqui para que faturas,
 * reconciliação e alertas usem a mesma referência.
 */
export function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round(
    (new Date(dateStr + 'T12:00:00').getTime() - today.getTime()) / 86_400_000
  )
}

// ─── Agregações canônicas ─────────────────────────────────────────────────────

export interface CatSlice {
  categoryId: string | null
  name:       string
  value:      number
}

export const UNCATEGORIZED_LABEL = 'Sem categoria'

export interface DualSummary {
  ledger: {
    income:  number
    expense: number
    balance: number
  }
  operational: {
    income:  number
    expense: number
    balance: number
  }
}

export function calcDualSummary(
  transactions: Array<{
    type:             TxType
    amount:           number
    lifecycle_status: LifecycleStatus
  }>
): DualSummary {
  let ledgerIncome  = 0
  let ledgerExpense = 0
  let opIncome      = 0
  let opExpense     = 0

  for (const tx of transactions) {
    if (tx.type === 'transfer') continue

    if (isLedgerStatus(tx.lifecycle_status)) {
      if (tx.type === 'income')  ledgerIncome  += Number(tx.amount)
      if (tx.type === 'expense') ledgerExpense += Number(tx.amount)
    } else if (isOperationalStatus(tx.lifecycle_status)) {
      if (tx.type === 'income')  opIncome  += Number(tx.amount)
      if (tx.type === 'expense') opExpense += Number(tx.amount)
    }
  }

  return {
    ledger: {
      income:  ledgerIncome,
      expense: ledgerExpense,
      balance: ledgerIncome - ledgerExpense,
    },
    operational: {
      income:  opIncome,
      expense: opExpense,
      balance: opIncome - opExpense,
    },
  }
}

/**
 * Calcula o saldo total de contas ativas (excluindo tipo 'credit').
 *
 * Extraído do dashboard — único ponto de verdade para saldo de contas.
 * Faturas, reconciliação e widgets consomem esta função.
 *
 * @param accounts Lista de contas com current_balance
 */
export function calcAccountsBalance(
  accounts: Array<{ current_balance: number }>
): number {
  return accounts.reduce((sum, a) => sum + Number(a.current_balance), 0)
}

// ─── Forecast layer ───────────────────────────────────────────────────────────

export interface ForecastItem {
  recurrenceId:  string
  description:   string
  amount:        number
  type:          TxType
  competencia:   string
  expectedDate:  string
  creditCardId:  string | null
  categoryId:    string | null
  isProjected:   true
}

export interface RecurrenceForForecast {
  id:             string
  description:    string
  amount:         number
  type:           TxType
  frequency:      'daily' | 'weekly' | 'monthly' | 'yearly'
  next_due_date:  string | null
  end_date:       string | null
  credit_card_id: string | null
  category_id:    string | null
  is_active:      boolean
}

export function projectForecast(
  recurrences:  RecurrenceForForecast[],
  competencias: string[],
  existing:     Set<string>,
): ForecastItem[] {
  const items: ForecastItem[] = []

  for (const rec of recurrences) {
    if (!rec.is_active || !rec.next_due_date) continue

    for (const competencia of competencias) {
      const key = `${rec.id}:${competencia}`
      if (existing.has(key)) continue

      const expectedDate = getExpectedDateInCompetencia(rec, competencia)
      if (!expectedDate) continue
      if (rec.end_date && expectedDate > rec.end_date) continue

      items.push({
        recurrenceId:  rec.id,
        description:   rec.description,
        amount:        Number(rec.amount),
        type:          rec.type,
        competencia,
        expectedDate,
        creditCardId:  rec.credit_card_id,
        categoryId:    rec.category_id,
        isProjected:   true,
      })
    }
  }

  return items
}

function getExpectedDateInCompetencia(
  rec:         RecurrenceForForecast,
  competencia: string,
): string | null {
  if (!rec.next_due_date) return null

  const [targetYear] = competencia.split('-').map(Number)
  const next         = new Date(rec.next_due_date + 'T12:00:00')
  const nextComp     = dateToCompetencia(rec.next_due_date)

  if (rec.frequency === 'monthly') {
    let d      = new Date(next)
    let safety = 0
    while (safety++ < 36) {
      const comp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (comp === competencia) return d.toISOString().split('T')[0]
      if (comp > competencia)   return null
      d.setMonth(d.getMonth() + 1)
    }
    return null
  }

  if (rec.frequency === 'yearly') {
    const d = new Date(next)
    d.setFullYear(targetYear)
    const comp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return comp === competencia ? d.toISOString().split('T')[0] : null
  }

  if (nextComp === competencia) return rec.next_due_date
  if (nextComp > competencia)   return null

  let d      = new Date(next)
  let safety = 0
  const step = rec.frequency === 'daily' ? 1 : 7
  while (safety++ < 400) {
    const comp = dateToCompetencia(d.toISOString().split('T')[0])
    if (comp === competencia) return d.toISOString().split('T')[0]
    if (comp > competencia)   return null
    d.setDate(d.getDate() + step)
  }

  return null
}

export function buildExistingRecurrenceSet(
  transactions: Array<{ recurrence_id: string | null; competencia: string | null }>
): Set<string> {
  const set = new Set<string>()
  for (const tx of transactions) {
    if (tx.recurrence_id && tx.competencia) {
      set.add(`${tx.recurrence_id}:${tx.competencia}`)
    }
  }
  return set
}

// ─── occurrencesInWindow ──────────────────────────────────────────────────────

export function occurrencesInWindow(
  nextDueDate: string,
  frequency:   string,
  horizonDate: Date,
): number {
  const start = new Date(nextDueDate + 'T12:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (start > horizonDate) return 0

  let count   = 0
  let current = new Date(start)

  while (current <= horizonDate && count < 60) {
    if (current >= today) count++
    switch (frequency) {
      case 'daily':   current.setDate(current.getDate() + 1);        break
      case 'weekly':  current.setDate(current.getDate() + 7);        break
      case 'monthly': current.setMonth(current.getMonth() + 1);      break
      case 'yearly':  current.setFullYear(current.getFullYear() + 1); break
      default:        return count
    }
    if (frequency === 'monthly' || frequency === 'yearly') break
  }

  return count
}

// ─── getForecastSummary ───────────────────────────────────────────────────────
//
// API canônica de projeção financeira de curto prazo.
//
// Consolida a lógica que estava espalhada no dashboard (recEntradas, recSaidas,
// saldoPrevisto, recCount) em uma única função de domínio reutilizável.
//
// Consumidores: dashboard, faturas futuras, widgets, insights, notificações.
//
// SEPARAÇÃO DE CONCEITOS:
//   - recurrences  → coisas que ainda vão nascer (intenção)
//   - installments → fatos já contratados distribuídos no tempo (obrigação)
//   installmentCount NÃO entra aqui — pertence a getInstallmentProjection() futuro.
//
// PRINCÍPIO: engine retorna semântica financeira e dados derivados canônicos.
//   Nunca retorna cor, label, ícone, opacity ou classes CSS.
//   A UI decide representação visual.

export interface ForecastProjectionItem {
  recurrenceId: string
  description:  string
  amount:       number
  type:         TxType        // 'income' | 'expense'
  expectedDate: string        // YYYY-MM-DD (próxima ocorrência na janela)
  competencia:  string        // YYYY-MM
  source:       'recurrence'  // extensível: 'installment' | 'scheduled' no futuro
}

export interface ForecastSummary {
  /** Receitas recorrentes projetadas na janela */
  projectedIncome:    number
  /** Despesas recorrentes projetadas na janela */
  projectedExpense:   number
  /**
   * Saldo projetado ao final da janela.
   * Fórmula: currentBalance + projectedIncome - projectedExpense - openInvoicesTotal
   */
  projectedBalance:   number
  /** Total de ocorrências de recorrências na janela */
  recurrenceCount:    number
  /** Itens individuais — dados brutos sem representação visual */
  items:              ForecastProjectionItem[]
}

export interface GetForecastSummaryParams {
  /** Recorrências ativas do usuário (is_active = true) */
  recurrences:        Array<{
    id:            string
    description:   string
    amount:        number
    type:          TxType
    frequency:     'daily' | 'weekly' | 'monthly' | 'yearly'
    next_due_date: string | null
    end_date:      string | null
    is_active:     boolean
  }>
  /** Janela de projeção em dias a partir de hoje (padrão: 30) */
  horizonDays:        number
  /** Saldo atual de contas (já calculado via calcAccountsBalance) */
  currentBalance:     number
  /** Total de faturas em aberto — deduzido do saldo projetado */
  openInvoicesTotal:  number
}

export function getForecastSummary({
  recurrences,
  horizonDays,
  currentBalance,
  openInvoicesTotal,
}: GetForecastSummaryParams): ForecastSummary {
  const today       = new Date(); today.setHours(0, 0, 0, 0)
  const horizonDate = new Date(today); horizonDate.setDate(horizonDate.getDate() + horizonDays)
  const horizonStr  = horizonDate.toISOString().split('T')[0]
  const todayStr    = today.toISOString().split('T')[0]

  const items: ForecastProjectionItem[] = []
  let projectedIncome  = 0
  let projectedExpense = 0
  let recurrenceCount  = 0

  for (const rec of recurrences) {
    if (!rec.is_active || !rec.next_due_date) continue
    if (rec.end_date && rec.end_date < todayStr) continue

    const occ = occurrencesInWindow(rec.next_due_date, rec.frequency, horizonDate)
    if (occ === 0) continue

    const total = Number(rec.amount) * occ
    recurrenceCount += occ

    if (rec.type === 'income')  projectedIncome  += total
    if (rec.type === 'expense') projectedExpense += total

    // Gera item para a primeira ocorrência na janela
    const expectedDate = getFirstOccurrenceInWindow(rec.next_due_date, rec.frequency, todayStr, horizonStr)
    if (expectedDate) {
      items.push({
        recurrenceId: rec.id,
        description:  rec.description,
        amount:       Number(rec.amount),
        type:         rec.type,
        expectedDate,
        competencia:  dateToCompetencia(expectedDate),
        source:       'recurrence',
      })
    }
  }

  const projectedBalance = currentBalance + projectedIncome - projectedExpense - openInvoicesTotal

  return {
    projectedIncome,
    projectedExpense,
    projectedBalance,
    recurrenceCount,
    items,
  }
}

/**
 * Retorna a primeira data de ocorrência de uma recorrência dentro da janela [today, horizon].
 * Função interna — usada apenas por getForecastSummary para popular items[].
 */
function getFirstOccurrenceInWindow(
  nextDueDate:  string,
  frequency:    string,
  todayStr:     string,
  horizonStr:   string,
): string | null {
  let d      = new Date(nextDueDate + 'T12:00:00')
  let safety = 0

  while (safety++ < 400) {
    const ds = d.toISOString().split('T')[0]
    if (ds > horizonStr) return null
    if (ds >= todayStr)  return ds

    switch (frequency) {
      case 'daily':   d.setDate(d.getDate() + 1);        break
      case 'weekly':  d.setDate(d.getDate() + 7);        break
      case 'monthly': d.setMonth(d.getMonth() + 1);      break
      case 'yearly':  d.setFullYear(d.getFullYear() + 1); break
      default:        return null
    }
  }

  return null
}
