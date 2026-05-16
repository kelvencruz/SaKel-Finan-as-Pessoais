'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  Bank, CreditCard, Tag, ListBullets, Receipt, TrendUp,
  Wallet, Warning, CalendarCheck, ArrowClockwise,
  ArrowUp, ArrowDown, Eye, EyeSlash, ArrowUpRight,
} from '@phosphor-icons/react'

import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader }    from '@/components/layout/PageHeader'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type LifecycleStatus = 'CONFIRMED' | 'PENDING_EXPECTED' | 'PENDING_REVIEW' | 'OVERDUE' | 'CANCELLED'

interface MonthLine     { mes: string; saldo: number }
interface CatSlice      { name: string; value: number }
interface InvoiceDue    { id: string; card_name: string; card_color: string; due_date: string; total_amount: number; days_until_due: number }
interface ProjecaoItem  { label: string; value: number; color: string; sign: string }
interface RecentTx      { id: string; description: string; amount: number; type: 'income' | 'expense' | 'transfer'; category_name?: string; category_icon?: string; date: string }

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const SLICE_COLORS   = ['#7C3AED','#f97316','#22c55e','#f59e0b','#3b82f6','#ec4899','#14b8a6']
const MONTH_NAMES    = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CONFIRMED_STATUSES: LifecycleStatus[] = ['CONFIRMED']

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

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-4">
        <div className="h-8 rounded-lg bg-gray-100 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-xl bg-gray-100" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 h-72 rounded-xl bg-gray-100" />
          <div className="h-72 rounded-xl bg-gray-100" />
        </div>
      </div>
    </PageContainer>
  )
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PageContainer>
      <div className="rounded-2xl p-10 text-center bg-white border border-dashed border-red-100">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-red-50">
          <Warning weight="duotone" size={26} className="text-red-400" />
        </div>
        <p className="text-sm font-semibold mb-1 text-gray-800">Erro ao carregar o dashboard</p>
        <p className="text-xs mb-6 max-w-xs mx-auto text-gray-400">{message}</p>
        <button onClick={onRetry}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
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
      <PageHeader title="Dashboard" />
      <div className="rounded-2xl p-10 text-center mb-6 bg-white border-2 border-dashed border-gray-200">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-indigo-50">
          <Bank weight="duotone" size={28} className="text-indigo-500" />
        </div>
        <h2 className="text-lg font-semibold mb-2 text-gray-800">Sua central financeira começa aqui</h2>
        <p className="text-sm max-w-sm mx-auto mb-6 text-gray-400">
          Adicione uma conta para acompanhar saldo, transações e investimentos.
        </p>
        <a href="/dashboard/contas"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
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
            className="rounded-xl p-4 bg-white border border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
            <item.icon weight="duotone" size={24} className="text-indigo-500 mb-2" />
            <p className="text-sm font-medium mb-1 text-gray-800">{item.title}</p>
            <p className="text-xs text-gray-400">{item.desc}</p>
          </a>
        ))}
      </div>
    </PageContainer>
  )
}

function InvoiceBadge({ days }: { days: number }) {
  if (days < 0)   return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-500">Vencida</span>
  if (days === 0) return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-500">Vence hoje</span>
  if (days <= 7)  return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600">Vence em {days}d</span>
  return               <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">{days}d</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard principal
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient()

  const [userName,            setUserName]            = useState('')
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
  const [invVisivel,          setInvVisivel]          = useState(true)

  const load = useCallback(async () => {
    setLoadError(null)
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      // Nome do usuário para o saudação
      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).single()
      setUserName((profile?.full_name ?? '').split(' ')[0] ?? '')

      const now       = new Date()
      const year      = now.getFullYear()
      const month     = now.getMonth()
      const inicioMes = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const fimMes    = new Date(year, month + 1, 0).toISOString().split('T')[0]
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
      const invoicesFormatted = ((dueInv ?? []) as { id: string; total_amount: number; due_date: string; credit_card_id: string }[])
        .map(inv => ({
          id:             inv.id,
          card_name:      cardMap[inv.credit_card_id]?.name  ?? 'Cartão',
          card_color:     cardMap[inv.credit_card_id]?.color ?? '#7C3AED',
          due_date:       inv.due_date,
          total_amount:   Number(inv.total_amount),
          days_until_due: daysUntil(inv.due_date),
        }))
      setInvoicesDue(invoicesFormatted)

      // ── Transações do mês ────────────────────────────────────
      const { data: txMes, error: txErr } = await supabase
        .from('transactions')
        .select('type, amount, category_id')
        .eq('user_id', user.id)
        .gte('date', inicioMes).lte('date', fimMes)
        .in('lifecycle_status', CONFIRMED_STATUSES)
        .in('type', ['income', 'expense'])
      if (txErr) throw txErr

      const txArr      = (txMes ?? []) as { type: string; amount: number; category_id: string | null }[]
      const recMesVal  = txArr.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
      const despMesVal = txArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
      setRecMes(recMesVal)
      setDespMes(despMesVal)

      // ── Histórico 6 meses → gráfico de linha (saldo acumulado) ──
      const meses = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(year, month - (5 - i), 1)
        return { key: d.toISOString().slice(0, 7), label: MONTH_NAMES[d.getMonth()] }
      })
      const { data: txHist } = await supabase
        .from('transactions')
        .select('type, amount, date')
        .eq('user_id', user.id)
        .gte('date', meses[0].key + '-01')
        .in('lifecycle_status', CONFIRMED_STATUSES)
        .in('type', ['income', 'expense'])
      const histArr = (txHist ?? []) as { type: string; amount: number; date: string }[]

      setMonthLine(meses.map(({ key, label }) => {
        const txs  = histArr.filter(t => t.date.startsWith(key))
        const rec  = txs.filter(t => t.type === 'income').reduce((s,  t) => s + Number(t.amount), 0)
        const desp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
        return { mes: label, saldo: rec - desp }
      }))

      // ── Categorias ───────────────────────────────────────────
      const { data: cats } = await supabase.from('categories').select('id, name').eq('user_id', user.id)
      const catNameMap = Object.fromEntries(((cats ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
      const catMap2: Record<string, number> = {}
      txArr.filter(t => t.type === 'expense').forEach(t => {
        const k = t.category_id ? (catNameMap[t.category_id] ?? 'Outros') : 'Outros'
        catMap2[k] = (catMap2[k] ?? 0) + Number(t.amount)
      })
      setCatSlices(
        Object.entries(catMap2).map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value).slice(0, 6)
      )

      // ── Últimas transações ───────────────────────────────────
      const { data: recentData } = await supabase
        .from('transactions')
        .select('id, type, description, amount, date, category_id')
        .eq('user_id', user.id)
        .in('lifecycle_status', CONFIRMED_STATUSES)
        .order('date', { ascending: false })
        .limit(5)

      const catIconMap = Object.fromEntries(
        ((cats ?? []) as { id: string; name: string; icon?: string }[]).map(c => [c.id, c])
      )
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
        .in('lifecycle_status', CONFIRMED_STATUSES)
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
        { label: 'Saldo atual em contas',      value: saldo,         color: 'var(--primary)', sign: ''  },
        { label: 'Receitas recorrentes (30d)', value: recEntradas,   color: 'var(--success)', sign: '+' },
        { label: 'Despesas recorrentes (30d)', value: recSaidas,     color: 'var(--danger)',  sign: '−' },
        { label: 'Parcelas pendentes (30d)',   value: totalParcelas, color: 'var(--warning)', sign: '−' },
        { label: 'Faturas em aberto',          value: faturas,       color: 'var(--primary)', sign: '−' },
      ])

    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Falha ao carregar dados financeiros.')
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  if (loading)      return <DashboardSkeleton />
  if (loadError)    return <DashboardError message={loadError} onRetry={load} />
  if (!hasAccounts) return <EmptyDashboard />

  const saldoLiquido = saldoContas - totalFaturas

  return (
    <PageContainer>
      {/* ── Header ── */}
      <PageHeader
        title={`${greeting()}${userName ? `, ${userName}` : ''}`}
        description="Aqui está o resumo da sua vida financeira."
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Saldo Total',
            value: saldoContas,
            color: saldoContas >= 0 ? 'text-indigo-600' : 'text-red-500',
            sub:   'Excluindo cartões',
            icon:  Wallet,
            iconBg: 'bg-indigo-50 text-indigo-400',
          },
          {
            label: 'Receitas',
            value: recMes,
            color: 'text-green-600',
            sub:   'Este mês',
            icon:  ArrowUp,
            iconBg: 'bg-green-50 text-green-400',
          },
          {
            label: 'Despesas',
            value: despMes,
            color: 'text-red-500',
            sub:   'Este mês',
            icon:  ArrowDown,
            iconBg: 'bg-red-50 text-red-400',
          },
          {
            label: 'Investimentos',
            value: patrimonioInvestido,
            color: 'text-violet-600',
            sub:   'Total investido',
            icon:  TrendUp,
            iconBg: 'bg-violet-50 text-violet-400',
          },
        ].map(kpi => (
          <div key={kpi.label}
            className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{kpi.label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.iconBg}`}>
                <kpi.icon size={16} weight="duotone" />
              </div>
            </div>
            <p className={`text-xl font-bold ${kpi.color}`}>{fmt(kpi.value)}</p>
            <p className="text-[10px] text-gray-400">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Layout 2 colunas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">

        {/* Coluna principal — 2/3 */}
        <div className="lg:col-span-2 space-y-5">

          {/* Gráfico de evolução do saldo */}
          <div className="bg-white border border-gray-100 rounded-xl p-5"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Evolução do saldo</p>
                <p className="text-xs text-gray-400 mt-0.5">Resultado mensal dos últimos 6 meses</p>
              </div>
              <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-indigo-50 text-indigo-500">
                Últimos 6 meses
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={monthLine}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtK} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number | string) => [fmt(Number(v)), 'Saldo']}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                />
                <Line
                  type="monotone" dataKey="saldo" stroke="#7C3AED" strokeWidth={2.5}
                  dot={{ fill: '#7C3AED', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: '#7C3AED' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Despesas por categoria */}
          <div className="bg-white border border-gray-100 rounded-xl p-5"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <p className="text-sm font-medium text-gray-700 mb-4">Despesas por categoria</p>
            {catSlices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-36 gap-2">
                <Receipt weight="duotone" size={32} className="text-gray-200" />
                <p className="text-xs text-gray-400">Sem despesas este mês</p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={catSlices} cx="50%" cy="50%" innerRadius={44} outerRadius={68} dataKey="value">
                      {catSlices.map((_, i) => <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: number | string) => fmt(Number(v))}
                      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {catSlices.map((slice, i) => {
                    const total = catSlices.reduce((s, c) => s + c.value, 0)
                    const pct   = total > 0 ? Math.round((slice.value / total) * 100) : 0
                    return (
                      <div key={slice.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                        <p className="text-xs text-gray-500 truncate flex-1">{slice.name}</p>
                        <p className="text-xs font-medium text-gray-600">{pct}%</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Últimas transações */}
          <div className="bg-white border border-gray-100 rounded-xl p-5"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-700">Últimas transações</p>
              <a href="/dashboard/transacoes"
                className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
                Ver todas <ArrowUpRight size={11} weight="bold" />
              </a>
            </div>
            {recentTxs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 gap-2">
                <ListBullets weight="duotone" size={28} className="text-gray-200" />
                <p className="text-xs text-gray-400">Nenhuma transação confirmada</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentTxs.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    {/* Ícone */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs ${
                      tx.type === 'income'   ? 'bg-green-50 text-green-600'
                      : tx.type === 'expense' ? 'bg-red-50 text-red-500'
                      : 'bg-indigo-50 text-indigo-500'
                    }`}>
                      {/* category_icon: emoji do banco — exceção permitida pelo Master */}
                      {tx.category_icon
                        ? <span>{tx.category_icon}</span>
                        : tx.type === 'income'
                        ? <ArrowUp size={14} weight="duotone" />
                        : <ArrowDown size={14} weight="duotone" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{tx.description}</p>
                      <p className="text-[10px] text-gray-400">{tx.category_name ?? 'Sem categoria'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-semibold ${
                        tx.type === 'income' ? 'text-green-600' : tx.type === 'expense' ? 'text-red-500' : 'text-indigo-500'
                      }`}>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''} {fmt(tx.amount)}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna lateral — 1/3 */}
        <div className="space-y-5">

          {/* Patrimônio líquido */}
          <div className={`rounded-xl px-5 py-4 ${saldoLiquido >= 0 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Wallet weight="duotone" size={14} className={saldoLiquido >= 0 ? 'text-green-500' : 'text-red-500'} />
              <p className="text-xs font-medium text-gray-600">Patrimônio líquido estimado</p>
            </div>
            <p className={`text-2xl font-bold mb-1 ${saldoLiquido >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {fmt(saldoLiquido)}
            </p>
            <p className="text-[10px] text-gray-400">Saldo em contas menos faturas em aberto</p>
          </div>

          {/* Investimentos (se houver) */}
          {patrimonioInvestido > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl px-5 py-4"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendUp weight="duotone" size={14} className="text-violet-500" />
                  <p className="text-xs font-medium text-gray-600">Patrimônio investido</p>
                </div>
                <button onClick={() => setInvVisivel(v => !v)} className="text-gray-400 hover:text-gray-600">
                  {invVisivel
                    ? <Eye weight="duotone" size={14} />
                    : <EyeSlash weight="duotone" size={14} />
                  }
                </button>
              </div>
              <p className="text-xl font-bold text-violet-600 mb-1">
                {invVisivel ? fmt(patrimonioInvestido) : '••••••'}
              </p>
              <a href="/dashboard/investimentos" className="text-[11px] text-violet-500 hover:underline flex items-center gap-1">
                Ver investimentos <ArrowUpRight size={10} weight="bold" />
              </a>
            </div>
          )}

          {/* Saldo previsto */}
          <div className="bg-white border border-gray-100 rounded-xl p-5"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Saldo Previsto</p>
                <p className="text-xs text-gray-400 mt-0.5">Projeção para os próximos 30 dias</p>
              </div>
              <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-indigo-50 text-indigo-500">
                30 dias
              </span>
            </div>
            <div className="space-y-2 mb-4">
              {projecaoItens.map(item => (
                <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <p className="text-[11px] text-gray-400">{item.label}</p>
                  <p className="text-[11px] font-semibold" style={{ color: item.color }}>
                    {item.sign && <span className="mr-0.5">{item.sign}</span>}
                    {fmt(item.value)}
                  </p>
                </div>
              ))}
            </div>
            <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${
              saldoPrevisto >= 0 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'
            }`}>
              <div>
                <p className="text-xs font-semibold text-gray-700">Saldo projetado</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {recCount} recorrência(s) · {instCount} parcela(s)
                </p>
              </div>
              <p className={`text-lg font-bold ${saldoPrevisto >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmt(saldoPrevisto)}
              </p>
            </div>
          </div>

          {/* Faturas próximas */}
          {invoicesDue.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarCheck weight="duotone" size={14} className="text-gray-400" />
                  <p className="text-sm font-medium text-gray-700">Faturas próximas</p>
                </div>
                <a href="/dashboard/faturas" className="text-xs text-indigo-500 hover:underline">Ver todas</a>
              </div>
              <div className="space-y-2">
                {invoicesDue.slice(0, 4).map(inv => (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: inv.card_color }}>
                        <CreditCard weight="duotone" size={12} style={{ color: '#fff' }} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-700">{inv.card_name}</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(inv.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <InvoiceBadge days={inv.days_until_due} />
                      <p className="text-xs font-semibold text-indigo-600">{fmt(inv.total_amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Links rápidos */}
          <div className="bg-white border border-gray-100 rounded-xl p-4"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <p className="text-xs font-medium text-gray-400 mb-3">Acesso rápido</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Transações',    href: '/dashboard/transacoes',    icon: ListBullets },
                { label: 'Contas',        href: '/dashboard/contas',        icon: Bank        },
                { label: 'Cartões',       href: '/dashboard/cartoes',       icon: CreditCard  },
                { label: 'Faturas',       href: '/dashboard/faturas',       icon: Receipt     },
                { label: 'Investimentos', href: '/dashboard/investimentos', icon: TrendUp     },
                { label: 'Categorias',    href: '/dashboard/categorias',    icon: Tag         },
              ].map(link => (
                <a key={link.href} href={link.href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                  <link.icon weight="duotone" size={14} />
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
