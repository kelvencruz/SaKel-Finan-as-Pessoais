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

// Helper usado nos filtros Supabase (.in('lifecycle_status', getLedgerStatuses()))
export function getLedgerStatuses(): LifecycleStatus[] {
  return LEDGER_STATUSES
}

export function isLedgerStatus(status: LifecycleStatus): boolean {
  return LEDGER_STATUSES.includes(status)
}

// ─── OPERATIONAL_STATUSES — status que afetam visão operacional mas não ledger ─
//
// Usado na seção "Previsto / Em revisão" da tela de transações.
// Separado do ledger para não contaminar saldo real.

export const OPERATIONAL_STATUSES: LifecycleStatus[] = [
  'PENDING_EXPECTED',
]

export function isOperationalStatus(status: LifecycleStatus): boolean {
  return OPERATIONAL_STATUSES.includes(status)
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

/**
 * Retorna { inicioMes, fimMes } no formato YYYY-MM-DD.
 * Sempre derivado do campo `date` — nunca de created_at.
 */
export function getMonthRange(
  year: number,
  month: number, // 0-indexed (Date.getMonth())
): { inicioMes: string; fimMes: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const m   = month + 1
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    inicioMes: `${year}-${pad(m)}-01`,
    fimMes:    `${year}-${pad(m)}-${pad(lastDay)}`,
  }
}

/**
 * Retorna a competência do mês atual no formato YYYY-MM.
 * Competência é sempre derivada de `date` — nunca de created_at.
 */
export function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Converte uma data YYYY-MM-DD para competência YYYY-MM.
 * Use esta função — nunca slice(0,7) diretamente em created_at.
 */
export function dateToCompetencia(date: string): string {
  return date.slice(0, 7)
}

// ─── Tipos de agregação ───────────────────────────────────────────────────────

export interface CatSlice {
  categoryId: string | null
  name:       string
  value:      number
}

export const UNCATEGORIZED_LABEL = 'Sem categoria'

export interface DualSummary {
  /** Ledger factual — CONFIRMED + OVERDUE + PENDING_REVIEW */
  ledger: {
    income:  number
    expense: number
    balance: number
  }
  /** Operacional — PENDING_EXPECTED (previsão que não é fato ainda) */
  operational: {
    income:  number
    expense: number
    balance: number
  }
}

// ─── calcDualSummary ──────────────────────────────────────────────────────────
//
// Calcula resumo financeiro em duas camadas a partir de uma lista de transações
// já carregadas no cliente (ex: filtered em transações/page.tsx).
//
// ATENÇÃO: esta função opera sobre dados já filtrados pela UI.
// Para agregações canônicas server-side (dashboard KPIs), use as queries
// do dashboard com getLedgerStatuses() diretamente no Supabase.
//
// TD-001: destino correto é uma Supabase view get_financial_summary(user_id).
// Mantido aqui até sprint de infraestrutura financeira.

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
    // CANCELLED: ignorado em ambas as camadas — nem ledger, nem operacional
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

// ─── Forecast layer ───────────────────────────────────────────────────────────
//
// Camada derivada — previsão de recorrências ativas calculada em runtime.
// NÃO persistida. NÃO entra em saldo real, total de fatura ou reconciliação.
//
// Modelo mental:
//   recurrence → intenção
//   transaction → fato financeiro (gerado pelo engine)
//   ForecastItem → derivação visual efêmera
//
// Transição: quando o engine gerar a transaction real para uma competência,
// o ForecastItem dessa competência some — a transaction real aparece no lugar.

export interface ForecastItem {
  recurrenceId:  string
  description:   string
  amount:        number
  type:          TxType
  competencia:   string // YYYY-MM
  expectedDate:  string // YYYY-MM-DD (próxima ocorrência estimada)
  creditCardId:  string | null
  categoryId:    string | null
  isProjected:   true   // sempre true — distingue do ledger factual
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

/**
 * Projeta recorrências ativas para um conjunto de competências futuras.
 *
 * Retorna ForecastItem[] — itens derivados, nunca persistidos.
 *
 * @param recurrences  Lista de recorrências ativas (is_active=true, sem deleted_at)
 * @param competencias Lista de YYYY-MM a projetar (ex: ['2026-06', '2026-07'])
 * @param existing     Set de "recurrenceId:YYYY-MM" que já têm transaction real
 *                     Esses são excluídos do forecast — engine já gerou o fato
 */
export function projectForecast(
  recurrences:  RecurrenceForForecast[],
  competencias: string[],
  existing:     Set<string>,
): ForecastItem[] {
  const items: ForecastItem[] = []
  const today = new Date(); today.setHours(0, 0, 0, 0)

  for (const rec of recurrences) {
    if (!rec.is_active || !rec.next_due_date) continue

    for (const competencia of competencias) {
      const key = `${rec.id}:${competencia}`

      // Se engine já gerou transaction real para essa competência → skip
      if (existing.has(key)) continue

      // Verifica se a recorrência tem ocorrência nessa competência
      const expectedDate = getExpectedDateInCompetencia(rec, competencia)
      if (!expectedDate) continue

      // Verifica end_date
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

/**
 * Retorna a data esperada (YYYY-MM-DD) de uma recorrência em uma competência,
 * ou null se não há ocorrência nesse mês.
 *
 * Para frequência monthly: projeta a partir de next_due_date avançando mês a mês
 * até encontrar a competência alvo ou passar dela.
 */
function getExpectedDateInCompetencia(
  rec:         RecurrenceForForecast,
  competencia: string, // YYYY-MM
): string | null {
  if (!rec.next_due_date) return null

  const [targetYear, targetMonth] = competencia.split('-').map(Number)
  const next = new Date(rec.next_due_date + 'T12:00:00')

  // Competência do next_due_date
  const nextComp = dateToCompetencia(rec.next_due_date)

  if (rec.frequency === 'monthly') {
    // Avança next_due_date mês a mês até chegar na competência alvo
    let d = new Date(next)
    let safety = 0
    while (safety++ < 36) {
      const comp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (comp === competencia) return d.toISOString().split('T')[0]
      if (comp > competencia)  return null
      d.setMonth(d.getMonth() + 1)
    }
    return null
  }

  if (rec.frequency === 'yearly') {
    // Mesmo dia/mês, ano diferente
    const d = new Date(next)
    d.setFullYear(targetYear)
    const comp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return comp === competencia ? d.toISOString().split('T')[0] : null
  }

  // daily/weekly: se next_due_date está dentro da competência alvo → retorna
  // (simplificação: retorna a primeira ocorrência no mês)
  if (nextComp === competencia) return rec.next_due_date
  if (nextComp > competencia)   return null

  // Avança até entrar na competência
  let d = new Date(next)
  let safety = 0
  const step = rec.frequency === 'daily' ? 1 : 7
  while (safety++ < 400) {
    const comp = dateToCompetencia(d.toISOString().split('T')[0])
    if (comp === competencia) return d.toISOString().split('T')[0]
    if (comp > competencia)  return null
    d.setDate(d.getDate() + step)
  }

  return null
}

/**
 * Gera o Set de chaves "recurrenceId:YYYY-MM" a partir de transactions reais.
 * Usado por projectForecast para excluir o que o engine já gerou.
 *
 * @param transactions Transações com recurrence_id e competencia (campo text do DB)
 */
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
//
// Conta quantas ocorrências de uma recorrência caem numa janela de N dias.
// Usada no dashboard para projeção de 30 dias.
// Extraída aqui para evitar duplicação entre dashboard e futura tela de projeção.

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
      case 'daily':   current.setDate(current.getDate() + 1);       break
      case 'weekly':  current.setDate(current.getDate() + 7);       break
      case 'monthly': current.setMonth(current.getMonth() + 1);     break
      case 'yearly':  current.setFullYear(current.getFullYear() + 1); break
      default:        return count
    }
    if (frequency === 'monthly' || frequency === 'yearly') break
  }

  return count
}
