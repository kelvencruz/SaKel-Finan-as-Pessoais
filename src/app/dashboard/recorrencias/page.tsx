'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'

type TxType    = 'income' | 'expense'
type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface Recorrencia {
  id: string
  user_id: string
  type: TxType
  description: string
  amount: number
  category_id: string | null
  account_id: string | null
  credit_card_id: string | null
  frequency: Frequency
  start_date: string
  end_date: string | null
  next_due_date: string
  is_active: boolean
  created_at: string
  // joins em memória
  account_name?: string
  category_name?: string
  category_icon?: string
  credit_card_name?: string
}

interface Account    { id: string; name: string; current_balance: number }
interface Category   { id: string; name: string; type: string; icon: string }
interface CreditCard { id: string; name: string; closing_day: number; due_day: number }

type Toast = { message: string; type: 'success' | 'error' }

const fmt     = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')

const FREQ_LABELS: Record<Frequency, string> = {
  daily:   'Diária',
  weekly:  'Semanal',
  monthly: 'Mensal',
  yearly:  'Anual',
}

const FREQ_ICONS: Record<Frequency, string> = {
  daily:   '📅',
  weekly:  '📅',
  monthly: '🔁',
  yearly:  '🗓️',
}

function nextDueDate(startDate: string, frequency: Frequency): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(startDate + 'T12:00:00')
  while (d < today) {
    switch (frequency) {
      case 'daily':   d.setDate(d.getDate() + 1); break
      case 'weekly':  d.setDate(d.getDate() + 7); break
      case 'monthly': d.setMonth(d.getMonth() + 1); break
      case 'yearly':  d.setFullYear(d.getFullYear() + 1); break
    }
  }
  return d.toISOString().split('T')[0]
}

const emptyForm = {
  type:            'expense' as TxType,
  description:     '',
  amount:          '',
  category_id:     '',
  account_id:      '',
  credit_card_id:  '',
  use_credit_card: false,
  frequency:       'monthly' as Frequency,
  start_date:      new Date().toISOString().split('T')[0],
  end_date:        '',
}

export default function RecorrenciasPage() {
  const supabase = createClient()

  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])
  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [categories,   setCategories]   = useState<Category[]>([])
  const [creditCards,  setCreditCards]  = useState<CreditCard[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [toast,        setToast]        = useState<Toast | null>(null)
  const [showModal,    setShowModal]    = useState(false)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [form,         setForm]         = useState(emptyForm)
  const [error,        setError]        = useState<string | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }

    const [{ data: rec }, { data: acc }, { data: cat }, { data: cards }] = await Promise.all([
      supabase.from('recurrences').select('*').eq('user_id', user.id).order('next_due_date'),
      supabase.from('accounts').select('id, name, current_balance').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('id, name, type, icon').eq('user_id', user.id).order('name'),
      supabase.from('credit_cards').select('id, name, closing_day, due_day').eq('user_id', user.id).eq('is_active', true).order('name'),
    ])

    const accList  = (acc   ?? []) as Account[]
    const catList  = (cat   ?? []) as Category[]
    const cardList = (cards ?? []) as CreditCard[]
    const recList  = (rec   ?? []) as Recorrencia[]

    const accMap  = Object.fromEntries(accList.map(a => [a.id, a]))
    const catMap  = Object.fromEntries(catList.map(c => [c.id, c]))
    const cardMap = Object.fromEntries(cardList.map(c => [c.id, c]))

    setRecorrencias(recList.map(r => ({
      ...r,
      account_name:     r.account_id     ? accMap[r.account_id]?.name      : undefined,
      category_name:    r.category_id    ? catMap[r.category_id]?.name     : undefined,
      category_icon:    r.category_id    ? catMap[r.category_id]?.icon     : undefined,
      credit_card_name: r.credit_card_id ? cardMap[r.credit_card_id]?.name : undefined,
    })))
    setAccounts(accList)
    setCategories(catList)
    setCreditCards(cardList)
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function openCreate() {
    setForm({ ...emptyForm, account_id: accounts[0]?.id ?? '' })
    setEditingId(null)
    setError(null)
    setShowModal(true)
  }

  function openEdit(r: Recorrencia) {
    setForm({
      type:            r.type,
      description:     r.description,
      amount:          String(r.amount),
      category_id:     r.category_id ?? '',
      account_id:      r.account_id ?? '',
      credit_card_id:  r.credit_card_id ?? '',
      use_credit_card: !!r.credit_card_id,
      frequency:       r.frequency,
      start_date:      r.start_date,
      end_date:        r.end_date ?? '',
    })
    setEditingId(r.id)
    setError(null)
    setShowModal(true)
  }

  async function handleSave() {
    setError(null)
    const amount = parseFloat(String(form.amount).replace(',', '.'))
    if (!form.description.trim())      { setError('Descrição é obrigatória.'); return }
    if (isNaN(amount) || amount <= 0)  { setError('Valor deve ser maior que zero.'); return }
    if (!form.use_credit_card && !form.account_id)   { setError('Selecione uma conta.'); return }
    if (form.use_credit_card  && !form.credit_card_id) { setError('Selecione um cartão.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    const next = nextDueDate(form.start_date, form.frequency)

    const payload = {
      type:           form.type,
      description:    form.description.trim(),
      amount,
      category_id:    form.category_id    || null,
      account_id:     form.use_credit_card ? null : (form.account_id || null),
      credit_card_id: form.use_credit_card ? form.credit_card_id : null,
      frequency:      form.frequency,
      start_date:     form.start_date,
      end_date:       form.end_date || null,
      is_active:      true,
    }

    if (editingId) {
      const { error: err } = await supabase
        .from('recurrences').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
      showToast('Recorrência atualizada!')
    } else {
      const { error: err } = await supabase
        .from('recurrences').insert({ ...payload, user_id: user.id, next_due_date: next })
      if (err) { setError(err.message); setSaving(false); return }

      // Gamificação — silencioso se action não existir ainda
      await awardXP(user.id, 'transaction_created').catch(() => {})

      showToast('Recorrência criada!')
    }

    await loadAll()
    setShowModal(false)
    setSaving(false)
  }

  async function toggleActive(r: Recorrencia) {
    await supabase.from('recurrences').update({ is_active: !r.is_active }).eq('id', r.id)
    await loadAll()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta recorrência?')) return
    await supabase.from('recurrences').delete().eq('id', id)
    showToast('Recorrência excluída.')
    await loadAll()
  }

  // ─── Gera transação agora + fatura se for cartão ──────────────────────────
  async function generateNow(r: Recorrencia) {
    setGeneratingId(r.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGeneratingId(null); return }

    const today = new Date().toISOString().split('T')[0]
    let invoiceId: string | null = null

    // Se tiver cartão, cria/busca fatura correta
    if (r.credit_card_id) {
      const card = creditCards.find(c => c.id === r.credit_card_id)
      if (card) {
        const d = new Date(today + 'T12:00:00')
        let month = d.getMonth() + 1
        let year  = d.getFullYear()
        if (d.getDate() > card.closing_day) {
          month = month === 12 ? 1 : month + 1
          year  = month === 1  ? year + 1 : year
        }
        const { data: existing } = await supabase
          .from('credit_card_invoices').select('id')
          .eq('credit_card_id', r.credit_card_id).eq('month', month).eq('year', year).single()

        if (existing) {
          invoiceId = existing.id
        } else {
          const dueMonth = month === 12 ? 1 : month + 1
          const dueYear  = month === 12 ? year + 1 : year
          const dueDate  = `${dueYear}-${String(dueMonth).padStart(2,'0')}-${String(card.due_day).padStart(2,'0')}`
          const { data: created } = await supabase
            .from('credit_card_invoices')
            .insert({ credit_card_id: r.credit_card_id, user_id: user.id, month, year, total_amount: 0, status: 'open', due_date: dueDate })
            .select('id').single()
          invoiceId = created?.id ?? null
        }
      }
    }

    // Insere transação
    const { error: err } = await supabase.from('transactions').insert({
      user_id:        user.id,
      type:           r.type,
      description:    r.description,
      amount:         r.amount,
      date:           today,
      account_id:     r.credit_card_id ? null : r.account_id,
      credit_card_id: r.credit_card_id ?? null,
      invoice_id:     invoiceId,
      category_id:    r.category_id,
      status:         r.credit_card_id ? 'posted' : 'pending',
      is_recurring:   true,
    })

    if (err) { showToast('Erro ao gerar transação.', 'error'); setGeneratingId(null); return }

    // Recalcula total da fatura
    if (invoiceId) {
      const { data } = await supabase.from('transactions').select('amount').eq('invoice_id', invoiceId)
      const total = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
      await supabase.from('credit_card_invoices').update({ total_amount: total }).eq('id', invoiceId)
    }

    // Gamificação
    await awardXP(user.id, 'transaction_created').catch(() => {})

    // Avança next_due_date
    const next = nextDueDate(today, r.frequency)
    await supabase.from('recurrences').update({ next_due_date: next }).eq('id', r.id)

    showToast(r.credit_card_id ? 'Transação gerada e lançada na fatura!' : 'Transação gerada com sucesso!')
    await loadAll()
    setGeneratingId(null)
  }

  const catsFiltradas = categories.filter(c => c.type === form.type || c.type === 'both')
  const ativas   = recorrencias.filter(r => r.is_active)
  const inativas = recorrencias.filter(r => !r.is_active)

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto" style={{ background: 'var(--color-bg)' }}>

      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
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
          <a href="/dashboard" className="text-sm hover:underline" style={{ color: 'var(--color-text-muted)' }}>← Dashboard</a>
          <h1 className="text-xl font-semibold mt-1" style={{ color: 'var(--color-text-primary)' }}>Recorrências</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Gerencie salário, aluguel, assinaturas e contas fixas.
          </p>
        </div>
        <button onClick={openCreate}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--color-brand)' }}>
          + Nova Recorrência
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-20 rounded-xl animate-pulse"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
          ))}
        </div>
      ) : recorrencias.length === 0 ? (
        <div className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}>
          <p className="text-4xl mb-3">🔁</p>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            Nenhuma recorrência ainda
          </p>
          <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
            Cadastre salário, aluguel, assinaturas e o sistema gera as transações automaticamente.
          </p>
          <button onClick={openCreate}
            className="text-white px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--color-brand)' }}>
            Criar primeira recorrência
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {ativas.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'var(--color-text-muted)' }}>
                Ativas ({ativas.length})
              </p>
              <div className="space-y-2">
                {ativas.map(r => (
                  <RecorrenciaCard key={r.id} r={r}
                    onEdit={openEdit} onToggle={toggleActive}
                    onDelete={handleDelete} onGenerate={generateNow}
                    generatingId={generatingId} />
                ))}
              </div>
            </div>
          )}
          {inativas.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'var(--color-text-muted)' }}>
                Pausadas ({inativas.length})
              </p>
              <div className="space-y-2 opacity-60">
                {inativas.map(r => (
                  <RecorrenciaCard key={r.id} r={r}
                    onEdit={openEdit} onToggle={toggleActive}
                    onDelete={handleDelete} onGenerate={generateNow}
                    generatingId={generatingId} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--color-surface)' }}>
            <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--color-text-primary)' }}>
              {editingId ? 'Editar Recorrência' : 'Nova Recorrência'}
            </h2>

            <div className="space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>Tipo</label>
                <div className="flex gap-2">
                  {(['expense', 'income'] as TxType[]).map(t => (
                    <button key={t} onClick={() => setForm({ ...form, type: t, category_id: '' })}
                      className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors border"
                      style={{
                        background:  form.type === t ? (t === 'income' ? '#dcfce7' : '#fee2e2') : 'transparent',
                        color:       form.type === t ? (t === 'income' ? '#166534' : '#991b1b') : 'var(--color-text-muted)',
                        borderColor: form.type === t ? 'transparent' : 'var(--color-border)',
                      }}>
                      {t === 'income' ? '↑ Receita' : '↓ Despesa'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>Descrição</label>
                <input type="text" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder={form.type === 'income' ? 'Ex: Salário, Aluguel recebido...' : 'Ex: Aluguel, Netflix, Academia...'}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
              </div>

              {/* Valor */}
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>Valor (R$)</label>
                <input type="text" inputMode="decimal" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="0,00"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
              </div>

              {/* Frequência + Data início */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>Frequência</label>
                  <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value as Frequency })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
                    <option value="daily">Diária</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>Data início</label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
                </div>
              </div>

              {/* Data fim */}
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Data fim <span style={{ color: 'var(--color-text-muted)' }}>(opcional)</span>
                </label>
                <input type="date" value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }} />
              </div>

              {/* Toggle cartão */}
              {form.type === 'expense' && creditCards.length > 0 && (
                <div className="flex items-center justify-between rounded-lg px-3 py-2.5"
                  style={{ background: '#f5f3ff', border: '1px solid #e9d5ff' }}>
                  <div className="flex items-center gap-2">
                    <span>💳</span>
                    <span className="text-sm font-medium" style={{ color: '#6d28d9' }}>Pagar com cartão</span>
                  </div>
                  <button
                    onClick={() => setForm({ ...form, use_credit_card: !form.use_credit_card, credit_card_id: creditCards[0]?.id ?? '' })}
                    className="relative w-10 h-5 rounded-full transition-colors"
                    style={{ background: form.use_credit_card ? '#8b5cf6' : 'var(--color-border-md, #d1d5db)' }}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.use_credit_card ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}

              {/* Conta ou Cartão */}
              {form.use_credit_card && form.type === 'expense' ? (
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>Cartão</label>
                  <select value={form.credit_card_id} onChange={e => setForm({ ...form, credit_card_id: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
                    <option value="">Selecione...</option>
                    {creditCards.map(c => <option key={c.id} value={c.id}>💳 {c.name}</option>)}
                  </select>
                  <p className="text-xs mt-1" style={{ color: '#8b5cf6' }}>
                    Ao gerar, a transação será lançada na fatura do cartão automaticamente.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>Conta</label>
                  <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
                    <option value="">Selecione...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              {/* Categoria */}
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Categoria <span style={{ color: 'var(--color-text-muted)' }}>(opcional)</span>
                </label>
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
                  <option value="">Sem categoria</option>
                  {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg py-2 text-sm transition-colors"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: form.type === 'income' ? '#16a34a' : 'var(--color-brand)' }}>
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar recorrência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Card de recorrência ────────────────────────────────────────────────────────
function RecorrenciaCard({
  r, onEdit, onToggle, onDelete, onGenerate, generatingId
}: {
  r: Recorrencia
  onEdit: (r: Recorrencia) => void
  onToggle: (r: Recorrencia) => void
  onDelete: (id: string) => void
  onGenerate: (r: Recorrencia) => void
  generatingId: string | null
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const nextDate  = new Date(r.next_due_date + 'T12:00:00')
  const daysUntil = Math.round((nextDate.getTime() - today.getTime()) / 86400000)
  const isOverdue = daysUntil < 0
  const isDueSoon = daysUntil <= 3 && daysUntil >= 0

  return (
    <div className="rounded-xl px-4 py-3 flex items-center gap-4 group transition-colors"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>

      <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
        style={{ background: r.type === 'income' ? '#dcfce7' : '#fee2e2' }}>
        {r.category_icon ?? FREQ_ICONS[r.frequency]}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
            {r.description}
          </p>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)' }}>
            {FREQ_LABELS[r.frequency]}
          </span>
          {r.credit_card_id && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 shrink-0">
              💳 Cartão
            </span>
          )}
          {isOverdue && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 shrink-0">
              Atrasada
            </span>
          )}
          {isDueSoon && !isOverdue && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 shrink-0">
              Vence em {daysUntil}d
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
          {r.credit_card_name ? `💳 ${r.credit_card_name}` : (r.account_name ?? '—')}
          {r.category_name ? ` · ${r.category_name}` : ''}
          {' · Próxima: '}{fmtDate(r.next_due_date)}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-semibold"
          style={{ color: r.type === 'income' ? '#16a34a' : '#ef4444' }}>
          {r.type === 'income' ? '+' : '−'} {fmt(r.amount)}
        </p>
      </div>

      <div className="opacity-0 group-hover:opacity-100 transition-all flex gap-1 shrink-0">
        <button onClick={() => onGenerate(r)} disabled={generatingId === r.id}
          title="Gerar transação agora"
          className="text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-30"
          style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)' }}>
          {generatingId === r.id ? '...' : '▶'}
        </button>
        <button onClick={() => onToggle(r)} title={r.is_active ? 'Pausar' : 'Ativar'}
          className="text-xs px-2 py-1 rounded-lg transition-colors"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
          {r.is_active ? '⏸' : '▶'}
        </button>
        <button onClick={() => onEdit(r)} title="Editar"
          className="text-sm px-1.5 py-1 rounded transition-colors"
          style={{ color: 'var(--color-text-muted)' }}>✏️</button>
        <button onClick={() => onDelete(r.id)} title="Excluir"
          className="text-sm px-1.5 py-1 rounded transition-colors"
          style={{ color: 'var(--color-text-muted)' }}>🗑️</button>
      </div>
    </div>
  )
}
