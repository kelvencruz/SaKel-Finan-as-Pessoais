'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'
import { Account, AccountType } from '@/types'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { AppModal } from '@/components/AppModal'
import { AnimatedValue } from '@/components/ui/AnimatedValue'
import {
  Bank, PiggyBank, Wallet, TrendUp, Folder,
  Plus, CheckCircle, XCircle, Warning,
} from '@phosphor-icons/react'

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

const emptyForm = {
  name:            '',
  type:            'checking' as AccountType,
  initial_balance: '',
  color:           '#6366f1',
  icon:            '',
  is_active:       true,
}

type Toast        = { message: string; type: 'success' | 'error' }
type ConfirmState = { open: boolean; title: string; body: string; onConfirm: () => void }

const CONFIRM_CLOSED: ConfirmState = { open: false, title: '', body: '', onConfirm: () => {} }

export default function ContasPage() {
  const supabase = createClient()

  const [accounts,    setAccounts]    = useState<Account[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [form,        setForm]        = useState(emptyForm)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [toast,       setToast]       = useState<Toast | null>(null)
  const [confirm,     setConfirm]     = useState<ConfirmState>(CONFIRM_CLOSED)
  const [hoveredId,   setHoveredId]   = useState<string | null>(null)

  // ── helpers ──────────────────────────────────────────────────────────────

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function openConfirm(title: string, body: string, onConfirm: () => void) {
    setConfirm({ open: true, title, body, onConfirm })
  }

  // ── data ──────────────────────────────────────────────────────────────────

  async function loadAccounts() {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .neq('type', 'credit')
      .is('deleted_at', null)          // regra inviolável: nunca omitir
      .order('created_at')
    setAccounts(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAccounts() }, [])

  // ── modal criar/editar ────────────────────────────────────────────────────

  function openCreate() {
    setForm(emptyForm); setEditingId(null); setError(null); setShowModal(true)
  }

  function openEdit(account: Account) {
    setForm({
      name:            account.name,
      type:            account.type === 'credit' ? 'checking' : account.type,
      initial_balance: String(account.initial_balance),
      color:           account.color,
      icon:            account.icon ?? '',
      is_active:       account.is_active,
    })
    setEditingId(account.id); setError(null); setShowModal(true)
  }

  async function handleSave() {
    setError(null)
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    const initialBalance = parseFloat(String(form.initial_balance).replace(',', '.') || '0')
    if (isNaN(initialBalance))            { setError('Saldo inicial inválido.'); return }
    if (!editingId && initialBalance < 0) { setError('Saldo inicial não pode ser negativo.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    if (editingId) {
      const { error: err } = await supabase
        .from('accounts')
        .update({
          name:      form.name.trim(),
          type:      form.type,
          color:     form.color,
          icon:      form.icon || null,
          is_active: form.is_active,
        })
        .eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
      showToast('Conta atualizada!')
    } else {
      const { error: err } = await supabase.from('accounts').insert({
        user_id:         user.id,
        name:            form.name.trim(),
        type:            form.type,
        initial_balance: initialBalance,
        current_balance: initialBalance,
        color:           form.color,
        icon:            form.icon || null,
        is_active:       true,
      })
      if (err) { setError(err.message); setSaving(false); return }

      const isFirstAccount = accounts.filter(a => a.type !== 'credit').length === 0
      await awardXP(user.id, 'account_created', isFirstAccount ? 'first_account' : undefined)
        .catch(() => {})

      // dispatch canônico — controller / FAB listener escuta este evento
      window.dispatchEvent(new CustomEvent('sakel:conta-criada'))
      showToast('Conta criada!')
    }

    await loadAccounts()
    setShowModal(false)
    setSaving(false)
  }

  // ── soft delete ───────────────────────────────────────────────────────────

  async function handleDelete(account: Account) {
    // verifica vínculos antes de abrir o confirm
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id)
      .is('deleted_at', null)

    if (count && count > 0) {
      openConfirm(
        'Não é possível excluir',
        `"${account.name}" possui ${count} transação(ões) vinculada(s) e não pode ser excluída.`,
        () => setConfirm(CONFIRM_CLOSED),
      )
      return
    }

    openConfirm(
      'Excluir conta',
      `Tem certeza que deseja excluir "${account.name}"? Esta ação não poderá ser desfeita.`,
      async () => {
        setConfirm(CONFIRM_CLOSED)
        setDeletingId(account.id)
        // soft delete — NUNCA .delete()
        const { error: err } = await supabase
          .from('accounts')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', account.id)
        if (err) showToast('Erro ao excluir conta.', 'error')
        else showToast('Conta excluída.')
        await loadAccounts()
        setDeletingId(null)
      },
    )
  }

  async function toggleActive(account: Account) {
    await supabase
      .from('accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id)
    showToast(account.is_active ? 'Conta desativada.' : 'Conta reativada.')
    await loadAccounts()
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0)
  const activeCount  = accounts.filter(a => a.is_active).length
  const typeInfo     = (type: AccountType) =>
    ACCOUNT_TYPES.find(t => t.value === type) ?? { label: type, Icon: Folder }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <PageContainer>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle weight="duotone" size={16} />
            : <XCircle    weight="duotone" size={16} />}
          {toast.message}
        </div>
      )}

      {/* ── Header ── */}
      <PageHeader
        title="Contas Financeiras"
        description="Gerencie suas contas bancárias e carteiras"
        action={
          <div className="hidden md:flex">
            <button
              onClick={openCreate}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-lg"
            >
              <Plus weight="bold" size={16} />
              Nova Conta
            </button>
          </div>
        }
      />

      {/* ── Banner cartões ── */}
      <div
        className="rounded-xl px-4 py-3 mb-6 flex items-center justify-between"
        style={{
          background:   'var(--glass-bg)',
          border:       '1px solid var(--glass-border)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Cartões de crédito são gerenciados separadamente.
        </p>
        <a
          href="/dashboard/cartoes"
          className="text-xs font-medium hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          Ir para Cartões →
        </a>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">

        {/* Saldo total */}
        <div
          className="glass-card rounded-xl p-5 sm:col-span-2"
          style={{ border: '1px solid var(--glass-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Saldo total</p>
          <div className="mt-1">
            <AnimatedValue
              value={totalBalance}
              format="currency"
              group="financial"
              className={`text-3xl font-bold ${
                totalBalance >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
              }`}
            />
          </div>
        </div>

        {/* Contas ativas */}
        <div
          className="glass-card rounded-xl p-5"
          style={{ border: '1px solid var(--glass-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Contas ativas</p>
          <div className="mt-1">
            <AnimatedValue
              value={activeCount}
              format="number"
              group="financial"
              className="text-3xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* ── Lista ── */}
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
      ) : accounts.length === 0 ? (
        <div
          className="glass-card rounded-xl p-10 text-center"
          style={{ border: '1px dashed var(--glass-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nenhuma conta cadastrada ainda.
          </p>
          <button
            onClick={openCreate}
            className="mt-3 text-sm hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Criar primeira conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map(account => {
            const info     = typeInfo(account.type)
            const isHovered = hoveredId === account.id
            return (
              <div
                key={account.id}
                className={`glass-card rounded-xl p-5 flex items-start justify-between transition-all duration-200 ${
                  account.is_active ? '' : 'opacity-60'
                }`}
                style={{
                  border: `1px solid ${isHovered ? 'var(--glass-hover-border)' : 'var(--glass-border)'}`,
                }}
                onMouseEnter={() => setHoveredId(account.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* esquerda — avatar + info */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                    style={{ backgroundColor: account.color }}
                  >
                    {account.icon ? account.icon : account.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {account.name}
                      </p>
                      {!account.is_active && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{
                            background: 'var(--glass-bg)',
                            color:      'var(--text-secondary)',
                          }}
                        >
                          inativa
                        </span>
                      )}
                    </div>
                    <p
                      className="text-xs flex items-center gap-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <info.Icon weight="duotone" size={12} />
                      {info.label}
                    </p>
                    <div className="mt-1">
                      <AnimatedValue
                        value={Number(account.current_balance)}
                        format="currency"
                        group="financial"
                        className={`text-sm font-semibold ${
                          Number(account.current_balance) >= 0
                            ? 'text-[var(--success)]'
                            : 'text-[var(--danger)]'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* direita — ações */}
                <div className="flex flex-col gap-1 items-end">
                  <button
                    onClick={() => openEdit(account)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLElement).style.color  = 'var(--primary)'
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLElement).style.color  = 'var(--text-secondary)'
                      ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(account)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLElement).style.color  = 'var(--warning)'
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLElement).style.color  = 'var(--text-secondary)'
                      ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    {account.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => handleDelete(account)}
                    disabled={deletingId === account.id}
                    className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-50"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLElement).style.color  = 'var(--danger)'
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLElement).style.color  = 'var(--text-secondary)'
                      ;(e.currentTarget as HTMLElement).style.background = 'transparent'
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

      {/* ── Modal criar/editar conta ── */}
      <AppModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Editar Conta' : 'Nova Conta'}
        size="md"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setShowModal(false)}
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
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 btn-primary"
            >
              {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar conta'}
            </button>
          </AppModal.Footer>
        }
      >
        <div className="space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Nome da conta
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Nubank, Bradesco..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{
                background:  'var(--glass-bg)',
                color:       'var(--text-primary)',
                border:      '1px solid var(--glass-border)',
                outlineColor: 'var(--primary)',
              }}
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Tipo</label>
            <select
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as AccountType })}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{
                background:  'var(--glass-bg)',
                color:       'var(--text-primary)',
                border:      '1px solid var(--glass-border)',
                outlineColor: 'var(--primary)',
              }}
            >
              {ACCOUNT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Para cartões de crédito, use{' '}
              <a href="/dashboard/cartoes" style={{ color: 'var(--primary)' }} className="hover:underline">
                Cartões
              </a>.
            </p>
          </div>

          {/* Ícone */}
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Ícone <span style={{ opacity: 0.6 }}>(emoji opcional)</span>
            </label>
            <input
              type="text"
              value={form.icon}
              onChange={e => setForm({ ...form, icon: e.target.value })}
              placeholder="Ex: 💜 🏦 💰"
              maxLength={4}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{
                background:  'var(--glass-bg)',
                color:       'var(--text-primary)',
                border:      '1px solid var(--glass-border)',
                outlineColor: 'var(--primary)',
              }}
            />
          </div>

          {/* Saldo inicial (só no create) */}
          {!editingId && (
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                Saldo inicial (R$)
              </label>
              <input
                type="number"
                value={form.initial_balance}
                onChange={e => setForm({ ...form, initial_balance: e.target.value })}
                placeholder="0,00"
                min="0"
                step="0.01"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{
                  background:  'var(--glass-bg)',
                  color:       'var(--text-primary)',
                  border:      '1px solid var(--glass-border)',
                  outlineColor: 'var(--primary)',
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Saldo atual da conta no momento do cadastro.
              </p>
            </div>
          )}

          {/* Cor */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Cor</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setForm({ ...form, color })}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    outline:         form.color === color ? `3px solid ${color}` : 'none',
                    outlineOffset:   '2px',
                  }}
                />
              ))}
            </div>
          </div>

          {/* is_active (só no edit) */}
          {editingId && (
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
                className="w-4 h-4"
                style={{ accentColor: 'var(--primary)' }}
              />
              <label htmlFor="is_active" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Conta ativa
              </label>
            </div>
          )}

          {/* erro inline */}
          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          )}
        </div>
      </AppModal>

      {/* ── Modal de confirmação canônico ── */}
      <AppModal
        open={confirm.open}
        onClose={() => setConfirm(CONFIRM_CLOSED)}
        title={confirm.title}
        size="sm"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setConfirm(CONFIRM_CLOSED)}
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
              onClick={confirm.onConfirm}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--danger)' }}
            >
              Confirmar
            </button>
          </AppModal.Footer>
        }
      >
        <div className="flex items-start gap-3 py-1">
          <Warning weight="duotone" size={20} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {confirm.body}
          </p>
        </div>
      </AppModal>

    </PageContainer>
  )
}
