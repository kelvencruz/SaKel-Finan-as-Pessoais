'use client'
import { useActionHubStore } from '@/stores/useActionHubStore'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { AppModal } from '@/components/AppModal'
import { AnimatedValue } from '@/components/ui/AnimatedValue'
import {
  TrendUp,
  Plus,
  Drop,
  ChartBar,
  CalendarBlank,
  PencilSimple,
  Pause,
  Play,
  Trash,
  Target,
  Palette,
  Siren,
  // Phosphor icons substituindo emojis dos GOAL_ICONS
  Crosshair,
  Shield,
  Umbrella,
  Airplane,
  House,
  Car,
  BookOpen,
  Heart,
  Baby,
  FirstAid,
  Briefcase,
  Globe,
} from '@phosphor-icons/react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Investment {
  id: string
  user_id: string
  name: string
  type: string
  goal_id: string | null
  institution: string | null
  initial_amount: number
  current_amount: number
  profitability: string | null
  liquidity_type: string | null
  liquidity_date: string | null
  start_date: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

interface Goal {
  id: string
  name: string
  icon: string
  color: string
}

type Toast = { message: string; type: 'success' | 'error' }

// ─── Constantes ──────────────────────────────────────────────────────────────

const TYPES = [
  'Renda Fixa', 'Renda Variável', 'Tesouro', 'CDB', 'LCI/LCA',
  'ETF', 'Ações', 'FII', 'Cripto', 'Outro',
]

const TYPE_COLORS: Record<string, string> = {
  'Renda Fixa':    '#22c55e',
  'Renda Variável':'#6366f1',
  'Tesouro':       '#f59e0b',
  'CDB':           '#3b82f6',
  'LCI/LCA':       '#14b8a6',
  'ETF':           '#8b5cf6',
  'Ações':         '#ef4444',
  'FII':           '#f97316',
  'Cripto':        '#ec4899',
  'Outro':         '#6b7280',
}

const LIQUIDITY_LABELS: Record<string, string> = {
  daily:      'Liquidez diária',
  fixed_date: 'Data de vencimento',
  none:       'Sem liquidez',
}

// Phosphor icons no lugar de emojis — regra inviolável do design system
const GOAL_ICONS: { key: string; icon: React.ElementType }[] = [
  { key: 'crosshair', icon: Crosshair },
  { key: 'shield',    icon: Shield },
  { key: 'umbrella',  icon: Umbrella },
  { key: 'airplane',  icon: Airplane },
  { key: 'house',     icon: House },
  { key: 'car',       icon: Car },
  { key: 'book',      icon: BookOpen },
  { key: 'heart',     icon: Heart },
  { key: 'baby',      icon: Baby },
  { key: 'firstaid',  icon: FirstAid },
  { key: 'briefcase', icon: Briefcase },
  { key: 'globe',     icon: Globe },
]

const emptyForm = {
  name: '',
  type: 'Renda Fixa',
  goal_id: '',
  institution: '',
  initial_amount: '',
  current_amount: '',
  profitability: '',
  liquidity_type: 'daily',
  liquidity_date: '',
  start_date: new Date().toISOString().split('T')[0],
  notes: '',
}

const emptyGoalForm = { name: '', icon: 'crosshair', color: '#6366f1' }

// ─── Helpers financeiros ──────────────────────────────────────────────────────

/**
 * Arredondamento seguro para 2 casas decimais.
 * Proxy para bigint até a migration investment_transactions.
 * Evita floating point drift acumulativo (ex: 100.10 + 200.20 = 300.30000000000003).
 */
function safeAdd(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100
}

function safeMul(a: number, b: number): number {
  return Math.round(a * b * 100) / 100
}

const fmt    = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`

// ─── Componente ──────────────────────────────────────────────────────────────

export default function InvestimentosPage() {
  const supabase = createClient()

  // Estado principal
  const [investments, setInvestments] = useState<Investment[]>([])
  const [goals,       setGoals]       = useState<Goal[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState<string | null>(null)

  // Modal criar/editar
  const [showModal,   setShowModal]   = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [form,        setForm]        = useState(emptyForm)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState<string | null>(null)

  // Confirmação de exclusão (modal próprio — sem confirm() nativo)
  const [deleteTarget, setDeleteTarget] = useState<Investment | null>(null)
  const [deleting,     setDeleting]     = useState(false)

  // Novo objetivo inline
  const [showNewGoal, setShowNewGoal] = useState(false)
  const [goalForm,    setGoalForm]    = useState(emptyGoalForm)
  const [savingGoal,  setSavingGoal]  = useState(false)

  // Filtros
  const [filterType,   setFilterType]   = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // Toast
  const [toast, setToast] = useState<Toast | null>(null)
  // ─── FAB → abre modal inline enquanto NovoInvestimentoModal canônico não existe ───
const { pendingAction, clear } = useActionHubStore()

useEffect(() => {
  if (pendingAction === 'novo-investimento') {
    openCreate()
    clear()
  }
}, [pendingAction])

  // ─── Toast helper ─────────────────────────────────────────────────────────

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }

    const [{ data: inv, error: invErr }, { data: gls, error: glsErr }] = await Promise.all([
      supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        // Soft delete: excluir registros com deleted_at preenchido
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('investment_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('name'),
    ])

    if (invErr || glsErr) {
      setLoadError('Erro ao carregar investimentos. Tente novamente.')
      setLoading(false)
      return
    }

    setLoadError(null)
    setInvestments((inv ?? []) as Investment[])
    setGoals((gls ?? []) as Goal[])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  // ─── Modal abrir/fechar ───────────────────────────────────────────────────

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setFormError(null)
    setShowNewGoal(false)
    setShowModal(true)
  }

  function openEdit(inv: Investment) {
    setForm({
      name:           inv.name,
      type:           inv.type,
      goal_id:        inv.goal_id ?? '',
      institution:    inv.institution ?? '',
      initial_amount: String(inv.initial_amount),
      current_amount: String(inv.current_amount),
      profitability:  inv.profitability ?? '',
      liquidity_type: inv.liquidity_type ?? 'daily',
      liquidity_date: inv.liquidity_date ?? '',
      start_date:     inv.start_date ?? new Date().toISOString().split('T')[0],
      notes:          inv.notes ?? '',
    })
    setEditingId(inv.id)
    setFormError(null)
    setShowNewGoal(false)
    setShowModal(true)
  }

  // ─── Salvar objetivo inline ───────────────────────────────────────────────

  async function handleSaveGoal() {
    if (!goalForm.name.trim()) return
    setSavingGoal(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingGoal(false); return }

    const { data, error: err } = await supabase
      .from('investment_goals')
      .insert({
        user_id: user.id,
        name:    goalForm.name.trim(),
        icon:    goalForm.icon,
        color:   goalForm.color,
      })
      .select('*')
      .single()

    if (!err && data) {
      const newGoal = data as Goal
      setGoals(prev => [...prev, newGoal].sort((a, b) => a.name.localeCompare(b.name)))
      setForm(f => ({ ...f, goal_id: newGoal.id }))
      setShowNewGoal(false)
      setGoalForm(emptyGoalForm)
    }
    setSavingGoal(false)
  }

  // ─── Salvar investimento ──────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) { setFormError('Nome é obrigatório.'); return }
    const current = parseFloat(form.current_amount)
    if (isNaN(current) || current < 0) { setFormError('Valor atual inválido.'); return }
    if (form.liquidity_type === 'fixed_date' && !form.liquidity_date) {
      setFormError('Informe a data de vencimento.'); return
    }

    setSaving(true)
    setFormError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFormError('Não autenticado.'); setSaving(false); return }

    const payload = {
      user_id:        user.id,
      name:           form.name.trim(),
      type:           form.type,
      goal_id:        form.goal_id || null,
      institution:    form.institution.trim() || null,
      // safeAdd: arredondamento seguro no parse
      initial_amount: Math.round(parseFloat(form.initial_amount || '0') * 100) / 100,
      current_amount: Math.round(current * 100) / 100,
      profitability:  form.profitability.trim() || null,
      liquidity_type: form.liquidity_type || null,
      liquidity_date: form.liquidity_type === 'fixed_date' ? form.liquidity_date : null,
      start_date:     form.start_date || null,
      notes:          form.notes.trim() || null,
    }

    if (editingId) {
      const { error: err } = await supabase.from('investments').update(payload).eq('id', editingId)
      if (err) { setFormError(err.message); setSaving(false); return }
      showToast('Investimento atualizado!')
    } else {
      const { error: err } = await supabase.from('investments').insert(payload)
      if (err) { setFormError(err.message); setSaving(false); return }
      const isFirstInvestment = investments.filter(i => i.is_active).length === 0
      if (isFirstInvestment) {
        await awardXP(user.id, 'first_investment', 'first_investment').catch(() => {})
      }
      showToast('Investimento cadastrado!')
    }

    await loadAll()
    setShowModal(false)
    setSaving(false)
  }

  // ─── Toggle ativo/inativo ─────────────────────────────────────────────────

  async function handleToggleActive(inv: Investment) {
    await supabase.from('investments').update({ is_active: !inv.is_active }).eq('id', inv.id)
    await loadAll()
  }

  // ─── Soft delete ─────────────────────────────────────────────────────────
  // CORREÇÃO AUDITORIA (CRÍTICO): substituído DELETE físico por soft delete.
  // deleted_at timestamptz deve existir na tabela investments.
  // Migration necessária: ALTER TABLE investments ADD COLUMN deleted_at timestamptz;

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error: err } = await supabase
      .from('investments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id)

    if (err) {
      showToast('Erro ao excluir investimento.', 'error')
    } else {
      showToast('Investimento excluído.')
    }
    await loadAll()
    setDeleteTarget(null)
    setDeleting(false)
  }

  // ─── Cálculos ─────────────────────────────────────────────────────────────
  // CORREÇÃO AUDITORIA (ALTO): usando safeAdd para evitar floating point drift.

  const activeInvestments = investments.filter(i => i.is_active)

  const totalInvested = activeInvestments.reduce((s, i) => safeAdd(s, Number(i.current_amount)), 0)
  const totalInitial  = activeInvestments.reduce((s, i) => safeAdd(s, Number(i.initial_amount)), 0)
  const totalGain     = Math.round((totalInvested - totalInitial) * 100) / 100
  const gainPct       = totalInitial > 0
    ? Math.round((totalGain / totalInitial) * 10000) / 100  // 4 casas para pct, mostra 2
    : 0

  // ─── Filtros e memos ──────────────────────────────────────────────────────

  const filtered = useMemo(() => investments.filter(inv => {
    if (!showInactive && !inv.is_active) return false
    if (filterType && inv.type !== filterType) return false
    return true
  }), [investments, filterType, showInactive])

  const byType = useMemo(() => {
    const map: Record<string, number> = {}
    activeInvestments.forEach(i => {
      map[i.type] = safeAdd(map[i.type] ?? 0, Number(i.current_amount))
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [investments])

  const byGoal = useMemo(() => {
    const map: Record<string, { amount: number; goal: Goal }> = {}
    activeInvestments.forEach(i => {
      if (!i.goal_id) return
      const g = goals.find(g => g.id === i.goal_id)
      if (!g) return
      if (!map[i.goal_id]) map[i.goal_id] = { amount: 0, goal: g }
      map[i.goal_id].amount = safeAdd(map[i.goal_id].amount, Number(i.current_amount))
    })
    return Object.values(map).sort((a, b) => b.amount - a.amount)
  }, [investments, goals])

  const goalMap = Object.fromEntries(goals.map(g => [g.id, g]))

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageContainer>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium border transition-opacity ${
          toast.type === 'success'
            ? 'bg-success/10 text-success border-success/30'
            : 'bg-danger/10 text-danger border-danger/30'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Investimentos"
        description="Patrimônio separado do saldo operacional"
        action={
          <button
            onClick={openCreate}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} weight="bold" />
            Novo Investimento
          </button>
        }
      />

      {/* Erro de carregamento */}
      {loadError && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-danger/30 bg-danger/10 text-danger text-sm">
          <Siren size={16} weight="duotone" />
          {loadError}
          <button
            onClick={() => { setLoadError(null); setLoading(true); loadAll() }}
            className="ml-auto underline opacity-70 hover:opacity-100 transition-opacity text-xs"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── KPIs ── */}
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">

  <div
    className="sm:col-span-2 rounded-2xl p-4 sm:p-5 border transition-all duration-200"
    style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      border: '1px solid var(--glass-border)',
      boxShadow: '0 0 0 0 transparent',
    }}
  >
    <div className="w-8 h-1 rounded-full mb-3" style={{ background: 'var(--chart-line-start)' }} />
    <p className="text-xs text-text-secondary mb-1">Patrimônio investido</p>
    {loading ? (
      <div className="h-8 w-36 rounded-lg animate-pulse bg-white/10 mb-1" />
    ) : (
      <AnimatedValue
        value={totalInvested}
        group="investments"
        className="text-2xl sm:text-3xl font-bold"
        style={{ color: 'var(--chart-line-start)' }}
      />
    )}
    <p className="text-xs text-text-secondary mt-1">Não incluso no saldo disponível</p>
  </div>

  <div
    className="rounded-2xl p-4 sm:p-5 border transition-all duration-200"
    style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      border: '1px solid var(--glass-border)',
    }}
  >
    <div
      className="w-8 h-1 rounded-full mb-3"
      style={{ background: totalGain >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
    />
    <p className="text-xs text-text-secondary mb-1">Rendimento</p>
    {loading ? (
      <div className="h-7 w-24 rounded-lg animate-pulse bg-white/10 mb-1" />
    ) : (
      <AnimatedValue
        value={totalGain}
        group="investments"
        className={`text-xl font-bold ${totalGain >= 0 ? 'text-success' : 'text-danger'}`}
      />
    )}
    <p className={`text-xs mt-1 ${gainPct >= 0 ? 'text-success' : 'text-danger'}`}>
      {loading ? '...' : fmtPct(gainPct)}
    </p>
  </div>

  <div
    className="rounded-2xl p-4 sm:p-5 border transition-all duration-200"
    style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      border: '1px solid var(--glass-border)',
    }}
  >
    <div className="w-8 h-1 rounded-full mb-3" style={{ background: 'var(--chart-line-mid)' }} />
    <p className="text-xs text-text-secondary mb-1">Ativos</p>
    {loading ? (
      <div className="h-7 w-12 rounded-lg animate-pulse bg-white/10 mb-1" />
    ) : (
      <p className="text-xl font-bold text-text-primary">{activeInvestments.length}</p>
    )}
    <p className="text-xs text-text-secondary mt-1">investimentos</p>
  </div>

</div>
        
        

        {/* Patrimônio investido */}
        <div
          className="sm:col-span-2 rounded-2xl p-5 border transition-all duration-200"
          style={{
            background:     'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            border:         '1px solid var(--glass-border)',
            boxShadow:      '0 0 0 0 transparent',
          }}
        >
          {/* Accent bar */}
          <div
            className="w-8 h-1 rounded-full mb-3"
            style={{ background: 'var(--chart-line-start)' }}
          />
          <p className="text-xs text-text-secondary mb-1">Patrimônio investido</p>
          {loading ? (
            <div className="h-8 w-36 rounded-lg animate-pulse bg-white/10 mb-1" />
          ) : (
            <AnimatedValue
              value={totalInvested}
              group="investments"
              className="text-3xl font-bold"
              style={{ color: 'var(--chart-line-start)' }}
            />
          )}
          <p className="text-xs text-text-secondary mt-1">Não incluso no saldo disponível</p>
        </div>

        {/* Rendimento total */}
        <div
          className="rounded-2xl p-5 border transition-all duration-200"
          style={{
            background:     'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            border:         '1px solid var(--glass-border)',
          }}
        >
          <div
            className="w-8 h-1 rounded-full mb-3"
            style={{ background: totalGain >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
          />
          <p className="text-xs text-text-secondary mb-1">Rendimento total</p>
          {loading ? (
            <div className="h-7 w-24 rounded-lg animate-pulse bg-white/10 mb-1" />
          ) : (
            <AnimatedValue
              value={totalGain}
              group="investments"
              className={`text-xl font-bold ${totalGain >= 0 ? 'text-success' : 'text-danger'}`}
            />
          )}
          <p className={`text-xs mt-1 ${gainPct >= 0 ? 'text-success' : 'text-danger'}`}>
            {loading ? '...' : fmtPct(gainPct)}
          </p>
        </div>

        {/* Ativos */}
        <div
          className="rounded-2xl p-5 border transition-all duration-200"
          style={{
            background:     'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            border:         '1px solid var(--glass-border)',
          }}
        >
          <div
            className="w-8 h-1 rounded-full mb-3"
            style={{ background: 'var(--chart-line-mid)' }}
          />
          <p className="text-xs text-text-secondary mb-1">Ativos</p>
          {loading ? (
            <div className="h-7 w-12 rounded-lg animate-pulse bg-white/10 mb-1" />
          ) : (
            <p className="text-xl font-bold text-text-primary">{activeInvestments.length}</p>
          )}
          <p className="text-xs text-text-secondary mt-1">investimentos</p>
        </div>
      

      {/* ── Distribuição ── */}
      {!loading && activeInvestments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

          {/* Por tipo */}
          <div
            className="rounded-2xl p-5 border"
            style={{
              background:     'var(--glass-bg)',
              backdropFilter: 'blur(var(--glass-blur))',
              WebkitBackdropFilter: 'blur(var(--glass-blur))',
              border:         '1px solid var(--glass-border)',
            }}
          >
            <p className="text-sm font-medium text-text-primary mb-4">Por tipo</p>
            <div className="space-y-3">
              {byType.map(([type, amount]) => {
                const pct = totalInvested > 0
                  ? Math.round((amount / totalInvested) * 10000) / 100
                  : 0
                return (
                  <div key={type}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-text-secondary font-medium">{type}</span>
                      <span className="text-text-secondary">{fmt(amount)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-border)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: TYPE_COLORS[type] ?? '#6b7280' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Por objetivo */}
          {byGoal.length > 0 && (
            <div
              className="rounded-2xl p-5 border"
              style={{
                background:     'var(--glass-bg)',
                backdropFilter: 'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                border:         '1px solid var(--glass-border)',
              }}
            >
              <p className="text-sm font-medium text-text-primary mb-4">Por objetivo</p>
              <div className="space-y-3">
                {byGoal.map(({ goal, amount }) => {
                  const pct = totalInvested > 0
                    ? Math.round((amount / totalInvested) * 10000) / 100
                    : 0
                  return (
                    <div key={goal.id}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-text-secondary font-medium">{goal.name}</span>
                        <span className="text-text-secondary">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-border)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: goal.color }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex gap-2 mb-4 items-center overflow-x-auto pb-1 scrollbar-none">
  <button
    onClick={() => setFilterType('')}
    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
      !filterType ? 'bg-accent-primary text-white' : 'bg-bg-surface text-text-secondary hover:bg-white/10'
    }`}
  >
    Todos
  </button>
  {TYPES.map(t => investments.some(i => i.type === t) && (
    <button
      key={t}
      onClick={() => setFilterType(t)}
      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0"
      style={
        filterType === t
          ? { backgroundColor: TYPE_COLORS[t], color: '#fff' }
          : { background: 'var(--glass-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--glass-border)' }
      }
    >
      {t}
    </button>
  ))}
  <label className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none shrink-0">
    <input
      type="checkbox"
      checked={showInactive}
      onChange={e => setShowInactive(e.target.checked)}
      className="rounded"
    />
    Inativos
  </label>
</div>

      {/* ── Lista de investimentos ── */}
      {loading ? (
        /* Skeleton loading — sem flash de R$ 0,00 */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(n => (
            <div
              key={n}
              className="rounded-2xl p-4 border animate-pulse"
              style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', minHeight: 140 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-10 rounded-full bg-white/10" />
                <div className="flex-1">
                  <div className="h-3.5 w-32 rounded bg-white/10 mb-2" />
                  <div className="h-3 w-20 rounded bg-white/10" />
                </div>
              </div>
              <div className="h-6 w-28 rounded bg-white/10 mb-2" />
              <div className="h-3 w-16 rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center border border-dashed"
          style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}
        >
          <TrendUp size={40} weight="duotone" className="text-text-secondary mx-auto mb-3" />
          <p className="text-text-primary text-sm font-medium">Nenhum investimento cadastrado</p>
          <p className="text-text-secondary text-xs mt-1 mb-4">
            Cadastre seus investimentos para acompanhar seu patrimônio separado do saldo operacional.
          </p>
          <button
            onClick={openCreate}
            className="bg-accent-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Novo Investimento
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(inv => {
            const gain    = Math.round((Number(inv.current_amount) - Number(inv.initial_amount)) * 100) / 100
            const gainPct = Number(inv.initial_amount) > 0
              ? Math.round((gain / Number(inv.initial_amount)) * 10000) / 100
              : 0
            const goal = inv.goal_id ? goalMap[inv.goal_id] : null

            return (
              <div
                key={inv.id}
                className="rounded-2xl p-4 border transition-all duration-200 group"
                style={{
                  background:     'var(--glass-bg)',
                  backdropFilter: 'blur(var(--glass-blur))',
                  WebkitBackdropFilter: 'blur(var(--glass-blur))',
                  border:         `1px solid var(--glass-border)`,
                  opacity:        inv.is_active ? 1 : 0.5,
                  // glass-card hover: apenas border-color e box-shadow — sem transform (regra inviolável)
                  transition:     'border-color 200ms, box-shadow 200ms, opacity 200ms',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.borderColor = 'var(--glass-hover-border)'
                  el.style.boxShadow   = `0 0 0 1px var(--glass-hover-border)`
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.borderColor = 'var(--glass-border)'
                  el.style.boxShadow   = 'none'
                }}
              >
                {/* Accent bar por tipo */}
                <div
                  className="w-full h-0.5 rounded-full mb-4 opacity-60"
                  style={{ background: TYPE_COLORS[inv.type] ?? '#6b7280' }}
                />

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: TYPE_COLORS[inv.type] ?? '#6b7280' }}
                    />
                    <div>
                      <p className="font-semibold text-text-primary text-sm leading-tight">{inv.name}</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {inv.type}{inv.institution ? ` · ${inv.institution}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Badge de objetivo — sem emoji, usa cor do goal */}
                  {goal && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                      style={{
                        backgroundColor: goal.color + '20',
                        color:           goal.color,
                        border:          `1px solid ${goal.color}30`,
                      }}
                    >
                      {goal.name}
                    </span>
                  )}
                </div>

                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-xs text-text-secondary">Valor atual</p>
                    <AnimatedValue
                      value={Number(inv.current_amount)}
                      group="investments"
                      className="text-xl font-bold text-text-primary"
                    />
                  </div>
                  <div className="text-right">
                    <AnimatedValue
                      value={gain}
                      group="investments"
                      className={`text-sm font-semibold ${gain >= 0 ? 'text-success' : 'text-danger'}`}
                    />
                    <p className={`text-xs ${gainPct >= 0 ? 'text-success' : 'text-danger'}`}>
                      {fmtPct(gainPct)}
                    </p>
                  </div>
                </div>

                {/* Chips de metadata */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {inv.liquidity_type && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full border flex items-center gap-1"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--color-text-secondary)' }}
                    >
                      <Drop size={10} weight="duotone" />
                      {LIQUIDITY_LABELS[inv.liquidity_type] ?? inv.liquidity_type}
                      {inv.liquidity_type === 'fixed_date' && inv.liquidity_date
                        ? ` · ${new Date(inv.liquidity_date + 'T12:00:00').toLocaleDateString('pt-BR')}`
                        : ''}
                    </span>
                  )}
                  {inv.profitability && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 text-success"
                      style={{ background: 'var(--color-success-bg, rgba(34,197,94,0.08))', borderColor: 'rgba(34,197,94,0.2)' }}
                    >
                      <ChartBar size={10} weight="duotone" />
                      {inv.profitability}
                    </span>
                  )}
                  {inv.start_date && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full border flex items-center gap-1"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--color-text-secondary)' }}
                    >
                      <CalendarBlank size={10} weight="duotone" />
                      {new Date(inv.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>

                {/* Ações */}
                {/* Ações */}
<div
  className="flex gap-1 pt-2"
  style={{ borderTop: '1px solid var(--glass-border)' }}
>
  <button
    onClick={() => openEdit(inv)}
    className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent-primary px-2 py-2 rounded hover:bg-accent-primary/10 transition-colors min-h-[36px]"
  >
    <PencilSimple size={12} weight="duotone" />
    Editar
  </button>
  <button
    onClick={() => handleToggleActive(inv)}
    className="flex items-center gap-1 text-xs text-text-secondary hover:text-warning px-2 py-2 rounded hover:bg-warning/10 transition-colors min-h-[36px]"
  >
    {inv.is_active
      ? <><Pause size={12} weight="duotone" /> Desativar</>
      : <><Play  size={12} weight="duotone" /> Ativar</>
    }
  </button>
  <button
    onClick={() => setDeleteTarget(inv)}
    className="flex items-center gap-1 text-xs text-text-secondary hover:text-danger px-2 py-2 rounded hover:bg-danger/10 transition-colors min-h-[36px]"
  >
    <Trash size={12} weight="duotone" />
    Excluir
  </button>
</div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Modal: Criar / Editar investimento
      ═══════════════════════════════════════════════════════════════════ */}
      <AppModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Editar Investimento' : 'Novo Investimento'}
        size="md"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setShowModal(false)}
              className="flex-1 rounded-lg py-2 text-sm transition-colors hover:opacity-80"
              style={{ border: '1px solid var(--glass-border)', color: 'var(--color-text-muted)', background: 'transparent' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Cadastrar'}
            </button>
          </AppModal.Footer>
        }
      >
        <div className="space-y-4">

          {/* Nome */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Nome
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Tesouro Selic 2029, PETR4..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
            />
          </div>

          {/* Tipo + Instituição */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Tipo
              </label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
              >
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                Instituição
              </label>
              <input
                type="text"
                value={form.institution}
                onChange={e => setForm({ ...form, institution: e.target.value })}
                placeholder="Ex: XP, Nubank..."
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
              />
            </div>
          </div>

          {/* Objetivo */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Objetivo
            </label>
            {!showNewGoal ? (
              <div className="flex gap-2">
                <select
                  value={form.goal_id}
                  onChange={e => setForm({ ...form, goal_id: e.target.value })}
                  className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                >
                  <option value="">Sem objetivo</option>
                  {goals.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewGoal(true)}
                  className="px-3 py-2 rounded-lg text-xs hover:opacity-80 transition-opacity whitespace-nowrap"
                  style={{ border: '1px dashed var(--primary)', color: 'var(--primary)', background: 'transparent' }}
                >
                  + Novo
                </button>
              </div>
            ) : (
              <div
                className="rounded-xl p-3 space-y-3"
                style={{ border: '1px solid var(--primary)', background: 'var(--glass-bg)' }}
              >
                <p className="text-xs font-medium" style={{ color: 'var(--primary)' }}>Novo objetivo</p>
                <input
                  type="text"
                  value={goalForm.name}
                  onChange={e => setGoalForm({ ...goalForm, name: e.target.value })}
                  placeholder="Nome do objetivo"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                />

                <div className="flex gap-3">
                  {/* Ícone — Phosphor icons, sem emojis */}
                  <div className="flex-1">
                    <p className="text-xs mb-2 flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
                      <Target size={10} weight="duotone" /> Ícone
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {GOAL_ICONS.map(({ key, icon: Icon }) => (
                        <button
                          key={key}
                          onClick={() => setGoalForm({ ...goalForm, icon: key })}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                          style={
                            goalForm.icon === key
                              ? { background: 'var(--glass-bg)', outline: '2px solid var(--primary)', outlineOffset: '1px' }
                              : { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }
                          }
                        >
                          <Icon size={14} weight="duotone" style={{ color: 'var(--color-text-secondary)' }} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cor */}
                  <div>
                    <p className="text-xs mb-2 flex items-center gap-1" style={{ color: 'var(--color-text-secondary)' }}>
                      <Palette size={10} weight="duotone" /> Cor
                    </p>
                    <input
                      type="color"
                      value={goalForm.color}
                      onChange={e => setGoalForm({ ...goalForm, color: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer bg-transparent"
                      style={{ border: '1px solid var(--glass-border)' }}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowNewGoal(false)}
                    className="flex-1 rounded-lg py-1.5 text-xs transition-colors hover:opacity-80"
                    style={{ border: '1px solid var(--glass-border)', color: 'var(--color-text-muted)', background: 'transparent' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveGoal}
                    disabled={savingGoal || !goalForm.name.trim()}
                    className="flex-1 rounded-lg py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--primary)' }}
                  >
                    {savingGoal ? 'Salvando...' : 'Criar objetivo'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Valor inicial + Valor atual */}
          <div className="grid grid-cols-2 gap-3">
  <div>
    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
      Valor inicial (R$)
    </label>
    <input
      type="number"
      inputMode="decimal"
      value={form.initial_amount}
      onChange={e => setForm({ ...form, initial_amount: e.target.value })}
      placeholder="0,00"
      step="0.01"
      min="0"
      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
    />
  </div>
  <div>
    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
      Valor atual (R$)
    </label>
    <input
      type="number"
      inputMode="decimal"
      value={form.current_amount}
      onChange={e => setForm({ ...form, current_amount: e.target.value })}
      placeholder="0,00"
      step="0.01"
      min="0"
      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
    />
  </div>
</div>

          {/* Rentabilidade */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Rentabilidade <span style={{ opacity: 0.5 }}>(opcional)</span>
            </label>
            <input
              type="text"
              value={form.profitability}
              onChange={e => setForm({ ...form, profitability: e.target.value })}
              placeholder="Ex: 110% CDI, IPCA + 6%, 12% a.a., Variável"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
            />
          </div>

          {/* Liquidez */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Liquidez
            </label>
            <select
              value={form.liquidity_type}
              onChange={e => setForm({ ...form, liquidity_type: e.target.value, liquidity_date: '' })}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
            >
              <option value="daily">Liquidez diária</option>
              <option value="fixed_date">Data de vencimento</option>
              <option value="none">Sem liquidez</option>
            </select>
            {form.liquidity_type === 'fixed_date' && (
              <input
                type="date"
                value={form.liquidity_date}
                onChange={e => setForm({ ...form, liquidity_date: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary mt-2"
                style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
              />
            )}
          </div>

          {/* Data de início */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Data de início
            </label>
            <input
              type="date"
              value={form.start_date}
              onChange={e => setForm({ ...form, start_date: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
            />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Observações <span style={{ opacity: 0.5 }}>(opcional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Notas adicionais..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
            />
          </div>

          {formError && (
            <p className="text-sm text-danger">{formError}</p>
          )}
        </div>
      </AppModal>

      {/* ═══════════════════════════════════════════════════════════════════
          Modal: Confirmação de exclusão (soft delete)
          CORREÇÃO AUDITORIA (CRÍTICO): substitui confirm() nativo.
          O botão confirmar executa UPDATE deleted_at em vez de DELETE.
      ═══════════════════════════════════════════════════════════════════ */}
      <AppModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Excluir investimento?"
        size="sm"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 rounded-lg py-2 text-sm transition-colors hover:opacity-80"
              style={{ border: '1px solid var(--glass-border)', color: 'var(--color-text-muted)', background: 'transparent' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 bg-danger"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          </AppModal.Footer>
        }
      >
        <p className="text-sm text-text-secondary leading-relaxed">
          O investimento <strong className="text-text-primary font-medium">{deleteTarget?.name}</strong> será
          removido da sua lista. Esta ação pode ser revertida pelo suporte se necessário.
        </p>
      </AppModal>

    </PageContainer>
  )
}
