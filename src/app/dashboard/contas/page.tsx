'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Account, AccountType } from '@/types'

const ACCOUNT_TYPES: { value: AccountType; label: string; emoji: string }[] = [
  { value: 'checking',   label: 'Conta Corrente', emoji: '🏦' },
  { value: 'savings',    label: 'Poupança',        emoji: '🐷' },
  { value: 'cash',       label: 'Dinheiro',        emoji: '💵' },
  { value: 'credit',     label: 'Cartão de Crédito', emoji: '💳' },
  { value: 'investment', label: 'Investimentos',   emoji: '📈' },
  { value: 'other',      label: 'Outro',           emoji: '🗂️' },
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

  // ── helpers ──────────────────────────────────────────────
  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAccounts() {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at')
    setAccounts(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAccounts() }, [])

  // ── modal ────────────────────────────────────────────────
  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setError(null)
    setShowModal(true)
  }

  function openEdit(account: Account) {
    setForm({
      name:            account.name,
      type:            account.type,
      initial_balance: String(account.initial_balance),
      color:           account.color,
      icon:            account.icon ?? '',
      is_active:       account.is_active,
    })
    setEditingId(account.id)
    setError(null)
    setShowModal(true)
  }

  // ── save ─────────────────────────────────────────────────
  async function handleSave() {
    setError(null)

    if (!form.name.trim()) {
      setError('Nome é obrigatório.')
      return
    }

    const initialBalance = parseFloat(String(form.initial_balance).replace(',', '.') || '0')
    if (isNaN(initialBalance)) {
      setError('Saldo inicial inválido.')
      return
    }
    if (!editingId && initialBalance < 0) {
      setError('Saldo inicial não pode ser negativo.')
      return
    }

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
      showToast('Conta atualizada com sucesso!')
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
      showToast('Conta criada com sucesso!')
    }

    await loadAccounts()
    setShowModal(false)
    setSaving(false)
  }

  // ── delete ───────────────────────────────────────────────
  async function handleDelete(account: Account) {
    const confirmed = confirm(
      `Excluir a conta "${account.name}"?\n\nAtenção: isso removerá a conta permanentemente.`
    )
    if (!confirmed) return

    // verifica se há transações vinculadas
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id)

    if (count && count > 0) {
      alert(
        `Não é possível excluir a conta "${account.name}" pois ela possui ${count} transação(ões) vinculada(s).\n\nExclua ou mova as transações antes de remover a conta.`
      )
      return
    }

    setDeletingId(account.id)
    const { error: err } = await supabase.from('accounts').delete().eq('id', account.id)

    if (err) {
      showToast('Erro ao excluir conta.', 'error')
    } else {
      showToast('Conta excluída.')
    }

    await loadAccounts()
    setDeletingId(null)
  }

  // ── toggle ativo ─────────────────────────────────────────
  async function toggleActive(account: Account) {
    await supabase
      .from('accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id)
    showToast(account.is_active ? 'Conta desativada.' : 'Conta reativada.')
    await loadAccounts()
  }

  // ── totais ───────────────────────────────────────────────
  const totalBalance  = accounts.reduce((s, a) => s + Number(a.current_balance), 0)
  const activeCount   = accounts.filter(a => a.is_active).length

  const typeInfo = (type: AccountType) =>
    ACCOUNT_TYPES.find(t => t.value === type) ?? { label: type, emoji: '🗂️' }

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</a>
          <h1 className="text-xl font-semibold mt-1">Contas Financeiras</h1>
        </div>
        <button
          onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + Nova Conta
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-xl p-5 sm:col-span-2">
          <p className="text-sm text-gray-500">Saldo total</p>
          <p className={`text-3xl font-bold mt-1 ${totalBalance >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
            {fmt(totalBalance)}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-sm text-gray-500">Contas ativas</p>
          <p className="text-3xl font-bold mt-1 text-gray-800">{activeCount}</p>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : accounts.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">Nenhuma conta cadastrada ainda.</p>
          <button onClick={openCreate} className="mt-3 text-indigo-600 text-sm hover:underline">
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
                className={`bg-white border rounded-xl p-5 flex items-start justify-between transition-opacity ${
                  account.is_active ? 'border-gray-100' : 'border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                    style={{ backgroundColor: account.color }}
                  >
                    {account.icon ? account.icon : account.name.charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-800">{account.name}</p>
                      {!account.is_active && (
                        <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">
                          inativa
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{info.emoji} {info.label}</p>
                    <p className={`text-sm font-semibold mt-1 ${
                      Number(account.current_balance) >= 0 ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {fmt(Number(account.current_balance))}
                    </p>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex flex-col gap-1 items-end">
                  <button
                    onClick={() => openEdit(account)}
                    className="text-xs text-gray-400 hover:text-indigo-600 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(account)}
                    className="text-xs text-gray-400 hover:text-amber-600 px-2 py-1 rounded hover:bg-amber-50 transition-colors"
                  >
                    {account.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => handleDelete(account)}
                    disabled={deletingId === account.id}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-5">
              {editingId ? 'Editar Conta' : 'Nova Conta'}
            </h2>

            <div className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nome da conta</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Nubank, Bradesco..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Tipo</label>
                <select
                  value={form.type}
                  onChange={e => setForm({ ...form, type: e.target.value as AccountType })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {ACCOUNT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                  ))}
                </select>
              </div>

              {/* Ícone */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Ícone <span className="text-gray-400">(emoji opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.icon}
                  onChange={e => setForm({ ...form, icon: e.target.value })}
                  placeholder="Ex: 💜 🏦 💰"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={4}
                />
              </div>

              {/* Saldo inicial — só na criação */}
              {!editingId && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Saldo inicial (R$)</label>
                  <input
                    type="number"
                    value={form.initial_balance}
                    onChange={e => setForm({ ...form, initial_balance: e.target.value })}
                    placeholder="0,00"
                    min="0"
                    step="0.01"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Informe o saldo atual da conta no momento do cadastro.</p>
                </div>
              )}

              {/* Cor */}
              <div>
                <label className="block text-sm text-gray-600 mb-2">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setForm({ ...form, color })}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: color,
                        outline: form.color === color ? `3px solid ${color}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Ativo (apenas edição) */}
              {editingId && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-600">
                    Conta ativa
                  </label>
                </div>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar conta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
