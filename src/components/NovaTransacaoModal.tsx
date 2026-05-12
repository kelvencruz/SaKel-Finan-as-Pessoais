'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'

type TxType = 'income' | 'expense' | 'transfer'
type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface Account    { id: string; name: string; color: string; current_balance: number }
interface Category   { id: string; name: string; type: string; icon: string }
interface CreditCard { id: string; name: string; color: string; closing_day: number; due_day: number }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TYPE_LABELS: Record<TxType, string> = {
  income:   '↑ Receita',
  expense:  '↓ Despesa',
  transfer: '⇄ Transferência',
}

const FREQ_LABELS: Record<Frequency, string> = {
  daily:   'Diária',
  weekly:  'Semanal',
  monthly: 'Mensal',
  yearly:  'Anual',
}

const emptyForm = {
  type:                   'expense' as TxType,
  description:            '',
  amount:                 '',
  date:                   new Date().toISOString().split('T')[0],
  account_id:             '',
  destination_account_id: '',
  category_id:            '',
  notes:                  '',
  status:                 'paid',
  use_credit_card:        false,
  credit_card_id:         '',
  is_recurring:           false,
  recurrence_frequency:   'monthly' as Frequency,
  recurrence_end_date:    '',
  is_installment:         false,
  installment_count:      2,
  installment_first_date: new Date().toISOString().split('T')[0],
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

// ─── Toast de XP ─────────────────────────────────────────────────────────
function XPToast({ xp, badge, onDone }: { xp: number; badge?: string | null; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-1 animate-bounce-in">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-semibold">
        <span>⚡</span> +{xp} XP ganhos!
      </div>
      {badge && (
        <div className="bg-yellow-400 text-yellow-900 px-4 py-1.5 rounded-xl shadow text-xs font-semibold">
          🏅 Nova conquista desbloqueada!
        </div>
      )}
    </div>
  )
}

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors ${active ? 'bg-indigo-500' : 'bg-gray-200'}`}>
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
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
  const [xpToast,     setXpToast]     = useState<{ xp: number; badge?: string | null } | null>(null)
  const [gamEnabled,  setGamEnabled]  = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: acc }, { data: cat }, { data: cards }, { data: prefs }] = await Promise.all([
        supabase.from('accounts').select('id, name, color, current_balance').eq('user_id', user.id).order('name'),
        supabase.from('categories').select('id, name, type, icon').eq('user_id', user.id).order('name'),
        supabase.from('credit_cards').select('id, name, color, closing_day, due_day').eq('user_id', user.id).eq('is_active', true).order('name'),
        supabase.from('user_preferences').select('gamification_enabled').eq('user_id', user.id).single(),
      ])
      const accList = (acc ?? []) as Account[]
      setAccounts(accList)
      setCategories((cat ?? []) as Category[])
      setCreditCards((cards ?? []) as CreditCard[])
      setGamEnabled(prefs?.gamification_enabled ?? false)
      setForm(f => ({ ...f, account_id: accList[0]?.id ?? '' }))
      setLoaded(true)
    }
    load()
  }, [open])

  useEffect(() => {
    if (open) { setForm(f => ({ ...emptyForm, account_id: accounts[0]?.id ?? '' })); setError(null) }
  }, [open])

  const amount = parseFloat(String(form.amount).replace(',', '.')) || 0
  const valorParcela = form.is_installment && form.installment_count > 1
    ? amount / form.installment_count : amount

  async function getOrCreateInvoice(cardId: string, date: string, userId: string): Promise<string | null> {
    const d    = new Date(date + 'T12:00:00')
    const card = creditCards.find(c => c.id === cardId)
    if (!card) return null
    let month = d.getMonth() + 1
    let year  = d.getFullYear()
    if (d.getDate() > card.closing_day) {
      month = month === 12 ? 1 : month + 1
      year  = month === 1  ? year + 1 : year
    }
    const { data: existing } = await supabase
      .from('credit_card_invoices').select('id')
      .eq('credit_card_id', cardId).eq('month', month).eq('year', year).single()
    if (existing) return existing.id

    const dueMonth = month === 12 ? 1 : month + 1
    const dueYear  = month === 12 ? year + 1 : year
    const dueDate  = `${dueYear}-${String(dueMonth).padStart(2,'0')}-${String(card.due_day).padStart(2,'0')}`
    const { data: created } = await supabase
      .from('credit_card_invoices')
      .insert({ credit_card_id: cardId, user_id: userId, month, year, total_amount: 0, status: 'open', due_date: dueDate })
      .select('id').single()
    return created?.id ?? null
  }

  function getInstallmentDates(): string[] {
    const dates: string[] = []
    const base = new Date(form.installment_first_date + 'T12:00:00')
    for (let i = 0; i < form.installment_count; i++) {
      const d = new Date(base); d.setMonth(d.getMonth() + i)
      dates.push(d.toISOString().split('T')[0])
    }
    return dates
  }

  // ─── Lógica de XP pós-save ───────────────────────────────────────────────
  async function handleXP(userId: string, hasCategory: boolean, isFirstTx: boolean, isRecurring: boolean) {
    if (!gamEnabled) return

    let totalXP = 0
    let badgeEarned: string | null = null

    // XP por criar transação
    const r1 = await awardXP(userId, 'transaction_created', isFirstTx ? 'first_transaction' : undefined)
    totalXP += 10
    if (r1.newBadge) badgeEarned = r1.newBadge

    // XP por categorizar
    if (hasCategory) {
      await awardXP(userId, 'transaction_categorized')
      totalXP += 5
    }

    // XP por recorrência
    if (isRecurring) {
      const r2 = await awardXP(userId, 'first_recurring', 'first_recurring')
      totalXP += 20
      if (r2.newBadge && !badgeEarned) badgeEarned = r2.newBadge
    }

    // Verifica se é 10ª ou 50ª transação
    const { count } = await supabase
      .from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    if (count === 10) {
      const r3 = await awardXP(userId, 'transaction_created', 'ten_transactions')
      if (r3.newBadge && !badgeEarned) badgeEarned = r3.newBadge
    }
    if (count === 50) {
      const r4 = await awardXP(userId, 'transaction_created', 'fifty_transactions')
      if (r4.newBadge && !badgeEarned) badgeEarned = r4.newBadge
    }

    setXpToast({ xp: totalXP, badge: badgeEarned })
  }

  async function handleSave() {
    setError(null)
    if (!form.description.trim())     { setError('Descrição é obrigatória.'); return }
    if (isNaN(amount) || amount <= 0) { setError('Valor deve ser maior que zero.'); return }
    if (form.is_recurring && form.is_installment) {
      setError('Uma transação não pode ser recorrente e parcelada ao mesmo tempo.'); return
    }
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

    // Verifica se é primeira transação
    const { count: txCount } = await supabase
      .from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    const isFirstTx = (txCount ?? 0) === 0

    // ─── RECORRENTE ───────────────────────────────────────────────────
    if (form.is_recurring) {
      const recPayload = {
        user_id: user.id, type: form.type, description: form.description.trim(),
        amount, frequency: form.recurrence_frequency, next_date: form.date,
        start_date: form.date, end_date: form.recurrence_end_date || null,
        account_id: form.account_id || null, category_id: form.category_id || null,
        notes: form.notes?.trim() || null,
      }
      const { error: recErr } = await supabase.from('recurrences').insert(recPayload)
      if (recErr) { setError(recErr.message); setSaving(false); return }

      await supabase.from('transactions').insert({
        user_id: user.id, type: form.type, description: form.description.trim(),
        amount, date: form.date, account_id: form.account_id || null,
        category_id: form.category_id || null, notes: form.notes?.trim() || null,
        status: form.status, is_recurring: true,
      })

      await handleXP(user.id, !!form.category_id, isFirstTx, true)
      setSaving(false); onSaved?.(); onClose(); return
    }

    // ─── PARCELADO ────────────────────────────────────────────────────
    if (form.is_installment) {
      const dates = getInstallmentDates()
      const { data: group, error: groupErr } = await supabase
        .from('installment_groups')
        .insert({ user_id: user.id, description: form.description.trim(), total_amount: amount,
          count: form.installment_count, category_id: form.category_id || null,
          account_id: form.account_id || null, notes: form.notes?.trim() || null })
        .select('id').single()

      if (groupErr || !group) { setError(groupErr?.message ?? 'Erro ao criar parcelamento.'); setSaving(false); return }

      for (let i = 0; i < dates.length; i++) {
        let invoiceId: string | null = null
        let accountId = form.account_id || null
        if (form.use_credit_card && form.type === 'expense') {
          invoiceId = await getOrCreateInvoice(form.credit_card_id, dates[i], user.id)
          accountId = null
        }
        const txPayload = {
          user_id: user.id, type: form.type,
          description: `${form.description.trim()} (${i + 1}/${form.installment_count})`,
          amount: parseFloat(valorParcela.toFixed(2)), date: dates[i],
          account_id: accountId, category_id: form.category_id || null,
          notes: form.notes?.trim() || null, status: i === 0 ? form.status : 'pending',
          credit_card_id: form.use_credit_card ? form.credit_card_id : null,
          invoice_id: invoiceId, is_installment: true,
          installment_group_id: group.id, installment_index: i + 1,
        }
        const { data: tx } = await supabase.from('transactions').insert(txPayload).select('id').single()
        await supabase.from('installments').insert({
          user_id: user.id, transaction_id: tx?.id ?? null, installment_group_id: group.id,
          amount: parseFloat(valorParcela.toFixed(2)), due_date: dates[i],
          status: i === 0 ? (form.status === 'paid' ? 'paid' : 'pending') : 'pending',
          installment_index: i + 1,
        })
        if (invoiceId) {
          const { data } = await supabase.from('transactions').select('amount').eq('invoice_id', invoiceId)
          const total = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
          await supabase.from('credit_card_invoices').update({ total_amount: total }).eq('id', invoiceId)
        }
      }

      await handleXP(user.id, !!form.category_id, isFirstTx, false)
      setSaving(false); onSaved?.(); onClose(); return
    }

    // ─── TRANSAÇÃO NORMAL ─────────────────────────────────────────────
    let invoiceId: string | null = null
    let accountId = form.account_id || null
    if (form.use_credit_card && form.type === 'expense') {
      invoiceId = await getOrCreateInvoice(form.credit_card_id, form.date, user.id)
      accountId = null
    }

    const payload: any = {
      user_id: user.id, type: form.type, description: form.description.trim(),
      amount, date: form.date, account_id: accountId,
      destination_account_id: form.type === 'transfer' ? form.destination_account_id : null,
      category_id: form.category_id || null, notes: form.notes?.trim() || null,
      status: form.use_credit_card ? 'posted' : form.status,
      credit_card_id: form.use_credit_card ? form.credit_card_id : null,
      invoice_id: invoiceId,
    }

    const { error: err } = await supabase.from('transactions').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }

    if (invoiceId) {
      const { data } = await supabase.from('transactions').select('amount').eq('invoice_id', invoiceId)
      const total = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
      await supabase.from('credit_card_invoices').update({ total_amount: total }).eq('id', invoiceId)
    }

    await handleXP(user.id, !!form.category_id, isFirstTx, false)
    setSaving(false); onSaved?.(); onClose()
  }

  const catsFiltradas = categories.filter(c =>
    form.type !== 'transfer' && (c.type === form.type || c.type === 'both')
  )

  if (!open) return null

  return (
    <>
      {/* Toast XP */}
      {xpToast && (
        <XPToast xp={xpToast.xp} badge={xpToast.badge} onDone={() => setXpToast(null)} />
      )}

      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
          <h2 className="text-lg font-semibold mb-5">Nova Transação</h2>

          <div className="space-y-4">
            {/* Tipo */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Tipo</label>
              <div className="flex gap-2">
                {(['expense', 'income', 'transfer'] as TxType[]).map(t => (
                  <button key={t}
                    onClick={() => setForm({ ...form, type: t, category_id: '', use_credit_card: false })}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      form.type === t
                        ? t === 'income'   ? 'bg-green-100 text-green-700'
                        : t === 'expense'  ? 'bg-red-100 text-red-600'
                        : 'bg-indigo-100 text-indigo-700'
                        : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >{TYPE_LABELS[t]}</button>
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
              <input type="text" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder={form.type === 'income' ? 'Ex: Salário, Freelance…' : form.type === 'expense' ? 'Ex: Mercado, Aluguel…' : 'Ex: Para reserva…'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Valor + Data */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {form.is_installment ? 'Valor total (R$)' : 'Valor (R$)'}
                </label>
                <input type="text" inputMode="decimal" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="0,00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {form.is_installment ? 'Data 1ª parcela' : 'Data'}
                </label>
                <input type="date"
                  value={form.is_installment ? form.installment_first_date : form.date}
                  onChange={e => setForm({ ...form, ...(form.is_installment ? { installment_first_date: e.target.value } : { date: e.target.value }) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Cartão ou Conta */}
            {form.use_credit_card && form.type === 'expense' ? (
              <div>
                <label className="block text-sm text-gray-600 mb-1">Cartão</label>
                <select value={form.credit_card_id} onChange={e => setForm({ ...form, credit_card_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">Selecione o cartão…</option>
                  {creditCards.map(c => <option key={c.id} value={c.id}>💳 {c.name}</option>)}
                </select>
                <p className="text-xs text-purple-500 mt-1">A despesa será lançada na fatura do cartão.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
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
                  <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">Selecione…</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.current_balance)}</option>)}
                  </select>
                </div>
                {form.type === 'transfer' && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Conta de Destino</label>
                    <select value={form.destination_account_id} onChange={e => setForm({ ...form, destination_account_id: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
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
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">Sem categoria</option>
                  {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>
            )}

            {/* Toggle Recorrente */}
            {form.type !== 'transfer' && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔁</span>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Recorrente</p>
                      <p className="text-[11px] text-gray-400">Repete automaticamente</p>
                    </div>
                  </div>
                  <Toggle active={form.is_recurring}
                    onChange={() => setForm({ ...form, is_recurring: !form.is_recurring, is_installment: false })} />
                </div>
                {form.is_recurring && (
                  <div className="px-4 pb-4 space-y-3 bg-indigo-50 border-t border-indigo-100">
                    <div className="pt-3">
                      <label className="block text-xs text-gray-500 mb-1">Frequência</label>
                      <div className="grid grid-cols-4 gap-1">
                        {(['daily','weekly','monthly','yearly'] as Frequency[]).map(f => (
                          <button key={f} onClick={() => setForm({ ...form, recurrence_frequency: f })}
                            className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              form.recurrence_frequency === f ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}>{FREQ_LABELS[f]}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Data de encerramento <span className="text-gray-400">(opcional)</span></label>
                      <input type="date" value={form.recurrence_end_date}
                        onChange={e => setForm({ ...form, recurrence_end_date: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <p className="text-[11px] text-indigo-500">
                      A partir de {form.date ? new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'},
                      repete {FREQ_LABELS[form.recurrence_frequency].toLowerCase()}
                      {form.recurrence_end_date ? ` até ${new Date(form.recurrence_end_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ' sem data de encerramento'}.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Toggle Parcelado */}
            {form.type === 'expense' && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📅</span>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Parcelado</p>
                      <p className="text-[11px] text-gray-400">Divide em várias parcelas</p>
                    </div>
                  </div>
                  <Toggle active={form.is_installment}
                    onChange={() => setForm({ ...form, is_installment: !form.is_installment, is_recurring: false })} />
                </div>
                {form.is_installment && (
                  <div className="px-4 pb-4 space-y-3 bg-orange-50 border-t border-orange-100">
                    <div className="pt-3">
                      <label className="block text-xs text-gray-500 mb-1">Número de parcelas</label>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setForm({ ...form, installment_count: Math.max(2, form.installment_count - 1) })}
                          className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-50 flex items-center justify-center text-lg">−</button>
                        <span className="text-sm font-bold text-gray-800 w-6 text-center">{form.installment_count}x</span>
                        <button onClick={() => setForm({ ...form, installment_count: Math.min(48, form.installment_count + 1) })}
                          className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 font-bold hover:bg-gray-50 flex items-center justify-center text-lg">+</button>
                        <div className="flex gap-1 ml-auto">
                          {[2,3,6,12,24].map(n => (
                            <button key={n} onClick={() => setForm({ ...form, installment_count: n })}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                form.installment_count === n ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                              }`}>{n}x</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {amount > 0 && (
                      <div className="bg-white rounded-lg px-3 py-2.5 border border-orange-100">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500">Valor por parcela</span>
                          <span className="text-sm font-bold text-orange-600">{fmt(valorParcela)}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xs text-gray-400">Total</span>
                          <span className="text-xs text-gray-400">{form.installment_count}x de {fmt(valorParcela)} = {fmt(amount)}</span>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-orange-500">
                      {form.installment_count} parcelas mensais a partir de{' '}
                      {form.installment_first_date ? new Date(form.installment_first_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}.
                      A 1ª fica com status <strong>{form.status === 'paid' ? 'Pago' : 'Pendente'}</strong>, as demais como Pendente.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Observação */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Observação <span className="text-gray-400">(opcional)</span></label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={2} placeholder="Notas adicionais…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className={`flex-1 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                form.use_credit_card    ? 'bg-purple-600 hover:bg-purple-700' :
                form.type === 'income'  ? 'bg-green-600 hover:bg-green-700'  :
                form.type === 'expense' ? 'bg-red-500 hover:bg-red-600'      :
                'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {saving ? 'Salvando…' :
                form.is_installment ? `Salvar ${form.installment_count}x parcelas` :
                form.is_recurring   ? 'Salvar recorrência' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
