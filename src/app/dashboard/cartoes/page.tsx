'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { CreditCard, Plus } from '@phosphor-icons/react'

interface CreditCard {
  id: string
  user_id: string
  account_id: string | null
  name: string
  limit_amount: number
  closing_day: number
  due_day: number
  color: string
  icon: string
  is_active: boolean
  created_at: string
  account?: { name: string } | null
}

interface Account {
  id: string
  name: string
}

const COLORS = ['#6366f1','#3b82f6','#22c55e','#f97316','#ef4444','#ec4899','#14b8a6','#f59e0b','#8b5cf6','#1e293b']

const emptyForm = {
  name: '',
  limit_amount: '',
  closing_day: '1',
  due_day: '10',
  account_id: '',
  color: '#6366f1',
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function CartoesPage() {
  const supabase = createClient()
  const [cards,      setCards]      = useState<CreditCard[]>([])
  const [accounts,   setAccounts]   = useState<Account[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState(emptyForm)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadAll() {
    const [{ data: cardsData }, { data: accData }] = await Promise.all([
      supabase.from('credit_cards').select('*, account:accounts(name)').order('created_at'),
      supabase.from('accounts').select('id, name').order('name'),
    ])
    setCards(cardsData ?? [])
    setAccounts(accData ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function openCreate() {
    setForm(emptyForm); setEditingId(null); setError(null); setShowModal(true)
  }

  function openEdit(card: CreditCard) {
    setForm({
      name:          card.name,
      limit_amount:  String(card.limit_amount),
      closing_day:   String(card.closing_day),
      due_day:       String(card.due_day),
      account_id:    card.account_id ?? '',
      color:         card.color,
    })
    setEditingId(card.id); setError(null); setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim())                          { setError('Nome é obrigatório.'); return }
    if (!form.limit_amount || parseFloat(form.limit_amount) < 0) { setError('Limite inválido.'); return }
    const closing = parseInt(form.closing_day)
    const due     = parseInt(form.due_day)
    if (closing < 1 || closing > 31) { setError('Dia de fechamento inválido (1-31).'); return }
    if (due     < 1 || due     > 31) { setError('Dia de vencimento inválido (1-31).'); return }

    setSaving(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    const payload = {
      user_id:      user.id,
      name:         form.name.trim(),
      limit_amount: parseFloat(form.limit_amount),
      closing_day:  closing,
      due_day:      due,
      account_id:   form.account_id || null,
      color:        form.color,
    }

    if (editingId) {
      const { error } = await supabase.from('credit_cards').update(payload).eq('id', editingId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('credit_cards').insert(payload)
      if (error) { setError(error.message); setSaving(false); return }
    }

    await loadAll(); setShowModal(false); setSaving(false)
  }

  async function handleToggleActive(card: CreditCard) {
    await supabase.from('credit_cards').update({ is_active: !card.is_active }).eq('id', card.id)
    await loadAll()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await supabase.from('credit_cards').delete().eq('id', id)
    await loadAll()
    setDeletingId(null)
  }

  const activeCards   = cards.filter(c => c.is_active)
  const inactiveCards = cards.filter(c => !c.is_active)

  return (
    <PageContainer>
      <PageHeader
        title="Cartões de Crédito"
        description="Gerencie seus cartões e limites"
        action={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-lg">
            <Plus weight="bold" size={16} />
            Novo Cartão
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--bg-surface)] border border-white/5 rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Total de cartões</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{activeCards.length}</p>
        </div>
        <div className="bg-[var(--bg-surface)] border border-white/5 rounded-xl p-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Limite total</p>
          <p className="text-2xl font-bold text-[var(--accent-primary)]">
            {fmt(activeCards.reduce((s, c) => s + Number(c.limit_amount), 0))}
          </p>
        </div>
        <div className="bg-[var(--bg-surface)] border border-white/5 rounded-xl p-4 sm:block hidden">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Inativos</p>
          <p className="text-2xl font-bold text-[var(--text-secondary)]">{inactiveCards.length}</p>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-[var(--text-secondary)] text-sm">Carregando...</p>
      ) : cards.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-dashed border-white/10 rounded-xl p-10 text-center">
          <CreditCard weight="duotone" size={40} className="mx-auto mb-3 text-[var(--text-secondary)]" />
          <p className="text-[var(--text-secondary)] text-sm">Nenhum cartão cadastrado ainda.</p>
          <button onClick={openCreate} className="mt-3 text-[var(--accent-primary)] text-sm hover:underline">
            Adicionar primeiro cartão
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <div key={card.id}
              className={`bg-[var(--bg-surface)] border rounded-xl p-5 flex items-center gap-4 transition-opacity ${
                !card.is_active ? 'opacity-50 border-white/5' : 'border-white/5'
              }`}>
              {/* Visual do cartão */}
              <div className="w-14 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm"
                style={{ backgroundColor: card.color }}>
                <CreditCard weight="duotone" size={22} />
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-[var(--text-primary)]">{card.name}</p>
                  {!card.is_active && (
                    <span className="text-xs bg-white/10 text-[var(--text-secondary)] px-2 py-0.5 rounded-full">
                      Inativo
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-1">
                  <span className="text-xs text-[var(--text-secondary)]">
                    Limite: <span className="text-[var(--text-primary)] font-medium">{fmt(Number(card.limit_amount))}</span>
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    Fecha dia <span className="text-[var(--text-primary)] font-medium">{card.closing_day}</span>
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    Vence dia <span className="text-[var(--text-primary)] font-medium">{card.due_day}</span>
                  </span>
                  {card.account && (
                    <span className="text-xs text-[var(--text-secondary)]">
                      Conta: <span className="text-[var(--text-primary)] font-medium">{card.account.name}</span>
                    </span>
                  )}
                </div>
              </div>
              {/* Ações */}
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(card)}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] px-2 py-1 rounded hover:bg-white/5 transition-colors">
                  Editar
                </button>
                <button onClick={() => handleToggleActive(card)}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--warning)] px-2 py-1 rounded hover:bg-white/5 transition-colors">
                  {card.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => handleDelete(card.id)} disabled={deletingId === card.id}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--danger)] px-2 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-50">
                  {deletingId === card.id ? '...' : 'Excluir'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)' }} onClick={() => setShowModal(false)}>
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-md p-6 shadow-xl border border-white/5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5">
              {editingId ? 'Editar Cartão' : 'Novo Cartão'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Nome do cartão</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Nubank, Itaú Platinum..."
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Limite (R$)</label>
                <input type="number" value={form.limit_amount} onChange={e => setForm({ ...form, limit_amount: e.target.value })}
                  placeholder="0,00" step="0.01" min="0"
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Dia de fechamento</label>
                  <input type="number" value={form.closing_day} onChange={e => setForm({ ...form, closing_day: e.target.value })}
                    min="1" max="31"
                    className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Dia de vencimento</label>
                  <input type="number" value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })}
                    min="1" max="31"
                    className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                  Conta para pagamento <span className="opacity-60">(opcional)</span>
                </label>
                <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]">
                  <option value="">Nenhuma conta vinculada</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-2">Cor do cartão</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(color => (
                    <button key={color} onClick={() => setForm({ ...form, color })}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{ backgroundColor: color, outline: form.color === color ? `3px solid ${color}` : 'none', outlineOffset: '2px' }} />
                  ))}
                </div>
              </div>
              {/* Preview */}
              <div className="rounded-xl p-4 text-white text-sm font-medium flex items-center justify-between"
                style={{ backgroundColor: form.color }}>
                <span className="flex items-center gap-2">
                  <CreditCard weight="duotone" size={18} />
                  {form.name || 'Nome do cartão'}
                </span>
                <span>{form.limit_amount ? fmt(parseFloat(form.limit_amount)) : 'R$ 0,00'}</span>
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
                {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}