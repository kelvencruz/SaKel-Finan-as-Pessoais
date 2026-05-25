'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { AppModal } from '@/components/AppModal'
import { AnimatedValue } from '@/components/ui/AnimatedValue'
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
      name:         card.name,
      limit_amount: String(card.limit_amount),
      closing_day:  String(card.closing_day),
      due_day:      String(card.due_day),
      account_id:   card.account_id ?? '',
      color:        card.color,
    })
    setEditingId(card.id); setError(null); setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim())                                        { setError('Nome é obrigatório.'); return }
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
  const totalLimit    = activeCards.reduce((s, c) => s + Number(c.limit_amount), 0)

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

        {/* Total de cartões */}
        <div
          className="relative rounded-xl p-4 border overflow-hidden"
          style={{
            background:           'var(--glass-bg)',
            backdropFilter:       'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            borderColor:          'var(--glass-border)',
          }}
        >
          <div
            className="absolute bottom-0 left-0 h-0.5 w-full rounded-b-xl"
            style={{ background: 'var(--primary)' }}
          />
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            Total de cartões
          </p>
          <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {activeCards.length}
          </p>
        </div>

        {/* Limite total */}
        <div
          className="relative rounded-xl p-4 border overflow-hidden"
          style={{
            background:           'var(--glass-bg)',
            backdropFilter:       'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            borderColor:          'var(--glass-border)',
          }}
        >
          <div
            className="absolute bottom-0 left-0 h-0.5 w-full rounded-b-xl"
            style={{ background: 'var(--chart-line-start)' }}
          />
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            Limite total
          </p>
          <AnimatedValue
            value={totalLimit}
            group="financial"
            className="text-2xl font-bold"
            style={{ color: 'var(--primary)' }}
          />
        </div>

        {/* Inativos */}
        <div
          className="relative rounded-xl p-4 border overflow-hidden sm:block hidden"
          style={{
            background:           'var(--glass-bg)',
            backdropFilter:       'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            borderColor:          'var(--glass-border)',
          }}
        >
          <div
            className="absolute bottom-0 left-0 h-0.5 w-full rounded-b-xl"
            style={{ background: 'var(--color-text-muted)' }}
          />
          <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
            Inativos
          </p>
          <p className="text-2xl font-bold" style={{ color: 'var(--color-text-muted)' }}>
            {inactiveCards.length}
          </p>
        </div>

      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Carregando...</p>
      ) : cards.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center border border-dashed"
          style={{ borderColor: 'var(--color-border)', background: 'var(--glass-bg)' }}
        >
          <CreditCard weight="duotone" size={40} className="mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Nenhum cartão cadastrado ainda.</p>
          <button
            onClick={openCreate}
            className="mt-3 text-sm hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Adicionar primeiro cartão
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <div
              key={card.id}
              className="rounded-xl p-5 flex items-center gap-4 border transition-opacity"
              style={{
                background:           'var(--glass-bg)',
                backdropFilter:       'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                borderColor:          'var(--glass-border)',
                opacity:              card.is_active ? 1 : 0.5,
              }}
            >
              <div
                className="w-14 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm"
                style={{ backgroundColor: card.color }}
              >
                <CreditCard weight="duotone" size={22} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {card.name}
                  </p>
                  {!card.is_active && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--color-surface-hover)',
                        color:      'var(--color-text-muted)',
                      }}
                    >
                      Inativo
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-1">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Limite:{' '}
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {fmt(Number(card.limit_amount))}
                    </span>
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Fecha dia{' '}
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {card.closing_day}
                    </span>
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Vence dia{' '}
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {card.due_day}
                    </span>
                  </span>
                  {card.account && (
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Conta:{' '}
                      <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
                        {card.account.name}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => openEdit(card)}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--primary)'
                    e.currentTarget.style.background = 'var(--color-surface-hover)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--color-text-muted)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  Editar
                </button>
                <button
                  onClick={() => handleToggleActive(card)}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--color-warning)'
                    e.currentTarget.style.background = 'var(--color-surface-hover)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--color-text-muted)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {card.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  onClick={() => handleDelete(card.id)}
                  disabled={deletingId === card.id}
                  className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-50"
                  style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--color-danger)'
                    e.currentTarget.style.background = 'var(--color-surface-hover)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--color-text-muted)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {deletingId === card.id ? '...' : 'Excluir'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      <AppModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Editar Cartão' : 'Novo Cartão'}
        size="md"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setShowModal(false)}
              className="flex-1 rounded-lg py-2 text-sm transition-colors hover:opacity-80"
              style={{
                border:     '1px solid var(--color-border)',
                color:      'var(--color-text-muted)',
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
              {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Adicionar'}
            </button>
          </AppModal.Footer>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Nome do cartão
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Nubank, Itaú Platinum..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              style={{
                background: 'var(--color-bg)',
                color:      'var(--color-text-primary)',
                border:     '1px solid var(--color-border)',
              }}
            />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Limite (R$)
            </label>
            <input
              type="number"
              value={form.limit_amount}
              onChange={e => setForm({ ...form, limit_amount: e.target.value })}
              placeholder="0,00"
              step="0.01"
              min="0"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              style={{
                background: 'var(--color-bg)',
                color:      'var(--color-text-primary)',
                border:     '1px solid var(--color-border)',
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Dia de fechamento
              </label>
              <input
                type="number"
                value={form.closing_day}
                onChange={e => setForm({ ...form, closing_day: e.target.value })}
                min="1"
                max="31"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{
                  background: 'var(--color-bg)',
                  color:      'var(--color-text-primary)',
                  border:     '1px solid var(--color-border)',
                }}
              />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Dia de vencimento
              </label>
              <input
                type="number"
                value={form.due_day}
                onChange={e => setForm({ ...form, due_day: e.target.value })}
                min="1"
                max="31"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{
                  background: 'var(--color-bg)',
                  color:      'var(--color-text-primary)',
                  border:     '1px solid var(--color-border)',
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Conta para pagamento <span style={{ opacity: 0.6 }}>(opcional)</span>
            </label>
            <select
              value={form.account_id}
              onChange={e => setForm({ ...form, account_id: e.target.value })}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              style={{
                background: 'var(--color-bg)',
                color:      'var(--color-text-primary)',
                border:     '1px solid var(--color-border)',
              }}
            >
              <option value="">Nenhuma conta vinculada</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Cor do cartão
            </label>
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

          {/* Preview */}
          <div
            className="rounded-xl p-4 text-white text-sm font-medium flex items-center justify-between"
            style={{ backgroundColor: form.color }}
          >
            <span className="flex items-center gap-2">
              <CreditCard weight="duotone" size={18} />
              {form.name || 'Nome do cartão'}
            </span>
            <span>{form.limit_amount ? fmt(parseFloat(form.limit_amount)) : 'R$ 0,00'}</span>
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}
        </div>
      </AppModal>
    </PageContainer>
  )
}