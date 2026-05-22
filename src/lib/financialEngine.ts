/**
 * financialEngine.ts
 * Sakel Finanças — Contrato Semântico Financeiro v1
 *
 * REGRA DE OURO: nenhuma página, hook ou componente implementa
 * semântica financeira localmente. Tudo passa por aqui.
 *
 * Decisões registradas em: Sakel_Contexto_Estrategico_Master_v2_1 (22/05/2026)
 */

// ─── Constantes canônicas de lifecycle ────────────────────────────────────────

/**
 * Transações que compõem o LEDGER — saldo real confirmado.
 * OVERDUE entra porque o dinheiro já saiu do bolso mesmo sem confirmação manual.
 * Usado em: KPIs do dashboard, gráfico de categorias (padrão), summary ledger.
 */
export const LEDGER_STATUSES = ['CONFIRMED', 'OVERDUE'] as const
export type LedgerStatus = (typeof LEDGER_STATUSES)[number]

/**
 * Transações operacionais — planejadas mas não realizadas.
 * Nunca entram no ledger. Entram em projeção e no bloco "pendentes" da UI.
 * Usado em: bloco separado na página de transações, toggle "incluir pendentes".
 */
export const OPERATIONAL_STATUSES = ['PENDING_EXPECTED', 'PENDING_REVIEW'] as const
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number]

/**
 * Transações terminais — encerradas, não afetam nenhum cálculo.
 */
export const TERMINAL_STATUSES = ['CANCELLED'] as const
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number]

export type LifecycleStatus = LedgerStatus | OperationalStatus | TerminalStatus

// ─── Predicates canônicos ─────────────────────────────────────────────────────

export function isLedgerStatus(status: string): status is LedgerStatus {
  return (LEDGER_STATUSES as readonly string[]).includes(status)
}

export function isOperationalStatus(status: string): status is OperationalStatus {
  return (OPERATIONAL_STATUSES as readonly string[]).includes(status)
}

export function isTerminalStatus(status: string): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

// ─── Campo canônico de data ───────────────────────────────────────────────────

/**
 * Sempre usar o campo `date` (DATE do Postgres, formato YYYY-MM-DD).
 * NUNCA usar created_at, updated_at ou qualquer timestamp para filtros financeiros.
 */
export const FINANCIAL_DATE_FIELD = 'date' as const

// ─── Normalização de datas (UTC-safe) ────────────────────────────────────────

/**
 * Retorna { inicioMes, fimMes } como strings YYYY-MM-DD para uso em queries SQL.
 *
 * PROBLEMA CORRIGIDO: o padrão anterior usava
 *   new Date(year, month + 1, 0).toISOString().split('T')[0]
 * que converte para UTC e pode retornar o dia anterior em fusos UTC-3 (Brasil).
 * Esta função monta a string diretamente, sem conversão UTC.
 */
export function getMonthRange(year: number, month: number): { inicioMes: string; fimMes: string } {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(lastDay).padStart(2, '0')
  return {
    inicioMes: `${year}-${mm}-01`,
    fimMes:    `${year}-${mm}-${dd}`,
  }
}

/**
 * Retorna o mês canônico de uma data string YYYY-MM-DD.
 * NUNCA usar em campos created_at ou timestamps.
 */
export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/**
 * Retorna o mês atual como 'YYYY-MM'.
 */
export function getCurrentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── getLedgerStatuses ────────────────────────────────────────────────────────

/**
 * Retorna o array de statuses para filtro SQL de acordo com o contexto.
 * @param includePending — quando true, adiciona OPERATIONAL_STATUSES (toggle "incluir pendentes")
 */
export function getLedgerStatuses(includePending = false): string[] {
  if (includePending) {
    return [...LEDGER_STATUSES, ...OPERATIONAL_STATUSES]
  }
  return [...LEDGER_STATUSES]
}

// ─── Resolução canônica de categoria ─────────────────────────────────────────

/**
 * Nome canônico para transações sem categoria.
 * SEMPRE "Sem categoria" — nunca "Outros", nunca string vazia.
 */
export const UNCATEGORIZED_LABEL = 'Sem categoria' as const

/**
 * Resolve o nome de exibição de uma categoria.
 */
export function resolveCategoryName(
  categoryId: string | null | undefined,
  categoryMap: Record<string, string>,
): string {
  if (!categoryId) return UNCATEGORIZED_LABEL
  return categoryMap[categoryId] ?? UNCATEGORIZED_LABEL
}

// ─── CatSlice — shape canônico do gráfico ─────────────────────────────────────

/**
 * Shape canônico de uma fatia do gráfico de categorias.
 * categoryId é preservado desde a origem para FEAT-CHART-DRILL.
 */
export interface CatSlice {
  categoryId: string | null
  name:       string
  value:      number
}

// ─── Summary financeiro ───────────────────────────────────────────────────────

export interface FinancialSummary {
  income:  number
  expense: number
  balance: number
}

/**
 * Calcula summary de um array de transações já filtrado.
 */
export function calcSummary(
  transactions: Array<{ type: string; amount: number; lifecycle_status: string }>,
  statusFilter: string[],
): FinancialSummary {
  const relevant = transactions.filter(t => statusFilter.includes(t.lifecycle_status))
  const income   = relevant.filter(t => t.type === 'income').reduce((s, t)  => s + t.amount, 0)
  const expense  = relevant.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  return { income, expense, balance: income - expense }
}

/**
 * Calcula os dois blocos do summary da página de transações:
 * - ledger:      CONFIRMED + OVERDUE  → "saldo real"
 * - operational: PENDING_EXPECTED + PENDING_REVIEW → "previsto / em revisão"
 */
export function calcDualSummary(
  transactions: Array<{ type: string; amount: number; lifecycle_status: string }>,
): { ledger: FinancialSummary; operational: FinancialSummary } {
  return {
    ledger:      calcSummary(transactions, [...LEDGER_STATUSES]),
    operational: calcSummary(transactions, [...OPERATIONAL_STATUSES]),
  }
}

// ─── buildCategorySlices ──────────────────────────────────────────────────────

/**
 * Agrega despesas por categoria a partir de transações já filtradas por mês.
 * Usado como fallback se a view SQL não estiver disponível.
 * Em produção, preferir consumir diretamente a view expenses_by_category.
 */
export function buildCategorySlices(
  transactions: Array<{
    type: string
    amount: number
    category_id: string | null
    lifecycle_status: string
  }>,
  categoryMap: Record<string, string>,
  statusFilter: string[],
  maxSlices = 6,
): CatSlice[] {
  const expenses = transactions.filter(
    t => t.type === 'expense' && statusFilter.includes(t.lifecycle_status),
  )

  const map: Record<string, { value: number; categoryId: string | null }> = {}

  for (const t of expenses) {
    const name = resolveCategoryName(t.category_id, categoryMap)
    if (!map[name]) map[name] = { value: 0, categoryId: t.category_id }
    map[name].value += t.amount
  }

  return Object.entries(map)
    .map(([name, { value, categoryId }]): CatSlice => ({ categoryId, name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, maxSlices)
}
