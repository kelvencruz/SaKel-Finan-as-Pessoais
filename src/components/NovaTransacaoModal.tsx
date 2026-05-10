'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type TxType = 'income' | 'expense' | 'transfer'

interface Account    { id: string; name: string; color: string; current_balance: number }
interface Category   { id: string; name: string; type: string; icon: string }
interface CreditCard { id: string; name: string; color: string; closing_day: number; due_day: number }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TYPE_LABELS: Record<TxType, string> = {
  income:   '↑ Receita',
  expense:  '↓ Despesa',
  transfer: '⇄ Transferência',
}

const emptyForm = {
  type: 'expense' as TxType,
  description: '',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  account_id: '',
  destination_account_id: '',
  category_id: '',
  notes: '',
  status: 'paid',
  use_credit_card: false,
  credit_card_id: '',
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

export default function NovaTransacaoModal({ open, onClose, onSaved }: Props) {
  const supabase = createClient()

  const [accounts,    setAccounts]    = useState<Account[]>([])
  const [categories,  setCategories]  = useState<Category[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [loaded,      setLoaded]      = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [form,        setForm]        = useState(emptyForm)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!open || loaded) return
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: acc }, { data: cat }, { data: cards }] = await Promise.all([
        supabase.from('accounts').select('id, name, color, current_balance').eq('user_id', user.id).order('name'),
        supabase.from('categories').select('id, name, type, icon').eq('user_id', user.id).order('name'),
        supabase.from('credit_cards').select('id, name, color, closing_day, due_day').eq('user_id', user.id).eq('is_active', true).order('name'),
      ])

      const accList = (acc ?? []) as Account[]
      setAccounts(accList)
      setCategories((cat ?? []) as Category[])
      setCreditCards((cards ?? []) as CreditCard[])
      setForm(f => ({ ...f, account_id: accList[0]?.id ?? '' }))
      setLoaded(true)
    }
    load()
  }, [open])

  useEffect(() => {
    if (open) {
      setForm(f => ({ ...emptyForm, account_id: accounts[0]?.id ?? '' }))
      setError(null)
    }
  }, [open])

  async function getOrCreateInvoice(cardId: string, date: string, userId: string): Promise<string | null> {
    const d = new Date(date + 'T12:00:00')
    const card = creditCards.find(c => c.id === cardId)
    if (!card) return null

    let month = d.getMonth() + 1
    let year  = d.getFullYear()
    if (d.getDate() > card.closing_day) {
      month = month === 12 ? 1 : month + 1
      year  = month === 1 ? year + 1 : year
    }

    const { data: existing } = await supabase
      .from('credit_card_invoices')
      .select('id')
      .eq('credit_card_id', cardId)
      .eq('month', month)
      .eq('year', year)
      .single()

    if (existing) return existing.id

    const dueMonth = month === 12 ? 1 : month + 1
    const dueYear  = month === 12 ? year + 1 : year
    const dueDate  = `${dueYear}-${String(dueMonth).padStart(2,'0')}-${String(card.due_day).padStart(2,'0')}`

    const { data: created } = await supabase
      .from('credit_card_invoices')
      .insert({ credit_card_id: cardId, user_id: userId, month, year, total_amount: 0, status: 'open', due_date: dueDate })
      .select('id')
      .single()

    return created?.id ?? null
  }

  async function handleSave() {
    setError(null)
    const amount = parseFloat(String(form.amount).replace(',', '.'))
    if (!form.description.trim())     { setError('Descrição é obrigatória.'); return }
    if (isNaN(amount) || amount <= 0) { setError('Valor deve ser maior que zero.'); return }

    if (form.use_credit_card && form.type === 'expense') {
      if (!form.credit_card_id) { setError('Selecione um cartão.'); return }
    } else {
      if (!form.account_id) { setError('Selecione uma conta.'); return }
      if (form.type === 'transfer' && !form.destination_account_id) { setError('Selecione a conta de destino.'); return }
      if (form.type === 'transfer' && form.account_id === form.destination_account_id) { setError('Contas devem ser diferentes.'); return }
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    let invoiceId: string | null = null
    let accountId = form.account_id || null

    if (form.use_credit_card && form.type === 'expense') {
      invoiceId = await getOrCreateInvoice(form.credit_card_id, form.date, user.id)
      accountId = null
    }

    const payload: any = {
      user_id:                user.id,
      type:                   form.type,
      description:            form.description.trim(),
      amount,
      date:                   form.date,
      account_id:             accountId,
      destination_account_id: form.type === 'transfer' ? form.destination_account_id : null,
      category_id:            form.category_id || null,
      notes:                  form.notes?.trim() || null,
      status:                 form.use_credit_card ? 'posted' : form.status,
      credit_card_id:         form.use_credit_card ? form.credit_card_id : null,
      invoice_id:             invoiceId,
    }

    const { error: err } = await supabase.from('transactions').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }

    if (invoiceId) {
      const { data } = await supabase.from('transactions').select('amount').eq('invoice_id', invoiceId)
      const total = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
      await supabase.from('credit_card_invoices').update({ total_amount: total }).eq('id', invoiceId)
    }

    setSaving(false)
    onSaved?.()
    onClose()
  }

  const catsFiltradas = categories.filter(c =>
    form.type !== 'transfer' && (c.type === form.type || c.type === 'both')
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-5">Nova Transação</h2>

        <div className="space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Tipo</label>
            <div className="flex gap-2">
              {(['expense', 'income', 'transfer'] as TxType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, type: t, category_id: '', use_credit_card: false })}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    form.type === t
                      ? t === 'income'   ? 'bg-green-100 text-green-700'
                      : t === 'expense'  ? 'bg-red-100 text-red-600'
                      : 'bg-indigo-100 text-indigo-700'
                      : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle cartão */}
          {form.type === 'expense' && creditCards.length > 0 && (
            <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">💳</span>
                <span className="text-sm text-purple-700 font-medium">Pagar com cartão de crédito</span>
              </div>
              <button
                onClick={() => setForm({ ...form, use_credit_card: !form.use_credit_card, credit_card_id: creditCards[0]?.id ?? '' })}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.use_credit_card ? 'bg-purple-500' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.use_credit_card ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Descrição</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder={form.type === 'income' ? 'Ex: Salário, Freelance…' : form.type === 'expense' ? 'Ex: Mercado, Aluguel…' : 'Ex: Para reserva…'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Valor (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Data</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Cartão ou Conta */}
          {form.use_credit_card && form.type === 'expense' ? (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Cartão</label>
              <select
                value={form.credit_card_id}
                onChange={e => setForm({ ...form, credit_card_id: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Selecione o cartão…</option>
                {creditCards.map(c => <option key={c.id} value={c.id}>💳 {c.name}</option>)}
              </select>
              <p className="text-xs text-purple-500 mt-1">A despesa será lançada na fatura do cartão.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="paid">✅ Pago</option>
                  <option value="pending">⏳ Pendente</option>
                  <option value="overdue">⚠️ Vencido</option>
                  <option value="cancelled">❌ Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {form.type === 'transfer' ? 'Conta de Origem' : 'Conta'}
                </label>
                <select
                  value={form.account_id}
                  onChange={e => setForm({ ...form, account_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Selecione…</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.current_balance)}</option>)}
                </select>
              </div>
              {form.type === 'transfer' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Conta de Destino</label>
                  <select
                    value={form.destination_account_id}
                    onChange={e => setForm({ ...form, destination_account_id: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Selecione…</option>
                    {accounts.filter(a => a.id !== form.account_id).map(a => (
                      <option key={a.id} value={a.id}>{a.name} — {fmt(a.current_balance)}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Categoria */}
          {form.type !== 'transfer' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Categoria <span className="text-gray-400">(opcional)</span>
              </label>
              <select
                value={form.category_id}
                onChange={e => setForm({ ...form, category_id: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Sem categoria</option>
                {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          )}

          {/* Observação */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Observação <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Notas adicionais…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              form.use_credit_card    ? 'bg-purple-600 hover:bg-purple-700' :
              form.type === 'income'  ? 'bg-green-600 hover:bg-green-700'  :
              form.type === 'expense' ? 'bg-red-500 hover:bg-red-600'      :
              'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}