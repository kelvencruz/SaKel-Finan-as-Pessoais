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
  ArrowUp, ArrowDown, ArrowUpRight, CalendarCheck, Eye, EyeSlash,
} from '@phosphor-icons/react'

import { PageContainer }   from '@/components/layout/PageContainer'
import { usePrivacyStore } from '@/stores/usePrivacyStore'
import { PrivateValue }    from '@/components/ui/PrivateValue'
import { AnimatedValue }   from '@/components/ui/AnimatedValue'
import {
  getMonthRange,
  getCurrentMonthKey,
  getLedgerStatuses,
  calcAccountsBalance,
  daysUntil,
  getForecastSummary,
  UNCATEGORIZED_LABEL,
  occurrencesInWindow,
  type CatSlice,
  type ForecastSummary,
} from '@/lib/financialEngine'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthLine  { mes: string; saldo: number }
interface InvoiceDue {
  id:             string
  card_name:      string
  card_color:     string
  due_date:       string
  total_amount:   number
  days_until_due: number
}
interface RecentTx {
  id:            string
  description:   string
  amount:        number
  type:          'income' | 'expense' | 'transfer'
  category_name?: string
  category_icon?: string
  date:          string
}

// ─── UI: itens de projeção (representação visual — não pertence ao engine) ────

interface ProjecaoItem {
  label: string
  value: number
  color: string
  sign:  string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SLICE_COLORS = ['#7C3AED', '#f97316', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899']
const MONTH_NAMES  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

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
            <div className="h-40 rounded-xl opacity-60"  style={{ background: 'var(--surface-raised, var(--surface))' }} />
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

  const [syncStatus,          setSyncStatus]          = useState<{ ran_at: string; processed: number; failed: number } | null>(null)
  const [saldoContas,         setSaldoContas]         = useState(0)
  const [totalFaturas,        setTotalFaturas]        = useState(0)
  const [patrimonioInvestido, setPatrimonioInvestido] = useState(0)
  const [recMes,              setRecMes]              = useState(0)
  const [despMes,             setDespMes]             = useState(0)
  const [monthLine,           setMonthLine]           = useState<MonthLine[]>([])
  const [catSlices,           setCatSlices]           = useState<CatSlice[]>([])
  const [invoicesDue,         setInvoicesDue]         = useState<InvoiceDue[]>([])
  const [recentTxs,           setRecentTxs]           = useState<RecentTx[]>([])
  const [loading,             setLoading]             = useState(true)
  const [loadError,           setLoadError]           = useState<string | null>(null)
  const [hasAccounts,         setHasAccounts]         = useState(true)
  const [instCount,           setInstCount]           = useState(0)

  // ForecastSummary — dados canônicos do engine (sem lógica UI)
  const [forecastSummary, setForecastSummary] = useState<ForecastSummary>({
    projectedIncome:  0,
    projectedExpense: 0,
    projectedBalance: 0,
    recurrenceCount:  0,
    items:            [],
  })

  const load = useCallback(async () => {
    setLoadError(null)
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const now   = new Date()
      const year  = now.getFullYear()
      const month = now.getMonth()

      const { inicioMes, fimMes } = getMonthRange(year, month)
      const monthKey              = getCurrentMonthKey()
      const hoje                  = now.toISOString().split('T')[0]

      const limit30 = new Date(now); limit30.setDate(limit30.getDate() + 30)
      const horizon30 = limit30.toISOString().split('T')[0]

      // ── Contas ────────────────────────────────────────────────────────────
      const { data: acc, error: accErr } = await supabase
        .from('accounts').select('current_balance')
        .eq('user_id', user.id).eq('is_active', true).neq('type', 'credit')
      if (accErr) throw accErr

      const accList = (acc ?? []) as { current_balance: number }[]
      if (accList.length === 0) { setHasAccounts(false); setLoading(false); return }
      setHasAccounts(true)

      // calcAccountsBalance — engine é a única fonte de verdade para saldo
      const saldo = calcAccountsBalance(accList)
      setSaldoContas(saldo)

      // ── Faturas abertas ───────────────────────────────────────────────────
      const { data: openInv } = await supabase
        .from('credit_card_invoices').select('total_amount')
        .eq('user_id', user.id).in('status', ['open', 'overdue'])
      const faturas = ((openInv ?? []) as { total_amount: number }[])
        .reduce((s, i) => s + Number(i.total_amount), 0)
      setTotalFaturas(faturas)

      // ── Investimentos ─────────────────────────────────────────────────────
      const { data: invData } = await supabase
        .from('investments').select('current_amount')
        .eq('user_id', user.id).eq('is_active', true)
      const totalInv = ((invData ?? []) as { current_amount: number }[])
        .reduce((s, i) => s + Number(i.current_amount), 0)
      setPatrimonioInvestido(totalInv)

      // ── Faturas próximas ──────────────────────────────────────────────────
      const { data: dueInv } = await supabase
        .from('credit_card_invoices').select('id, total_amount, status, due_date, credit_card_id')
        .eq('user_id', user.id).in('status', ['open', 'overdue'])
        .lte('due_date', horizon30).order('due_date')
      const { data: cards } = await supabase
        .from('credit_cards').select('id, name, color').eq('user_id', user.id)
      const cardMap = Object.fromEntries(
        ((cards ?? []) as { id: string; name: string; color: string }[]).map(c => [c.id, c])
      )

      // daysUntil — engine é a única fonte de verdade para dias até vencimento
      setInvoicesDue(
        ((dueInv ?? []) as { id: string; total_amount: number; due_date: string; credit_card_id: string }[])
          .map(inv => ({
            id:             inv.id,
            card_name:      cardMap[inv.credit_card_id]?.name  ?? 'Cartão',
            card_color:     cardMap[inv.credit_card_id]?.color ?? '#7C3AED',
            due_date:       inv.due_date,
            total_amount:   Number(inv.total_amount),
            days_until_due: daysUntil(inv.due_date),
          }))
      )

      // ── Transações do mês ─────────────────────────────────────────────────
      const { data: txMes, error: txErr } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('user_id', user.id)
        .gte('date', inicioMes).lte('date', fimMes)
        .in('lifecycle_status', getLedgerStatuses())
        .in('type', ['income', 'expense'])
      if (txErr) throw txErr

      const txArr      = (txMes ?? []) as { type: string; amount: number }[]
      const recMesVal  = txArr.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
      const despMesVal = txArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
      setRecMes(recMesVal)
      setDespMes(despMesVal)

      // ── Histórico 6 meses ─────────────────────────────────────────────────
      const meses = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(year, month - (5 - i), 1)
        return { key: d.toISOString().slice(0, 7), label: MONTH_NAMES[d.getMonth()] }
      })
      const { data: txHist } = await supabase
        .from('transactions')
        .select('type, amount, date')
        .eq('user_id', user.id)
        .gte('date', meses[0].key + '-01')
        .in('lifecycle_status', getLedgerStatuses())
        .in('type', ['income', 'expense'])
      const histArr = (txHist ?? []) as { type: string; amount: number; date: string }[]

      setMonthLine(meses.map(({ key, label }) => {
        const txs  = histArr.filter(t => t.date.startsWith(key))
        const rec  = txs.filter(t => t.type === 'income').reduce((s,  t) => s + Number(t.amount), 0)
        const desp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
        return { mes: label, saldo: rec - desp }
      }))

      // ── Categorias ────────────────────────────────────────────────────────
      const { data: cats } = await supabase
        .from('categories').select('id, name, icon').eq('user_id', user.id)
      const catNameMap = Object.fromEntries(
        ((cats ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])
      )
      const catIconMap = Object.fromEntries(
        ((cats ?? []) as { id: string; icon?: string }[]).map(c => [c.id, c])
      )

      const { data: catData } = await supabase
        .from('expenses_by_category')
        .select('category_id, category_name, total_amount')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .order('total_amount', { ascending: false })
        .limit(6)
      setCatSlices(
        ((catData ?? []) as { category_id: string | null; category_name: string | null; total_amount: number }[])
          .map(row => ({
            categoryId: row.category_id,
            name:       row.category_name ?? UNCATEGORIZED_LABEL,
            value:      Number(row.total_amount),
          }))
      )

      // ── Últimas transações ────────────────────────────────────────────────
      const { data: recentData } = await supabase
        .from('transactions')
        .select('id, type, description, amount, date, category_id')
        .eq('user_id', user.id)
        .in('lifecycle_status', getLedgerStatuses())
        .order('date', { ascending: false })
        .limit(5)
      setRecentTxs(
        ((recentData ?? []) as { id: string; type: string; description: string; amount: number; date: string; category_id: string | null }[])
          .map(t => ({
            id:            t.id,
            type:          t.type as 'income' | 'expense' | 'transfer',
            description:   t.description,
            amount:        Number(t.amount),
            date:          t.date,
            category_name: t.category_id ? catNameMap[t.category_id] : undefined,
            category_icon: t.category_id ? (catIconMap[t.category_id] as any)?.icon : undefined,
          }))
      )

      // ── Recorrências — getForecastSummary ─────────────────────────────────
      // Engine calcula projeção 30d. Dashboard só renderiza.
      const { data: recRules } = await supabase
        .from('recurrences')
        .select('id, type, amount, frequency, next_due_date, end_date, is_active, description')
        .eq('user_id', user.id).eq('is_active', true)
        .or(`next_due_date.lte.${horizon30},end_date.is.null,end_date.gte.${hoje}`)

      const summary = getForecastSummary({
        recurrences:       (recRules ?? []) as any[],
        horizonDays:       30,
        currentBalance:    saldo,
        openInvoicesTotal: faturas,
      })
      setForecastSummary(summary)

      // ── Parcelas (installments — domínio separado de forecast) ────────────
      // TD: extrair para getInstallmentProjection() quando sprint de infra chegar
      const { data: instData } = await supabase
        .from('transactions').select('type, amount')
        .eq('user_id', user.id)
        .not('installment_total', 'is', null)
        .in('lifecycle_status', getLedgerStatuses())
        .gte('date', hoje).lte('date', horizon30)
        .in('type', ['income', 'expense'])
      const instArr = (instData ?? []) as { type: string; amount: number }[]
      setInstCount(instArr.length)

      // ── Última sincronização do engine ────────────────────────────────────
      const { data: syncLog } = await supabase
        .from('lifecycle_engine_logs')
        .select('ran_at, processed, failed')
        .order('ran_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (syncLog) setSyncStatus(syncLog)

    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Falha ao carregar dados financeiros.')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() },       [load])
  useEffect(() => { syncFromDB() }, [syncFromDB])

  if (loading)      return <DashboardSkeleton />
  if (loadError)    return <DashboardError message={loadError} onRetry={load} />
  if (!hasAccounts) return <EmptyDashboard />

  // ── Representação visual da projeção — responsabilidade da UI, não do engine ──
  // O engine retorna números. O dashboard decide label, cor e sinal.
  const projecaoItens: ProjecaoItem[] = [
    { label: 'Saldo atual em contas',      value: saldoContas,                       color: 'var(--primary)',                sign: ''  },
    { label: 'Receitas recorrentes (30d)', value: forecastSummary.projectedIncome,   color: 'var(--success, #16A34A)',       sign: '+' },
    { label: 'Despesas recorrentes (30d)', value: forecastSummary.projectedExpense,  color: 'var(--danger, #DC2626)',        sign: '−' },
    { label: 'Faturas em aberto',          value: totalFaturas,                      color: 'var(--danger, #DC2626)',        sign: '−' },
  ]

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const kpis = [
    {
      label:       'Saldo Total',
      value:       saldoContas,
      sub:         'Excluindo cartões',
      icon:        Wallet,
      color:       saldoContas >= 0 ? 'var(--primary)' : 'var(--danger, #DC2626)',
      iconBg:      'var(--primary-glow)',
      accentColor: 'rgba(99,102,241,0.5)',
      group:       'financial' as const,
    },
    {
      label:       'Receitas',
      value:       recMes,
      sub:         'Este mês',
      icon:        ArrowUp,
      color:       'var(--success, #16A34A)',
      iconBg:      'rgba(22,163,74,0.12)',
      accentColor: 'rgba(34,197,94,0.5)',
      group:       'financial' as const,
    },
    {
      label:       'Despesas',
      value:       despMes,
      sub:         'Este mês',
      icon:        ArrowDown,
      color:       'var(--danger, #DC2626)',
      iconBg:      'rgba(220,38,38,0.12)',
      accentColor: 'rgba(248,113,113,0.5)',
      group:       'financial' as const,
    },
    {
      label:       'Investimentos',
      value:       patrimonioInvestido,
      sub:         'Total investido',
      icon:        TrendUp,
      color:       '#a78bfa',
      iconBg:      'rgba(167,139,250,0.12)',
      accentColor: 'rgba(56,189,248,0.4)',
      group:       'investments' as const,
    },
  ]

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
          <button
            onClick={toggleFinancial}
            className="flex items-center gap-1.5 text-xs min-h-[44px] px-2 transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={financialVisible ? 'Ocultar valores financeiros' : 'Mostrar valores financeiros'}
          >
            {financialVisible ? <Eye weight="duotone" size={14} /> : <EyeSlash weight="duotone" size={14} />}
            Financeiro
          </button>
          <button
            onClick={toggleInvestments}
            className="flex items-center gap-1.5 text-xs min-h-[44px] px-2 transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={investmentsVisible ? 'Ocultar investimentos' : 'Mostrar investimentos'}
          >
            {investmentsVisible ? <Eye weight="duotone" size={14} /> : <EyeSlash weight="duotone" size={14} />}
            Investimentos
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
        {kpis.map((kpi, idx) => (
          <div
            key={kpi.label}
            className="glass-card rounded-2xl p-6 flex flex-col gap-4 cursor-default"
            style={{ '--accent-color': kpi.accentColor } as React.CSSProperties}
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
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {kpi.sub}
            </p>
          </div>
        ))}
      </div>

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
        </div>

        {/* Coluna lateral */}
        <div className="space-y-5">

          {/* Saldo Previsto — dados do engine, visual do dashboard */}
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
                      {/* daysUntil já foi chamado no load — dashboard só renderiza */}
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
                <button
                  onClick={toggleInvestments}
                  className="transition-opacity hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label={investmentsVisible ? 'Ocultar investimentos' : 'Mostrar investimentos'}
                >
                  {investmentsVisible
                    ? <Eye weight="duotone" size={14} />
                    : <EyeSlash weight="duotone" size={14} />}
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
