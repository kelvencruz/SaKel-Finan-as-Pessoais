// src/components/NovaCategoriaModal.tsx
//
// Modal canônico para criação/edição de Categoria e Objetivo financeiro.
// Extraído de categorias/page.tsx na sprint TD-006.
//
// CONTRATO:
//  - mode='categoria' (padrão) → cria/edita Category
//  - mode='objetivo'           → cria/edita InvestmentGoal
//  - onSaved: chamado após insert/update bem-sucedido
//  - onClose: chamado em cancelar ou após save
//
// REGRAS ARQUITETURAIS:
//  - Nunca abrir diretamente de página ou FAB
//    → sempre via dispatch('nova-categoria' | 'novo-objetivo') → ActionHubController
//  - Edição ainda pode ser aberta diretamente pela página enquanto
//    houver modal inline — migrável futuramente
//  - Não usa framer-motion — transições max 300ms
//  - Tokens Luminous: var(--glass-*), var(--primary), var(--text-*)
//  - category_icon e goal_icon: única exceção para emoji no frontend

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Category, CategoryType, InvestmentGoal } from '@/types'
import { AppModal } from '@/components/AppModal'
import { ArrowDown, ArrowUp, TrendUp } from '@phosphor-icons/react'

// ─── Constantes ──────────────────────────────────────────────────────────────

const COLORS = [
  '#6366f1','#3b82f6','#22c55e','#f97316',
  '#ef4444','#ec4899','#14b8a6','#f59e0b',
  '#8b5cf6','#6b7280',
]

// category_icon — exceção permitida pela regra de ícones (vem do banco)
const ICONS = [
  '🛒','🚗','🏠','❤️','🎵','📚','👕','📱','✈️','🍔',
  '💼','💻','📈','💰','🎮','⚽','🐾','💊','🎁','⚡',
  '🍕','☕','🎓','🏋️','🧾','🎬','🏥','🐶','🌱','🧴',
]

const GOAL_ICONS = [
  '🎯','🛡️','🏖️','✈️','🏠','🚗','📚','💍','👶','🏥',
  '💼','🌍','📈','💰','🔑','⛵','🎓','🏋️','🌱','👑',
]

const emptyCatForm  = { name: '', type: 'expense' as CategoryType, color: '#6366f1', icon: '🛒', customIcon: '' }
const emptyGoalForm = { name: '', icon: '🎯', color: '#6366f1', target_amount: '', target_date: '' }

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ModalMode = 'categoria' | 'objetivo'

interface NovaCategoriaModalProps {
  open:    boolean
  onClose: () => void
  onSaved: () => void
  mode?:   ModalMode
  /** Edição de categoria existente */
  category?: Category
  /** Edição de objetivo existente */
  goal?: InvestmentGoal
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function typeActiveClass(v: CategoryType) {
  if (v === 'expense')    return 'bg-red-500/10 text-red-400'
  if (v === 'income')     return 'bg-green-500/10 text-green-400'
  return 'bg-[var(--primary)]/10 text-[var(--primary)]'
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NovaCategoriaModal({
  open,
  onClose,
  onSaved,
  mode     = 'categoria',
  category,
  goal,
}: NovaCategoriaModalProps) {
  const supabase    = createClient()
  const isGoalMode  = mode === 'objetivo'
  const isEditing   = isGoalMode ? Boolean(goal) : Boolean(category)

  const [catForm,   setCatForm]  = useState(emptyCatForm)
  const [goalForm,  setGoalForm] = useState(emptyGoalForm)
  const [saving,    setSaving]   = useState(false)
  const [error,     setError]    = useState<string | null>(null)

  // Preencher form ao abrir
  useEffect(() => {
    if (!open) return
    setError(null)

    if (isGoalMode && goal) {
      setGoalForm({
        name:          goal.name,
        icon:          goal.icon,
        color:         goal.color,
        target_amount: goal.target_amount ? String(goal.target_amount) : '',
        target_date:   goal.target_date ?? '',
      })
    } else if (!isGoalMode && category) {
      const isCustom = !ICONS.includes(category.icon)
      setCatForm({
        name:       category.name,
        type:       category.type,
        color:      category.color,
        icon:       isCustom ? ICONS[0] : category.icon,
        customIcon: isCustom ? category.icon : '',
      })
    } else if (isGoalMode) {
      setGoalForm(emptyGoalForm)
    } else {
      setCatForm(emptyCatForm)
    }
  }, [open, mode, category, goal, isGoalMode])

  // ── Save: categoria ───────────────────────────────────────────────────────

  async function saveCategoriaOrGoal() {
    if (isGoalMode) {
      await saveGoal()
    } else {
      await saveCategoria()
    }
  }

  async function saveCategoria() {
    setError(null)
    if (!catForm.name.trim()) { setError('Nome é obrigatório.'); return }

    const finalIcon = catForm.customIcon.trim() || catForm.icon
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    if (isEditing && category) {
      const { error: err } = await supabase
        .from('categories')
        .update({
          name:  catForm.name.trim(),
          type:  catForm.type,
          color: catForm.color,
          icon:  finalIcon,
        })
        .eq('id', category.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('categories').insert({
        name:    catForm.name.trim(),
        type:    catForm.type,
        color:   catForm.color,
        icon:    finalIcon,
        user_id: user.id,
      })
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  // ── Save: objetivo ────────────────────────────────────────────────────────

  async function saveGoal() {
    setError(null)
    if (!goalForm.name.trim()) { setError('Nome é obrigatório.'); return }

    const targetAmount = goalForm.target_amount ? parseFloat(goalForm.target_amount) : null
    if (goalForm.target_amount && isNaN(targetAmount!)) {
      setError('Valor meta inválido.')
      return
    }

    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    const payload = {
      name:          goalForm.name.trim(),
      icon:          goalForm.icon,
      color:         goalForm.color,
      target_amount: targetAmount,
      target_date:   goalForm.target_date || null,
    }

    if (isEditing && goal) {
      const { error: err } = await supabase
        .from('investment_goals')
        .update(payload)
        .eq('id', goal.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from('investment_goals')
        .insert({ ...payload, user_id: user.id })
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  // ── Modal title ───────────────────────────────────────────────────────────

  function modalTitle() {
    if (isGoalMode) return isEditing ? 'Editar Objetivo' : 'Novo Objetivo'
    return isEditing ? 'Editar Categoria' : 'Nova Categoria'
  }

  function saveLabel() {
    if (saving) return 'Salvando...'
    if (isEditing) return 'Salvar alterações'
    return isGoalMode ? 'Criar objetivo' : 'Criar categoria'
  }

  const activeCatIcon = catForm.customIcon.trim() || catForm.icon

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={modalTitle()}
      footer={
        <AppModal.Footer align="between">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg py-2 text-sm transition-colors hover:opacity-80"
            style={{
              border:     '1px solid var(--glass-border)',
              color:      'var(--text-secondary)',
              background: 'transparent',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={saveCategoriaOrGoal}
            disabled={saving}
            className="flex-1 btn-primary rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {saveLabel()}
          </button>
        </AppModal.Footer>
      }
    >
      {/* ── MODO CATEGORIA ── */}
      {!isGoalMode && (
        <div className="space-y-4">

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Nome
            </label>
            <input
              type="text"
              value={catForm.name}
              onChange={e => setCatForm({ ...catForm, name: e.target.value })}
              placeholder="Ex: Alimentação, Salário, Ações..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background:   'var(--glass-bg)',
                color:        'var(--text-primary)',
                border:       '1px solid var(--glass-border)',
                borderRadius: '0.5rem',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Tipo
            </label>
            <div className="flex gap-2">
              {([
                { v: 'expense'    as const, label: 'Despesa',      Icon: ArrowDown },
                { v: 'income'     as const, label: 'Receita',      Icon: ArrowUp },
                { v: 'investment' as const, label: 'Investimento', Icon: TrendUp },
              ]).map(t => (
                <button
                  key={t.v}
                  onClick={() => setCatForm({ ...catForm, type: t.v })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                    catForm.type === t.v
                      ? typeActiveClass(t.v)
                      : 'text-[var(--text-secondary)] hover:bg-white/5'
                  }`}
                  style={{
                    border: catForm.type !== t.v ? '1px solid var(--glass-border)' : 'none',
                  }}
                >
                  <t.Icon weight="duotone" size={13} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ícone */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Ícone
            </label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setCatForm({ ...catForm, icon, customIcon: '' })}
                  className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                  style={{
                    background: catForm.icon === icon && !catForm.customIcon
                      ? 'var(--primary)20'
                      : 'var(--glass-bg)',
                    border: catForm.icon === icon && !catForm.customIcon
                      ? '2px solid var(--primary)'
                      : '1px solid var(--glass-border)',
                    transform: catForm.icon === icon && !catForm.customIcon
                      ? 'scale(1.1)'
                      : 'scale(1)',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={catForm.customIcon}
              onChange={e => setCatForm({ ...catForm, customIcon: e.target.value })}
              placeholder="Ou digite um emoji personalizado…"
              maxLength={4}
              className="mt-2 w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background:   'var(--glass-bg)',
                color:        'var(--text-primary)',
                border:       '1px solid var(--glass-border)',
                borderRadius: '0.5rem',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
            />
          </div>

          {/* Cor */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Cor
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setCatForm({ ...catForm, color })}
                  className="w-7 h-7 rounded-full transition-all"
                  style={{
                    backgroundColor: color,
                    outline:         catForm.color === color ? `3px solid ${color}` : 'none',
                    outlineOffset:   '2px',
                    boxShadow:       catForm.color === color ? `0 0 8px ${color}60` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Prévia */}
          <div
            className="rounded-lg p-3 flex items-center gap-3"
            style={{
              background:  'var(--glass-bg)',
              border:      '1px solid var(--glass-border)',
              borderRadius:'0.5rem',
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
              style={{
                backgroundColor: catForm.color + '22',
                border:          `2px solid ${catForm.color}55`,
              }}
            >
              {activeCatIcon}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {catForm.name || 'Prévia da categoria'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {catForm.type === 'expense' ? 'Despesa' : catForm.type === 'income' ? 'Receita' : 'Investimento'}
              </p>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
      )}

      {/* ── MODO OBJETIVO ── */}
      {isGoalMode && (
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
              style={{
                background:   'var(--glass-bg)',
                color:        'var(--text-primary)',
                border:       '1px solid var(--glass-border)',
                borderRadius: '0.5rem',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
            />
          </div>

          {/* Ícone */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Ícone
            </label>
            <div className="flex gap-2 flex-wrap">
              {GOAL_ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setGoalForm({ ...goalForm, icon })}
                  className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all"
                  style={{
                    background: goalForm.icon === icon ? 'var(--primary)20' : 'var(--glass-bg)',
                    border:     goalForm.icon === icon
                      ? '2px solid var(--primary)'
                      : '1px solid var(--glass-border)',
                    transform:  goalForm.icon === icon ? 'scale(1.1)' : 'scale(1)',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Cor */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Cor
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setGoalForm({ ...goalForm, color })}
                  className="w-7 h-7 rounded-full transition-all"
                  style={{
                    backgroundColor: color,
                    outline:         goalForm.color === color ? `3px solid ${color}` : 'none',
                    outlineOffset:   '2px',
                    boxShadow:       goalForm.color === color ? `0 0 8px ${color}60` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Valor meta + Data alvo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                Valor meta{' '}
                <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>opcional</span>
              </label>
              <input
                type="number"
                value={goalForm.target_amount}
                onChange={e => setGoalForm({ ...goalForm, target_amount: e.target.value })}
                placeholder="0,00"
                min="0"
                step="0.01"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{
                  background:   'var(--glass-bg)',
                  color:        'var(--text-primary)',
                  border:       '1px solid var(--glass-border)',
                  borderRadius: '0.5rem',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
              />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                Data alvo{' '}
                <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>opcional</span>
              </label>
              <input
                type="date"
                value={goalForm.target_date}
                onChange={e => setGoalForm({ ...goalForm, target_date: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{
                  background:   'var(--glass-bg)',
                  color:        'var(--text-primary)',
                  border:       '1px solid var(--glass-border)',
                  borderRadius: '0.5rem',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
              />
            </div>
          </div>

          {/* Prévia */}
          <div
            className="rounded-lg p-3 flex items-center gap-3"
            style={{
              background:   'var(--glass-bg)',
              border:       '1px solid var(--glass-border)',
              borderRadius: '0.5rem',
            }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{
                backgroundColor: goalForm.color + '22',
                border:          `2px solid ${goalForm.color}55`,
              }}
            >
              {goalForm.icon}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {goalForm.name || 'Prévia do objetivo'}
              </p>
              {goalForm.target_amount && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Meta:{' '}
                  {parseFloat(goalForm.target_amount).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                  {goalForm.target_date
                    ? ` · ${new Date(goalForm.target_date + 'T12:00:00').toLocaleDateString('pt-BR')}`
                    : ''}
                </p>
              )}
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
      )}
    </AppModal>
  )
}
