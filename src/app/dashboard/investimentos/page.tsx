'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
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
  X,
} from '@phosphor-icons/react'

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

const TYPES = ['Renda Fixa','Renda Variável','Tesouro','CDB','LCI/LCA','ETF','Ações','FII','Cripto','Outro']

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

const GOAL_ICONS = ['🎯','🛡️','🏖️','✈️','🏠','🚗','📚','💍','👶','🏥','💼','🌍']

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

const emptyGoalForm = { name: '', icon: '🎯', color: '#6366f1' }

type Toast = { message: string; type: 'success' | 'error' }

export default function InvestimentosPage() {
  const supabase = createClient()
  const [investments, setInvestments] = useState<Investment[]>([])
  const [goals,       setGoals]       = useState<Goal[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [form,        setForm]        = useState(emptyForm)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [toast,       setToast]       = useState<Toast | null>(null)
  const [filterType,  setFilterType]  = useState('')
  const [showInactive,setShowInactive]= useState(false)

  const [showNewGoal,  setShowNewGoal]  = useState(false)
  const [goalForm,     setGoalForm]     = useState(emptyGoalForm)
  const [savingGoal,   setSavingGoal]   = useState(false)

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    const [{ data: inv }, { data: gls }] = await Promise.all([
      supabase.from('investments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('investment_goals').select('*').eq('user_id', user.id).order('name'),
    ])
    setInvestments((inv ?? []) as Investment[])
    setGoals((gls ?? []) as Goal[])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setError(null)
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
    setError(null)
    setShowNewGoal(false)
    setShowModal(true)
  }

  async function handleSaveGoal() {
    if (!goalForm.name.trim()) return
    setSavingGoal(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingGoal(false); return }
    const { data, error: err } = await supabase
      .from('investment_goals')
      .insert({ user_id: user.id, name: goalForm.name.trim(), icon: goalForm.icon, color: goalForm.color })
      .select('*').single()
    if (!err && data) {
      const newGoal = data as Goal
      setGoals(prev => [...prev, newGoal].sort((a, b) => a.name.localeCompare(b.name)))
      setForm(f => ({ ...f, goal_id: newGoal.id }))
      setShowNewGoal(false)
      setGoalForm(emptyGoalForm)
    }
    setSavingGoal(false)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    const current = parseFloat(form.current_amount)
    if (isNaN(current) || current < 0) { setError('Valor atual inválido.'); return }
    if (form.liquidity_type === 'fixed_date' && !form.liquidity_date) {
      setError('Informe a data de vencimento.'); return
    }

    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    const payload = {
      user_id:        user.id,
      name:           form.name.trim(),
      type:           form.type,
      goal_id:        form.goal_id || null,
      institution:    form.institution.trim() || null,
      initial_amount: parseFloat(form.initial_amount || '0'),
      current_amount: current,
      profitability:  form.profitability.trim() || null,
      liquidity_type: form.liquidity_type || null,
      liquidity_date: form.liquidity_type === 'fixed_date' ? form.liquidity_date : null,
      start_date:     form.start_date || null,
      notes:          form.notes.trim() || null,
    }

    if (editingId) {
      const { error: err } = await supabase.from('investments').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
      showToast('Investimento atualizado!')
    } else {
      const { error: err } = await supabase.from('investments').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }

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

  async function handleToggleActive(inv: Investment) {
    await supabase.from('investments').update({ is_active: !inv.is_active }).eq('id', inv.id)
    await loadAll()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este investimento?')) return
    setDeletingId(id)
    await supabase.from('investments').delete().eq('id', id)
    showToast('Investimento excluído.')
    await loadAll()
    setDeletingId(null)
  }

  const fmt    = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`

  const filtered = useMemo(() => investments.filter(inv => {
    if (!showInactive && !inv.is_active) return false
    if (filterType && inv.type !== filterType) return false
    return true
  }), [investments, filterType, showInactive])

  const activeInvestments = investments.filter(i => i.is_active)
  const totalInvested     = activeInvestments.reduce((s, i) => s + Number(i.current_amount), 0)
  const totalInitial      = activeInvestments.reduce((s, i) => s + Number(i.initial_amount), 0)
  const totalGain         = totalInvested - totalInitial
  const gainPct           = totalInitial > 0 ? (totalGain / totalInitial) * 100 : 0

  const byType = useMemo(() => {
    const map: Record<string, number> = {}
    activeInvestments.forEach(i => { map[i.type] = (map[i.type] ?? 0) + Number(i.current_amount) })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [investments])

  const byGoal = useMemo(() => {
    const map: Record<string, { amount: number; goal: Goal }> = {}
    activeInvestments.forEach(i => {
      if (!i.goal_id) return
      const g = goals.find(g => g.id === i.goal_id)
      if (!g) return
      if (!map[i.goal_id]) map[i.goal_id] = { amount: 0, goal: g }
      map[i.goal_id].amount += Number(i.current_amount)
    })
    return Object.values(map).sort((a, b) => b.amount - a.amount)
  }, [investments, goals])

  const goalMap = Object.fromEntries(goals.map(g => [g.id, g]))

  return (
    <PageContainer>
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium border ${
          toast.type === 'success'
            ? 'bg-success/10 text-success border-success/30'
            : 'bg-danger/10 text-danger border-danger/30'
        }`}>
          {toast.message}
        </div>
      )}

      <PageHeader
        title="Investimentos"
        description="Patrimônio separado do saldo operacional"
        action={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} weight="bold" />
            Novo Investimento
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-bg-surface rounded-xl p-4 sm:col-span-2">
          <p className="text-xs text-text-secondary mb-1">Patrimônio investido</p>
          <p className="text-3xl font-bold text-accent-primary">{fmt(totalInvested)}</p>
          <p className="text-xs text-text-secondary mt-1">Não incluso no saldo disponível</p>
        </div>
        <div className="bg-bg-surface rounded-xl p-4">
          <p className="text-xs text-text-secondary mb-1">Rendimento total</p>
          <p className={`text-xl font-bold ${totalGain >= 0 ? 'text-success' : 'text-danger'}`}>{fmt(totalGain)}</p>
          <p className={`text-xs mt-1 ${gainPct >= 0 ? 'text-success' : 'text-danger'}`}>{fmtPct(gainPct)}</p>
        </div>
        <div className="bg-bg-surface rounded-xl p-4">
          <p className="text-xs text-text-secondary mb-1">Ativos</p>
          <p className="text-xl font-bold text-text-primary">{activeInvestments.length}</p>
          <p className="text-xs text-text-secondary mt-1">investimentos</p>
        </div>
      </div>

      {/* Distribuição */}
      {activeInvestments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-bg-surface rounded-xl p-4">
            <p className="text-sm font-medium text-text-primary mb-3">Por tipo</p>
            <div className="space-y-2">
              {byType.map(([type, amount]) => {
                const pct = totalInvested > 0 ? (amount / totalInvested) * 100 : 0
                return (
                  <div key={type}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary font-medium">{type}</span>
                      <span className="text-text-secondary">{fmt(amount)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: TYPE_COLORS[type] ?? '#6b7280' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {byGoal.length > 0 && (
            <div className="bg-bg-surface rounded-xl p-4">
              <p className="text-sm font-medium text-text-primary mb-3">Por objetivo</p>
              <div className="space-y-2">
                {byGoal.map(({ goal, amount }) => {
                  const pct = totalInvested > 0 ? (amount / totalInvested) * 100 : 0
                  return (
                    <div key={goal.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-secondary font-medium">{goal.icon} {goal.name}</span>
                        <span className="text-text-secondary">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: goal.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap mb-4 items-center">
        <button onClick={() => setFilterType('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !filterType
              ? 'bg-accent-primary text-white'
              : 'bg-bg-surface text-text-secondary hover:bg-white/10'
          }`}>
          Todos
        </button>
        {TYPES.map(t => investments.some(i => i.type === t) && (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterType === t ? 'text-white' : 'bg-bg-surface text-text-secondary hover:bg-white/10'
            }`}
            style={filterType === t ? { backgroundColor: TYPE_COLORS[t] } : {}}>
            {t}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Mostrar inativos
        </label>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-text-secondary text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-bg-surface border border-dashed border-text-secondary/20 rounded-xl p-10 text-center">
          <TrendUp size={40} weight="duotone" className="text-text-secondary mx-auto mb-3" />
          <p className="text-text-primary text-sm font-medium">Nenhum investimento cadastrado</p>
          <p className="text-text-secondary text-xs mt-1 mb-4">
            Cadastre seus investimentos para acompanhar seu patrimônio separado do saldo operacional.
          </p>
          <button onClick={openCreate}
            className="bg-accent-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
            Novo Investimento
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(inv => {
            const gain    = Number(inv.current_amount) - Number(inv.initial_amount)
            const gainPct = Number(inv.initial_amount) > 0 ? (gain / Number(inv.initial_amount)) * 100 : 0
            const goal    = inv.goal_id ? goalMap[inv.goal_id] : null
            return (
              <div key={inv.id}
                className={`bg-bg-surface rounded-xl p-4 transition-opacity ${!inv.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-8 rounded-full" style={{ backgroundColor: TYPE_COLORS[inv.type] ?? '#6b7280' }} />
                    <div>
                      <p className="font-semibold text-text-primary text-sm">{inv.name}</p>
                      <p className="text-xs text-text-secondary">
                        {inv.type}{inv.institution ? ` · ${inv.institution}` : ''}
                      </p>
                    </div>
                  </div>
                  {goal && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: goal.color + '20', color: goal.color }}>
                      {goal.icon} {goal.name}
                    </span>
                  )}
                </div>

                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-xs text-text-secondary">Valor atual</p>
                    <p className="text-xl font-bold text-text-primary">{fmt(Number(inv.current_amount))}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${gain >= 0 ? 'text-success' : 'text-danger'}`}>{fmt(gain)}</p>
                    <p className={`text-xs ${gainPct >= 0 ? 'text-success' : 'text-danger'}`}>{fmtPct(gainPct)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {inv.liquidity_type && (
                    <span className="text-xs bg-white/5 text-text-secondary px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1">
                      <Drop size={10} weight="duotone" />
                      {LIQUIDITY_LABELS[inv.liquidity_type] ?? inv.liquidity_type}
                      {inv.liquidity_type === 'fixed_date' && inv.liquidity_date
                        ? ` · ${new Date(inv.liquidity_date + 'T12:00:00').toLocaleDateString('pt-BR')}`
                        : ''}
                    </span>
                  )}
                  {inv.profitability && (
                    <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20 flex items-center gap-1">
                      <ChartBar size={10} weight="duotone" />
                      {inv.profitability}
                    </span>
                  )}
                  {inv.start_date && (
                    <span className="text-xs bg-white/5 text-text-secondary px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1">
                      <CalendarBlank size={10} weight="duotone" />
                      {new Date(inv.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>

                <div className="flex gap-1 pt-2 border-t border-white/5">
                  <button onClick={() => openEdit(inv)}
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent-primary px-2 py-1 rounded hover:bg-accent-primary/10 transition-colors">
                    <PencilSimple size={12} weight="duotone" />
                    Editar
                  </button>
                  <button onClick={() => handleToggleActive(inv)}
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-warning px-2 py-1 rounded hover:bg-warning/10 transition-colors">
                    {inv.is_active
                      ? <><Pause size={12} weight="duotone" /> Desativar</>
                      : <><Play size={12} weight="duotone" /> Ativar</>
                    }
                  </button>
                  <button onClick={() => handleDelete(inv.id)} disabled={deletingId === inv.id}
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-danger px-2 py-1 rounded hover:bg-danger/10 transition-colors disabled:opacity-50">
                    <Trash size={12} weight="duotone" />
                    {deletingId === inv.id ? '…' : 'Excluir'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)' }} onClick={() => setShowModal(false)}>
          <div className="rounded-2xl w-full max-w-md p-6 shadow-xl border border-white/10 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#1E293B' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-text-primary">
                {editingId ? 'Editar Investimento' : 'Novo Investimento'}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="text-text-secondary hover:text-text-primary transition-colors">
                <X size={20} weight="bold" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">Nome</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Tesouro Selic 2029, PETR4..."
                  className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary" />
              </div>

              {/* Tipo + Instituição */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Tipo</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary">
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Instituição</label>
                  <input type="text" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })}
                    placeholder="Ex: XP, Nubank..."
                    className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary" />
                </div>
              </div>

              {/* Objetivo */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">Objetivo</label>
                {!showNewGoal ? (
                  <div className="flex gap-2">
                    <select value={form.goal_id} onChange={e => setForm({ ...form, goal_id: e.target.value })}
                      className="flex-1 bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary">
                      <option value="">Sem objetivo</option>
                      {goals.map(g => (
                        <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
                      ))}
                    </select>
                    <button onClick={() => setShowNewGoal(true)}
                      className="px-3 py-2 rounded-lg border border-dashed border-accent-primary/40 text-accent-primary text-xs hover:bg-accent-primary/10 transition-colors whitespace-nowrap">
                      + Novo
                    </button>
                  </div>
                ) : (
                  <div className="border border-accent-primary/20 rounded-xl p-3 space-y-2 bg-accent-primary/5">
                    <p className="text-xs font-medium text-accent-primary">Novo objetivo</p>
                    <input type="text" value={goalForm.name} onChange={e => setGoalForm({ ...goalForm, name: e.target.value })}
                      placeholder="Nome do objetivo"
                      className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary" />
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <p className="text-xs text-text-secondary mb-1 flex items-center gap-1">
                          <Target size={10} weight="duotone" /> Ícone
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {GOAL_ICONS.map(icon => (
                            <button key={icon} onClick={() => setGoalForm({ ...goalForm, icon })}
                              className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-colors ${
                                goalForm.icon === icon
                                  ? 'bg-accent-primary/20 ring-2 ring-accent-primary'
                                  : 'hover:bg-white/10'
                              }`}>
                              {icon}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-text-secondary mb-1 flex items-center gap-1">
                          <Palette size={10} weight="duotone" /> Cor
                        </p>
                        <input type="color" value={goalForm.color} onChange={e => setGoalForm({ ...goalForm, color: e.target.value })}
                          className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowNewGoal(false)}
                        className="flex-1 border border-white/10 text-text-secondary rounded-lg py-1.5 text-xs hover:bg-white/5">
                        Cancelar
                      </button>
                      <button onClick={handleSaveGoal} disabled={savingGoal || !goalForm.name.trim()}
                        className="flex-1 bg-accent-primary text-white rounded-lg py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50">
                        {savingGoal ? 'Salvando...' : 'Criar objetivo'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Valores */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Valor inicial (R$)</label>
                  <input type="number" value={form.initial_amount} onChange={e => setForm({ ...form, initial_amount: e.target.value })}
                    placeholder="0,00" step="0.01" min="0"
                    className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary" />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Valor atual (R$)</label>
                  <input type="number" value={form.current_amount} onChange={e => setForm({ ...form, current_amount: e.target.value })}
                    placeholder="0,00" step="0.01" min="0"
                    className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary" />
                </div>
              </div>

              {/* Rentabilidade */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Rentabilidade <span className="text-text-secondary/50">(opcional)</span>
                </label>
                <input type="text" value={form.profitability} onChange={e => setForm({ ...form, profitability: e.target.value })}
                  placeholder="Ex: 110% CDI, IPCA + 6%, 12% a.a., Variável"
                  className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary" />
              </div>

              {/* Liquidez */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">Liquidez</label>
                <select value={form.liquidity_type} onChange={e => setForm({ ...form, liquidity_type: e.target.value, liquidity_date: '' })}
                  className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary">
                  <option value="daily">Liquidez diária</option>
                  <option value="fixed_date">Data de vencimento</option>
                  <option value="none">Sem liquidez</option>
                </select>
                {form.liquidity_type === 'fixed_date' && (
                  <input type="date" value={form.liquidity_date} onChange={e => setForm({ ...form, liquidity_date: e.target.value })}
                    className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary mt-2" />
                )}
              </div>

              {/* Data início */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">Data de início</label>
                <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary" />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Observações <span className="text-text-secondary/50">(opcional)</span>
                </label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} placeholder="Notas adicionais..."
                  className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none" />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-white/10 text-text-secondary rounded-lg py-2 text-sm hover:bg-white/5 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-accent-primary text-white rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
