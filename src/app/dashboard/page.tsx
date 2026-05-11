'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import UserMenu from '@/components/UserMenu'

interface MonthBar  { mes: string; receitas: number; despesas: number }
interface CatSlice  { name: string; value: number }
interface InvoiceDue {
  id: string; card_name: string; card_color: string
  due_date: string; total_amount: number; days_until_due: number
}
interface ProjecaoItem {
  label: string; value: number; color: string; sign: string
}

const SLICE_COLORS = ['#6366f1','#f97316','#22c55e','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
const MONTH_NAMES  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const fmt  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const due   = new Date(dateStr + 'T12:00:00')
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function InvoiceBadge({ days }: { days: number }) {
  if (days < 0)   return <span className="text-[10px] font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Vencida</span>
  if (days === 0) return <span className="text-[10px] font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Vence hoje</span>
  if (days <= 3)  return <span className="text-[10px] font-medium bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">Vence em {days}d</span>
  if (days <= 7)  return <span className="text-[10px] font-medium bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full">Vence em {days}d</span>
  return <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{days}d</span>
}

// ─── Saldo Previsto ────────────────────────────────────────────────────────
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
          <p className="text-[10px] text-gray-400 mt-0.5">
            {recCount} recorrência(s) · {instCount} parcela(s) pendente(s)
          </p>
        </div>
        <p className={`text-xl font-bold ${saldoPrevisto >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(saldoPrevisto)}</p>
      </div>
    </div>
  )
}

// ─── Card de Investimentos (com localStorage) ──────────────────────────────
function InvestimentoCard({ valor }: { valor: number }) {
  const [visivel, setVisivel] = useState(() => {
    try { return localStorage.getItem('sakel-inv-visivel') !== 'false' } catch { return true }
  })
  function toggle() {
    const next = !visivel
    setVisivel(next)
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
          <p className="text-2xl font-bold text-indigo-700">
            {visivel ? fmt(valor) : '••••••'}
          </p>
          <button
            onClick={toggle}
            title={visivel ? 'Ocultar valor' : 'Mostrar valor'}
            className="text-indigo-400 hover:text-indigo-600 transition-colors text-sm"
          >
            {visivel ? '👁️' : '🙈'}
          </button>
        </div>
        <a href="/dashboard/investimentos" className="text-xs text-indigo-500 hover:underline">Ver investimentos →</a>
      </div>
    </div>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────
function EmptyDashboard({ email }: { email: string }) {
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
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl"
          style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}
        >🏦</div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Crie sua primeira conta</h2>
        <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
          Para começar a controlar suas finanças, cadastre uma conta bancária, carteira ou poupança.
        </p>
        <a
          href="/dashboard/contas"
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
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
          <a
            key={item.href} href={item.href}
            className="bg-white border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 rounded-xl p-4 transition-colors group"
          >
            <span className="text-2xl mb-2 block">{item.emoji}</span>
            <p className="text-sm font-medium text-gray-700 group-hover:text-indigo-700 mb-1">{item.title}</p>
            <p className="text-xs text-gray-400">{item.desc}</p>
          </a>
        ))}
      </div>

      {/* Dica rápida — mantida do antigo */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 flex items-start gap-3">
        <span className="text-xl shrink-0">💡</span>
        <div>
          <p className="text-sm font-medium text-indigo-700 mb-0.5">Dica rápida</p>
          <p className="text-xs text-indigo-500">
            Após criar uma conta, use o botão + no canto inferior direito para registrar receitas e despesas de qualquer página.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard principal ───────────────────────────────────────────────────
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
        .from('investments').select('current_amount')
        .eq('user_id', user.id).eq('is_active', true)
      setPatrimonioInvestido(((invData ?? []) as { current_amount: number }[]).reduce((s, i) => s + Number(i.current_amount), 0))

      // Faturas próximas do vencimento (30d)
      const { data: dueInv } = await supabase
        .from('credit_card_invoices')
        .select('id, total_amount, status, due_date, credit_card_id')
        .eq('user_id', user.id).in('status', ['open','overdue'])
        .lte('due_date', horizon30).order('due_date')
      const { data: cards } = await supabase.from('credit_cards').select('id, name, color').eq('user_id', user.id)
      const cardMap = Object.fromEntries(((cards ?? []) as { id: string; name: string; color: string }[]).map(c => [c.id, c]))
      setInvoicesDue(((dueInv ?? []) as { id: string; total_amount: number; due_date: string; credit_card_id: string }[]).map(inv => ({
        id:             inv.id,
        card_name:      cardMap[inv.credit_card_id]?.name  ?? 'Cartão',
        card_color:     cardMap[inv.credit_card_id]?.color ?? '#6366f1',
        due_date:       inv.due_date,
        total_amount:   Number(inv.total_amount),
        days_until_due: daysUntil(inv.due_date),
      })))

      // Receitas e despesas do mês
      const { data: txMes } = await supabase
        .from('transactions').select('type, amount').eq('user_id', user.id)
        .gte('date', inicioMes).lte('date', fimMes).in('type', ['income','expense'])
      const txArr = (txMes ?? []) as { type: string; amount: number }[]
      setRecMes( txArr.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0))
      setDespMes(txArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0))

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
          receitas: txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0),
          despesas: txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0),
        }
      }))

      // Pizza categorias
      const { data: txCat } = await supabase
        .from('transactions').select('amount, category_id').eq('user_id', user.id)
        .eq('type', 'expense').gte('date', inicioMes).lte('date', fimMes)
      const { data: cats } = await supabase.from('categories').select('id, name').eq('user_id', user.id)
      const catNameMap = Object.fromEntries(((cats ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
      const catMap2: Record<string, number> = {}
      ;((txCat ?? []) as { amount: number; category_id: string | null }[]).forEach(t => {
        const k = t.category_id ? (catNameMap[t.category_id] ?? 'Outros') : 'Sem categoria'
        catMap2[k] = (catMap2[k] ?? 0) + Number(t.amount)
      })
      setCatSlices(Object.entries(catMap2).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7))

      // Saldo Previsto — recorrências pendentes nos próximos 30d
      const { data: recData } = await supabase
        .from('transactions').select('type, amount, date')
        .eq('user_id', user.id).eq('is_recurring', true)
        .in('status', ['pending','overdue'])
        .gte('date', hoje).lte('date', horizon30)
        .in('type', ['income','expense'])
      const recArr = (recData ?? []) as { type: string; amount: number }[]
      const recEntradas = recArr.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0)
      const recSaidas   = recArr.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
      setRecCount(recArr.length)

      // Saldo Previsto — parcelas pendentes nos próximos 30d
      const { data: instData } = await supabase
        .from('transactions').select('type, amount')
        .eq('user_id', user.id).not('installment_total', 'is', null)
        .eq('status', 'pending')
        .gte('date', hoje).lte('date', horizon30)
        .in('type', ['income','expense'])
      const instArr = (instData ?? []) as { type: string; amount: number }[]
      const totalParcelas   = instArr.filter(i => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0)
      const parcelaReceitas = instArr.filter(i => i.type === 'income').reduce((s, i) => s + Number(i.amount), 0)
      setInstCount(instArr.length)

      setProjecaoItens([
        { label: 'Saldo atual em contas',      value: saldo,         color: 'text-indigo-600', sign: ''  },
        { label: 'Receitas recorrentes (30d)', value: recEntradas,   color: 'text-green-600',  sign: '+' },
        { label: 'Despesas recorrentes (30d)', value: recSaidas,     color: 'text-red-500',    sign: '−' },
        { label: 'Parcelas pendentes (30d)',   value: totalParcelas, color: 'text-orange-500', sign: '−' },
        { label: 'Faturas em aberto',          value: faturas,       color: 'text-purple-600', sign: '−' },
      ])
      setSaldoPrevisto(saldo + recEntradas + parcelaReceitas - recSaidas - totalParcelas - faturas)

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

      {/* ── Header: título + UserMenu ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{MONTH_NAMES[now.getMonth()]} de {now.getFullYear()}</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard/transacoes"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + Nova Transação
          </a>
          <UserMenu />
        </div>
      </div>

      {/* ── KPIs ── */}
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

      {/* ── Saldo disponível (patrimônio líquido) ── */}
      <div className={`rounded-xl px-5 py-4 mb-4 flex items-center justify-between border ${saldoLiquido >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
        <div>
          <p className="text-xs font-medium text-gray-600">💰 Patrimônio líquido estimado</p>
          <p className="text-xs text-gray-400 mt-0.5">Saldo em contas menos faturas em aberto</p>
        </div>
        <p className={`text-2xl font-bold ${saldoLiquido >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(saldoLiquido)}</p>
      </div>

      {/* ── Patrimônio investido (com localStorage) ── */}
      {patrimonioInvestido > 0 && <InvestimentoCard valor={patrimonioInvestido} />}

      {/* ── Saldo Previsto 30 dias ── */}
      <SaldoPrevisto
        itens={projecaoItens}
        saldoPrevisto={saldoPrevisto}
        recCount={recCount}
        instCount={instCount}
      />

      {/* ── Faturas próximas do vencimento ── */}
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

      {/* ── Gráficos ── */}
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

      {/* ── Links rápidos ── */}
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
