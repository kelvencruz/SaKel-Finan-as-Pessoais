'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Category, CategoryType, InvestmentGoal } from '@/types'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { AppModal } from '@/components/AppModal'
import {
  ArrowDown, ArrowUp, TrendUp,
  Plus, CheckCircle, XCircle, Warning,
} from '@phosphor-icons/react'

// ─── Constantes ───────────────────────────────────────────────────────────────

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

// ─── Glass style — tokens Luminous ───────────────────────────────────────────
const glassStyle: React.CSSProperties = {
  background:           'var(--glass-bg)',
  backdropFilter:       'blur(var(--glass-blur))',
  WebkitBackdropFilter: 'blur(var(--glass-blur))',
  border:               '1px solid var(--glass-border)',
  borderRadius:         '0.75rem',
}

// ─── Página principal ─────────────────────────────────────────────────────────

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

  // Modais de confirmação de exclusão — substitui confirm() nativo
  const [confirmDeleteCat,  setConfirmDeleteCat]  = useState<Category | null>(null)
  const [deleteBlockedCat,  setDeleteBlockedCat]  = useState<{ cat: Category; count: number } | null>(null)
  const [confirmDeleteGoal, setConfirmDeleteGoal] = useState<InvestmentGoal | null>(null)
  const [deleteBlockedGoal, setDeleteBlockedGoal] = useState<{ goal: InvestmentGoal; count: number } | null>(null)

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

  // ─── Categoria modal ──────────────────────────────────────────────────────

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

  // Exclusão com modal — sem confirm() nativo
  async function requestDeleteCat(cat: Category) {
    const { count } = await supabase
      .from('transactions').select('id', { count: 'exact', head: true }).eq('category_id', cat.id)
    if (count && count > 0) {
      setDeleteBlockedCat({ cat, count })
      return
    }
    setConfirmDeleteCat(cat)
  }

  async function executeDeleteCat() {
    if (!confirmDeleteCat) return
    setDeletingId(confirmDeleteCat.id)
    setConfirmDeleteCat(null)
    const { error: err } = await supabase.from('categories').delete().eq('id', confirmDeleteCat.id)
    if (err) showToast('Erro ao excluir categoria.', 'error')
    else showToast('Categoria excluída.')
    await loadAll()
    setDeletingId(null)
  }

  // ─── Goal modal ───────────────────────────────────────────────────────────

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

  // Exclusão com modal — sem confirm() nativo
  async function requestDeleteGoal(g: InvestmentGoal) {
    const { count } = await supabase
      .from('investments').select('id', { count: 'exact', head: true }).eq('goal_id', g.id)
    if (count && count > 0) {
      setDeleteBlockedGoal({ goal: g, count })
      return
    }
    setConfirmDeleteGoal(g)
  }

  async function executeDeleteGoal() {
    if (!confirmDeleteGoal) return
    setDeletingGoalId(confirmDeleteGoal.id)
    setConfirmDeleteGoal(null)
    const { error: err } = await supabase.from('investment_goals').delete().eq('id', confirmDeleteGoal.id)
    if (err) showToast('Erro ao excluir objetivo.', 'error')
    else showToast('Objetivo excluído.')
    await loadAll()
    setDeletingGoalId(null)
  }

  // ─── Derivados ────────────────────────────────────────────────────────────

  const filtered     = categories.filter(c => c.type === tab)
  const expenseCount = categories.filter(c => c.type === 'expense').length
  const incomeCount  = categories.filter(c => c.type === 'income').length
  const investCount  = categories.filter(c => c.type === 'investment').length
  const activeIcon   = form.customIcon.trim() || form.icon

  const TABS = [
    { key: 'expense'    as const, label: 'Despesas',      count: expenseCount, Icon: ArrowDown },
    { key: 'income'     as const, label: 'Receitas',      count: incomeCount,  Icon: ArrowUp   },
    { key: 'investment' as const, label: 'Investimentos', count: investCount,  Icon: TrendUp   },
  ]

  const TAB_ACTIVE_STYLE: Record<Tab, React.CSSProperties> = {
    expense:    { background: 'rgba(239,68,68,0.1)',   color: 'var(--danger, #dc2626)',  border: '1px solid rgba(239,68,68,0.2)'   },
    income:     { background: 'rgba(34,197,94,0.1)',   color: 'var(--success, #16a34a)', border: '1px solid rgba(34,197,94,0.2)'   },
    investment: { background: 'rgba(124,58,237,0.1)',  color: 'var(--primary)',           border: '1px solid rgba(124,58,237,0.2)'  },
  }

  function typeActiveStyle(v: CategoryType): React.CSSProperties {
    if (v === 'expense')    return { background: 'rgba(239,68,68,0.1)',  color: 'var(--danger, #dc2626)',  border: '1px solid rgba(239,68,68,0.2)'  }
    if (v === 'income')     return { background: 'rgba(34,197,94,0.1)',  color: 'var(--success, #16a34a)', border: '1px solid rgba(34,197,94,0.2)'  }
    return                         { background: 'rgba(124,58,237,0.1)', color: 'var(--primary)',          border: '1px solid rgba(124,58,237,0.2)' }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageContainer>

      {/* Toast — tokens Luminous */}
      {toast && (
        <div
          className="fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2"
          style={{
            ...glassStyle,
            border: toast.type === 'success'
              ? '1px solid rgba(34,197,94,0.25)'
              : '1px solid rgba(239,68,68,0.25)',
            color: toast.type === 'success'
              ? 'var(--success, #16a34a)'
              : 'var(--danger, #dc2626)',
          }}
        >
          {toast.type === 'success'
            ? <CheckCircle weight="duotone" size={16} />
            : <XCircle     weight="duotone" size={16} />}
          {toast.message}
        </div>
      )}

      {/* PageHeader — action com hidden md:flex (regra inviolável) */}
      <PageHeader
        title="Categorias"
        description="Organize despesas, receitas e objetivos de investimento"
        action={
          <div className="hidden md:flex">
            <button
              onClick={tab === 'investment' ? openCreateGoal : openCreate}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              <Plus weight="bold" size={16} />
              {tab === 'investment' ? 'Novo Objetivo' : 'Nova Categoria'}
            </button>
          </div>
        }
      />

      {/* Tabs — tokens Luminous */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
            style={
              tab === t.key
                ? TAB_ACTIVE_STYLE[t.key]
                : { background: 'var(--glass-bg)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }
            }
          >
            <t.Icon weight="duotone" size={15} />
            {t.label}
            <span style={{ opacity: 0.6 }} className="text-xs">{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }} />
          ))}
        </div>

      ) : tab === 'investment' ? (
        <div className="space-y-8">

          {/* Categorias de investimento */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Categorias de Investimento
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Classificam as transações do tipo investimento
                </p>
              </div>
              <button
                onClick={openCreate}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                + Nova categoria
              </button>
            </div>
            {filtered.length === 0 ? (
              <div className="p-6 text-center rounded-xl" style={{ ...glassStyle, border: '1px dashed var(--glass-border)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Nenhuma categoria de investimento ainda.
                </p>
                <button onClick={openCreate} className="mt-2 text-sm hover:underline" style={{ color: 'var(--primary)' }}>
                  Criar primeira
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map(cat => (
                  <CategoryCard key={cat.id} cat={cat} deletingId={deletingId}
                    onEdit={openEdit} onDelete={requestDeleteCat} />
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--glass-border)' }} />

          {/* Objetivos financeiros */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Objetivos Financeiros
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Agrupam investimentos por intenção — reserva, viagem, aposentadoria…
                </p>
              </div>
              <button
                onClick={openCreateGoal}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                + Novo objetivo
              </button>
            </div>
            {goals.length === 0 ? (
              <div className="p-6 text-center rounded-xl" style={{ ...glassStyle, border: '1px dashed var(--glass-border)' }}>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Nenhum objetivo criado ainda.
                </p>
                <button onClick={openCreateGoal} className="mt-2 text-sm hover:underline" style={{ color: 'var(--primary)' }}>
                  Criar primeiro objetivo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {goals.map(g => (
                  <GoalCard key={g.id} g={g} deletingGoalId={deletingGoalId}
                    onEdit={openEditGoal} onDelete={requestDeleteGoal} />
                ))}
              </div>
            )}
          </div>
        </div>

      ) : (
        filtered.length === 0 ? (
          <div className="p-10 text-center rounded-xl" style={{ ...glassStyle, border: '1px dashed var(--glass-border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma categoria de {tab === 'expense' ? 'despesa' : 'receita'} ainda.
            </p>
            <button onClick={openCreate} className="mt-3 text-sm hover:underline" style={{ color: 'var(--primary)' }}>
              Criar primeira categoria
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(cat => (
              <CategoryCard key={cat.id} cat={cat} deletingId={deletingId}
                onEdit={openEdit} onDelete={requestDeleteCat} />
            ))}
          </div>
        )
      )}

      {/* ── Modal Categoria — AppModal canônico ───────────────────────────── */}
      <AppModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Editar Categoria' : 'Nova Categoria'}
        size="md"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setShowModal(false)}
              className="flex-1 rounded-lg py-2 text-sm transition-opacity hover:opacity-80"
              style={{ border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', background: 'transparent' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar categoria'}
            </button>
          </AppModal.Footer>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Nome</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Alimentação, Salário..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--primary-rgb,124,58,237),0.15)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Tipo</label>
            <div className="flex gap-2">
              {([
                { v: 'expense'    as const, label: 'Despesa',      Icon: ArrowDown },
                { v: 'income'     as const, label: 'Receita',      Icon: ArrowUp   },
                { v: 'investment' as const, label: 'Investimento', Icon: TrendUp   },
              ]).map(t => (
                <button
                  key={t.v}
                  onClick={() => setForm({ ...form, type: t.v })}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={form.type === t.v
                    ? typeActiveStyle(t.v)
                    : { border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', background: 'transparent' }
                  }
                >
                  <t.Icon weight="duotone" size={13} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ícone — category_icon, exceção permitida */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Ícone</label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setForm({ ...form, icon, customIcon: '' })}
                  className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                  style={
                    form.icon === icon && !form.customIcon
                      ? { background: 'rgba(var(--primary-rgb,124,58,237),0.15)', outline: '2px solid var(--primary)', outlineOffset: '1px', transform: 'scale(1.1)' }
                      : { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }
                  }
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={form.customIcon}
              onChange={e => setForm({ ...form, customIcon: e.target.value })}
              placeholder="Ou digite um emoji personalizado…"
              maxLength={4}
              className="mt-2 w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
            />
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Cor</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setForm({ ...form, color })}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: color, outline: form.color === color ? `3px solid ${color}` : 'none', outlineOffset: '2px' }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div
            className="p-3 flex items-center gap-3 rounded-lg"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: form.color + '22', border: `2px solid ${form.color}55` }}
            >
              {activeIcon}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {form.name || 'Prévia da categoria'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {form.type === 'expense' ? 'Despesa' : form.type === 'income' ? 'Receita' : 'Investimento'}
              </p>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
      </AppModal>

      {/* ── Modal Objetivo — AppModal canônico ───────────────────────────── */}
      <AppModal
        open={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        title={editingGoalId ? 'Editar Objetivo' : 'Novo Objetivo'}
        size="md"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setShowGoalModal(false)}
              className="flex-1 rounded-lg py-2 text-sm transition-opacity hover:opacity-80"
              style={{ border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', background: 'transparent' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveGoal}
              disabled={savingGoal}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              {savingGoal ? 'Salvando...' : editingGoalId ? 'Salvar alterações' : 'Criar objetivo'}
            </button>
          </AppModal.Footer>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Nome do objetivo
            </label>
            <input
              type="text"
              value={goalForm.name}
              onChange={e => setGoalForm({ ...goalForm, name: e.target.value })}
              placeholder="Ex: Reserva de emergência, Carro, Viagem..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--primary-rgb,124,58,237),0.15)' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          {/* Ícone do objetivo */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Ícone</label>
            <div className="flex gap-2 flex-wrap">
              {GOAL_ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setGoalForm({ ...goalForm, icon })}
                  className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                  style={
                    goalForm.icon === icon
                      ? { background: 'rgba(var(--primary-rgb,124,58,237),0.15)', outline: '2px solid var(--primary)', outlineOffset: '1px', transform: 'scale(1.1)' }
                      : { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }
                  }
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Cor</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setGoalForm({ ...goalForm, color })}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: color, outline: goalForm.color === color ? `3px solid ${color}` : 'none', outlineOffset: '2px' }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                Valor meta <span style={{ opacity: 0.5 }}>(opcional)</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={goalForm.target_amount}
                onChange={e => setGoalForm({ ...goalForm, target_amount: e.target.value })}
                placeholder="0,00"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
              />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                Data alvo <span style={{ opacity: 0.5 }}>(opcional)</span>
              </label>
              <input
                type="date"
                value={goalForm.target_date}
                onChange={e => setGoalForm({ ...goalForm, target_date: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
              />
            </div>
          </div>

          {/* Preview */}
          <div
            className="p-3 flex items-center gap-3 rounded-lg"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: goalForm.color + '22', border: `2px solid ${goalForm.color}55` }}
            >
              {goalForm.icon}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {goalForm.name || 'Prévia do objetivo'}
              </p>
              {goalForm.target_amount && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Meta: {parseFloat(goalForm.target_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  {goalForm.target_date ? ` · ${new Date(goalForm.target_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                </p>
              )}
            </div>
          </div>

          {goalError && <p className="text-sm" style={{ color: 'var(--danger)' }}>{goalError}</p>}
        </div>
      </AppModal>

      {/* ── Modal confirmação exclusão categoria ── */}
      <AppModal
        open={!!confirmDeleteCat}
        onClose={() => setConfirmDeleteCat(null)}
        title="Excluir categoria"
        size="sm"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setConfirmDeleteCat(null)}
              className="flex-1 rounded-lg py-2 text-sm transition-opacity hover:opacity-80"
              style={{ border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', background: 'transparent' }}
            >
              Cancelar
            </button>
            <button
              onClick={executeDeleteCat}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--danger)' }}
            >
              Excluir
            </button>
          </AppModal.Footer>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Tem certeza que deseja excluir{' '}
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            "{confirmDeleteCat?.name}"
          </span>
          ? Esta ação não pode ser desfeita.
        </p>
      </AppModal>

      {/* ── Modal exclusão bloqueada — categoria com transações ── */}
      <AppModal
        open={!!deleteBlockedCat}
        onClose={() => setDeleteBlockedCat(null)}
        title="Não é possível excluir"
        size="sm"
        footer={
          <AppModal.Footer align="end">
            <button
              onClick={() => setDeleteBlockedCat(null)}
              className="rounded-lg px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              Entendi
            </button>
          </AppModal.Footer>
        }
      >
        <div className="flex items-start gap-3">
          <Warning weight="duotone" size={20} style={{ color: 'var(--warning, #ca8a04)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            A categoria{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              "{deleteBlockedCat?.cat.name}"
            </span>{' '}
            possui{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {deleteBlockedCat?.count} transação(ões)
            </span>{' '}
            vinculada(s) e não pode ser excluída.
          </p>
        </div>
      </AppModal>

      {/* ── Modal confirmação exclusão objetivo ── */}
      <AppModal
        open={!!confirmDeleteGoal}
        onClose={() => setConfirmDeleteGoal(null)}
        title="Excluir objetivo"
        size="sm"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setConfirmDeleteGoal(null)}
              className="flex-1 rounded-lg py-2 text-sm transition-opacity hover:opacity-80"
              style={{ border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', background: 'transparent' }}
            >
              Cancelar
            </button>
            <button
              onClick={executeDeleteGoal}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--danger)' }}
            >
              Excluir
            </button>
          </AppModal.Footer>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Tem certeza que deseja excluir o objetivo{' '}
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            "{confirmDeleteGoal?.name}"
          </span>
          ? Esta ação não pode ser desfeita.
        </p>
      </AppModal>

      {/* ── Modal exclusão bloqueada — objetivo com investimentos ── */}
      <AppModal
        open={!!deleteBlockedGoal}
        onClose={() => setDeleteBlockedGoal(null)}
        title="Não é possível excluir"
        size="sm"
        footer={
          <AppModal.Footer align="end">
            <button
              onClick={() => setDeleteBlockedGoal(null)}
              className="rounded-lg px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              Entendi
            </button>
          </AppModal.Footer>
        }
      >
        <div className="flex items-start gap-3">
          <Warning weight="duotone" size={20} style={{ color: 'var(--warning, #ca8a04)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            O objetivo{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              "{deleteBlockedGoal?.goal.name}"
            </span>{' '}
            possui{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {deleteBlockedGoal?.count} investimento(s)
            </span>{' '}
            vinculado(s) e não pode ser excluído.
          </p>
        </div>
      </AppModal>

    </PageContainer>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function CategoryCard({
  cat, deletingId, onEdit, onDelete,
}: {
  cat: Category
  deletingId: string | null
  onEdit: (cat: Category) => void
  onDelete: (cat: Category) => void
}) {
  return (
    <div
      className="p-4 flex items-center justify-between group transition-all"
      style={{
        background:           'var(--glass-bg)',
        backdropFilter:       'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        border:               '1px solid var(--glass-border)',
        borderRadius:         '0.75rem',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--glass-hover-border)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ backgroundColor: cat.color + '22', border: `2px solid ${cat.color}44` }}
        >
          {cat.icon}
        </div>
        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
          {cat.name}
        </span>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(cat)}
          className="text-xs px-2 py-1 rounded transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'rgba(var(--primary-rgb,124,58,237),0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(cat)}
          disabled={deletingId === cat.id}
          className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-40"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
        >
          {deletingId === cat.id ? '...' : 'Excluir'}
        </button>
      </div>
    </div>
  )
}

function GoalCard({
  g, deletingGoalId, onEdit, onDelete,
}: {
  g: InvestmentGoal
  deletingGoalId: string | null
  onEdit: (g: InvestmentGoal) => void
  onDelete: (g: InvestmentGoal) => void
}) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return (
    <div
      className="p-4 flex items-center justify-between group transition-all"
      style={{
        background:           'var(--glass-bg)',
        backdropFilter:       'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        border:               '1px solid var(--glass-border)',
        borderRadius:         '0.75rem',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--glass-hover-border)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: g.color + '22', border: `2px solid ${g.color}55` }}
        >
          {g.icon}
        </div>
        <div>
          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{g.name}</p>
          {g.target_amount && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Meta: {fmt(g.target_amount)}
              {g.target_date ? ` · ${new Date(g.target_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(g)}
          className="text-xs px-2 py-1 rounded transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'rgba(var(--primary-rgb,124,58,237),0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(g)}
          disabled={deletingGoalId === g.id}
          className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-40"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
        >
          {deletingGoalId === g.id ? '...' : 'Excluir'}
        </button>
      </div>
    </div>
  )
}
