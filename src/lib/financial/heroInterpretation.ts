/**
 * heroInterpretation.ts
 *
 * Pipeline de interpretação financeira do SaKel.
 *
 * HOME = Diagnóstico
 * ANALYTICS = Investigação
 * TRANSAÇÕES = Evidência
 *
 * Fluxo:
 *   HEALTH_CHECK_IDS (healthChecks.ts) ← fonte canônica de IDs
 *   runFinancialHealthChecks() → HealthCheckResult[]
 *   + HeroInterpretationContext (métricas, forecast, trends)
 *   ↓
 *   mapHealthChecksToHeroState()
 *   ↓
 *   HeroInterpretation → HeroZone (apenas renderização)
 *
 *   + RecommendationContext
 *   ↓
 *   generateRecommendation() → string | null → HeroZone
 *
 * Mudanças v2 (revisão pós-review):
 *   - IDs importados de HEALTH_CHECK_IDS — fonte única de verdade (INC-S33-001)
 *   - severityScore usado na classificação de estado, não mais código morto
 *   - confidence renomeado para coverageScore + recalculado com peso de histórico
 *   - highlights tipados por HighlightKind — elimina string matching frágil
 *   - narrative adicionado ao HeroInterpretation (história antes de lista)
 *   - linguagem dos summaries revisada — mais concreta, menos corporativa
 *   - HeroInterpretationContext expandido: trends + daysTracked + transactionCount
 *
 * Mudanças v2.1 (INC-S39-003):
 *   - hasCheck() corrigido: c.id → c.type, c.triggered removido
 *     (HealthCheckResult não possui campo id nem triggered;
 *      presença no array = check disparado)
 *   - calcSeverityScore() corrigido: c.triggered removido, c.id → c.type
 */

// ─── Dependências internas ─────────────────────────────────────────────────────

import { HEALTH_CHECK_IDS as HC } from '@/lib/financial/healthChecks'
import type { HealthCheckResult }  from '@/lib/financial/healthChecks'
import type { ForecastSummary }    from '@/lib/financialEngine'

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type HeroState = 'excellent' | 'healthy' | 'attention' | 'critical'

type HighlightKind = 'positive' | 'negative'

interface Highlight {
  kind:  HighlightKind
  label: string
}

export interface HeroInterpretation {
  state: HeroState
  headline: string
  narrative: string
  summary: string
  coverageScore: number
  highlights: string[]
  primaryMetric: {
    label: string
    value: number
  }
}

// ─── Contexto de entrada ───────────────────────────────────────────────────────

export interface FinancialTrends {
  patrimonioVariation30d: number
  patrimonioGrowing: boolean
  expenseVariationPct: number
}

export interface HeroInterpretationContext {
  checks: HealthCheckResult[]
  patrimonioTotal: number
  liquidez: number
  totalFaturas: number
  projectedBalance: number
  trends: FinancialTrends
  daysTracked: number
  transactionCount: number
}

// ─── CoverageScore ────────────────────────────────────────────────────────────

function calcCoverageScore(
  checksWithData:   number,
  daysTracked:      number,
  transactionCount: number,
  expectedChecks  = 7,
  minDays         = 90,
  minTransactions = 30,
): number {
  const checkCoverage   = Math.min(checksWithData / expectedChecks, 1)
  const historyCoverage = Math.min(daysTracked / minDays, 1)
  const volumeCoverage  = Math.min(transactionCount / minTransactions, 1)
  return (checkCoverage + historyCoverage + volumeCoverage) / 3
}

// ─── Helpers de checks ────────────────────────────────────────────────────────
//
// INC-S39-003: HealthCheckResult não possui campo `id` nem `triggered`.
// O campo canônico de identificação é `type`.
// A presença do item no array já indica que o check disparou —
// runFinancialHealthChecks() só retorna itens positivos.

function hasCheck(checks: HealthCheckResult[], id: string): boolean {
  return checks.some(c => c.type === id)
}

function countTriggered(checks: HealthCheckResult[], ids: string[]): number {
  return ids.filter(id => hasCheck(checks, id)).length
}

// ─── SeverityScore ────────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Partial<Record<string, number>> = {
  [HC.INVOICE_OVERDUE]:        1.0,
  [HC.NEGATIVE_FORECAST]:      0.9,
  [HC.INVOICE_DUE_SOON]:       0.5,
  [HC.CATEGORY_OVER_BUDGET]:   0.4,
  [HC.RECURRING_WITHOUT_ACCT]: 0.2,
}

function calcSeverityScore(checks: HealthCheckResult[]): number {
  const maxWeight = Object.values(SEVERITY_WEIGHT).reduce<number>((s, w) => s + (w ?? 0), 0) || 1

  // INC-S39-003: presença no array = disparado. Sem filtro por c.triggered.
  // c.id → c.type (campo canônico de HealthCheckResult).
  const totalWeight = checks.reduce(
    (sum, c) => sum + (SEVERITY_WEIGHT[c.type] ?? 0),
    0,
  )

  return Math.min(totalWeight / maxWeight, 1)
}

// ─── Highlights tipados ───────────────────────────────────────────────────────

function buildTypedHighlights(
  ctx:   HeroInterpretationContext,
  state: HeroState,
): string[] {
  const items: Highlight[] = []

  if (hasCheck(ctx.checks, HC.EMERGENCY_RESERVE))
    items.push({ kind: 'positive', label: 'Reserva de emergência completa' })

  if (ctx.trends.patrimonioGrowing)
    items.push({ kind: 'positive', label: 'Patrimônio crescendo há 3 meses' })

  if (!hasCheck(ctx.checks, HC.INVOICE_OVERDUE) && ctx.totalFaturas === 0)
    items.push({ kind: 'positive', label: 'Nenhuma fatura em aberto' })

  if (ctx.projectedBalance > 0 && (state === 'excellent' || state === 'healthy'))
    items.push({ kind: 'positive', label: 'Caixa projetado positivo para os próximos 30 dias' })

  if (hasCheck(ctx.checks, HC.INVOICE_OVERDUE))
    items.push({ kind: 'negative', label: 'Fatura em atraso identificada' })

  if (hasCheck(ctx.checks, HC.INVOICE_DUE_SOON))
    items.push({ kind: 'negative', label: 'Fatura com vencimento próximo' })

  if (hasCheck(ctx.checks, HC.NEGATIVE_FORECAST))
    items.push({ kind: 'negative', label: 'Projeção de caixa negativa nos próximos 30 dias' })

  if (hasCheck(ctx.checks, HC.CATEGORY_OVER_BUDGET))
    items.push({ kind: 'negative', label: 'Categoria de gasto acima do padrão histórico' })

  if (hasCheck(ctx.checks, HC.RECURRING_WITHOUT_ACCT))
    items.push({ kind: 'negative', label: 'Recorrência sem conta vinculada' })

  const priorityKind:  HighlightKind = (state === 'excellent' || state === 'healthy') ? 'positive' : 'negative'
  const secondaryKind: HighlightKind = priorityKind === 'positive' ? 'negative' : 'positive'

  const priority  = items.filter(h => h.kind === priorityKind)
  const secondary = items.filter(h => h.kind === secondaryKind)

  return [...priority, ...secondary].slice(0, 3).map(h => h.label)
}

// ─── Conteúdo textual dos estados ─────────────────────────────────────────────

interface StateContent {
  headline:  string
  narrative: string
  summary:   string
}

function buildExcellentContent(ctx: HeroInterpretationContext): StateContent {
  const hasReserve = hasCheck(ctx.checks, HC.EMERGENCY_RESERVE)
  const varStr     = ctx.trends.patrimonioVariation30d > 0
    ? `cresceu ${fmtBRL(ctx.trends.patrimonioVariation30d)} nos últimos 30 dias`
    : 'permanece estável'

  if (hasReserve && ctx.trends.patrimonioGrowing) {
    return {
      headline:  'Posição financeira excelente',
      narrative: `Seu patrimônio ${varStr} e os compromissos dos próximos 30 dias estão cobertos pela liquidez atual.`,
      summary:   'A reserva de emergência está completa e o histórico recente aponta crescimento consistente. Não há sinais de pressão sobre o caixa no horizonte visível.',
    }
  }
  if (hasReserve) {
    return {
      headline:  'Posição financeira excelente',
      narrative: `Seu patrimônio ${varStr}. A reserva de emergência está completa e não há faturas críticas no horizonte imediato.`,
      summary:   'Todos os compromissos dos próximos 30 dias estão cobertos e a posição de liquidez permanece confortável.',
    }
  }
  return {
    headline:  'Posição financeira excelente',
    narrative: `Seu patrimônio ${varStr} e o caixa projetado para os próximos 30 dias é positivo.`,
    summary:   'Não foram identificados riscos relevantes para o próximo ciclo financeiro. Sua liquidez está saudável.',
  }
}

function buildHealthyContent(ctx: HeroInterpretationContext): StateContent {
  const hasCategoryAlert = hasCheck(ctx.checks, HC.CATEGORY_OVER_BUDGET)
  const hasInvoiceSoon   = hasCheck(ctx.checks, HC.INVOICE_DUE_SOON)
  const varStr           = ctx.trends.patrimonioVariation30d > 0
    ? `cresceu ${fmtBRL(ctx.trends.patrimonioVariation30d)}`
    : 'permanece estável'

  if (hasCategoryAlert && hasInvoiceSoon) {
    return {
      headline:  'Posição financeira saudável',
      narrative: `Seu patrimônio ${varStr} nos últimos 30 dias. Há uma fatura próxima e gastos acima do padrão em alguma categoria que merecem acompanhamento.`,
      summary:   'A posição de liquidez permanece positiva. Os desvios identificados não representam risco imediato, mas vale monitorar antes do próximo vencimento.',
    }
  }
  if (hasCategoryAlert) {
    return {
      headline:  'Posição financeira saudável',
      narrative: `Seu patrimônio ${varStr} nos últimos 30 dias. Os gastos em uma categoria saíram do padrão histórico — vale checar antes de novos compromissos.`,
      summary:   'A liquidez permanece confortável e o caixa projetado é positivo. O desvio de categoria não compromete a posição atual.',
    }
  }
  return {
    headline:  'Posição financeira saudável',
    narrative: `Seu patrimônio ${varStr} nos últimos 30 dias. Os compromissos próximos estão cobertos pela liquidez disponível.`,
    summary:   'Há pequenos sinais que merecem atenção, mas nenhum representa risco imediato para o patrimônio ou para a liquidez dos próximos 30 dias.',
  }
}

function buildAttentionContent(ctx: HeroInterpretationContext): StateContent {
  const hasForecast    = hasCheck(ctx.checks, HC.NEGATIVE_FORECAST)
  const hasInvoiceSoon = hasCheck(ctx.checks, HC.INVOICE_DUE_SOON)

  if (hasForecast) {
    return {
      headline:  'Atenção necessária',
      narrative: 'O caixa projetado para os próximos 30 dias está negativo. Sua liquidez atual cobre os compromissos imediatos, mas o horizonte é apertado.',
      summary:   'Revise os compromissos futuros antes de assumir novos gastos ou aportes. A posição patrimonial permanece intacta — o risco é de liquidez, não de patrimônio.',
    }
  }
  if (hasInvoiceSoon) {
    return {
      headline:  'Atenção necessária',
      narrative: 'Há uma fatura com vencimento próximo que exige monitoramento. Sua posição geral permanece equilibrada.',
      summary:   'Confirme a cobertura da fatura antes do vencimento para evitar juros ou impacto no limite. O restante dos indicadores está dentro do padrão.',
    }
  }
  return {
    headline:  'Atenção necessária',
    narrative: 'Mais de um indicador saiu do padrão esperado. Sua liquidez permanece positiva, mas o cenário pede atenção antes de novos compromissos.',
    summary:   'Nenhum dos desvios identificados é crítico isoladamente, mas a combinação deles merece revisão neste ciclo.',
  }
}

function buildCriticalContent(ctx: HeroInterpretationContext): StateContent {
  const hasOverdue  = hasCheck(ctx.checks, HC.INVOICE_OVERDUE)
  const hasForecast = hasCheck(ctx.checks, HC.NEGATIVE_FORECAST)

  if (hasOverdue && hasForecast) {
    return {
      headline:  'Risco financeiro identificado',
      narrative: 'Há faturas em atraso e o caixa projetado para os próximos dias é negativo. Ação imediata é necessária para evitar encargos e deterioração da posição.',
      summary:   'Priorize a regularização das pendências antes de qualquer novo compromisso financeiro. O patrimônio total permanece positivo — o risco é concentrado no curto prazo.',
    }
  }
  if (hasOverdue) {
    return {
      headline:  'Risco financeiro identificado',
      narrative: 'Existem faturas em atraso que podem gerar encargos e afetar sua posição de crédito. Regularize as pendências o quanto antes.',
      summary:   'O patrimônio total não está comprometido. O risco é pontual e reversível com ação rápida.',
    }
  }
  return {
    headline:  'Risco financeiro identificado',
    narrative: 'O caixa projetado indica pressão significativa nos próximos dias e a liquidez disponível está abaixo do recomendado em relação ao patrimônio.',
    summary:   'Avalie quais compromissos podem ser postergados e evite novos aportes até que a liquidez se normalize.',
  }
}

// ─── Função principal ──────────────────────────────────────────────────────────

export function mapHealthChecksToHeroState(
  ctx: HeroInterpretationContext,
): HeroInterpretation {
  const {
    checks,
    patrimonioTotal,
    liquidez,
    daysTracked,
    transactionCount,
  } = ctx

  const coverageScore  = calcCoverageScore(checks.length, daysTracked, transactionCount)
  const severityScore  = calcSeverityScore(checks)
  const liquidezRatio  = patrimonioTotal > 0 ? liquidez / patrimonioTotal : 0

  const hasOverdue     = hasCheck(checks, HC.INVOICE_OVERDUE)
  const hasForecastNeg = hasCheck(checks, HC.NEGATIVE_FORECAST)
  const hasInvoiceSoon = hasCheck(checks, HC.INVOICE_DUE_SOON)

  let state: HeroState

  if (hasOverdue || (severityScore > 0.85 && liquidezRatio < 0.10)) {
    state = 'critical'
  } else if (severityScore > 0.35 || hasForecastNeg || hasInvoiceSoon) {
    state = 'attention'
  } else if (severityScore > 0 || coverageScore < 0.5) {
    state = 'healthy'
  } else {
    state = 'excellent'
  }

  let content: StateContent

  switch (state) {
    case 'excellent': content = buildExcellentContent(ctx); break
    case 'healthy':   content = buildHealthyContent(ctx);   break
    case 'attention': content = buildAttentionContent(ctx); break
    case 'critical':  content = buildCriticalContent(ctx);  break
  }

  return {
    state,
    headline:      content.headline,
    narrative:     content.narrative,
    summary:       content.summary,
    coverageScore,
    highlights:    buildTypedHighlights(ctx, state),
    primaryMetric: {
      label: 'Patrimônio Total',
      value: patrimonioTotal,
    },
  }
}

// ─── Recomendação ──────────────────────────────────────────────────────────────

export interface RecommendationContext {
  forecastSummary:      ForecastSummary
  liquidez:             number
  patrimonioTotal:      number
  heroState:            HeroState
  currentMonthlyAporte: number
  reservaTargetMonths:  number
  avgMonthlyExpense:    number
}

export function generateRecommendation(ctx: RecommendationContext): string | null {
  const {
    forecastSummary,
    liquidez,
    heroState,
    currentMonthlyAporte,
    reservaTargetMonths,
    avgMonthlyExpense,
  } = ctx

  if (heroState === 'critical') return null

  const projectedBalance    = forecastSummary.projectedBalance
  const reservaTarget       = avgMonthlyExpense * reservaTargetMonths
  const reservaGap          = reservaTarget - liquidez
  const liquidezAposReserva = liquidez - reservaTarget

  if (reservaGap > 0 && heroState === 'healthy' && avgMonthlyExpense > 0) {
    const meses = Math.ceil(reservaGap / (avgMonthlyExpense * 0.2))
    if (meses <= 12) {
      const mensal = Math.round(reservaGap / meses / 100) * 100
      return `Sua reserva de emergência está em formação. Aportes de ${fmtBRL(mensal)} por mês completariam o objetivo em ${meses} ${meses === 1 ? 'mês' : 'meses'}.`
    }
  }

  if (heroState === 'excellent' && projectedBalance > 0 && liquidezAposReserva > 0) {
    const capacidade = Math.floor((projectedBalance * 0.80) / 100) * 100
    if (capacidade >= 200) {
      const sugestao = currentMonthlyAporte > 0
        ? Math.floor(Math.min(capacidade, currentMonthlyAporte * 0.5) / 100) * 100
        : capacidade
      if (sugestao >= 200) {
        return `Sua liquidez projetada comporta um aporte adicional de até ${fmtBRL(sugestao)} este mês sem comprometer os compromissos dos próximos 30 dias.`
      }
    }
  }

  if (heroState === 'attention' && projectedBalance < liquidez * 0.3) {
    return 'Mantenha a liquidez atual antes de assumir novos compromissos financeiros neste ciclo.'
  }

  if (heroState === 'excellent' && currentMonthlyAporte === 0 && liquidezAposReserva > avgMonthlyExpense) {
    return 'Você tem liquidez disponível além da reserva de emergência. Definir um aporte mensal recorrente aceleraria o crescimento patrimonial sem impactar seu caixa.'
  }

  return null
}

// ─── Utilitário interno ───────────────────────────────────────────────────────

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style:                 'currency',
    currency:              'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}