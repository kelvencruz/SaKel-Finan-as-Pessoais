'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Category, CategoryType, InvestmentGoal } from '@/types'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  ArrowDown, ArrowUp, TrendUp,
  Plus, CheckCircle, XCircle,
} from '@phosphor-icons/react'

const COLORS = [
  '#6366f1','#3b82f6','#22c55e','#f97316',
  '#ef4444','#ec4899','#14b8a6','#f59e0b',
  '#8b5cf6','#6b7280',
]

// category_icon — escolha do usuário, exceção permitida pela regra de ícones
const ICONS = [
  '🛒','🚗','🏠','❤️','🎵','📚','👕','📱','✈️','🍔',
  '💼','💻','📈','💰','🎮','⚽','🐾','💊','🎁','⚡',
  '🍕','☕','🎓','🏋️','🧾','🎬','🏥','🐶','🌱','🧴',
]

const GOAL_ICONS = [
  '🎯','🛡️','🏖️','✈️','🏠','🚗','📚','💍','👶','🏥',
  '💼','🌍','📈','💰','🔑','⛵','🎓','🏋️','🌱','👑',
]

const emptyForm     = { name: '', type: 'expense' as CategoryType, color: '#6366f1', icon: '🛒', customIcon: '' }
const emptyGoalForm = { name: '', icon: '🎯', color: '#6366f1', target_amount: '', target_date: '' }

type Tab   = 'expense' | 'income' | 'investment'
type Toast = { message: string; type: 'success' | 'error' }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function CategoriasPage() {
  const supabase = createClient()

  const [categories,     setCategories]     = useState<Category[]>([])
  const [loading,        setLoading]        = useState(true)
  const [showModal,      setShowModal]      = useState(false)
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [form,           setForm]           = useState(emptyForm)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [deletingId,     setDeletingId]     = useState<string | null>(null)

  const [goals,          setGoals]          = useState<InvestmentGoal[]>([])
  const [showGoalModal,  setShowGoalModal]  = useState(false)
  const [editingGoalId,  setEditingGoalId]  = useState<string | null>(null)
  const [goalForm,       setGoalForm]       = useState(emptyGoalForm)
  const [savingGoal,     setSavingGoal]     = useState(false)
  const [goalError,      setGoalError]      = useState<string | null>(null)
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null)

  const [tab,   setTab]   = useState<Tab>('expense')
  const [toast, setToast] = useState<Toast | null>(null)

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAll() {
    const [{ data: cats }, { data: gls }] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('investment_goals').select('*').order('name'),
    ])
    setCategories(cats ?? [])
    setGoals((gls ?? []) as InvestmentGoal[])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  // ── categoria modal ───────────────────────────────────────────────────
  function openCreate() {
    setForm({ ...emptyForm, type: tab === 'investment' ? 'investment' : tab })
    setEditingId(null); setError(null); setShowModal(true)
  }

  function openEdit(cat: Category) {
    const isCustom = !ICONS.includes(cat.icon)
    setForm({
      name:       cat.name,
      type:       cat.type,
      color:      cat.color,
      icon:       isCustom ? ICONS[0] : cat.icon,
      customIcon: isCustom ? cat.icon : '',
    })
    setEditingId(cat.id); setError(null); setShowModal(true)
  }

  async function handleSave() {
    setError(null)
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    const finalIcon = form.customIcon.trim() || form.icon
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    if (editingId) {
      const { error: err } = await supabase
        .from('categories')
        .update({ name: form.name.trim(), type: form.type, color: form.color, icon: finalIcon })
        .eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
      showToast('Categoria atualizada!')
    } else {
      const { error: err } = await supabase
        .from('categories')
        .insert({ name: form.name.trim(), type: form.type, color: form.color, icon: finalIcon, user_id: user.id })
      if (err) { setError(err.message); setSaving(false); return }
      showToast('Categoria criada!')
    }
    await loadAll(); setShowModal(false); setSaving(false)
  }

  async function handleDelete(cat: Category) {
    if (!confirm(`Excluir a categoria "${cat.name}"?`)) return
    const { count } = await supabase
      .from('transactions').select('id', { count: 'exact', head: true }).eq('category_id', cat.id)
    if (count && count > 0) {
      alert(`Não é possível excluir "${cat.name}" pois ela possui ${count} transação(ões) vinculada(s).`)
      return
    }
    setDeletingId(cat.id)
    const { error: err } = await supabase.from('categories').delete().eq('id', cat.id)
    if (err) showToast('Erro ao excluir categoria.', 'error')
    else showToast('Categoria excluída.')
    await loadAll(); setDeletingId(null)
  }

  // ── goal modal ────────────────────────────────────────────────────────
  function openCreateGoal() {
    setGoalForm(emptyGoalForm); setEditingGoalId(null); setGoalError(null); setShowGoalModal(true)
  }

  function openEditGoal(g: InvestmentGoal) {
    setGoalForm({
      name:          g.name,
      icon:          g.icon,
      color:         g.color,
      target_amount: g.target_amount ? String(g.target_amount) : '',
      target_date:   g.target_date ?? '',
    })
    setEditingGoalId(g.id); setGoalError(null); setShowGoalModal(true)
  }

  async function handleSaveGoal() {
    setGoalError(null)
    if (!goalForm.name.trim()) { setGoalError('Nome é obrigatório.'); return }
    const targetAmount = goalForm.target_amount ? parseFloat(goalForm.target_amount) : null
    if (goalForm.target_amount && isNaN(targetAmount!)) { setGoalError('Valor meta inválido.'); return }

    setSavingGoal(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGoalError('Não autenticado.'); setSavingGoal(false); return }

    const payload = {
      name:          goalForm.name.trim(),
      icon:          goalForm.icon,
      color:         goalForm.color,
      target_amount: targetAmount,
      target_date:   goalForm.target_date || null,
    }

    if (editingGoalId) {
      const { error: err } = await supabase.from('investment_goals').update(payload).eq('id', editingGoalId)
      if (err) { setGoalError(err.message); setSavingGoal(false); return }
      showToast('Objetivo atualizado!')
    } else {
      const { error: err } = await supabase.from('investment_goals').insert({ ...payload, user_id: user.id })
      if (err) { setGoalError(err.message); setSavingGoal(false); return }
      showToast('Objetivo criado!')
    }
    await loadAll(); setShowGoalModal(false); setSavingGoal(false)
  }

  async function handleDeleteGoal(g: InvestmentGoal) {
    if (!confirm(`Excluir o objetivo "${g.name}"?`)) return
    const { count: invCount } = await supabase
      .from('investments').select('id', { count: 'exact', head: true }).eq('goal_id', g.id)
    if (invCount && invCount > 0) {
      alert(`Não é possível excluir "${g.name}" pois ele possui ${invCount} investimento(s) vinculado(s).`)
      return
    }
    setDeletingGoalId(g.id)
    const { error: err } = await supabase.from('investment_goals').delete().eq('id', g.id)
    if (err) showToast('Erro ao excluir objetivo.', 'error')
    else showToast('Objetivo excluído.')
    await loadAll(); setDeletingGoalId(null)
  }

  // ── derived ───────────────────────────────────────────────────────────
  const filtered     = categories.filter(c => c.type === tab)
  const expenseCount = categories.filter(c => c.type === 'expense').length
  const incomeCount  = categories.filter(c => c.type === 'income').length
  const investCount  = categories.filter(c => c.type === 'investment').length
  const activeIcon   = form.customIcon.trim() || form.icon

  const TABS = [
    { key: 'expense'    as const, label: 'Despesas',      count: expenseCount, Icon: ArrowDown, activeClass: 'bg-red-500/10 text-[var(--danger)]'           },
    { key: 'income'     as const, label: 'Receitas',      count: incomeCount,  Icon: ArrowUp,   activeClass: 'bg-green-500/10 text-[var(--success)]'         },
    { key: 'investment' as const, label: 'Investimentos', count: investCount,  Icon: TrendUp,   activeClass: 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]' },
  ]

  return (
    <PageContainer>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle weight="duotone" size={16} />
            : <XCircle weight="duotone" size={16} />}
          {toast.message}
        </div>
      )}

      <PageHeader
        title="Categorias"
        description="Organize despesas, receitas e objetivos de investimento"
        action={
          <button
            onClick={tab === 'investment' ? openCreateGoal : openCreate}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-lg"
          >
            <Plus weight="bold" size={16} />
            {tab === 'investment' ? 'Novo Objetivo' : 'Nova Categoria'}
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? t.activeClass
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-white/5 hover:bg-white/5'
            }`}>
            <t.Icon weight="duotone" size={15} />
            {t.label}
            <span className="text-xs opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[var(--text-secondary)] text-sm">Carregando...</p>

      ) : tab === 'investment' ? (
        <div className="space-y-8">
          {/* Categorias de investimento */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Categorias de Investimento</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Classificam as transações do tipo investimento</p>
              </div>
              <button onClick={openCreate} className="text-xs text-[var(--accent-primary)] hover:underline font-medium">
                + Nova categoria
              </button>
            </div>
            {filtered.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-dashed border-white/10 rounded-xl p-6 text-center">
                <p className="text-[var(--text-secondary)] text-sm">Nenhuma categoria de investimento ainda.</p>
                <button onClick={openCreate} className="mt-2 text-[var(--accent-primary)] text-sm hover:underline">Criar primeira</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map(cat => (
                  <div key={cat.id}
                    className="bg-[var(--bg-surface)] border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                        style={{ backgroundColor: cat.color + '22', border: `2px solid ${cat.color}44` }}>
                        {cat.icon}
                      </div>
                      <span className="font-medium text-[var(--text-primary)] text-sm">{cat.name}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(cat)}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] px-2 py-1 rounded hover:bg-white/5 transition-colors">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(cat)} disabled={deletingId === cat.id}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--danger)] px-2 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50">
                        {deletingId === cat.id ? '...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/5" />

          {/* Objetivos financeiros */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Objetivos Financeiros</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Agrupam investimentos por intenção — reserva, viagem, aposentadoria…</p>
              </div>
              <button onClick={openCreateGoal} className="text-xs text-[var(--accent-primary)] hover:underline font-medium">
                + Novo objetivo
              </button>
            </div>
            {goals.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-dashed border-white/10 rounded-xl p-6 text-center">
                <p className="text-[var(--text-secondary)] text-sm">Nenhum objetivo criado ainda.</p>
                <button onClick={openCreateGoal} className="mt-2 text-[var(--accent-primary)] text-sm hover:underline">
                  Criar primeiro objetivo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {goals.map(g => (
                  <div key={g.id}
                    className="bg-[var(--bg-surface)] border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
                        style={{ backgroundColor: g.color + '22', border: `2px solid ${g.color}55` }}>
                        {g.icon}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text-primary)] text-sm">{g.name}</p>
                        {g.target_amount && (
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Meta: {fmt(g.target_amount)}
                            {g.target_date ? ` · ${new Date(g.target_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditGoal(g)}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] px-2 py-1 rounded hover:bg-white/5 transition-colors">
                        Editar
                      </button>
                      <button onClick={() => handleDeleteGoal(g)} disabled={deletingGoalId === g.id}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--danger)] px-2 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50">
                        {deletingGoalId === g.id ? '...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      ) : (
        filtered.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-dashed border-white/10 rounded-xl p-10 text-center">
            <p className="text-[var(--text-secondary)] text-sm">
              Nenhuma categoria de {tab === 'expense' ? 'despesa' : 'receita'} ainda.
            </p>
            <button onClick={openCreate} className="mt-3 text-[var(--accent-primary)] text-sm hover:underline">
              Criar primeira categoria
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(cat => (
              <div key={cat.id}
                className="bg-[var(--bg-surface)] border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: cat.color + '22', border: `2px solid ${cat.color}44` }}>
                    {cat.icon}
                  </div>
                  <span className="font-medium text-[var(--text-primary)] text-sm">{cat.name}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(cat)}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] px-2 py-1 rounded hover:bg-white/5 transition-colors">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(cat)} disabled={deletingId === cat.id}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--danger)] px-2 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50">
                    {deletingId === cat.id ? '...' : 'Excluir'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Modal Categoria ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-md p-6 shadow-xl border border-white/5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5">
              {editingId ? 'Editar Categoria' : 'Nova Categoria'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Nome</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Aporte, Reserva, Ações..."
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Tipo</label>
                <div className="flex gap-2">
                  {([
                    { v: 'expense'    as const, label: 'Despesa',      Icon: ArrowDown },
                    { v: 'income'     as const, label: 'Receita',      Icon: ArrowUp   },
                    { v: 'investment' as const, label: 'Investimento', Icon: TrendUp   },
                  ]).map(t => (
                    <button key={t.v} onClick={() => setForm({ ...form, type: t.v })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                        form.type === t.v
                          ? t.v === 'expense'    ? 'bg-red-500/10 text-[var(--danger)]'
                          : t.v === 'income'     ? 'bg-green-500/10 text-[var(--success)]'
                          : 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                          : 'border border-white/10 text-[var(--text-secondary)] hover:bg-white/5'
                      }`}>
                      <t.Icon weight="duotone" size={13} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ícone — category_icon, exceção permitida */}
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">Ícone</label>
                <div className="flex gap-2 flex-wrap">
                  {ICONS.map(icon => (
                    <button key={icon} onClick={() => setForm({ ...form, icon, customIcon: '' })}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                        form.icon === icon && !form.customIcon
                          ? 'bg-[var(--accent-primary)]/20 ring-2 ring-[var(--accent-primary)] scale-110'
                          : 'bg-white/5 hover:bg-white/10'
                      }`}>
                      {icon}
                    </button>
                  ))}
                </div>
                <input type="text" value={form.customIcon} onChange={e => setForm({ ...form, customIcon: e.target.value })}
                  placeholder="Ou digite um emoji personalizado…" maxLength={4}
                  className="mt-2 w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(color => (
                    <button key={color} onClick={() => setForm({ ...form, color })}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{ backgroundColor: color, outline: form.color === color ? `3px solid ${color}` : 'none', outlineOffset: '2px' }} />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-[var(--bg)] rounded-lg p-3 flex items-center gap-3 border border-white/5">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                  style={{ backgroundColor: form.color + '22', border: `2px solid ${form.color}55` }}>
                  {activeIcon}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{form.name || 'Prévia da categoria'}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {form.type === 'expense' ? 'Despesa' : form.type === 'income' ? 'Receita' : 'Investimento'}
                  </p>
                </div>
              </div>

              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-white/10 text-[var(--text-secondary)] rounded-lg py-2 text-sm hover:bg-white/5 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 btn-primary rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-colors">
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar categoria'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Objetivo ───────────────────────────────────────────────── */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-md p-6 shadow-xl border border-white/5 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5">
              {editingGoalId ? 'Editar Objetivo' : 'Novo Objetivo'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Nome do objetivo</label>
                <input type="text" value={goalForm.name} onChange={e => setGoalForm({ ...goalForm, name: e.target.value })}
                  placeholder="Ex: Reserva de emergência, Carro, Viagem..."
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
              </div>

              {/* Ícone do objetivo — category_icon, exceção permitida */}
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">Ícone</label>
                <div className="flex gap-2 flex-wrap">
                  {GOAL_ICONS.map(icon => (
                    <button key={icon} onClick={() => setGoalForm({ ...goalForm, icon })}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                        goalForm.icon === icon
                          ? 'bg-[var(--accent-primary)]/20 ring-2 ring-[var(--accent-primary)] scale-110'
                          : 'bg-white/5 hover:bg-white/10'
                      }`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(color => (
                    <button key={color} onClick={() => setGoalForm({ ...goalForm, color })}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{ backgroundColor: color, outline: goalForm.color === color ? `3px solid ${color}` : 'none', outlineOffset: '2px' }} />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Valor meta (R$) <span className="opacity-60">opcional</span>
                  </label>
                  <input type="number" value={goalForm.target_amount} onChange={e => setGoalForm({ ...goalForm, target_amount: e.target.value })}
                    placeholder="0,00" min="0" step="0.01"
                    className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">
                    Data alvo <span className="opacity-60">opcional</span>
                  </label>
                  <input type="date" value={goalForm.target_date} onChange={e => setGoalForm({ ...goalForm, target_date: e.target.value })}
                    className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
                </div>
              </div>

              {/* Preview */}
              <div className="bg-[var(--bg)] rounded-lg p-3 flex items-center gap-3 border border-white/5">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
                  style={{ backgroundColor: goalForm.color + '22', border: `2px solid ${goalForm.color}55` }}>
                  {goalForm.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{goalForm.name || 'Prévia do objetivo'}</p>
                  {goalForm.target_amount && (
                    <p className="text-xs text-[var(--text-secondary)]">
                      Meta: {parseFloat(goalForm.target_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      {goalForm.target_date ? ` · ${new Date(goalForm.target_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {goalError && <p className="text-sm text-[var(--danger)]">{goalError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowGoalModal(false)}
                className="flex-1 border border-white/10 text-[var(--text-secondary)] rounded-lg py-2 text-sm hover:bg-white/5 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveGoal} disabled={savingGoal}
                className="flex-1 btn-primary rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-colors">
                {savingGoal ? 'Salvando...' : editingGoalId ? 'Salvar alterações' : 'Criar objetivo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}