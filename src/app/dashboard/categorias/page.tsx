'use client'

// src/app/dashboard/contas/page.tsx
//
// Etapa 12 — Migração visual Luminous completa
//
// MUDANÇAS (sessão 8):
//  - Modal de criação completamente removido — delegado ao NovaContaModal canônico via dispatch
//  - confirm() nativo removido — substituído por modal de confirmação AppModal (anti-padrão documentado)
//  - alert() nativo removido — substituído por toast de erro
//  - PageHeader action com wrapper hidden md:flex (BUG-016 definitivamente corrigido)
//  - Escuta sakel:conta-criada para reload automático
//  - Glass-card padrão Luminous nos KPI cards e lista
//  - AnimatedValue nos valores financeiros
//  - Tokens Luminous: var(--glass-bg), var(--glass-border), var(--primary), var(--text-primary/secondary)
//  - Removidos todos os tokens legados: --bg-surface, --color-*, border-white/5
//  - Hover: onMouseEnter/onMouseLeave com var(--glass-hover-border) — NUNCA hover:bg-white/5
//  - Skeleton loading nos KPI cards

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'
import { Account, AccountType } from '@/types'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { AppModal } from '@/components/AppModal'
import { AnimatedValue } from '@/components/AnimatedValue'
import { useActionHubStore } from '@/stores/useActionHubStore'
import {
  Bank, PiggyBank, Wallet, TrendUp, Folder,
  Plus, CheckCircle, XCircle, Warning,
} from '@phosphor-icons/react'

// ─── Tipos e constantes ──────────────────────────────────────────────────────

const ACCOUNT_TYPES: { value: AccountType; label: string; Icon: React.ElementType }[] = [
  { value: 'checking',   label: 'Conta Corrente', Icon: Bank },
  { value: 'savings',    label: 'Poupança',        Icon: PiggyBank },
  { value: 'cash',       label: 'Dinheiro',        Icon: Wallet },
  { value: 'investment', label: 'Investimentos',   Icon: TrendUp },
  { value: 'other',      label: 'Outro',            Icon: Folder },
]

const COLORS = [
  '#6366f1','#3b82f6','#22c55e','#f97316',
  '#ef4444','#ec4899','#14b8a6','#f59e0b',
  '#8b5cf6','#6b7280',
]

type Toast = { message: string; type: 'success' | 'error' }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── Glass card inline (padrão Luminous — sem componente global ainda) ───────
const glassStyle: React.CSSProperties = {
  background:           'var(--glass-bg)',
  backdropFilter:       'blur(var(--glass-blur))',
  WebkitBackdropFilter: 'blur(var(--glass-blur))',
  border:               '1px solid var(--glass-border)',
  borderRadius:         '0.75rem',
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function ContasPage() {
  const supabase = createClient()
  const dispatch = useActionHubStore(s => s.dispatch)

  const [accounts,   setAccounts]   = useState<Account[]>([])
  const [loading,    setLoading]    = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast,      setToast]      = useState<Toast | null>(null)

  // Modal de confirmação de exclusão (substitui confirm() nativo — anti-padrão)
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null)
  const [deleteBlocked, setDeleteBlocked] = useState<{ account: Account; count: number } | null>(null)

  // Modal de edição — permanece local pois é edição inline de dados existentes
  // (criação é 100% delegada ao NovaContaModal canônico via dispatch)
  const [editModal,  setEditModal]  = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editForm,   setEditForm]   = useState({
    name: '', type: 'checking' as AccountType,
    color: '#6366f1', icon: '', is_active: true,
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError,  setEditError]  = useState<string | null>(null)

  // ─── Toast ────────────────────────────────────────────────────────────────
  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── Load ─────────────────────────────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .neq('type', 'credit')
      .order('created_at')
    setAccounts(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  // ─── Escuta sakel:conta-criada (NovaContaModal canônico) ─────────────────
  useEffect(() => {
    function onContaCriada() { loadAccounts() }
    window.addEventListener('sakel:conta-criada', onContaCriada)
    return () => window.removeEventListener('sakel:conta-criada', onContaCriada)
  }, [loadAccounts])

  // ─── Edição ───────────────────────────────────────────────────────────────
  function openEdit(account: Account) {
    setEditForm({
      name:      account.name,
      type:      account.type === 'credit' ? 'checking' : account.type,
      color:     account.color,
      icon:      account.icon ?? '',
      is_active: account.is_active,
    })
    setEditingId(account.id)
    setEditError(null)
    setEditModal(true)
  }

  async function handleEditSave() {
    setEditError(null)
    if (!editForm.name.trim()) { setEditError('Nome é obrigatório.'); return }

    setEditSaving(true)
    const { error: err } = await supabase
      .from('accounts')
      .update({
        name:      editForm.name.trim(),
        type:      editForm.type,
        color:     editForm.color,
        icon:      editForm.icon || null,
        is_active: editForm.is_active,
      })
      .eq('id', editingId!)

    if (err) { setEditError(err.message); setEditSaving(false); return }

    showToast('Conta atualizada!')
    await loadAccounts()
    setEditModal(false)
    setEditSaving(false)
  }

  // ─── Ativar/Desativar ─────────────────────────────────────────────────────
  async function toggleActive(account: Account) {
    await supabase.from('accounts').update({ is_active: !account.is_active }).eq('id', account.id)
    showToast(account.is_active ? 'Conta desativada.' : 'Conta reativada.')
    await loadAccounts()
  }

  // ─── Exclusão (fluxo com modal — sem confirm() nativo) ───────────────────
  async function requestDelete(account: Account) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id)

    if (count && count > 0) {
      setDeleteBlocked({ account, count })
      return
    }
    setConfirmDelete(account)
  }

  async function confirmDeleteAccount() {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    setConfirmDelete(null)

    const { error: err } = await supabase.from('accounts').delete().eq('id', confirmDelete.id)
    if (err) showToast('Erro ao excluir conta.', 'error')
    else showToast('Conta excluída.')

    await loadAccounts()
    setDeletingId(null)
  }

  // ─── Derivados ────────────────────────────────────────────────────────────
  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0)
  const activeCount  = accounts.filter(a => a.is_active).length
  const typeInfo     = (type: AccountType) =>
    ACCOUNT_TYPES.find(t => t.value === type) ?? { label: type, Icon: Folder }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <PageContainer>

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2"
          style={glassStyle}
        >
          {toast.type === 'success'
            ? <CheckCircle weight="duotone" size={16} style={{ color: 'var(--success)' }} />
            : <XCircle weight="duotone" size={16} style={{ color: 'var(--danger)' }} />}
          <span style={{ color: 'var(--text-primary)' }}>{toast.message}</span>
        </div>
      )}

      {/* ── PageHeader — action com wrapper hidden md:flex (BUG-016 corrigido) ── */}
      <PageHeader
        title="Contas Financeiras"
        description="Gerencie suas contas bancárias e carteiras"
        action={
          <div className="hidden md:flex">
            <button
              onClick={() => dispatch('nova-conta')}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              <Plus weight="bold" size={16} />
              Nova Conta
            </button>
          </div>
        }
      />

      {/* ── Banner cartões — glass sutil ── */}
      <div
        className="mb-6 flex items-center justify-between px-4 py-3 rounded-xl"
        style={{
          background:   'rgba(var(--primary-rgb, 124,58,237),0.06)',
          border:       '1px solid rgba(var(--primary-rgb, 124,58,237),0.15)',
          borderRadius: '0.75rem',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Cartões de crédito são gerenciados separadamente.
        </p>
        <a
          href="/dashboard/cartoes"
          className="text-xs font-medium hover:underline ml-4 shrink-0"
          style={{ color: 'var(--primary)' }}
        >
          Ir para Cartões →
        </a>
      </div>

      {/* ── KPI Cards — glass + AnimatedValue ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">

        {/* Saldo total */}
        <div className="p-5 sm:col-span-2" style={glassStyle}>
          {loading ? (
            <>
              <div className="h-3.5 w-20 rounded mb-3"
                style={{ background: 'var(--glass-border)', animation: 'pulse 1.5s infinite' }} />
              <div className="h-8 w-40 rounded"
                style={{ background: 'var(--glass-border)', animation: 'pulse 1.5s infinite' }} />
            </>
          ) : (
            <>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Saldo total</p>
              <AnimatedValue
                value={totalBalance}
                format="currency"
                group="financial"
                className={`text-3xl font-bold ${totalBalance >= 0 ? '' : ''}`}
                style={{ color: totalBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}
              />
            </>
          )}
        </div>

        {/* Contas ativas */}
        <div className="p-5" style={glassStyle}>
          {loading ? (
            <>
              <div className="h-3.5 w-24 rounded mb-3"
                style={{ background: 'var(--glass-border)', animation: 'pulse 1.5s infinite' }} />
              <div className="h-8 w-12 rounded"
                style={{ background: 'var(--glass-border)', animation: 'pulse 1.5s infinite' }} />
            </>
          ) : (
            <>
              <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Contas ativas</p>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {activeCount}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Lista de contas ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-5" style={glassStyle}>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full shrink-0"
                  style={{ background: 'var(--glass-border)', animation: 'pulse 1.5s infinite' }} />
                <div className="space-y-2 flex-1">
                  <div className="h-3.5 w-32 rounded"
                    style={{ background: 'var(--glass-border)', animation: 'pulse 1.5s infinite' }} />
                  <div className="h-3 w-20 rounded"
                    style={{ background: 'var(--glass-border)', animation: 'pulse 1.5s infinite' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div
          className="p-10 text-center"
          style={{
            ...glassStyle,
            border: '1px dashed var(--glass-border)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nenhuma conta cadastrada ainda.
          </p>
          <button
            onClick={() => dispatch('nova-conta')}
            className="mt-3 text-sm hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Criar primeira conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map(account => {
            const info = typeInfo(account.type)
            return (
              <div
                key={account.id}
                className="p-5 flex items-start justify-between"
                style={{
                  ...glassStyle,
                  opacity: account.is_active ? 1 : 0.55,
                  transition: 'border-color 200ms, box-shadow 200ms, opacity 200ms',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-hover-border)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border)'
                }}
              >
                {/* Avatar + info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                    style={{ backgroundColor: account.color }}
                  >
                    {account.icon ? account.icon : account.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {account.name}
                      </p>
                      {!account.is_active && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            background: 'var(--glass-border)',
                            color:      'var(--text-secondary)',
                          }}
                        >
                          inativa
                        </span>
                      )}
                    </div>
                    <p
                      className="text-xs flex items-center gap-1 mt-0.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <info.Icon weight="duotone" size={12} />
                      {info.label}
                    </p>
                    <AnimatedValue
                      value={Number(account.current_balance)}
                      format="currency"
                      group="financial"
                      className="text-sm font-semibold mt-1"
                      style={{
                        color: Number(account.current_balance) >= 0
                          ? 'var(--success)'
                          : 'var(--danger)',
                      }}
                    />
                  </div>
                </div>

                {/* Ações */}
                <div className="flex flex-col gap-1 items-end shrink-0 ml-2">
                  <button
                    onClick={() => openEdit(account)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = 'var(--primary)'
                      e.currentTarget.style.background = 'rgba(var(--primary-rgb,124,58,237),0.08)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = 'var(--text-secondary)'
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(account)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = 'var(--warning)'
                      e.currentTarget.style.background = 'rgba(var(--primary-rgb,124,58,237),0.08)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = 'var(--text-secondary)'
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {account.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => requestDelete(account)}
                    disabled={deletingId === account.id}
                    className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-40"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = 'var(--danger)'
                      e.currentTarget.style.background = 'rgba(var(--primary-rgb,124,58,237),0.08)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = 'var(--text-secondary)'
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {deletingId === account.id ? '...' : 'Excluir'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Modal de confirmação de exclusão
          (substitui confirm() nativo — anti-padrão documentado)
      ══════════════════════════════════════════════════════════════════════ */}
      <AppModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Excluir conta"
        size="sm"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setConfirmDelete(null)}
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
              onClick={confirmDeleteAccount}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--danger)' }}
            >
              Excluir
            </button>
          </AppModal.Footer>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Tem certeza que deseja excluir a conta{' '}
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            "{confirmDelete?.name}"
          </span>
          ? Esta ação não pode ser desfeita.
        </p>
      </AppModal>

      {/* ══════════════════════════════════════════════════════════════════════
          Modal de exclusão bloqueada (conta com transações)
          (substitui alert() nativo)
      ══════════════════════════════════════════════════════════════════════ */}
      <AppModal
        open={!!deleteBlocked}
        onClose={() => setDeleteBlocked(null)}
        title="Não é possível excluir"
        size="sm"
        footer={
          <AppModal.Footer align="end">
            <button
              onClick={() => setDeleteBlocked(null)}
              className="rounded-lg px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              Entendi
            </button>
          </AppModal.Footer>
        }
      >
        <div className="flex items-start gap-3">
          <Warning weight="duotone" size={20} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            A conta{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              "{deleteBlocked?.account.name}"
            </span>{' '}
            possui{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {deleteBlocked?.count} transação(ões)
            </span>{' '}
            vinculada(s) e não pode ser excluída.
          </p>
        </div>
      </AppModal>

      {/* ══════════════════════════════════════════════════════════════════════
          Modal de edição — permanece local (edição de dados existentes)
          Criação delegada ao NovaContaModal canônico via dispatch('nova-conta')
      ══════════════════════════════════════════════════════════════════════ */}
      <AppModal
        open={editModal}
        onClose={() => setEditModal(false)}
        title="Editar Conta"
        size="md"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setEditModal(false)}
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
              onClick={handleEditSave}
              disabled={editSaving}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              {editSaving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </AppModal.Footer>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Nome da conta
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Ex: Nubank, Bradesco..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background:  'var(--glass-bg)',
                color:       'var(--text-primary)',
                border:      '1px solid var(--glass-border)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
            />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Tipo
            </label>
            <select
              value={editForm.type}
              onChange={e => setEditForm({ ...editForm, type: e.target.value as AccountType })}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background:  'var(--glass-bg)',
                color:       'var(--text-primary)',
                border:      '1px solid var(--glass-border)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
            >
              {ACCOUNT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Ícone <span style={{ opacity: 0.5 }}>(emoji opcional)</span>
            </label>
            <input
              type="text"
              value={editForm.icon}
              onChange={e => setEditForm({ ...editForm, icon: e.target.value })}
              placeholder="Ex: 💜 🏦 💰"
              maxLength={4}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background:  'var(--glass-bg)',
                color:       'var(--text-primary)',
                border:      '1px solid var(--glass-border)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)' }}
            />
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Cor
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setEditForm({ ...editForm, color })}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    outline:         editForm.color === color ? `3px solid ${color}` : 'none',
                    outlineOffset:   '2px',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_active_edit"
              checked={editForm.is_active}
              onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
              className="w-4 h-4"
              style={{ accentColor: 'var(--primary)' }}
            />
            <label
              htmlFor="is_active_edit"
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              Conta ativa
            </label>
          </div>

          {editError && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{editError}</p>
          )}
        </div>
      </AppModal>

    </PageContainer>
  )
}
