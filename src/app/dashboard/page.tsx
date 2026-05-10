'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'

interface MonthBar { mes: string; receitas: number; despesas: number }
interface CatSlice  { name: string; value: number; percent?: number }
interface AccountRow { id: string; name: string; color: string; current_balance: number; type: string }

const SLICE_COLORS = ['#6366f1','#f97316','#22c55e','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
const MONTH_NAMES  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const fmt  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`

function pct(current: number, prev: number) {
  if (prev === 0) return current > 0 ? 100 : 0
  return Math.round(((current - prev) / Math.abs(prev)) * 100)
}

// ── Skeleton primitives ───────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 animate-pulse">
      <div className="h-2.5 bg-gray-100 rounded w-2/5 mb-3" />
      <div className="h-6 bg-gray-100 rounded w-3/5 mb-2" />
      <div className="h-2 bg-gray-100 rounded w-1/3" />
    </div>
  )
}
function SkeletonChart({ h = 200 }: { h?: number }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse">
      <div className="h-3 bg-gray-100 rounded w-1/3 mb-4" />
      <div className="bg-gray-50 rounded-lg" style={{ height: h }} />
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────
function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill }} className="font-medium">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { name, value, payload: inner } = payload[0]
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700">{name}</p>
      <p className="text-gray-500 mt-0.5">{fmt(value)} · {inner.percent?.toFixed(1)}%</p>
    </div>
  )
}

export default function DashboardPage() {
  const supabase = createClient()

  const [email,      setEmail]      = useState('')
  const [loading,    setLoading]    = useState(true)

  // KPIs
  const [saldoTotal, setSaldoTotal] = useState(0)
  const [recMes,     setRecMes]     = useState(0)
  const [despMes,    setDespMes]    = useState(0)
  const [recPrev,    setRecPrev]    = useState(0)
  const [despPrev,   setDespPrev]   = useState(0)
  const [saldoPrev,  setSaldoPrev]  = useState(0)

  // Pendências
  const [pendentes,  setPendentes]  = useState(0)
  const [vencidas,   setVencidas]   = useState(0)

  // Gráficos
  const [monthBars,  setMonthBars]  = useState<MonthBar[]>([])
  const [catSlices,  setCatSlices]  = useState<CatSlice[]>([])

  // Contas
  const [accounts,   setAccounts]   = useState<AccountRow[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }
      setEmail(user.email ?? '')

      const now    = new Date()
      const year   = now.getFullYear()
      const month  = now.getMonth()

      const inicioMes  = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const fimMes     = new Date(year, month + 1, 0).toISOString().split('T')[0]

      const prevMonth  = new Date(year, month - 1, 1)
      const inicioPrev = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`
      const fimPrev    = new Date(year, month, 0).toISOString().split('T')[0]

      // ── Contas ──────────────────────────────────────────
      const { data: acc } = await supabase
        .from('accounts')
        .select('id, name, color, current_balance, type')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('current_balance', { ascending: false })
      const accList = (acc ?? []) as AccountRow[]
      setAccounts(accList)
      setSaldoTotal(accList.reduce((s, a) => s + Number(a.current_balance), 0))

      // ── Transações mês atual ─────────────────────────────
      const { data: txMes } = await supabase
        .from('transactions')
        .select('type, amount, status')
        .eq('user_id', user.id)
        .gte('date', inicioMes)
        .lte('date', fimMes)
        .in('type', ['income', 'expense'])
      const txMesArr = (txMes ?? []) as { type: string; amount: number; status: string }[]
      const rm = txMesArr.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
      const dm = txMesArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
      setRecMes(rm)
      setDespMes(dm)

      // ── Transações mês anterior ──────────────────────────
      const { data: txPrev } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('user_id', user.id)
        .gte('date', inicioPrev)
        .lte('date', fimPrev)
        .in('type', ['income', 'expense'])
      const txPrevArr = (txPrev ?? []) as { type: string; amount: number }[]
      const rp = txPrevArr.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
      const dp = txPrevArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
      setRecPrev(rp)
      setDespPrev(dp)
      setSaldoPrev(rp - dp)

      // ── Pendências ───────────────────────────────────────
      const { count: cPend } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending')
      const { count: cVenc } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'overdue')
      setPendentes(cPend ?? 0)
      setVencidas(cVenc ?? 0)

      // ── Histórico 6 meses ────────────────────────────────
      const meses = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(year, month - (5 - i), 1)
        return {
          key:   d.toISOString().slice(0, 7),
          label: MONTH_NAMES[d.getMonth()] + '/' + String(d.getFullYear()).slice(2),
        }
      })
      const { data: txHist } = await supabase
        .from('transactions')
        .select('type, amount, date')
        .eq('user_id', user.id)
        .gte('date', meses[0].key + '-01')
        .in('type', ['income', 'expense'])
      const txHistArr = (txHist ?? []) as { type: string; amount: number; date: string }[]
      setMonthBars(meses.map(({ key, label }) => {
        const txs = txHistArr.filter(t => t.date.startsWith(key))
        return {
          mes:      label,
          receitas: txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0),
          despesas: txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0),
        }
      }))

      // ── Categorias ───────────────────────────────────────
      const { data: txCat } = await supabase
        .from('transactions')
        .select('amount, category_id')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .gte('date', inicioMes)
        .lte('date', fimMes)
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', user.id)
      const catNameMap = Object.fromEntries(
        ((cats ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])
      )
      const catMap: Record<string, number> = {}
      ;((txCat ?? []) as { amount: number; category_id: string | null }[]).forEach(t => {
        const k = t.category_id ? (catNameMap[t.category_id] ?? 'Outros') : 'Sem categoria'
        catMap[k] = (catMap[k] ?? 0) + Number(t.amount)
      })
      const total = Object.values(catMap).reduce((s, v) => s + v, 0)
      setCatSlices(
        Object.entries(catMap)
          .map(([name, value]) => ({ name, value, percent: total > 0 ? (value / total) * 100 : 0 }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 7)
      )

      setLoading(false)
    }
    load()
  }, [])

  const now         = new Date()
  const saldoMes    = recMes - despMes
  const pctRec      = pct(recMes,  recPrev)
  const pctDesp     = pct(despMes, despPrev)
  const pctSaldo    = pct(saldoMes, saldoPrev)
  const totalAlerts = pendentes + vencidas

  // Badge de variação
  function DeltaBadge({ value, invert = false }: { value: number; invert?: boolean }) {
    const good = invert ? value < 0 : value > 0
    if (value === 0) return <span className="text-[10px] text-gray-300">= vs mês ant.</span>
    return (
      <span className={`text-[10px] font-medium ${good ? 'text-green-500' : 'text-red-400'}`}>
        {value > 0 ? '▲' : '▼'} {Math.abs(value)}% vs mês ant.
      </span>
    )
  }

  const quickActions = [
    { label: 'Nova Transação',  href: '/dashboard/transacoes', emoji: '➕', color: 'bg-indigo-600 text-white hover:bg-indigo-700' },
    { label: 'Nova Conta',      href: '/dashboard/contas',     emoji: '🏦', color: 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50' },
    { label: 'Nova Categoria',  href: '/dashboard/categorias', emoji: '🏷️', color: 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50' },
    { label: 'Importar CSV',    href: '/dashboard/importar',   emoji: '📥', color: 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {MONTH_NAMES[now.getMonth()]} de {now.getFullYear()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 hidden sm:block">{email}</span>
          <a
            href="/dashboard/transacoes"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + Nova Transação
          </a>
        </div>
      </div>

      {/* Alertas */}
      {!loading && totalAlerts > 0 && (
        <div className="flex gap-3 mb-5 flex-wrap">
          {vencidas > 0 && (
            <a href="/dashboard/transacoes" className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-red-100 transition-colors">
              <span>⚠️</span>
              {vencidas} transação{vencidas > 1 ? 'ões' : ''} vencida{vencidas > 1 ? 's' : ''}
            </a>
          )}
          {pendentes > 0 && (
            <a href="/dashboard/transacoes" className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-yellow-100 transition-colors">
              <span>⏳</span>
              {pendentes} transação{pendentes > 1 ? 'ões' : ''} pendente{pendentes > 1 ? 's' : ''}
            </a>
          )}
        </div>
      )}

      {/* Cards KPI */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Saldo Total */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">💰 Saldo Total</p>
            <p className={`text-lg font-bold ${saldoTotal >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
              {fmt(saldoTotal)}
            </p>
            <p className="text-[10px] text-gray-300 mt-1">{accounts.length} conta{accounts.length !== 1 ? 's' : ''} ativa{accounts.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Receitas */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">📈 Receitas do Mês</p>
            <p className="text-lg font-bold text-green-600">{fmt(recMes)}</p>
            <DeltaBadge value={pctRec} />
          </div>

          {/* Despesas */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">📉 Despesas do Mês</p>
            <p className="text-lg font-bold text-red-500">{fmt(despMes)}</p>
            <DeltaBadge value={pctDesp} invert />
          </div>

          {/* Saldo do Mês */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">⚖️ Saldo do Mês</p>
            <p className={`text-lg font-bold ${saldoMes >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {fmt(saldoMes)}
            </p>
            <DeltaBadge value={pctSaldo} />
          </div>
        </div>
      )}

      {/* Gráficos */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
          <div className="lg:col-span-3"><SkeletonChart h={220} /></div>
          <div className="lg:col-span-2"><SkeletonChart h={220} /></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-6">
          {/* Barras */}
          <div className="lg:col-span-3 bg-white border border-gray-100 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Receitas × Despesas (6 meses)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthBars} barSize={12} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="receitas" name="Receitas" fill="#22c55e" radius={[4,4,0,0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Donut */}
          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-700 mb-1">Despesas por Categoria</p>
            <p className="text-xs text-gray-400 mb-3">Mês atual</p>
            {catSlices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-44 text-gray-300">
                <span className="text-4xl mb-2">📂</span>
                <p className="text-xs">Sem despesas categorizadas</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={catSlices} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value">
                      {catSlices.map((_, i) => <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legenda com valor e % */}
                <div className="mt-2 space-y-1">
                  {catSlices.map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                        <span className="text-gray-600 truncate">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-gray-400">{s.percent?.toFixed(0)}%</span>
                        <span className="font-medium text-gray-700">{fmt(s.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Saldo por conta + Ações rápidas */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SkeletonChart h={120} />
          <SkeletonChart h={120} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Saldo por conta */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-700">Saldo por Conta</p>
              <a href="/dashboard/contas" className="text-xs text-indigo-500 hover:underline">Ver todas</a>
            </div>
            {accounts.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-300 text-2xl mb-1">🏦</p>
                <p className="text-xs text-gray-400">Nenhuma conta cadastrada</p>
                <a href="/dashboard/contas" className="text-xs text-indigo-500 hover:underline mt-1 block">Criar conta</a>
              </div>
            ) : (
              <div className="space-y-2.5">
                {accounts.slice(0, 5).map(acc => (
                  <div key={acc.id} className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: acc.color }}
                    >
                      {acc.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-700 truncate">{acc.name}</p>
                        <p className={`text-xs font-semibold shrink-0 ml-2 ${Number(acc.current_balance) >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
                          {fmt(Number(acc.current_balance))}
                        </p>
                      </div>
                      {/* Barra de proporção */}
                      {saldoTotal > 0 && Number(acc.current_balance) > 0 && (
                        <div className="h-1 bg-gray-100 rounded-full mt-1">
                          <div
                            className="h-1 rounded-full transition-all"
                            style={{
                              width: `${Math.min((Number(acc.current_balance) / saldoTotal) * 100, 100)}%`,
                              backgroundColor: acc.color,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {accounts.length > 5 && (
                  <p className="text-xs text-gray-400 text-center pt-1">+{accounts.length - 5} outras</p>
                )}
              </div>
            )}
          </div>

          {/* Ações rápidas */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-700 mb-4">Ações Rápidas</p>
            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map(action => (
                <a
                  key={action.href}
                  href={action.href}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${action.color}`}
                >
                  <span>{action.emoji}</span>
                  <span className="text-xs leading-tight">{action.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
