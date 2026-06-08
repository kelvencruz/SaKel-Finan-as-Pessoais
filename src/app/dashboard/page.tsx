// src/app/dashboard/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import {
  Bank, CreditCard, Tag, ListBullets, Receipt, TrendUp,
  Wallet, Warning, ArrowClockwise,
  ArrowUp, ArrowDown, ArrowUpRight, CalendarCheck, Eye, EyeSlash, Lightbulb,
} from '@phosphor-icons/react'

import { PageContainer }      from '@/components/layout/PageContainer'
import { usePrivacyStore }    from '@/stores/usePrivacyStore'
import { usePreferencesStore } from '@/stores/usePreferencesStore'
import { PrivateValue }       from '@/components/ui/PrivateValue'
import { AnimatedValue }      from '@/components/ui/AnimatedValue'
import { InsightsSection }    from '@/components/dashboard/InsightsSection'
import {
  fetchDashboard,
  type HeroInterpretation,
  type FinancialDeltas,
  type FinancialTrends,
  type InvoiceDue,
  type RecentTx,
  type MonthLine,
  type SyncStatus,
} from '@/lib/dashboard/dashboardService'
import { type ForecastSummary } from '@/lib/financialEngine'

// ─── Types locais (apenas UI — sem overlap com dashboardService) ──────────────

interface ProjecaoItem {
  label: string
  value: number
  color: string
  sign:  string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SLICE_COLORS = ['#7C3AED', '#f97316', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899']

const fmt  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v.toFixed(0)}`

// ─── Tooltip customizado ──────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:     'var(--surface-premium, var(--surface))',
      border:         '1px solid var(--glass-border, var(--border-subtle, var(--border)))',
      borderRadius:   8,
      padding:        '6px 10px',
      fontSize:       12,
      color:          'var(--text)',
      boxShadow:      'var(--card-shadow)',
      backdropFilter: 'blur(var(--glass-blur, 12px))',
    }}>
      {label && <p style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</p>}
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: 'var(--text)', fontWeight: 500 }}>
          {entry.name ? `${entry.name}: ` : ''}{fmt(Number(entry.value))}
        </p>
      ))}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-24 rounded-xl opacity-60"
              style={{ background: 'var(--surface-raised, var(--surface))' }} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <div className="h-64 rounded-xl opacity-60" style={{ background: 'var(--surface-raised, var(--surface))' }} />
            <div className="h-48 rounded-xl opacity-60" style={{ background: 'var(--surface-raised, var(--surface))' }} />
          </div>
          <div className="space-y-5">
            <div className="h-64 rounded-xl opacity-60" style={{ background: 'var(--surface-raised, var(--surface))' }} />
            <div className="h-40 rounded-xl opacity-60" style={{ background: 'var(--surface-raised, var(--surface))' }} />
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PageContainer>
      <div className="glass-card rounded-xl p-10 text-center border border-dashed"
        style={{ borderColor: 'rgba(220,38,38,0.13)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'rgba(220,38,38,0.1)' }}>
          <Warning weight="duotone" size={26} style={{ color: 'var(--danger, #DC2626)' }} />
        </div>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
          Erro ao carregar o dashboard
        </p>
        <p className="text-xs mb-6 max-w-xs mx-auto" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
        <button onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--primary)' }}>
          <ArrowClockwise size={14} weight="bold" />
          Tentar novamente
        </button>
      </div>
    </PageContainer>
  )
}

function EmptyDashboard() {
  return (
    <PageContainer>
      <div className="glass-card rounded-xl p-10 text-center mb-6 border-2 border-dashed"
        style={{ borderColor: 'var(--border-subtle, var(--border))' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--primary-glow)' }}>
          <Bank weight="duotone" size={28} style={{ color: 'var(--primary)' }} />
        </div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
          Sua central financeira começa aqui
        </h2>
        <p className="text-sm max-w-sm mx-auto mb-6" style={{ color: 'var(--text-secondary)' }}>
          Adicione uma conta para acompanhar saldo, transações e investimentos.
        </p>
        <a href="/dashboard/contas"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--primary)' }}>
          Criar minha primeira conta
        </a>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Bank,       title: 'Adicionar contas',  desc: 'Cadastre banco, carteira ou poupança com saldo inicial.', href: '/dashboard/contas'     },
          { icon: CreditCard, title: 'Cadastrar cartões', desc: 'Vincule seus cartões de crédito e acompanhe faturas.',     href: '/dashboard/cartoes'    },
          { icon: Tag,        title: 'Ver categorias',    desc: '14 categorias padrão já foram criadas para você.',         href: '/dashboard/categorias' },
        ].map(item => (
          <a key={item.href} href={item.href}
            className="glass-card rounded-xl p-4 border transition-all duration-300 group hover:-translate-y-0.5"
            style={{ borderColor: 'var(--glass-border, var(--border-subtle, var(--border)))' }}>
            <item.icon weight="duotone" size={24} className="mb-2" style={{ color: 'var(--primary)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{item.title}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
          </a>
        ))}
      </div>
    </PageContainer>
  )
}

function InvoiceBadge({ days }: { days: number }) {
  if (days < 0)   return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Vencida</span>
  if (days === 0) return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Hoje</span>
  if (days <= 7)  return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Em {days}d</span>
  return               <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-[var(--text-secondary)]">{days}d</span>
}

// ─── Delta badge — ETAPA-D ────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null
  const positive = delta > 0
  const color    = positive ? 'var(--success, #16A34A)' : 'var(--danger, #DC2626)'
  const bg       = positive ? 'rgba(22,163,74,0.10)'    : 'rgba(220,38,38,0.10)'
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
      style={{ color, background: bg }}>
      {positive ? <ArrowUp size={9} weight="bold" /> : <ArrowDown size={9} weight="bold" />}
      {fmt(Math.abs(delta))}
    </span>
  )
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient()

  const {
    syncFromDB,
    financialVisible,
    toggleFinancial,
    investmentsVisible,
    toggleInvestments,
  } = usePrivacyStore()

  const { preferences, loadPreferences, togglePreference } = usePreferencesStore()

  // ── Estado ──────────────────────────────────────────────────────────────────
  const [loading,             setLoading]             = useState(true)
  const [loadError,           setLoadError]           = useState<string | null>(null)
  const [hasAccounts,         setHasAccounts]         = useState(true)
  const [syncStatus,          setSyncStatus]          = useState<SyncStatus | null>(null)

  // KPIs
  const [saldoContas,         setSaldoContas]         = useState(0)
  const [totalFaturas,        setTotalFaturas]        = useState(0)
  const [patrimonioInvestido, setPatrimonioInvestido] = useState(0)
  const [recMes,              setRecMes]              = useState(0)
  const [despMes,             setDespMes]             = useState(0)

  // Deltas e trends — ETAPA-D
  const [deltas, setDeltas] = useState<FinancialDeltas>({ deltaRec: 0, deltaDesp: 0, deltaSaldo: 0 })
  const [trends, setTrends] = useState<FinancialTrends>({ currentMonthlyAporte: 0, avgMonthlyExpense: 0 })

  // Projeção
  const [forecastSummary, setForecastSummary] = useState<ForecastSummary>({
    projectedIncome:  0,
    projectedExpense: 0,
    projectedBalance: 0,
    recurrenceCount:  0,
    items:            [],
  })
  const [instCount, setInstCount] = useState(0)

  // Listas
  const [monthLine,   setMonthLine]   = useState<MonthLine[]>([])
  const [catSlices,   setCatSlices]   = useState<{ categoryId: string | null; name: string; value: number }[]>([])
  const [invoicesDue, setInvoicesDue] = useState<InvoiceDue[]>([])
  const [recentTxs,   setRecentTxs]   = useState<RecentTx[]>([])

  // Intelligence Layer — ETAPA-G
  const [heroData,       setHeroData]       = useState<HeroInterpretation | null>(null)
  const [recommendation, setRecommendation] = useState<string | null>(null)

  // DASH-002 — glow hover nos KPI cards
  const [hoveredKpi, setHoveredKpi] = useState<string | null>(null)

  // ── Load ─────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoadError(null)
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const vm = await fetchDashboard(user.id)

      setHasAccounts(vm.hasAccounts)
      setSaldoContas(vm.saldoContas)
      setTotalFaturas(vm.totalFaturas)
      setPatrimonioInvestido(vm.patrimonioInvestido)
      setRecMes(vm.recMes)
      setDespMes(vm.despMes)
      setDeltas(vm.deltas)
      setTrends(vm.trends)
      setForecastSummary(vm.forecastSummary)
      setInstCount(vm.instCount)
      setInvoicesDue(vm.invoicesDue)
      setRecentTxs(vm.recentTxs)
      setCatSlices(vm.catSlices)
      setMonthLine(vm.monthLine)
      setSyncStatus(vm.syncStatus)
      setHeroData(vm.heroData)
      setRecommendation(vm.recommendation)

    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Falha ao carregar dados financeiros.')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() },            [load])
  useEffect(() => { syncFromDB() },      [syncFromDB])
  useEffect(() => { loadPreferences() }, [loadPreferences])

  if (loading)      return <DashboardSkeleton />
  if (loadError)    return <DashboardError message={loadError} onRetry={load} />
  if (!hasAccounts) return <EmptyDashboard />

  // ── Projeção — responsabilidade da UI, não do engine ─────────────────────────

  const projecaoItens: ProjecaoItem[] = [
    { label: 'Saldo atual em contas',      value: saldoContas,                      color: 'var(--primary)',                sign: ''  },
    { label: 'Receitas recorrentes (30d)', value: forecastSummary.projectedIncome,  color: 'var(--success, #16A34A)',       sign: '+' },
    { label: 'Despesas recorrentes (30d)', value: forecastSummary.projectedExpense, color: 'var(--danger, #DC2626)',        sign: '−' },
    { label: 'Faturas em aberto',          value: totalFaturas,                     color: 'var(--danger, #DC2626)',        sign: '−' },
  ]

  // ── KPIs — ETAPA-I: labels alinhados ao manifesto — TD-016 ───────────────────

  const kpis = [
    {
      label:       'Posição Total',
      value:       saldoContas,
      sub:         'Excluindo cartões',
      delta:       deltas.deltaSaldo,
      icon:        Wallet,
      color:       saldoContas >= 0 ? 'var(--primary)' : 'var(--danger, #DC2626)',
      iconBg:      'var(--primary-glow)',
      accentColor: 'rgba(99,102,241,0.5)',
      group:       'financial' as const,
    },
    {
      label:       'Entradas',
      value:       recMes,
      sub:         'Este mês',
      delta:       deltas.deltaRec,
      icon:        ArrowUp,
      color:       'var(--success, #16A34A)',
      iconBg:      'rgba(22,163,74,0.12)',
      accentColor: 'rgba(34,197,94,0.5)',
      group:       'financial' as const,
    },
    {
      label:       'Compromissos',
      value:       despMes,
      sub:         'Este mês',
      delta:       deltas.deltaDesp,
      icon:        ArrowDown,
      color:       'var(--danger, #DC2626)',
      iconBg:      'rgba(220,38,38,0.12)',
      accentColor: 'rgba(248,113,113,0.5)',
      group:       'financial' as const,
    },
    {
      label:       'Patrimônio Investido',
      value:       patrimonioInvestido,
      sub:         'Total investido',
      delta:       0,
      icon:        TrendUp,
      color:       '#a78bfa',
      iconBg:      'rgba(167,139,250,0.12)',
      accentColor: 'rgba(167,139,250,0.5)',
      group:       'investments' as const,
    },
  ]

  // ── Insights visíveis — controlado por usePreferencesStore ───────────────────
  const insightsVisible = preferences?.show_insights ?? true

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageContainer>

      {/* Toggles de privacidade + status de sincronização */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {syncStatus && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <ArrowClockwise weight="duotone" size={12}
              style={{ color: syncStatus.failed > 0 ? 'var(--danger)' : 'var(--success)' }} />
            <span>
              Sincronizado{' '}
              {new Date(syncStatus.ran_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo',
              })}{' às '}
              {new Date(syncStatus.ran_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
              })}
              {syncStatus.processed > 0 && (
                <span style={{ color: 'var(--success)' }}>
                  {' · '}{syncStatus.processed} processada{syncStatus.processed !== 1 ? 's' : ''}
                </span>
              )}
              {syncStatus.failed > 0 && (
                <span style={{ color: 'var(--danger)' }}>
                  {' · '}{syncStatus.failed} falha{syncStatus.failed !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 ml-auto">
          {/* INC-S47-002 — ícones corrigidos: EyeSlash quando visível, Eye quando oculto */}
          <button
            onClick={toggleFinancial}
            className="flex items-center gap-1.5 text-xs min-h-[44px] px-2 transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={financialVisible ? 'Ocultar valores financeiros' : 'Mostrar valores financeiros'}
          >
            {financialVisible
              ? <EyeSlash weight="duotone" size={14} />
              : <Eye      weight="duotone" size={14} />}
            Financeiro
          </button>
          <button
            onClick={toggleInvestments}
            className="flex items-center gap-1.5 text-xs min-h-[44px] px-2 transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={investmentsVisible ? 'Ocultar investimentos' : 'Mostrar investimentos'}
          >
            {investmentsVisible
              ? <EyeSlash weight="duotone" size={14} />
              : <Eye      weight="duotone" size={14} />}
            Investimentos
          </button>
          {/* ETAPA-G.1 — toggle show_insights — TD-023 — INC-S42-001 */}
          <button
            onClick={() => togglePreference('show_insights')}
            className="flex items-center gap-1.5 text-xs min-h-[44px] px-2 transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-secondary)', opacity: insightsVisible ? 1 : 0.4 }}
            aria-label={insightsVisible ? 'Ocultar insights' : 'Mostrar insights'}
          >
            <Lightbulb weight="duotone" size={14} />
            Insights
          </button>
        </div>
      </div>

      {/* KPI Cards — DASH-002 glow hover + DASH-005 cascade entrance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
        {kpis.map((kpi, idx) => (
          <div
            key={kpi.label}
            className="glass-card rounded-2xl p-6 flex flex-col gap-4 cursor-default kpi-enter transition-shadow duration-300"
            style={{
              '--accent-color': kpi.accentColor,
              animationDelay:   `${idx * 90}ms`,
              boxShadow: hoveredKpi === kpi.label
                ? `0 0 0 1px ${kpi.accentColor}, 0 4px 24px 0 ${kpi.accentColor}`
                : undefined,
            } as React.CSSProperties}
            onMouseEnter={() => setHoveredKpi(kpi.label)}
            onMouseLeave={() => setHoveredKpi(null)}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-secondary)' }}>
                {kpi.label}
              </p>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: kpi.iconBg }}>
                <kpi.icon size={20} weight="duotone" style={{ color: kpi.color }} />
              </div>
            </div>
            {kpi.group === 'investments' ? (
              <AnimatedValue
                value={kpi.value} trigger={!loading} group="investments"
                delay={idx * 80} colorize={false}
                className="text-2xl font-bold tracking-tight"
                style={{ color: kpi.color } as React.CSSProperties}
              />
            ) : (
              <AnimatedValue
                value={kpi.value} trigger={!loading} group="financial"
                delay={idx * 80} colorize={false}
                className="text-2xl font-bold tracking-tight"
                style={{ color: kpi.color } as React.CSSProperties}
              />
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {kpi.sub}
              </p>
              {kpi.delta !== 0 && <DeltaBadge delta={kpi.delta} />}
            </div>
          </div>
        ))}
      </div>

      {/* InsightsSection — ETAPA-G — controlado por show_insights */}
      {heroData && (
        <div className="mb-5">
          <InsightsSection
            hero={heroData}
            recommendation={recommendation}
            visible={insightsVisible}
          />
        </div>
      )}

      {/* Layout 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-5">

          {/* Gráfico evolução do saldo */}
          <div className="glass-card rounded-xl p-5 cursor-default">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  Evolução do saldo
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Resultado mensal dos últimos 6 meses
                </p>
              </div>
              <span className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                Últimos 6 meses
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={monthLine}>
                <defs>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="var(--chart-line-start, #4f46e5)" />
                    <stop offset="50%"  stopColor="var(--chart-line-mid,   #0ea5e9)" />
                    <stop offset="100%" stopColor="var(--chart-line-end,   #a78bfa)" />
                  </linearGradient>
                  <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%"   stopColor="var(--chart-line-start, #4f46e5)" stopOpacity={0.18} />
                    <stop offset="60%"  stopColor="var(--chart-line-mid,   #0ea5e9)" stopOpacity={0.06} />
                    <stop offset="100%" stopColor="var(--chart-line-end,   #a78bfa)" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle, var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickFormatter={fmtK} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone" dataKey="saldo"
                  stroke="url(#lineGradient)" strokeWidth={2.5}
                  fill="url(#areaGradient)"
                  dot={{ fill: 'var(--chart-line-start, #4f46e5)', r: 4, strokeWidth: 2, stroke: 'var(--glass-bg, var(--surface))' }}
                  activeDot={{ r: 6, fill: 'var(--chart-line-mid, #0ea5e9)', stroke: 'var(--chart-line-mid, #0ea5e9)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Despesas por categoria */}
          <div className="glass-card rounded-xl p-5 cursor-default">
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
              Despesas por categoria
            </p>
            {catSlices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-36 gap-2">
                <Receipt weight="duotone" size={32} style={{ color: 'var(--border)' }} />
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Sem despesas este mês</p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <div className="w-full sm:w-[45%] shrink-0">
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={catSlices} cx="50%" cy="50%"
                        innerRadius={44} outerRadius={66}
                        dataKey="value"
                        stroke="var(--glass-bg, var(--surface))" strokeWidth={3} paddingAngle={2}
                      >
                        {catSlices.map((_, i) => (
                          <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-2">
                  {catSlices.map((slice, i) => {
                    const total = catSlices.reduce((s, c) => s + c.value, 0)
                    const pct   = total > 0 ? Math.round((slice.value / total) * 100) : 0
                    return (
                      <div key={slice.name} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length],
                            boxShadow:       `0 0 6px ${SLICE_COLORS[i % SLICE_COLORS.length]}88`,
                          }} />
                        <p className="text-xs truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                          {slice.name}
                        </p>
                        <p className="text-xs font-medium shrink-0" style={{ color: 'var(--text)' }}>
                          {pct}%
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Tendências — ETAPA-D */}
          <div className="glass-card rounded-xl p-5 cursor-default">
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
              Tendências
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ background: 'var(--surface-raised, var(--surface))' }}>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Aporte mensal
                </p>
                <p className="text-lg font-bold"
                  style={{ color: trends.currentMonthlyAporte >= 0 ? 'var(--success, #16A34A)' : 'var(--danger, #DC2626)' }}>
                  <PrivateValue value={fmt(trends.currentMonthlyAporte)} group="financial" />
                </p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Receitas − Despesas este mês
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--surface-raised, var(--surface))' }}>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Média de despesas
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                  <PrivateValue value={fmt(trends.avgMonthlyExpense)} group="financial" />
                </p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Últimos 6 meses
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Coluna lateral */}
        <div className="space-y-5">

          {/* Saldo Previsto */}
          <div className="glass-card rounded-xl p-5 cursor-default">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Saldo previsto
              </p>
              <span className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                30 dias
              </span>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
              Projeção para os próximos 30 dias
            </p>

            <AnimatedValue
              value={forecastSummary.projectedBalance}
              trigger={!loading}
              group="financial"
              colorize={true}
              className="text-3xl font-bold mb-5"
            />

            <div className="space-y-0">
              {projecaoItens.map(item => (
                <div key={item.label}
                  className="flex items-center justify-between py-2 border-b last:border-0 transition-colors duration-200"
                  style={{ borderColor: 'var(--glass-border, var(--border-subtle, var(--border)))' }}>
                  <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
                  <p className="text-[11px] font-semibold" style={{ color: item.color }}>
                    {item.sign && <span className="mr-0.5">{item.sign}</span>}
                    <PrivateValue value={fmt(item.value)} group="financial" />
                  </p>
                </div>
              ))}
            </div>

            {(forecastSummary.recurrenceCount > 0 || instCount > 0) && (
              <p className="text-[10px] mt-3" style={{ color: 'var(--text-secondary)' }}>
                {forecastSummary.recurrenceCount > 0 && (
                  <>{forecastSummary.recurrenceCount} recorrência{forecastSummary.recurrenceCount !== 1 ? 's' : ''}</>
                )}
                {forecastSummary.recurrenceCount > 0 && instCount > 0 && <span className="mx-1">·</span>}
                {instCount > 0 && <>{instCount} parcela{instCount !== 1 ? 's' : ''}</>}
              </p>
            )}
          </div>

          {/* Últimas transações */}
          <div className="glass-card rounded-xl p-5 cursor-default">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Últimas transações
              </p>
              <a href="/dashboard/transacoes"
                className="text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
                style={{ color: 'var(--primary)' }}>
                Ver todas <ArrowUpRight size={11} weight="bold" />
              </a>
            </div>
            {recentTxs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 gap-2">
                <ListBullets weight="duotone" size={28} style={{ color: 'var(--border)' }} />
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Nenhuma transação confirmada
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {recentTxs.map(tx => (
                  <div key={tx.id}
                    className="flex items-center gap-3 py-3 border-b last:border-0 transition-colors duration-200"
                    style={{ borderColor: 'var(--glass-border, var(--border-subtle, var(--border)))' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs"
                      style={{
                        background: tx.type === 'income'
                          ? 'rgba(34,197,94,0.12)'
                          : tx.type === 'expense'
                          ? 'rgba(248,113,113,0.10)'
                          : 'var(--primary-glow)',
                      }}>
                      {tx.category_icon
                        ? <span className="text-[13px]">{tx.category_icon}</span>
                        : tx.type === 'income'
                        ? <ArrowUp size={13} weight="duotone" style={{ color: 'var(--success, #16A34A)' }} />
                        : <ArrowDown size={13} weight="duotone" style={{ color: 'var(--danger, #DC2626)' }} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                        {tx.description}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {tx.category_name ?? 'Sem categoria'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold"
                        style={{
                          color: tx.type === 'income'
                            ? 'var(--success, #16A34A)'
                            : tx.type === 'expense'
                            ? 'var(--danger, #DC2626)'
                            : 'var(--primary)',
                        }}>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                        <PrivateValue value={fmt(tx.amount)} group="financial" />
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Faturas próximas */}
          {invoicesDue.length > 0 && (
            <div className="glass-card rounded-xl p-5 cursor-default">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarCheck weight="duotone" size={14} style={{ color: 'var(--text-secondary)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    Faturas próximas
                  </p>
                </div>
                <a href="/dashboard/faturas"
                  className="text-xs transition-opacity hover:opacity-70"
                  style={{ color: 'var(--primary)' }}>
                  Ver todas
                </a>
              </div>
              <div className="space-y-0">
                {invoicesDue.slice(0, 4).map(inv => (
                  <div key={inv.id}
                    className="flex items-center justify-between py-2.5 border-b last:border-0 transition-colors duration-200"
                    style={{ borderColor: 'var(--glass-border, var(--border-subtle, var(--border)))' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: inv.card_color }}>
                        <CreditCard weight="duotone" size={12} style={{ color: '#fff' }} />
                      </div>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{inv.card_name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(inv.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <InvoiceBadge days={inv.days_until_due} />
                      <p className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                        <PrivateValue value={fmt(inv.total_amount)} group="financial" />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Investimentos */}
          {patrimonioInvestido > 0 && (
            <div className="glass-card rounded-xl px-5 py-4 cursor-default">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendUp weight="duotone" size={14} style={{ color: '#a78bfa' }} />
                  <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Patrimônio investido
                  </p>
                </div>
                {/* INC-S47-002 — ícone corrigido no card lateral também */}
                <button
                  onClick={toggleInvestments}
                  className="transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label={investmentsVisible ? 'Ocultar investimentos' : 'Mostrar investimentos'}
                >
                  {investmentsVisible
                    ? <EyeSlash weight="duotone" size={14} />
                    : <Eye      weight="duotone" size={14} />}
                </button>
              </div>
              <AnimatedValue
                value={patrimonioInvestido} trigger={!loading} group="investments"
                colorize={false} className="text-xl font-bold mb-2"
                style={{ color: '#a78bfa' } as React.CSSProperties}
              />
              <a href="/dashboard/investimentos"
                className="text-[11px] flex items-center gap-1 transition-opacity hover:opacity-70"
                style={{ color: '#a78bfa' }}>
                Ver investimentos <ArrowUpRight size={10} weight="bold" />
              </a>
            </div>
          )}

        </div>
      </div>
    </PageContainer>
  )
}
