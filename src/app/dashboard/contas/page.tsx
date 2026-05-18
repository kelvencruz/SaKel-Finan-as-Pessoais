'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'
import { Account, AccountType } from '@/types'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Bank, PiggyBank, Wallet, TrendUp, Folder, Plus, CheckCircle, XCircle } from '@phosphor-icons/react'

const ACCOUNT_TYPES: { value: AccountType; label: string; Icon: React.ElementType }[] = [
  { value: 'checking',   label: 'Conta Corrente', Icon: Bank },
  { value: 'savings',    label: 'Poupança',        Icon: PiggyBank },
  { value: 'cash',       label: 'Dinheiro',        Icon: Wallet },
  { value: 'investment', label: 'Investimentos', Icon: TrendUp },
  { value: 'other',      label: 'Outro',           Icon: Folder },
]

const COLORS = [
  '#6366f1','#3b82f6','#22c55e','#f97316',
  '#ef4444','#ec4899','#14b8a6','#f59e0b',
  '#8b5cf6','#6b7280',
]

const emptyForm = {
  name: '',
  type: 'checking' as AccountType,
  initial_balance: '',
  color: '#6366f1',
  icon: '',
  is_active: true,
}

type Toast = { message: string; type: 'success' | 'error' }
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ContasPage() {
  const supabase = createClient()

  const [accounts,   setAccounts]   = useState<Account[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState(emptyForm)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast,      setToast]      = useState<Toast | null>(null)

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAccounts() {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .neq('type', 'credit')
      .order('created_at')
    setAccounts(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAccounts() }, [])

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
        .update({ name: form.name.trim(), type: form.type, color: form.color, icon: form.icon || null, is_active: form.is_active })
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
      showToast('Conta criada!')
    }

    await loadAccounts()
    setShowModal(false)
    setSaving(false)
  }

  async function handleDelete(account: Account) {
    if (!confirm(`Excluir a conta "${account.name}"?`)) return
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id)
    if (count && count > 0) {
      alert(`Não é possível excluir "${account.name}" pois ela possui ${count} transação(ões) vinculada(s).`)
      return
    }
    setDeletingId(account.id)
    const { error: err } = await supabase.from('accounts').delete().eq('id', account.id)
    if (err) showToast('Erro ao excluir conta.', 'error')
    else showToast('Conta excluída.')
    await loadAccounts()
    setDeletingId(null)
  }

  async function toggleActive(account: Account) {
    await supabase.from('accounts').update({ is_active: !account.is_active }).eq('id', account.id)
    showToast(account.is_active ? 'Conta desativada.' : 'Conta reativada.')
    await loadAccounts()
  }

  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0)
  const activeCount  = accounts.filter(a => a.is_active).length
  const typeInfo     = (type: AccountType) => ACCOUNT_TYPES.find(t => t.value === type) ?? { label: type, Icon: Folder }

  return (
    <PageContainer>
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
        title="Contas Financeiras"
        description="Gerencie suas contas bancárias e carteiras"
        action={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-lg">
            <Plus weight="bold" size={16} />
            Nova Conta
          </button>
        }
      />

      {/* Banner cartões */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
        <p className="text-sm text-purple-700">Cartões de crédito são gerenciados separadamente.</p>
        <a href="/dashboard/cartoes" className="text-xs font-medium text-purple-600 hover:underline">
          Ir para Cartões →
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--bg-surface)] border border-white/5 rounded-xl p-5 sm:col-span-2">
          <p className="text-sm text-[var(--text-secondary)]">Saldo total</p>
          <p className={`text-3xl font-bold mt-1 ${totalBalance >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {fmt(totalBalance)}
          </p>
        </div>
        <div className="bg-[var(--bg-surface)] border border-white/5 rounded-xl p-5">
          <p className="text-sm text-[var(--text-secondary)]">Contas ativas</p>
          <p className="text-3xl font-bold mt-1 text-[var(--text-primary)]">{activeCount}</p>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-[var(--text-secondary)] text-sm">Carregando...</p>
      ) : accounts.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-dashed border-white/10 rounded-xl p-10 text-center">
          <p className="text-[var(--text-secondary)] text-sm">Nenhuma conta cadastrada ainda.</p>
          <button onClick={openCreate} className="mt-3 text-[var(--accent-primary)] text-sm hover:underline">
            Criar primeira conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map(account => {
            const info = typeInfo(account.type)
            return (
              <div key={account.id}
                className={`bg-[var(--bg-surface)] border rounded-xl p-5 flex items-start justify-between transition-opacity ${
                  account.is_active ? 'border-white/5' : 'border-white/5 opacity-60'
                }`}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                    style={{ backgroundColor: account.color }}>
                    {account.icon ? account.icon : account.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[var(--text-primary)]">{account.name}</p>
                      {!account.is_active && (
                        <span className="text-[10px] bg-white/10 text-[var(--text-secondary)] px-1.5 py-0.5 rounded-full">
                          inativa
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                      <info.Icon weight="duotone" size={12} />
                      {info.label}
                    </p>
                    <p className={`text-sm font-semibold mt-1 ${
                      Number(account.current_balance) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                    }`}>
                      {fmt(Number(account.current_balance))}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <button onClick={() => openEdit(account)}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] px-2 py-1 rounded hover:bg-white/5 transition-colors">
                    Editar
                  </button>
                  <button onClick={() => toggleActive(account)}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--warning)] px-2 py-1 rounded hover:bg-white/5 transition-colors">
                    {account.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button onClick={() => handleDelete(account)} disabled={deletingId === account.id}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--danger)] px-2 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50">
                    {deletingId === account.id ? '...' : 'Excluir'}
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
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-md p-6 shadow-xl border border-white/5" onClick={(e) => e.stopPropagation()}></div>
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-md p-6 shadow-xl border border-white/5">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5">
              {editingId ? 'Editar Conta' : 'Nova Conta'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Nome da conta</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Nubank, Bradesco..."
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Tipo</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as AccountType })}
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]">
                  {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Para cartões de crédito, use{' '}
                  <a href="/dashboard/cartoes" className="text-[var(--accent-primary)] hover:underline">Cartões</a>.
                </p>
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Ícone <span className="text-[var(--text-secondary)] opacity-60">(emoji opcional — category_icon)</span>
                </label>
                <input type="text" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}
                  placeholder="Ex: 💜 🏦 💰" maxLength={4}
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
              </div>
              {!editingId && (
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Saldo inicial (R$)</label>
                  <input type="number" value={form.initial_balance} onChange={e => setForm({ ...form, initial_balance: e.target.value })}
                    placeholder="0,00" min="0" step="0.01"
                    className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Saldo atual da conta no momento do cadastro.</p>
                </div>
              )}
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
              {editingId && (
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="is_active" checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4 accent-[var(--accent-primary)]" />
                  <label htmlFor="is_active" className="text-sm text-[var(--text-secondary)]">Conta ativa</label>
                </div>
              )}
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={(e) => e.stopPropagation()}
                className="flex-1 border border-white/10 text-[var(--text-secondary)] rounded-lg py-2 text-sm hover:bg-white/5 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 btn-primary rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-colors">
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar conta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}