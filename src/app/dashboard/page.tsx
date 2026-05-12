'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import UserMenu from '@/components/UserMenu'

interface MonthBar   { mes: string; receitas: number; despesas: number }
interface CatSlice   { name: string; value: number }
interface InvoiceDue { id: string; card_name: string; card_color: string; due_date: string; total_amount: number; days_until_due: number }
interface ProjecaoItem { label: string; value: number; color: string; sign: string }

// ─── KalDiz types ──────────────────────────────────────────────────────────
interface KalInsight {
  id:        string
  prioridade: 1 | 2 | 3          // 1=crítico 2=ação 3=positivo
  icone:     string
  titulo:    string
  texto:     string
  acao?:     { label: string; href: string }
  cor:       string               // classe tailwind de cor do texto
  bg:        string               // classe tailwind de bg
}

interface KalDizData {
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
}

const SLICE_COLORS = ['#6366f1','#f97316','#22c55e','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
const MONTH_NAMES  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const fmt  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.round((new Date(dateStr + 'T12:00:00').getTime() - today.getTime()) / 86400000)
}

// ─── Normalização de descrição ─────────────────────────────────────────────
function normalizeDesc(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\d{4,}/g, '')       // remove números longos (ex: últimos 4 dígitos)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30)
}

// ─── Motor de regras KalDiz v2 ─────────────────────────────────────────────
function gerarInsights(data: KalDizData): KalInsight[] {
  const candidatos: KalInsight[] = []
  const PISO_INVESTIMENTO = 200

  // ── PRIORIDADE 1 — Risco / Urgência ────────────────────────────────────

  // Saldo negativo
  if (data.saldoLiquido < 0) {
    candidatos.push({
      id: 'saldo-negativo', prioridade: 1,
      icone: '⚠️', cor: 'text-red-700', bg: 'bg-red-50 border-red-100',
      titulo: 'Saldo em risco',
      texto: `Suas faturas (${fmt(data.totalFaturas)}) superam seu saldo atual. Considere quitar antes de novos gastos.`,
      acao: { label: 'Ver faturas', href: '/dashboard/faturas' },
    })
  }

  // Fatura vencendo em até 5 dias
  const fatVencendo = data.invoicesDue.filter(i => i.days_until_due >= 0 && i.days_until_due <= 5)
  if (fatVencendo.length > 0) {
    const nomes = fatVencendo.map(f => f.card_name).join(', ')
    candidatos.push({
      id: 'fatura-vencendo', prioridade: 1,
      icone: '📅', cor: 'text-purple-700', bg: 'bg-purple-50 border-purple-100',
      titulo: fatVencendo.length === 1 ? 'Fatura vencendo em breve' : `${fatVencendo.length} faturas vencendo`,
      texto: `${nomes} vence${fatVencendo.length === 1 ? '' : 'm'} nos próximos 5 dias.`,
      acao: { label: 'Ver faturas', href: '/dashboard/faturas' },
    })
  }

  // Fatura vencida
  const fatVencidas = data.invoicesDue.filter(i => i.days_until_due < 0)
  if (fatVencidas.length > 0) {
    candidatos.push({
      id: 'fatura-vencida', prioridade: 1,
      icone: '🚨', cor: 'text-red-700', bg: 'bg-red-50 border-red-100',
      titulo: `${fatVencidas.length} fatura(s) vencida(s)`,
      texto: `Você tem faturas em atraso. Regularize para evitar juros.`,
      acao: { label: 'Ver faturas', href: '/dashboard/faturas' },
    })
  }

  // Alta de gasto por categoria (>= 30% vs mês anterior)
  let maiorAltaCat = ''
  let maiorAltaPct = 0
  for (const [cat, valorAtual] of Object.entries(data.catAtual)) {
    const valorAnterior = data.catAnterior[cat] ?? 0
    if (valorAnterior >= 50 && valorAtual > valorAnterior) {
      const pct = Math.round(((valorAtual - valorAnterior) / valorAnterior) * 100)
      if (pct >= 30 && pct > maiorAltaPct) { maiorAltaPct = pct; maiorAltaCat = cat }
    }
  }
  if (maiorAltaCat) {
    candidatos.push({
      id: 'alta-categoria', prioridade: 1,
      icone: '📈', cor: 'text-orange-700', bg: 'bg-orange-50 border-orange-100',
      titulo: `${maiorAltaCat} subiu ${maiorAltaPct}%`,
      texto: `Gastos em ${maiorAltaCat} aumentaram ${maiorAltaPct}% em relação ao mês passado.`,
      acao: { label: 'Ver transações', href: '/dashboard/transacoes' },
    })
  }

  // ── PRIORIDADE 2 — Ação prática ─────────────────────────────────────────

  // Despesas > Receitas
  if (data.despMes > data.recMes && data.recMes > 0) {
    const pct = Math.round(((data.despMes - data.recMes) / data.recMes) * 100)
    candidatos.push({
      id: 'despesa-maior', prioridade: 2,
      icone: '📊', cor: 'text-orange-600', bg: 'bg-orange-50 border-orange-100',
      titulo: 'Despesas acima das receitas',
      texto: `Você gastou ${pct}% a mais do que recebeu este mês. Bom momento para revisar.`,
      acao: { label: 'Ver transações', href: '/dashboard/transacoes' },
    })
  }

  // Transações sem categoria
  if (data.uncategorizedCount >= 3) {
    candidatos.push({
      id: 'sem-categoria', prioridade: 2,
      icone: '🏷️', cor: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-100',
      titulo: `${data.uncategorizedCount} lançamentos sem categoria`,
      texto: 'Categorizar suas transações melhora os relatórios e os insights do Kal.',
      acao: { label: 'Organizar agora', href: '/dashboard/transacoes' },
    })
  }

  // Recorrência sugerida
  if (data.recorrenteSugerida.length > 0) {
    const s = data.recorrenteSugerida[0]
    candidatos.push({
      id: 'recorrente-sugerida', prioridade: 2,
      icone: '🔁', cor: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100',
      titulo: 'Recorrência identificada',
      texto: `"${s.descricao}" aparece todo mês (≈ ${fmt(s.valor)}). Quer cadastrar como recorrente?`,
      acao: { label: 'Cadastrar recorrência', href: '/dashboard/recorrencias' },
    })
  }

  // Parcelas longas (instCount alto)
  if (data.instCount >= 6) {
    candidatos.push({
      id: 'parcelas-longas', prioridade: 2,
      icone: '📦', cor: 'text-orange-600', bg: 'bg-orange-50 border-orange-100',
      titulo: `${data.instCount} parcelas ainda pendentes`,
      texto: 'Você tem compromissos parcelados que se estendem pelos próximos meses — já estão no saldo previsto.',
      acao: { label: 'Ver transações', href: '/dashboard/transacoes' },
    })
  }

  // Recorrências previstas
  if (data.recCount > 0 && !candidatos.find(c => c.id === 'fatura-vencendo') && !candidatos.find(c => c.id === 'fatura-vencida')) {
    candidatos.push({
      id: 'recorrencias-previstas', prioridade: 2,
      icone: '🔁', cor: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100',
      titulo: `${data.recCount} recorrência(s) nos próximos 30 dias`,
      texto: 'Lançamentos recorrentes já estão considerados no seu saldo previsto.',
    })
  }

  // ── PRIORIDADE 3 — Positivos ─────────────────────────────────────────────

  // Saldo positivo + sem investimento
  if (data.saldoPrevisto > PISO_INVESTIMENTO && data.patrimonioInvestido === 0) {
    candidatos.push({
      id: 'sobra-sem-investimento', prioridade: 3,
      icone: '💡', cor: 'text-green-700', bg: 'bg-green-50 border-green-100',
      titulo: 'Você vai ter sobra este mês',
      texto: `Saldo previsto positivo de ${fmt(data.saldoPrevisto)}. Já pensou em investir uma parte?`,
      acao: { label: 'Ver investimentos', href: '/dashboard/investimentos' },
    })
  }

  // Saldo positivo + com investimento
  if (data.saldoPrevisto > 0 && data.patrimonioInvestido > 0) {
    candidatos.push({
      id: 'saldo-positivo-investindo', prioridade: 3,
      icone: '💚', cor: 'text-green-700', bg: 'bg-green-50 border-green-100',
      titulo: 'Boa consistência financeira',
      texto: `Saldo previsto positivo e patrimônio investido de ${fmt(data.patrimonioInvestido)}. Continue assim.`,
      acao: { label: 'Ver investimentos', href: '/dashboard/investimentos' },
    })
  }

  // 3 meses consecutivos positivos
  if (data.mesesPositivos >= 3) {
    candidatos.push({
      id: 'tres-meses-positivos', prioridade: 3,
      icone: '🎯', cor: 'text-green-700', bg: 'bg-green-50 border-green-100',
      titulo: `${data.mesesPositivos}º mês consecutivo no azul`,
      texto: 'Manter saldo positivo por meses seguidos é o hábito mais importante. Parabéns.',
    })
  }

  // Receitas > despesas (sem outros positivos)
  if (data.recMes > data.despMes && data.recMes > 0) {
    candidatos.push({
      id: 'receita-maior', prioridade: 3,
      icone: '✅', cor: 'text-green-700', bg: 'bg-green-50 border-green-100',
      titulo: 'Mês no azul',
      texto: `Você está sobrando ${fmt(data.recMes - data.despMes)} este mês. Considere reforçar a reserva.`,
    })
  }

  // Fallback
  if (candidatos.length === 0) {
    candidatos.push({
      id: 'tudo-ok', prioridade: 3,
      icone: '🎯', cor: 'text-green-700', bg: 'bg-green-50 border-green-100',
      titulo: 'Tudo equilibrado',
      texto: 'Nada de crítico nos próximos 30 dias. Continue acompanhando.',
    })
  }

  // Seleciona: 1 crítico + 1 ação + 1 positivo (máx 3)
  const critico  = candidatos.filter(c => c.prioridade === 1)[0]
  const acao     = candidatos.filter(c => c.prioridade === 2)[0]
  const positivo = candidatos.filter(c => c.prioridade === 3)[0]
  return [critico, acao, positivo].filter(Boolean) as KalInsight[]
}

// ─── Componente KalDiz ─────────────────────────────────────────────────────
function KalDiz({ data, enabled }: { data: KalDizData; enabled: boolean }) {
  if (!enabled) return null
  const insights = gerarInsights(data)
  if (insights.length === 0) return null

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-6">
      {/* Header */}
<div className="flex items-center gap-3 mb-4">

  {/* Avatar do Kal */}
  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm shrink-0 border border-indigo-400/20">
    
    <img
      src="/kal-avatar.png"
      alt="Kal"
      className="w-7 h-7 object-contain"
      onError={e => {
        const target = e.currentTarget as HTMLImageElement
        target.style.display = 'none'

        const fallback = target.nextElementSibling as HTMLElement
        if (fallback) fallback.style.display = 'flex'
      }}
    />

    {/* Fallback */}
    <div className="hidden w-7 h-7 items-center justify-center text-white text-xs font-bold">
      K
    </div>
  </div>

  {/* Texto */}
  <div className="min-w-0">
    <p className="text-sm font-semibold text-gray-800 leading-none">
      Kal
    </p>

    <p className="text-[11px] text-gray-400 mt-1">
      Insights financeiros inteligentes
    </p>
  </div>
</div>

      {/* Insights */}
      <div className="space-y-3">
        {insights.map(insight => (
          <div
            key={insight.id}
            className={`rounded-xl px-4 py-3 border ${insight.bg}`}
          >
            <div className="flex items-start gap-2.5">
              <span className="text-base shrink-0 mt-0.5">{insight.icone}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold mb-0.5 ${insight.cor}`}>{insight.titulo}</p>
                <p className="text-xs text-gray-600 leading-relaxed">{insight.texto}</p>
                {insight.acao && (
                  <a
                    href={insight.acao.href}
                    className={`inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 hover:underline ${insight.cor}`}
                  >
                    {insight.acao.label} →
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
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
          <p className="text-[10px] text-gray-400 mt-0.5">{recCount} recorrência(s) · {instCount} parcela(s) pendente(s)</p>
        </div>
        <p className={`text-xl font-bold ${saldoPrevisto >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(saldoPrevisto)}</p>
      </div>
    </div>
  )
}

// ─── Card de Investimentos ─────────────────────────────────────────────────
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
  const [kalEnabled,          setKalEnabled]          = useState(true)
  const [kalData,             setKalData]             = useState<KalDizData | null>(null)

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
      const inicioMesAnterior = new Date(year, month - 1, 1).toISOString().slice(0, 7)
      const fimMesAnterior    = new Date(year, month, 0).toISOString().split('T')[0]

      // Preferências do usuário
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

      // Faturas
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
        id: inv.id,
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
      const recMesVal  = txArr.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
      const despMesVal = txArr.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
      setRecMes(recMesVal)
      setDespMes(despMesVal)

      // Sem categoria
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
          receitas: txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0),
          despesas: txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0),
        }
      }))

      // Meses consecutivos positivos (últimos 3)
      let mesesPositivos = 0
      for (let i = 0; i < 3; i++) {
        const key = meses[5 - i]?.key
        if (!key) break
        const txs = histArr.filter(t => t.date.startsWith(key))
        const rec  = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
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

      // Categorias mês anterior (para comparar alta)
      const { data: txAnt } = await supabase
        .from('transactions').select('amount, category_id').eq('user_id', user.id)
        .eq('type', 'expense').gte('date', fimMesAnterior.slice(0,7) + '-01').lte('date', fimMesAnterior)
      const catAntMap: Record<string, number> = {}
      ;((txAnt ?? []) as { amount: number; category_id: string | null }[]).forEach(t => {
        const k = t.category_id ? (catNameMap[t.category_id] ?? 'Outros') : 'Sem categoria'
        catAntMap[k] = (catAntMap[k] ?? 0) + Number(t.amount)
      })

      // Recorrências previstas 30d
      const { data: recData } = await supabase
        .from('transactions').select('type, amount')
        .eq('user_id', user.id).eq('is_recurring', true)
        .in('status', ['pending','overdue'])
        .gte('date', hoje).lte('date', horizon30).in('type', ['income','expense'])
      const recArr2 = (recData ?? []) as { type: string; amount: number }[]
      const recEntradas = recArr2.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0)
      const recSaidas   = recArr2.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
      setRecCount(recArr2.length)

      // Parcelas pendentes 30d
      const { data: instData } = await supabase
        .from('transactions').select('type, amount')
        .eq('user_id', user.id).not('installment_total', 'is', null)
        .eq('status', 'pending').gte('date', hoje).lte('date', horizon30)
        .in('type', ['income','expense'])
      const instArr = (instData ?? []) as { type: string; amount: number }[]
      const totalParcelas   = instArr.filter(i => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0)
      const parcelaReceitas = instArr.filter(i => i.type === 'income').reduce((s, i) => s + Number(i.amount), 0)
      setInstCount(instArr.length)

      // Recorrência sugerida: transações normalizadas repetidas em 2+ meses
      const { data: tx60 } = await supabase
        .from('transactions').select('description, amount, date')
        .eq('user_id', user.id).eq('type', 'expense')
        .gte('date', inicio2m).lte('date', fimMes)
      const tx60Arr = (tx60 ?? []) as { description: string; amount: number; date: string }[]

      // Agrupa por descrição normalizada + mês
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
          const vals  = descValMap[desc]
          const media = vals.reduce((a, b) => a + b, 0) / vals.length
          const maxV  = Math.max(...vals)
          const minV  = Math.min(...vals)
          // Variação máxima de 20%
          if (maxV > 0 && (maxV - minV) / maxV <= 0.20) {
            sugeridas.push({ descricao: desc, valor: media })
          }
        }
      }

      const previsto = saldo + recEntradas + parcelaReceitas - recSaidas - totalParcelas - faturas
      setSaldoPrevisto(previsto)
      setProjecaoItens([
        { label: 'Saldo atual em contas',      value: saldo,         color: 'text-indigo-600', sign: ''  },
        { label: 'Receitas recorrentes (30d)', value: recEntradas,   color: 'text-green-600',  sign: '+' },
        { label: 'Despesas recorrentes (30d)', value: recSaidas,     color: 'text-red-500',    sign: '−' },
        { label: 'Parcelas pendentes (30d)',   value: totalParcelas, color: 'text-orange-500', sign: '−' },
        { label: 'Faturas em aberto',          value: faturas,       color: 'text-purple-600', sign: '−' },
      ])

      setKalData({
        saldoLiquido:        saldo - faturas,
        saldoContas:         saldo,
        saldoPrevisto:       previsto,
        recMes:              recMesVal,
        despMes:             despMesVal,
        recCount:            recArr2.length,
        instCount:           instArr.length,
        invoicesDue:         invoicesFormatted,
        totalFaturas:        faturas,
        patrimonioInvestido: totalInv,
        uncategorizedCount:  uncategorized,
        catAtual:            catMap2,
        catAnterior:         catAntMap,
        recorrenteSugerida:  sugeridas.slice(0, 1),
        mesesPositivos,
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

      {/* KalDiz v2 */}
      {kalData && <KalDiz data={kalData} enabled={kalEnabled} />}

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
