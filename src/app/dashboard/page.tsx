'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
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
import {
  getMonthRange,
  getCurrentMonthKey,
  getLedgerStatuses,
  UNCATEGORIZED_LABEL,
  type CatSlice,
} from '@/lib/financialEngine'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MonthLine    { mes: string; saldo: number }
interface InvoiceDue   { id: string; card_name: string; card_color: string; due_date: string; total_amount: number; days_until_due: number }
interface ProjecaoItem { label: string; value: number; color: string; sign: string }
interface RecentTx     { id: string; description: string; amount: number; type: 'income' | 'expense' | 'transfer'; category_name?: string; category_icon?: string; date: string }

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const SLICE_COLORS = ['#7C3AED', '#f97316', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899']
const MONTH_NAMES  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v.toFixed(0)}`

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr + 'T12:00:00').getTime() - today.getTime()) / 86400000)
}

function occurrencesInWindow(nextDueDate: string, frequency: string, horizonDate: Date): number {
  const start = new Date(nextDueDate + 'T12:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (start > horizonDate) return 0
  let count = 0; let current = new Date(start)
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
// Tooltip customizado — fix dark mode (BUG-DARK-MODE-TEXT)
// O Recharts ignora `color` do contentStyle para texto interno;
// usar `content` prop com componente próprio é a única solução confiável.
// ─────────────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:   'var(--color-surface)',
      border:       '1px solid var(--color-border)',
      borderRadius: 8,
      padding:      '6px 10px',
      fontSize:     12,
      color:        'var(--color-text-primary)',
    }}>
      {label && (
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 2 }}>{label}</p>
      )}
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
          {entry.name ? `${entry.name}: ` : ''}{fmt(Number(entry.value))}
        </p>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes utilitários
// ─────────────────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-xl bg-[var(--color-surface-raised,#1E293B)] opacity-60" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <div className="h-64 rounded-xl bg-[var(--color-surface-raised,#1E293B)] opacity-60" />
            <div className="h-48 rounded-xl bg-[var(--color-surface-raised,#1E293B)] opacity-60" />
          </div>
          <div className="space-y-5">
            <div className="h-64 rounded-xl bg-[var(--color-surface-raised,#1E293B)] opacity-60" />
            <div className="h-40 rounded-xl bg-[var(--color-surface-raised,#1E293B)] opacity-60" />
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PageContainer>
      <div className="rounded-2xl p-10 text-center border border-dashed"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-danger,#DC2626)22' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--color-danger,#DC2626)18' }}>
          <Warning weight="duotone" size={26} style={{ color: 'var(--color-danger,#DC2626)' }} />
        </div>
        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Erro ao carregar o dashboard
        </p>
        <p className="text-xs mb-6 max-w-xs mx-auto" style={{ color: 'var(--color-text-muted)' }}>{message}</p>
        <button onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-brand,#7C3AED)' }}>
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
      <div className="rounded-2xl p-10 text-center mb-6 border-2 border-dashed"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--color-brand,#7C3AED)18' }}>
          <Bank weight="duotone" size={28} style={{ color: 'var(--color-brand,#7C3AED)' }} />
        </div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          Sua central financeira começa aqui
        </h2>
        <p className="text-sm max-w-sm mx-auto mb-6" style={{ color: 'var(--color-text-muted)' }}>
          Adicione uma conta para acompanhar saldo, transações e investimentos.
        </p>
        <a href="/dashboard/contas"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-brand,#7C3AED)' }}>
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
            className="rounded-xl p-4 border transition-colors"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <item.icon weight="duotone" size={24} className="mb-2" style={{ color: 'var(--color-brand,#7C3AED)' }} />
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>{item.title}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.desc}</p>
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
  return               <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-[var(--color-text-muted)]">{days}d</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard principal
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient()

  // ── Privacy store (DT-002) ──────────────────────────────────────────────
  const {
    syncFromDB,
    financialVisible,
    toggleFinancial,
    investmentsVisible,
    toggleInvestments,
  } = usePrivacyStore()

  // ── Estado local de dados ───────────────────────────────────────────────
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
  const [projecaoItens,       setProjecaoItens]       = useState<ProjecaoItem[]>([])
  const [saldoPrevisto,       setSaldoPrevisto]       = useState(0)
  const [recCount,            setRecCount]            = useState(0)
  const [instCount,           setInstCount]           = useState(0)

  const load = useCallback(async () => {
    setLoadError(null)
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const now    = new Date()
      const year   = now.getFullYear()
      const month  = now.getMonth()

      // ── Datas do mês — UTC-safe via financialEngine ──────────
      const { inicioMes, fimMes } = getMonthRange(year, month)
      const monthKey = getCurrentMonthKey()

      const hoje      = now.toISOString().split('T')[0]
      const limit30   = new Date(now); limit30.setDate(limit30.getDate() + 30)
      const horizon30 = limit30.toISOString().split('T')[0]

      // ── Contas ──────────────────────────────────────────────
      const { data: acc, error: accErr } = await supabase
        .from('accounts').select('current_balance')
        .eq('user_id', user.id).eq('is_active', true).neq('type', 'credit')
      if (accErr) throw accErr

      const accList = (acc ?? []) as { current_balance: number }[]
      if (accList.length === 0) { setHasAccounts(false); setLoading(false); return }
      setHasAccounts(true)
      const saldo = accList.reduce((s, a) => s + Number(a.current_balance), 0)
      setSaldoContas(saldo)

      // ── Faturas ──────────────────────────────────────────────
      const { data: openInv } = await supabase
        .from('credit_card_invoices').select('total_amount')
        .eq('user_id', user.id).in('status', ['open', 'overdue'])
      const faturas = ((openInv ?? []) as { total_amount: number }[]).reduce((s, i) => s + Number(i.total_amount), 0)
      setTotalFaturas(faturas)

      // ── Investimentos ────────────────────────────────────────
      const { data: invData } = await supabase
        .from('investments').select('current_amount').eq('user_id', user.id).eq('is_active', true)
      const totalInv = ((invData ?? []) as { current_amount: number }[]).reduce((s, i) => s + Number(i.current_amount), 0)
      setPatrimonioInvestido(totalInv)

      // ── Faturas próximas ─────────────────────────────────────
      const { data: dueInv } = await supabase
        .from('credit_card_invoices').select('id, total_amount, status, due_date, credit_card_id')
        .eq('user_id', user.id).in('status', ['open', 'overdue'])
        .lte('due_date', horizon30).order('due_date')
      const { data: cards } = await supabase.from('credit_cards').select('id, name, color').eq('user_id', user.id)
      const cardMap = Object.fromEntries(
        ((cards ?? []) as { id: string; name: string; color: string }[]).map(c => [c.id, c])
      )
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

      // ── Transações do mês (KPIs receita/despesa) ─────────────
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

      // ── Histórico 6 meses → gráfico de linha ─────────────────
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

      // ── Categorias base (para últimas transações e catIcons) ──
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, icon')
        .eq('user_id', user.id)

      const catNameMap = Object.fromEntries(
        ((cats ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])
      )
      const catIconMap = Object.fromEntries(
        ((cats ?? []) as { id: string; icon?: string }[]).map(c => [c.id, c])
      )

      // ── Categorias — view SQL (source of truth, BUG-CHART-FILTER) ──
      const { data: catData } = await supabase
        .from('expenses_by_category')
        .select('category_id, category_name, total_amount')
        .eq('user_id', user.id)
        .eq('month_key', monthKey)
        .order('total_amount', { ascending: false })
        .limit(6)

      setCatSlices(
        ((catData ?? []) as {
          category_id:   string | null
          category_name: string | null
          total_amount:  number
        }[]).map((row): CatSlice => ({
          categoryId: row.category_id,
          name:       row.category_name ?? UNCATEGORIZED_LABEL,
          value:      Number(row.total_amount),
        }))
      )

      // ── Últimas transações ───────────────────────────────────
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

      // ── Recorrências ─────────────────────────────────────────
      const { data: recRules } = await supabase
        .from('recurrences')
        .select('type, amount, frequency, next_due_date, end_date, is_active')
        .eq('user_id', user.id).eq('is_active', true)
        .or(`next_due_date.lte.${horizon30},end_date.is.null,end_date.gte.${hoje}`)
      const recRulesArr = (recRules ?? []) as {
        type: string; amount: number; frequency: string
        next_due_date: string | null; end_date: string | null
      }[]

      let recEntradas = 0; let recSaidas = 0; let recCountVal = 0
      for (const rule of recRulesArr) {
        if (!rule.next_due_date) continue
        if (rule.end_date && rule.end_date < hoje) continue
        const occ = occurrencesInWindow(rule.next_due_date, rule.frequency, limit30)
        if (occ === 0) continue
        const total = Number(rule.amount) * occ
        recCountVal += occ
        if (rule.type === 'income') recEntradas += total
        else recSaidas += total
      }
      setRecCount(recCountVal)

      // ── Parcelas ─────────────────────────────────────────────
      const { data: instData } = await supabase
        .from('transactions').select('type, amount')
        .eq('user_id', user.id)
        .not('installment_total', 'is', null)
        .in('lifecycle_status', getLedgerStatuses())
        .gte('date', hoje).lte('date', horizon30)
        .in('type', ['income', 'expense'])
      const instArr       = (instData ?? []) as { type: string; amount: number }[]
      const totalParcelas = instArr.filter(i => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0)
      const parcRec       = instArr.filter(i => i.type === 'income').reduce((s,  i) => s + Number(i.amount), 0)
      setInstCount(instArr.length)

      // ── Projeção ─────────────────────────────────────────────
      const previsto = saldo + recEntradas + parcRec - recSaidas - totalParcelas - faturas
      setSaldoPrevisto(previsto)
      setProjecaoItens([
        { label: 'Saldo atual em contas',      value: saldo,         color: 'var(--color-brand,#7C3AED)',   sign: ''  },
        { label: 'Receitas recorrentes (30d)', value: recEntradas,   color: 'var(--color-success,#16A34A)', sign: '+' },
        { label: 'Despesas recorrentes (30d)', value: recSaidas,     color: 'var(--color-danger,#DC2626)',  sign: '−' },
        { label: 'Parcelas pendentes (30d)',   value: totalParcelas, color: 'var(--color-warning,#D97706)', sign: '−' },
        { label: 'Faturas em aberto',          value: faturas,       color: 'var(--color-danger,#DC2626)',  sign: '−' },
      ])

    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Falha ao carregar dados financeiros.')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Efeitos ─────────────────────────────────────────────────────────────
  useEffect(() => { load() },        [load])
  useEffect(() => { syncFromDB() },  [syncFromDB])

  if (loading)      return <DashboardSkeleton />
  if (loadError)    return <DashboardError message={loadError} onRetry={load} />
  if (!hasAccounts) return <EmptyDashboard />

  // ─────────────────────────────────────────────────────────────────────────
  // KPIs
  // ─────────────────────────────────────────────────────────────────────────

  const kpis = [
    {
      label:  'Saldo Total',
      value:  saldoContas,
      sub:    'Excluindo cartões',
      icon:   Wallet,
      color:  saldoContas >= 0 ? 'var(--color-brand,#7C3AED)' : 'var(--color-danger,#DC2626)',
      iconBg: 'rgba(124,58,237,0.12)',
      group:  'financial' as const,
    },
    {
      label:  'Receitas',
      value:  recMes,
      sub:    'Este mês',
      icon:   ArrowUp,
      color:  'var(--color-success,#16A34A)',
      iconBg: 'rgba(22,163,74,0.12)',
      group:  'financial' as const,
    },
    {
      label:  'Despesas',
      value:  despMes,
      sub:    'Este mês',
      icon:   ArrowDown,
      color:  'var(--color-danger,#DC2626)',
      iconBg: 'rgba(220,38,38,0.12)',
      group:  'financial' as const,
    },
    {
      label:  'Investimentos',
      value:  patrimonioInvestido,
      sub:    'Total investido',
      icon:   TrendUp,
      color:  '#a78bfa',
      iconBg: 'rgba(167,139,250,0.12)',
      group:  'investments' as const,
    },
  ]

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <PageContainer>

      {/* ── Toggles de privacidade ── */}
      <div className="flex items-center justify-end gap-4 mb-3">
        <button
          onClick={toggleFinancial}
          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label={financialVisible ? 'Ocultar valores financeiros' : 'Mostrar valores financeiros'}
        >
          {financialVisible
            ? <Eye weight="duotone" size={14} />
            : <EyeSlash weight="duotone" size={14} />
          }
          Financeiro
        </button>
        <button
          onClick={toggleInvestments}
          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label={investmentsVisible ? 'Ocultar investimentos' : 'Mostrar investimentos'}
        >
          {investmentsVisible
            ? <Eye weight="duotone" size={14} />
            : <EyeSlash weight="duotone" size={14} />
          }
          Investimentos
        </button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map(kpi => (
          <div key={kpi.label}
            className="rounded-xl p-4 flex flex-col gap-3 border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{kpi.label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: kpi.iconBg }}>
                <kpi.icon size={16} weight="duotone" style={{ color: kpi.color }} />
              </div>
            </div>
            <p className="text-xl font-bold" style={{ color: kpi.color }}>
              <PrivateValue value={fmt(kpi.value)} group={kpi.group} />
            </p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Layout 2 colunas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Coluna principal — 2/3 ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Gráfico evolução do saldo */}
          <div className="rounded-xl p-5 border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Evolução do saldo
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Resultado mensal dos últimos 6 meses
                </p>
              </div>
              <span className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(124,58,237,0.12)', color: 'var(--color-brand,#7C3AED)' }}>
                Últimos 6 meses
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={monthLine}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border,#1E293B)" />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted,#94A3B8)' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted,#94A3B8)' }}
                  tickFormatter={fmtK}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone" dataKey="saldo"
                  stroke="var(--color-brand,#7C3AED)" strokeWidth={2.5}
                  dot={{ fill: 'var(--color-brand,#7C3AED)', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: 'var(--color-brand,#7C3AED)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Despesas por categoria */}
          <div className="rounded-xl p-5 border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
              Despesas por categoria
            </p>
            {catSlices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-36 gap-2">
                <Receipt weight="duotone" size={32} style={{ color: 'var(--color-border)' }} />
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Sem despesas este mês</p>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="45%" height={160}>
                  <PieChart>
                    <Pie data={catSlices} cx="50%" cy="50%" innerRadius={44} outerRadius={68} dataKey="value">
                      {catSlices.map((_, i) => <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2.5">
                  {catSlices.map((slice, i) => {
                    const total = catSlices.reduce((s, c) => s + c.value, 0)
                    const pct   = total > 0 ? Math.round((slice.value / total) * 100) : 0
                    return (
                      <div key={slice.name} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                        <p className="text-xs truncate flex-1" style={{ color: 'var(--color-text-muted)' }}>
                          {slice.name}
                        </p>
                        <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
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

        {/* ── Coluna lateral — 1/3 ── */}
        <div className="space-y-5">

          {/* 1. Saldo Previsto */}
          <div className="rounded-xl p-5 border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Saldo previsto
              </p>
              <span className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(124,58,237,0.12)', color: 'var(--color-brand,#7C3AED)' }}>
                30 dias
              </span>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Projeção para os próximos 30 dias
            </p>
            <p className="text-3xl font-bold mb-5"
              style={{ color: saldoPrevisto >= 0 ? 'var(--color-success,#16A34A)' : 'var(--color-danger,#DC2626)' }}>
              <PrivateValue value={fmt(saldoPrevisto)} group="financial" />
            </p>
            <div className="space-y-2">
              {projecaoItens.map(item => (
                <div key={item.label}
                  className="flex items-center justify-between py-1.5 border-b last:border-0"
                  style={{ borderColor: 'var(--color-border)' }}>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{item.label}</p>
                  <p className="text-[11px] font-semibold" style={{ color: item.color }}>
                    {item.sign && <span className="mr-0.5">{item.sign}</span>}
                    <PrivateValue value={fmt(item.value)} group="financial" />
                  </p>
                </div>
              ))}
            </div>
            {(recCount > 0 || instCount > 0) && (
              <p className="text-[10px] mt-3" style={{ color: 'var(--color-text-muted)' }}>
                {recCount > 0 && <>{recCount} recorrência{recCount !== 1 ? 's' : ''}</>}
                {recCount > 0 && instCount > 0 && <span className="mx-1">·</span>}
                {instCount > 0 && <>{instCount} parcela{instCount !== 1 ? 's' : ''}</>}
              </p>
            )}
          </div>

          {/* 2. Últimas transações */}
          <div className="rounded-xl p-5 border"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Últimas transações
              </p>
              <a href="/dashboard/transacoes"
                className="text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-brand,#7C3AED)' }}>
                Ver todas <ArrowUpRight size={11} weight="bold" />
              </a>
            </div>
            {recentTxs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 gap-2">
                <ListBullets weight="duotone" size={28} style={{ color: 'var(--color-border)' }} />
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Nenhuma transação confirmada
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {recentTxs.map(tx => (
                  <div key={tx.id}
                    className="flex items-center gap-3 py-2.5 border-b last:border-0"
                    style={{ borderColor: 'var(--color-border)' }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs"
                      style={{
                        background: tx.type === 'income'
                          ? 'rgba(22,163,74,0.12)'
                          : tx.type === 'expense'
                          ? 'rgba(220,38,38,0.12)'
                          : 'rgba(124,58,237,0.12)',
                      }}>
                      {tx.category_icon
                        ? <span className="text-[13px]">{tx.category_icon}</span>
                        : tx.type === 'income'
                        ? <ArrowUp size={13} weight="duotone" style={{ color: 'var(--color-success,#16A34A)' }} />
                        : <ArrowDown size={13} weight="duotone" style={{ color: 'var(--color-danger,#DC2626)' }} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {tx.description}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {tx.category_name ?? 'Sem categoria'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold"
                        style={{
                          color: tx.type === 'income'
                            ? 'var(--color-success,#16A34A)'
                            : tx.type === 'expense'
                            ? 'var(--color-danger,#DC2626)'
                            : 'var(--color-brand,#7C3AED)',
                        }}>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                        <PrivateValue value={fmt(tx.amount)} group="financial" />
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Faturas próximas */}
          {invoicesDue.length > 0 && (
            <div className="rounded-xl p-5 border"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarCheck weight="duotone" size={14} style={{ color: 'var(--color-text-muted)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Faturas próximas
                  </p>
                </div>
                <a href="/dashboard/faturas"
                  className="text-xs transition-opacity hover:opacity-70"
                  style={{ color: 'var(--color-brand,#7C3AED)' }}>
                  Ver todas
                </a>
              </div>
              <div className="space-y-0.5">
                {invoicesDue.slice(0, 4).map(inv => (
                  <div key={inv.id}
                    className="flex items-center justify-between py-2.5 border-b last:border-0"
                    style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: inv.card_color }}>
                        <CreditCard weight="duotone" size={12} style={{ color: '#fff' }} />
                      </div>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {inv.card_name}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          {new Date(inv.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <InvoiceBadge days={inv.days_until_due} />
                      <p className="text-xs font-semibold" style={{ color: 'var(--color-brand,#7C3AED)' }}>
                        <PrivateValue value={fmt(inv.total_amount)} group="financial" />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Investimentos */}
          {patrimonioInvestido > 0 && (
            <div className="rounded-xl px-5 py-4 border"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendUp weight="duotone" size={14} style={{ color: '#a78bfa' }} />
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    Patrimônio investido
                  </p>
                </div>
                <button
                  onClick={toggleInvestments}
                  className="transition-opacity hover:opacity-70"
                  style={{ color: 'var(--color-text-muted)' }}
                  aria-label={investmentsVisible ? 'Ocultar investimentos' : 'Mostrar investimentos'}
                >
                  {investmentsVisible
                    ? <Eye weight="duotone" size={14} />
                    : <EyeSlash weight="duotone" size={14} />
                  }
                </button>
              </div>
              <p className="text-xl font-bold mb-2" style={{ color: '#a78bfa' }}>
                <PrivateValue value={fmt(patrimonioInvestido)} group="investments" />
              </p>
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
