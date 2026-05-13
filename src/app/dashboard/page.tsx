'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import UserMenu from '@/components/UserMenu'
import { awardXP, getGamification } from '@/lib/gamification'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MonthBar    { mes: string; receitas: number; despesas: number }
interface CatSlice    { name: string; value: number }
interface InvoiceDue  { id: string; card_name: string; card_color: string; due_date: string; total_amount: number; days_until_due: number }
interface ProjecaoItem { label: string; value: number; color: string; sign: string }

// ─── Kal v3 types ──────────────────────────────────────────────────────────

type KalSeverity = 'danger' | 'warning' | 'positive' | 'info' | 'gamification'

interface KalInsight {
  id:         string
  severity:   KalSeverity
  icone:      string
  titulo:     string
  texto:      string
  acao?:      { label: string; href: string }
}

interface KalContext {
  // financeiro
  saldoLiquido:        number
  saldoContas:         number
  saldoPrevisto:       number
  recMes:              number
  despMes:             number
  recCount:            number
  instCount:           number
  invoicesDue:         { days_until_due: number; total_amount: number; card_name: string }[]
  totalFaturas:        number
  patrimonioInvestido: number
  uncategorizedCount:  number
  catAtual:            Record<string, number>
  catAnterior:         Record<string, number>
  recorrenteSugerida:  { descricao: string; valor: number }[]
  mesesPositivos:      number
  // gamificação
  xp:          number
  level:       number
  levelName:   string
  streakDays:  number
  badges:      string[]
  newBadge:    string | null
  leveledUp:   boolean
}

// severity → estilos visuais
const SEV_STYLE: Record<KalSeverity, { bg: string; border: string; cor: string }> = {
  danger:       { bg: 'bg-red-50',    border: 'border-red-100',    cor: 'text-red-700'    },
  warning:      { bg: 'bg-orange-50', border: 'border-orange-100', cor: 'text-orange-700' },
  positive:     { bg: 'bg-green-50',  border: 'border-green-100',  cor: 'text-green-700'  },
  info:         { bg: 'bg-indigo-50', border: 'border-indigo-100', cor: 'text-indigo-700' },
  gamification: { bg: 'bg-purple-50', border: 'border-purple-100', cor: 'text-purple-700' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const SLICE_COLORS = ['#6366f1','#f97316','#22c55e','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
const MONTH_NAMES  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const BADGE_NAMES: Record<string, string> = {
  first_transaction:  'Primeira Transação',
  first_account:      'Bem-vindo!',
  first_recurring:    'Automatizador',
  first_investment:   'Primeiro Investimento',
  ten_transactions:   'Em Ritmo',
  fifty_transactions: 'Veterano',
  month_positive:     'Mês no Azul',
  three_months_blue:  'Trio Positivo',
  streak_7:           'Fogo na Semana',
  streak_30:          'Mês Consistente',
  all_categorized:    'Tudo Organizado',
  budget_goal:        'Meta Cumprida',
}

const BADGE_EMOJI: Record<string, string> = {
  first_transaction:  '🏅',
  first_account:      '🏦',
  first_recurring:    '🔁',
  first_investment:   '📈',
  ten_transactions:   '💪',
  fifty_transactions: '🦅',
  month_positive:     '💚',
  three_months_blue:  '🌟',
  streak_7:           '🔥',
  streak_30:          '📅',
  all_categorized:    '🏷️',
  budget_goal:        '🎯',
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((new Date(dateStr + 'T12:00:00').getTime() - today.getTime()) / 86400000)
}

function normalizeDesc(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\d{4,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30)
}

function occurrencesInWindow(nextDueDate: string, frequency: string, horizonDate: Date): number {
  const start = new Date(nextDueDate + 'T12:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  if (start > horizonDate) return 0

  let count = 0
  let current = new Date(start)

  while (current <= horizonDate && count < 60) {
    if (current >= today) count++
    switch (frequency) {
      case 'daily':   current.setDate(current.getDate() + 1); break
      case 'weekly':  current.setDate(current.getDate() + 7); break
      case 'monthly': current.setMonth(current.getMonth() + 1); break
      case 'yearly':  current.setFullYear(current.getFullYear() + 1); break
      default:        return count
    }
    if (frequency === 'monthly' || frequency === 'yearly') break
  }
  return count
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor de insights Kal v3
// Prioridade: danger → warning → positive → info → gamification
// Retorna exatamente 3 insights: 1 crítico, 1 ação, 1 positivo/gamificação
// ─────────────────────────────────────────────────────────────────────────────

function gerarInsights(ctx: KalContext): KalInsight[] {
  const danger:       KalInsight[] = []
  const warning:      KalInsight[] = []
  const positive:     KalInsight[] = []
  const info:         KalInsight[] = []
  const gamification: KalInsight[] = []

  const PISO_INV = 200

  // ── DANGER ────────────────────────────────────────────────────────────────

  if (ctx.saldoLiquido < 0) {
    danger.push({
      id: 'saldo-negativo', severity: 'danger',
      icone: '⚠️',
      titulo: 'Saldo em risco',
      texto: `Suas faturas (${fmt(ctx.totalFaturas)}) estão acima do saldo em conta. Evite novos gastos até regularizar.`,
      acao: { label: 'Ver faturas', href: '/dashboard/faturas' },
    })
  }

  const fatVencidas = ctx.invoicesDue.filter(i => i.days_until_due < 0)
  if (fatVencidas.length > 0) {
    danger.push({
      id: 'fatura-vencida', severity: 'danger',
      icone: '🚨',
      titulo: `${fatVencidas.length === 1 ? 'Fatura vencida' : `${fatVencidas.length} faturas vencidas`}`,
      texto: `Você tem ${fatVencidas.length === 1 ? 'uma fatura em atraso' : `${fatVencidas.length} faturas em atraso`}. Regularize para evitar juros.`,
      acao: { label: 'Regularizar agora', href: '/dashboard/faturas' },
    })
  }

  // ── WARNING ───────────────────────────────────────────────────────────────

  const fatVencendo = ctx.invoicesDue.filter(i => i.days_until_due >= 0 && i.days_until_due <= 5)
  if (fatVencendo.length > 0) {
    const nomes = fatVencendo.map(f => f.card_name).join(', ')
    warning.push({
      id: 'fatura-vencendo', severity: 'warning',
      icone: '📅',
      titulo: fatVencendo.length === 1 ? 'Fatura vence em breve' : `${fatVencendo.length} faturas vencendo`,
      texto: `${nomes} vence${fatVencendo.length === 1 ? '' : 'm'} nos próximos 5 dias. Verifique se tem saldo disponível.`,
      acao: { label: 'Ver faturas', href: '/dashboard/faturas' },
    })
  }

  // Maior alta de categoria vs mês anterior
  let topCat = ''; let topPct = 0
  for (const [cat, val] of Object.entries(ctx.catAtual)) {
    const ant = ctx.catAnterior[cat] ?? 0
    if (ant >= 50 && val > ant) {
      const pct = Math.round(((val - ant) / ant) * 100)
      if (pct >= 30 && pct > topPct) { topPct = pct; topCat = cat }
    }
  }
  if (topCat) {
    warning.push({
      id: 'alta-categoria', severity: 'warning',
      icone: '📈',
      titulo: `${topCat} subiu ${topPct}% este mês`,
      texto: `Você gastou ${topPct}% a mais em ${topCat} do que no mês passado. Vale dar uma olhada.`,
      acao: { label: 'Ver transações', href: '/dashboard/transacoes' },
    })
  }

  if (ctx.despMes > ctx.recMes && ctx.recMes > 0) {
    const pct = Math.round(((ctx.despMes - ctx.recMes) / ctx.recMes) * 100)
    warning.push({
      id: 'despesa-maior', severity: 'warning',
      icone: '📊',
      titulo: 'Despesas acima das receitas',
      texto: `Você gastou ${pct}% a mais do que recebeu este mês. Bom momento para revisar.`,
      acao: { label: 'Ver transações', href: '/dashboard/transacoes' },
    })
  }

  // ── INFO / AÇÃO ───────────────────────────────────────────────────────────

  if (ctx.uncategorizedCount >= 3) {
    info.push({
      id: 'sem-categoria', severity: 'info',
      icone: '🏷️',
      titulo: `${ctx.uncategorizedCount} lançamentos sem categoria`,
      texto: 'Categorizar transações melhora relatórios e deixa os insights do Kal mais precisos.',
      acao: { label: 'Organizar agora', href: '/dashboard/transacoes' },
    })
  }

  if (ctx.recorrenteSugerida.length > 0) {
    const s = ctx.recorrenteSugerida[0]
    info.push({
      id: 'recorrente-sugerida', severity: 'info',
      icone: '🔁',
      titulo: 'Parece uma recorrência',
      texto: `"${s.descricao}" aparece todo mês (≈ ${fmt(s.valor)}). Cadastrar como recorrente facilita o controle.`,
      acao: { label: 'Cadastrar recorrência', href: '/dashboard/recorrencias' },
    })
  }

  if (ctx.instCount >= 6) {
    info.push({
      id: 'parcelas-longas', severity: 'info',
      icone: '📦',
      titulo: `${ctx.instCount} parcelas pendentes`,
      texto: 'Você tem compromissos parcelados nos próximos meses — já considerados no saldo previsto.',
      acao: { label: 'Ver transações', href: '/dashboard/transacoes' },
    })
  }

  if (ctx.recCount > 0 && !warning.find(c => c.id === 'fatura-vencendo') && !danger.find(c => c.id === 'fatura-vencida')) {
    info.push({
      id: 'recorrencias-previstas', severity: 'info',
      icone: '🔁',
      titulo: `${ctx.recCount} recorrência(s) nos próximos 30 dias`,
      texto: 'Já estão refletidas no saldo previsto. Nenhuma surpresa por enquanto.',
    })
  }

  // ── POSITIVE ──────────────────────────────────────────────────────────────

  if (ctx.mesesPositivos >= 3) {
    positive.push({
      id: 'tres-meses-positivos', severity: 'positive',
      icone: '🌟',
      titulo: `${ctx.mesesPositivos}º mês consecutivo no azul`,
      texto: 'Consistência é o hábito financeiro mais valioso. Continue assim.',
    })
  }

  if (ctx.recMes > ctx.despMes && ctx.recMes > 0 && ctx.mesesPositivos < 3) {
    positive.push({
      id: 'mes-no-azul', severity: 'positive',
      icone: '✅',
      titulo: 'Mês no azul',
      texto: `Você está sobrando ${fmt(ctx.recMes - ctx.despMes)} este mês. Considere reforçar a reserva.`,
    })
  }

  if (ctx.saldoPrevisto > PISO_INV && ctx.patrimonioInvestido === 0) {
    positive.push({
      id: 'sobra-sem-investimento', severity: 'positive',
      icone: '💡',
      titulo: 'Vai sobrar esse mês',
      texto: `Saldo previsto de ${fmt(ctx.saldoPrevisto)}. Já pensou em investir uma parte?`,
      acao: { label: 'Ver investimentos', href: '/dashboard/investimentos' },
    })
  }

  if (ctx.saldoPrevisto > 0 && ctx.patrimonioInvestido > 0) {
    positive.push({
      id: 'saldo-positivo-investindo', severity: 'positive',
      icone: '💚',
      titulo: 'Boa consistência financeira',
      texto: `Saldo previsto positivo e ${fmt(ctx.patrimonioInvestido)} investidos. Continue assim.`,
      acao: { label: 'Ver investimentos', href: '/dashboard/investimentos' },
    })
  }

  // ── GAMIFICAÇÃO ───────────────────────────────────────────────────────────

  // Level up tem prioridade máxima no bloco de gamificação
  if (ctx.leveledUp) {
    gamification.push({
      id: 'level-up', severity: 'gamification',
      icone: '🎉',
      titulo: `Você subiu para o nível ${ctx.level}!`,
      texto: `Parabéns! Você agora é ${ctx.levelName}. Continue registrando para desbloquear mais conquistas.`,
      acao: { label: 'Ver conquistas', href: '/dashboard/conquistas' },
    })
  }

  if (ctx.newBadge) {
    const nome  = BADGE_NAMES[ctx.newBadge]  ?? ctx.newBadge
    const emoji = BADGE_EMOJI[ctx.newBadge]  ?? '🏅'
    gamification.push({
      id: `badge-${ctx.newBadge}`, severity: 'gamification',
      icone: emoji,
      titulo: `Nova conquista: ${nome}`,
      texto: `Você desbloqueou um badge. Acesse conquistas para ver todos os seus marcos.`,
      acao: { label: 'Ver conquistas', href: '/dashboard/conquistas' },
    })
  }

  if (ctx.streakDays >= 7 && !ctx.leveledUp && !ctx.newBadge) {
    gamification.push({
      id: 'streak-ativo', severity: 'gamification',
      icone: '🔥',
      titulo: `${ctx.streakDays} dias seguidos`,
      texto: `Você está em sequência há ${ctx.streakDays} dia${ctx.streakDays > 1 ? 's' : ''}. Manter o hábito é o segredo.`,
      acao: { label: 'Ver conquistas', href: '/dashboard/conquistas' },
    })
  }

  if (gamification.length === 0 && ctx.xp > 0) {
    gamification.push({
      id: 'xp-resumo', severity: 'gamification',
      icone: '⭐',
      titulo: `${ctx.xp} XP · Nível ${ctx.level}`,
      texto: `Você é ${ctx.levelName}. Continue usando o app para ganhar XP e desbloquear conquistas.`,
      acao: { label: 'Ver conquistas', href: '/dashboard/conquistas' },
    })
  }

  // Fallback se nada gerado
  if (danger.length === 0 && warning.length === 0 && positive.length === 0 && info.length === 0 && gamification.length === 0) {
    positive.push({
      id: 'tudo-ok', severity: 'positive',
      icone: '🎯',
      titulo: 'Tudo equilibrado',
      texto: 'Nada de crítico nos próximos 30 dias. Continue acompanhando.',
    })
  }

  // Seleciona 1 de cada bloco (prioridade: danger > warning, info > positive, gamification)
  const critico  = danger[0]   ?? warning[0]  ?? null
  const acao     = warning[0] !== critico
    ? (warning.find(i => i !== critico) ?? info[0] ?? null)
    : info[0] ?? null
  const positivo = gamification[0] ?? positive[0] ?? null

  return [critico, acao, positivo].filter(Boolean) as KalInsight[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente KalDiz v3
// ─────────────────────────────────────────────────────────────────────────────

function KalDiz({ ctx, enabled }: { ctx: KalContext; enabled: boolean }) {
  if (!enabled) return null
  const insights = gerarInsights(ctx)
  if (insights.length === 0) return null

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-6">
      {/* Header Kal */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 shrink-0 flex items-center justify-center">
            <img
              src="/kal-avatar.png"
              alt="Kal"
              className="w-10 h-10 object-contain"
              onError={(e) => {
                const t = e.currentTarget as HTMLImageElement
                t.style.display = 'none'
                const fb = t.nextElementSibling as HTMLElement
                if (fb) fb.style.display = 'flex'
              }}
            />
            <span
              style={{ display: 'none' }}
              className="w-10 h-10 rounded-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold"
            >K</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-none">Kal</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Seu copiloto financeiro</p>
          </div>
        </div>
        {/* Mini XP bar */}
        {ctx.xp > 0 && (
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-400 leading-none">Nível {ctx.level}</p>
              <p className="text-[10px] text-purple-600 font-medium mt-0.5">{ctx.xp} XP</p>
            </div>
            <a href="/dashboard/conquistas"
              className="w-8 h-8 rounded-full bg-purple-50 border border-purple-100 flex items-center justify-center text-sm hover:bg-purple-100 transition-colors"
              title="Ver conquistas">
              ⭐
            </a>
          </div>
        )}
      </div>

      {/* Insights */}
      <div className="space-y-2.5">
        {insights.map(insight => {
          const s = SEV_STYLE[insight.severity]
          return (
            <div key={insight.id} className={`rounded-xl px-4 py-3 border ${s.bg} ${s.border}`}>
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0 mt-0.5">{insight.icone}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold mb-0.5 ${s.cor}`}>{insight.titulo}</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{insight.texto}</p>
                  {insight.acao && (
                    <a href={insight.acao.href}
                      className={`inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 hover:underline ${s.cor}`}>
                      {insight.acao.label} →
                    </a>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes reutilizáveis
// ─────────────────────────────────────────────────────────────────────────────

function SaldoPrevisto({ itens, saldoPrevisto, recCount, instCount }: {
  itens: ProjecaoItem[]; saldoPrevisto: number; recCount: number; instCount: number
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-gray-700">Saldo Previsto</p>
          <p className="text-xs text-gray-400 mt-0.5">Projeção para os próximos 30 dias</p>
        </div>
        <span className="text-[10px] font-medium bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">30 dias</span>
      </div>
      <div className="space-y-2 mb-4">
        {itens.map(item => (
          <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className={`text-xs font-semibold ${item.color}`}>
              {item.sign && <span className="mr-0.5">{item.sign}</span>}
              {fmt(item.value)}
            </p>
          </div>
        ))}
      </div>
      <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${saldoPrevisto >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
        <div>
          <p className="text-xs font-semibold text-gray-700">Saldo projetado</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{recCount} recorrência(s) · {instCount} parcela(s) pendente(s)</p>
        </div>
        <p className={`text-xl font-bold ${saldoPrevisto >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(saldoPrevisto)}</p>
      </div>
    </div>
  )
}

function InvestimentoCard({ valor }: { valor: number }) {
  const [visivel, setVisivel] = useState(() => {
    try { return localStorage.getItem('sakel-inv-visivel') !== 'false' } catch { return true }
  })
  function toggle() {
    const next = !visivel; setVisivel(next)
    try { localStorage.setItem('sakel-inv-visivel', String(next)) } catch {}
  }
  return (
    <div className="rounded-xl px-5 py-4 mb-6 flex items-center justify-between border bg-indigo-50 border-indigo-100">
      <div>
        <p className="text-xs font-medium text-gray-600">📈 Patrimônio investido</p>
        <p className="text-xs text-gray-400 mt-0.5">Não incluso no saldo operacional</p>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-2 justify-end mb-1">
          <p className="text-2xl font-bold text-indigo-700">{visivel ? fmt(valor) : '••••••'}</p>
          <button onClick={toggle} title={visivel ? 'Ocultar' : 'Mostrar'}
            className="text-indigo-400 hover:text-indigo-600 transition-colors text-sm">
            {visivel ? '👁️' : '🙈'}
          </button>
        </div>
        <a href="/dashboard/investimentos" className="text-xs text-indigo-500 hover:underline">Ver investimentos →</a>
      </div>
    </div>
  )
}

function InvoiceBadge({ days }: { days: number }) {
  if (days < 0)   return <span className="text-[10px] font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Vencida</span>
  if (days === 0) return <span className="text-[10px] font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Vence hoje</span>
  if (days <= 3)  return <span className="text-[10px] font-medium bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">Vence em {days}d</span>
  if (days <= 7)  return <span className="text-[10px] font-medium bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full">Vence em {days}d</span>
  return <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{days}d</span>
}

function EmptyDashboard({ email: _ }: { email: string }) {
  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Bem-vindo ao SaKel Finanças</p>
        </div>
        <UserMenu />
      </div>
      <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center mb-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl"
          style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}>🏦</div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Sua central financeira começa aqui</h2>
        <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
          Adicione uma conta para acompanhar saldo, transações e investimentos.
        </p>
        <a href="/dashboard/contas"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
          Criar minha primeira conta
        </a>
      </div>
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-3">O que você pode fazer</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[
          { emoji: '🏦', title: 'Adicionar contas',  desc: 'Cadastre banco, carteira ou poupança com saldo inicial.', href: '/dashboard/contas' },
          { emoji: '💳', title: 'Cadastrar cartões', desc: 'Vincule seus cartões de crédito e acompanhe faturas.',     href: '/dashboard/cartoes' },
          { emoji: '🏷️', title: 'Ver categorias',   desc: '14 categorias padrão já foram criadas para você.',         href: '/dashboard/categorias' },
        ].map(item => (
          <a key={item.href} href={item.href}
            className="bg-white border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 rounded-xl p-4 transition-colors group">
            <span className="text-2xl mb-2 block">{item.emoji}</span>
            <p className="text-sm font-medium text-gray-700 group-hover:text-indigo-700 mb-1">{item.title}</p>
            <p className="text-xs text-gray-400">{item.desc}</p>
          </a>
        ))}
      </div>
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 flex items-start gap-3">
        <span className="text-xl shrink-0">💡</span>
        <div>
          <p className="text-sm font-medium text-indigo-700 mb-0.5">Dica rápida</p>
          <p className="text-xs text-indigo-500">Após criar uma conta, use o botão + no canto inferior direito para registrar receitas e despesas.</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard principal
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient()

  const [email,               setEmail]               = useState('')
  const [saldoContas,         setSaldoContas]         = useState(0)
  const [totalFaturas,        setTotalFaturas]        = useState(0)
  const [patrimonioInvestido, setPatrimonioInvestido] = useState(0)
  const [recMes,              setRecMes]              = useState(0)
  const [despMes,             setDespMes]             = useState(0)
  const [monthBars,           setMonthBars]           = useState<MonthBar[]>([])
  const [catSlices,           setCatSlices]           = useState<CatSlice[]>([])
  const [invoicesDue,         setInvoicesDue]         = useState<InvoiceDue[]>([])
  const [loading,             setLoading]             = useState(true)
  const [hasAccounts,         setHasAccounts]         = useState(true)
  const [projecaoItens,       setProjecaoItens]       = useState<ProjecaoItem[]>([])
  const [saldoPrevisto,       setSaldoPrevisto]       = useState(0)
  const [recCount,            setRecCount]            = useState(0)
  const [instCount,           setInstCount]           = useState(0)
  const [kalEnabled,          setKalEnabled]          = useState(true)
  const [kalCtx,              setKalCtx]              = useState<KalContext | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }
      setEmail(user.email ?? '')

      const now       = new Date()
      const year      = now.getFullYear()
      const month     = now.getMonth()
      const inicioMes = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const fimMes    = new Date(year, month + 1, 0).toISOString().split('T')[0]
      const hoje      = now.toISOString().split('T')[0]
      const limit30   = new Date(now); limit30.setDate(limit30.getDate() + 30)
      const horizon30 = limit30.toISOString().split('T')[0]
      const inicio2m  = new Date(year, month - 1, 1).toISOString().split('T')[0]
      const fimMesAnterior = new Date(year, month, 0).toISOString().split('T')[0]

      // Preferências
      const { data: prefs } = await supabase
        .from('user_preferences').select('kaldiz_enabled').eq('user_id', user.id).single()
      if (prefs) setKalEnabled(prefs.kaldiz_enabled ?? true)

      // Contas
      const { data: acc } = await supabase
        .from('accounts').select('current_balance')
        .eq('user_id', user.id).eq('is_active', true).neq('type', 'credit')
      const accList = (acc ?? []) as { current_balance: number }[]
      if (accList.length === 0) { setHasAccounts(false); setLoading(false); return }
      setHasAccounts(true)
      const saldo = accList.reduce((s, a) => s + Number(a.current_balance), 0)
      setSaldoContas(saldo)

      // Faturas abertas
      const { data: openInv } = await supabase
        .from('credit_card_invoices').select('total_amount')
        .eq('user_id', user.id).in('status', ['open','overdue'])
      const faturas = ((openInv ?? []) as { total_amount: number }[]).reduce((s, i) => s + Number(i.total_amount), 0)
      setTotalFaturas(faturas)

      // Investimentos
      const { data: invData } = await supabase
        .from('investments').select('current_amount').eq('user_id', user.id).eq('is_active', true)
      const totalInv = ((invData ?? []) as { current_amount: number }[]).reduce((s, i) => s + Number(i.current_amount), 0)
      setPatrimonioInvestido(totalInv)

      // Faturas próximas
      const { data: dueInv } = await supabase
        .from('credit_card_invoices').select('id, total_amount, status, due_date, credit_card_id')
        .eq('user_id', user.id).in('status', ['open','overdue'])
        .lte('due_date', horizon30).order('due_date')
      const { data: cards } = await supabase.from('credit_cards').select('id, name, color').eq('user_id', user.id)
      const cardMap = Object.fromEntries(((cards ?? []) as { id: string; name: string; color: string }[]).map(c => [c.id, c]))
      const invoicesFormatted = ((dueInv ?? []) as { id: string; total_amount: number; due_date: string; credit_card_id: string }[]).map(inv => ({
        id:             inv.id,
        card_name:      cardMap[inv.credit_card_id]?.name  ?? 'Cartão',
        card_color:     cardMap[inv.credit_card_id]?.color ?? '#6366f1',
        due_date:       inv.due_date,
        total_amount:   Number(inv.total_amount),
        days_until_due: daysUntil(inv.due_date),
      }))
      setInvoicesDue(invoicesFormatted)

      // Transações do mês
      const { data: txMes } = await supabase
        .from('transactions').select('type, amount, category_id, description, status')
        .eq('user_id', user.id).gte('date', inicioMes).lte('date', fimMes)
        .in('type', ['income','expense'])
      const txArr = (txMes ?? []) as { type: string; amount: number; category_id: string | null; description: string; status: string }[]
      const recMesVal  = txArr.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
      const despMesVal = txArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
      setRecMes(recMesVal)
      setDespMes(despMesVal)
      const uncategorized = txArr.filter(t => t.type === 'expense' && !t.category_id).length

      // Gráfico 6 meses
      const meses = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(year, month - (5 - i), 1)
        return { key: d.toISOString().slice(0, 7), label: MONTH_NAMES[d.getMonth()] + '/' + String(d.getFullYear()).slice(2) }
      })
      const { data: txHist } = await supabase
        .from('transactions').select('type, amount, date').eq('user_id', user.id)
        .gte('date', meses[0].key + '-01').in('type', ['income','expense'])
      const histArr = (txHist ?? []) as { type: string; amount: number; date: string }[]
      setMonthBars(meses.map(({ key, label }) => {
        const txs = histArr.filter(t => t.date.startsWith(key))
        return {
          mes:      label,
          receitas: txs.filter(t => t.type === 'income').reduce((s,  t) => s + Number(t.amount), 0),
          despesas: txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0),
        }
      }))

      // Meses consecutivos positivos
      let mesesPositivos = 0
      for (let i = 0; i < 3; i++) {
        const key = meses[5 - i]?.key
        if (!key) break
        const txs  = histArr.filter(t => t.date.startsWith(key))
        const rec  = txs.filter(t => t.type === 'income').reduce((s,  t) => s + Number(t.amount), 0)
        const desp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
        if (rec > desp) mesesPositivos++; else break
      }

      // Categorias
      const { data: cats } = await supabase.from('categories').select('id, name').eq('user_id', user.id)
      const catNameMap = Object.fromEntries(((cats ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
      const catMap2: Record<string, number> = {}
      txArr.filter(t => t.type === 'expense').forEach(t => {
        const k = t.category_id ? (catNameMap[t.category_id] ?? 'Outros') : 'Sem categoria'
        catMap2[k] = (catMap2[k] ?? 0) + Number(t.amount)
      })
      setCatSlices(Object.entries(catMap2).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7))

      // Categorias mês anterior
      const { data: txAnt } = await supabase
        .from('transactions').select('amount, category_id').eq('user_id', user.id)
        .eq('type', 'expense').gte('date', fimMesAnterior.slice(0,7) + '-01').lte('date', fimMesAnterior)
      const catAntMap: Record<string, number> = {}
      ;((txAnt ?? []) as { amount: number; category_id: string | null }[]).forEach(t => {
        const k = t.category_id ? (catNameMap[t.category_id] ?? 'Outros') : 'Sem categoria'
        catAntMap[k] = (catAntMap[k] ?? 0) + Number(t.amount)
      })

      // Recorrências
      const { data: recRules } = await supabase
        .from('recurrences')
        .select('type, amount, frequency, next_due_date, end_date, is_active')
        .eq('user_id', user.id).eq('is_active', true)
        .or(`next_due_date.lte.${horizon30},end_date.is.null,end_date.gte.${hoje}`)
      const recRulesArr = (recRules ?? []) as {
        type: string; amount: number; frequency: string
        next_due_date: string | null; end_date: string | null; is_active: boolean
      }[]

      let recEntradas = 0; let recSaidas = 0; let recCountVal = 0
      for (const rule of recRulesArr) {
        if (!rule.next_due_date) continue
        if (rule.end_date && rule.end_date < hoje) continue
        const ocorrencias = occurrencesInWindow(rule.next_due_date, rule.frequency, limit30)
        if (ocorrencias === 0) continue
        const total = Number(rule.amount) * ocorrencias
        recCountVal += ocorrencias
        if (rule.type === 'income') recEntradas += total
        else recSaidas += total
      }

      // Fallback recurring_transactions
      if (recRulesArr.length === 0) {
        const { data: rtData } = await supabase
          .from('recurring_transactions')
          .select('type, amount, frequency, next_execution, end_date, active')
          .eq('user_id', user.id).eq('active', true)
          .or(`next_execution.lte.${horizon30},end_date.is.null,end_date.gte.${hoje}`)
        const rtArr = (rtData ?? []) as {
          type: string; amount: number; frequency: string
          next_execution: string | null; end_date: string | null; active: boolean
        }[]
        for (const rule of rtArr) {
          if (!rule.next_execution) continue
          if (rule.end_date && rule.end_date < hoje) continue
          const ocorrencias = occurrencesInWindow(rule.next_execution, rule.frequency, limit30)
          if (ocorrencias === 0) continue
          const total = Number(rule.amount) * ocorrencias
          recCountVal += ocorrencias
          if (rule.type === 'income') recEntradas += total
          else recSaidas += total
        }
      }
      setRecCount(recCountVal)

      // Parcelas
      const { data: instData } = await supabase
        .from('transactions').select('type, amount')
        .eq('user_id', user.id).not('installment_total', 'is', null)
        .eq('status', 'pending').gte('date', hoje).lte('date', horizon30)
        .in('type', ['income','expense'])
      const instArr = (instData ?? []) as { type: string; amount: number }[]
      const totalParcelas   = instArr.filter(i => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0)
      const parcelaReceitas = instArr.filter(i => i.type === 'income').reduce((s,  i) => s + Number(i.amount), 0)
      setInstCount(instArr.length)

      // Recorrências sugeridas
      const { data: tx60 } = await supabase
        .from('transactions').select('description, amount, date')
        .eq('user_id', user.id).eq('type', 'expense')
        .gte('date', inicio2m).lte('date', fimMes)
      const tx60Arr = (tx60 ?? []) as { description: string; amount: number; date: string }[]
      const descMesMap: Record<string, Set<string>> = {}
      const descValMap: Record<string, number[]>    = {}
      tx60Arr.forEach(t => {
        const key = normalizeDesc(t.description)
        const mes = t.date.slice(0, 7)
        if (!descMesMap[key]) descMesMap[key] = new Set()
        descMesMap[key].add(mes)
        if (!descValMap[key]) descValMap[key] = []
        descValMap[key].push(Number(t.amount))
      })
      const sugeridas: { descricao: string; valor: number }[] = []
      for (const [desc, mesesSet] of Object.entries(descMesMap)) {
        if (mesesSet.size >= 2 && desc.length > 2) {
          const vals = descValMap[desc]
          const media = vals.reduce((a, b) => a + b, 0) / vals.length
          const maxV = Math.max(...vals); const minV = Math.min(...vals)
          if (maxV > 0 && (maxV - minV) / maxV <= 0.20) sugeridas.push({ descricao: desc, valor: media })
        }
      }

      // Saldo previsto final
      const previsto = saldo + recEntradas + parcelaReceitas - recSaidas - totalParcelas - faturas
      setSaldoPrevisto(previsto)
      setProjecaoItens([
        { label: 'Saldo atual em contas',      value: saldo,         color: 'text-indigo-600', sign: ''  },
        { label: 'Receitas recorrentes (30d)', value: recEntradas,   color: 'text-green-600',  sign: '+' },
        { label: 'Despesas recorrentes (30d)', value: recSaidas,     color: 'text-red-500',    sign: '−' },
        { label: 'Parcelas pendentes (30d)',   value: totalParcelas, color: 'text-orange-500', sign: '−' },
        { label: 'Faturas em aberto',          value: faturas,       color: 'text-purple-600', sign: '−' },
      ])

      // ── Gamificação ──────────────────────────────────────────────────────
      // Lê estado atual ANTES de conceder — para detectar levelUp e newBadge
      let gamCtx = {
        xp: 0, level: 1, levelName: 'Novato Financeiro',
        streakDays: 0, badges: [] as string[],
        newBadge: null as string | null, leveledUp: false,
      }

      try {
        const gam = await getGamification(user.id)
        if (gam) {
          gamCtx.xp         = gam.xp
          gamCtx.level      = gam.level.level
          gamCtx.levelName  = gam.level.name
          gamCtx.streakDays = gam.streakDays
          gamCtx.badges     = gam.badges
        }

        // month_positive — concede XP + badge apenas se badge ainda não conquistado
        if (recMesVal > despMesVal && recMesVal > 0 && !gamCtx.badges.includes('month_positive')) {
          const r = await awardXP(user.id, 'month_positive', 'month_positive')
          if (r.newBadge)  gamCtx.newBadge  = r.newBadge
          if (r.leveledUp) { gamCtx.leveledUp = true; gamCtx.level = r.newLevel }
          gamCtx.xp = r.newXP
        }

        // three_months_blue — mesma lógica
        if (mesesPositivos >= 3 && !gamCtx.badges.includes('three_months_blue')) {
          const r = await awardXP(user.id, 'three_months_blue', 'three_months_blue')
          // só sobrescreve newBadge se ainda não há um badge novo nesta sessão
          if (r.newBadge  && !gamCtx.newBadge)  gamCtx.newBadge  = r.newBadge
          if (r.leveledUp) { gamCtx.leveledUp = true; gamCtx.level = r.newLevel }
          gamCtx.xp = r.newXP
        }

        // Atualiza levelName se mudou
        const LEVEL_NAMES: Record<number, string> = {
          1: 'Novato Financeiro', 2: 'Poupador Consistente',
          3: 'Orçamentista Eficiente', 4: 'Estrategista Financeiro', 5: 'Mestre do Cofrinho',
        }
        gamCtx.levelName = LEVEL_NAMES[gamCtx.level] ?? gamCtx.levelName
      } catch (e) {
        console.error('[dashboard] gamification error:', e)
      }

      // ── Monta contexto Kal completo ───────────────────────────────────────
      setKalCtx({
        saldoLiquido:        saldo - faturas,
        saldoContas:         saldo,
        saldoPrevisto:       previsto,
        recMes:              recMesVal,
        despMes:             despMesVal,
        recCount:            recCountVal,
        instCount:           instArr.length,
        invoicesDue:         invoicesFormatted,
        totalFaturas:        faturas,
        patrimonioInvestido: totalInv,
        uncategorizedCount:  uncategorized,
        catAtual:            catMap2,
        catAnterior:         catAntMap,
        recorrenteSugerida:  sugeridas.slice(0, 1),
        mesesPositivos,
        ...gamCtx,
      })

      setLoading(false)
    }
    load()
  }, [])

  const saldoLiquido = saldoContas - totalFaturas
  const now = new Date()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-white border border-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!hasAccounts) return <EmptyDashboard email={email} />

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{MONTH_NAMES[now.getMonth()]} de {now.getFullYear()}</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/dashboard/transacoes"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            + Nova Transação
          </a>
          <UserMenu />
        </div>
      </div>

      {/* Kal v3 */}
      {kalCtx && <KalDiz ctx={kalCtx} enabled={kalEnabled} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Saldo em Contas</p>
          <p className={`text-lg font-bold ${saldoContas >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{fmt(saldoContas)}</p>
          <p className="text-[10px] text-gray-400 mt-1">Excluindo cartões</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Faturas Abertas</p>
          <p className="text-lg font-bold text-purple-600">{fmt(totalFaturas)}</p>
          <p className="text-[10px] text-gray-400 mt-1">Total a pagar</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Receitas do Mês</p>
          <p className="text-lg font-bold text-green-600">{fmt(recMes)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Despesas do Mês</p>
          <p className="text-lg font-bold text-red-500">{fmt(despMes)}</p>
        </div>
      </div>

      {/* Patrimônio líquido */}
      <div className={`rounded-xl px-5 py-4 mb-4 flex items-center justify-between border ${saldoLiquido >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
        <div>
          <p className="text-xs font-medium text-gray-600">💰 Patrimônio líquido estimado</p>
          <p className="text-xs text-gray-400 mt-0.5">Saldo em contas menos faturas em aberto</p>
        </div>
        <p className={`text-2xl font-bold ${saldoLiquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(saldoLiquido)}</p>
      </div>

      {patrimonioInvestido > 0 && <InvestimentoCard valor={patrimonioInvestido} />}

      <SaldoPrevisto itens={projecaoItens} saldoPrevisto={saldoPrevisto} recCount={recCount} instCount={instCount} />

      {/* Faturas vencendo */}
      {invoicesDue.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Faturas próximas do vencimento</p>
            <a href="/dashboard/faturas" className="text-xs text-indigo-500 hover:underline">Ver todas</a>
          </div>
          <div className="space-y-2">
            {invoicesDue.map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs shrink-0"
                    style={{ backgroundColor: inv.card_color }}>💳</div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{inv.card_name}</p>
                    <p className="text-xs text-gray-400">Vence {new Date(inv.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <InvoiceBadge days={inv.days_until_due} />
                  <p className="text-sm font-semibold text-purple-600">{fmt(inv.total_amount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
        <div className="lg:col-span-3 bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-700 mb-4">Receitas × Despesas (6 meses)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthBars} barSize={12} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} />
              <Tooltip formatter={(v: number | string) => fmt(Number(v))} />
              <Bar dataKey="receitas" name="Receitas" fill="#22c55e" radius={[4,4,0,0]} />
              <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-700 mb-4">Despesas por Categoria</p>
          {catSlices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-44 text-gray-300">
              <span className="text-4xl mb-2">📂</span>
              <p className="text-xs">Sem dados este mês</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={catSlices} cx="50%" cy="44%" innerRadius={46} outerRadius={70} dataKey="value">
                  {catSlices.map((_, i) => <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number | string) => fmt(Number(v))} />
                <Legend iconSize={9} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Links rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Transações',    href: '/dashboard/transacoes',    emoji: '📋' },
          { label: 'Contas',        href: '/dashboard/contas',        emoji: '🏦' },
          { label: 'Cartões',       href: '/dashboard/cartoes',       emoji: '💳' },
          { label: 'Faturas',       href: '/dashboard/faturas',       emoji: '📄' },
          { label: 'Investimentos', href: '/dashboard/investimentos', emoji: '📈' },
        ].map(link => (
          <a key={link.href} href={link.href}
            className="bg-white border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 rounded-xl px-4 py-3 text-sm text-gray-600 hover:text-indigo-700 font-medium transition-colors flex items-center gap-2">
            <span>{link.emoji}</span> {link.label}
          </a>
        ))}
      </div>
    </div>
  )
}
