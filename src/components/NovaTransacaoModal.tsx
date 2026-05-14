'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'
import { toastManager } from '@/components/core/ToastManager'

type TxType = 'income' | 'expense' | 'transfer'
type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface Account        { id: string; name: string; color: string; current_balance: number }
interface Category       { id: string; name: string; type: string; icon: string }
interface CreditCard     { id: string; name: string; color: string; closing_day: number; due_day: number }
interface InvestmentGoal { id: string; name: string; icon: string; color: string }

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
  goal_id:                '',
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
  const [goals,       setGoals]       = useState<InvestmentGoal[]>([])
  const [loaded,      setLoaded]      = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [form,        setForm]        = useState(emptyForm)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({ ...emptyForm })
    setError(null)
    setLoaded(false)

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: acc }, { data: cat }, { data: cards }, { data: gls }] = await Promise.all([
        supabase.from('accounts').select('id, name, color, current_balance').eq('user_id', user.id).order('name'),
        supabase.from('categories').select('id, name, type, icon').eq('user_id', user.id).order('name'),
        supabase.from('credit_cards').select('id, name, color, closing_day, due_day').eq('user_id', user.id).eq('is_active', true).order('name'),
        supabase.from('investment_goals').select('id, name, icon, color').eq('user_id', user.id).order('name'),
      ])

      const accList = (acc ?? []) as Account[]
      setAccounts(accList)
      setCategories((cat ?? []) as Category[])
      setCreditCards((cards ?? []) as CreditCard[])
      setGoals((gls ?? []) as InvestmentGoal[])
      setForm(f => ({ ...f, account_id: accList[0]?.id ?? '' }))
      setLoaded(true)
    }

    load()
  }, [open])

  const amount = parseFloat(String(form.amount).replace(',', '.')) || 0
  const valorParcela = form.is_installment && form.installment_count > 1
    ? amount / form.installment_count : amount

  const selectedCategory = categories.find(c => c.id === form.category_id)
  const isInvestmentCategory = selectedCategory?.type === 'investment'

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

  async function pushXPToast(userId: string, isFirstTx: boolean) {
    console.log('[XP] pushXPToast iniciado — userId:', userId)

    const { data: prefs, error: prefsError } = await supabase
      .from('user_preferences')
      .select('gamification_enabled')
      .eq('user_id', userId)
      .single()

    console.log('[XP] prefs:', prefs, '| error:', prefsError)

    const gamEnabled = prefs?.gamification_enabled ?? true
    console.log('[XP] gamEnabled:', gamEnabled)

    if (!gamEnabled) {
      console.log('[XP] desativado — abortando')
      return
    }

    const totalXP = 10
    let badgeEarned: string | null = null

    try {
      const r1 = await awardXP(userId, 'transaction_created', isFirstTx ? 'first_transaction' : undefined)
      console.log('[XP] awardXP r1:', r1)
      if (r1.newBadge) badgeEarned = r1.newBadge

      const { count } = await supabase
        .from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', userId)
      if (count === 10) {
        const r2 = await awardXP(userId, 'transaction_created', 'ten_transactions')
        if (r2.newBadge && !badgeEarned) badgeEarned = r2.newBadge
      }
      if (count === 50) {
        const r3 = await awardXP(userId, 'transaction_created', 'fifty_transactions')
        if (r3.newBadge && !badgeEarned) badgeEarned = r3.newBadge
      }
    } catch (e) {
      console.error('[XP] ERRO awardXP:', e)
    }

    console.log('[XP] push fila — xp:', totalXP, 'badge:', badgeEarned)
    toastManager.push({ kind: 'xp', xp: totalXP, badge: badgeEarned })
    console.log('[XP] push concluído')
  }

 async function finish(userId: string, isFirstTx: boolean, confirmMessage: string) {
  console.log('[FINISH] início — msg:', confirmMessage)
  toastManager.push({ kind: 'confirm', message: confirmMessage })
  console.log('[FINISH] confirm pushado')
  try {
    await pushXPToast(userId, isFirstTx)
  } catch (e) {
    console.error('[FINISH] ERRO pushXPToast:', e)
  }
  console.log('[FINISH] aguardando toast renderizar...')
  await new Promise(resolve => setTimeout(resolve, 300))
  console.log('[FINISH] concluído — fechando modal')
  onSaved?.()
  onClose()
  setSaving(false)
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

    const { count: txCount } = await supabase
      .from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
    const isFirstTx = (txCount ?? 0) === 0
    const goalId = isInvestmentCategory && form.goal_id ? form.goal_id : null

    if (form.is_recurring) {
      function calcNextDue(startDate: string, frequency: string): string {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const d = new Date(startDate + 'T12:00:00')
        while (d < today) {
          if (frequency === 'daily')        d.setDate(d.getDate() + 1)
          else if (frequency === 'weekly')  d.setDate(d.getDate() + 7)
          else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1)
          else if (frequency === 'yearly')  d.setFullYear(d.getFullYear() + 1)
        }
        return d.toISOString().split('T')[0]
      }

      const recPayload = {
        user_id:        user.id,
        type:           form.type,
        description:    form.description.trim(),
        amount,
        frequency:      form.recurrence_frequency,
        next_due_date:  calcNextDue(form.date, form.recurrence_frequency),
        start_date:     form.date,
        end_date:       form.recurrence_end_date || null,
        account_id:     form.use_credit_card ? null : (form.account_id || null),
        credit_card_id: form.use_credit_card ? form.credit_card_id : null,
        category_id:    form.category_id || null,
        is_active:      true,
      }

      const { data: recData, error: recErr } = await supabase
        .from('recurrences').insert(recPayload).select('id').single()

      if (recErr || !recData) {
        setError(recErr?.message ?? 'Erro ao criar recorrência.')
        setSaving(false)
        return
      }

      let invoiceId: string | null = null
      const accountId = form.use_credit_card ? null : (form.account_id || null)
      if (form.use_credit_card && form.type === 'expense') {
        invoiceId = await getOrCreateInvoice(form.credit_card_id, form.date, user.id)
      }

      await supabase.from('transactions').insert({
        user_id:        user.id,
        type:           form.type,
        description:    form.description.trim(),
        amount,
        date:           form.date,
        account_id:     accountId,
        category_id:    form.category_id || null,
        goal_id:        goalId,
        notes:          form.notes?.trim() || null,
        status:         form.use_credit_card ? 'posted' : form.status,
        credit_card_id: form.use_credit_card ? form.credit_card_id : null,
        invoice_id:     invoiceId,
        is_recurring:   true,
        recurrence_id:  recData.id,
      })

      if (invoiceId) {
        const { data } = await supabase.from('transactions').select('amount').eq('invoice_id', invoiceId)
        const total = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
        await supabase.from('credit_card_invoices').update({ total_amount: total }).eq('id', invoiceId)
      }

      await finish(user.id, isFirstTx, 'Recorrência salva ✓')
      return
    }

    if (form.is_installment) {
      const dates = getInstallmentDates()
      const { data: group, error: groupErr } = await supabase
        .from('installment_groups')
        .insert({
          user_id: user.id, description: form.description.trim(),
          total_amount: amount, count: form.installment_count,
          category_id: form.category_id || null,
          account_id: form.account_id || null,
          notes: form.notes?.trim() || null,
        })
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
          goal_id: goalId, notes: form.notes?.trim() || null,
          status: i === 0 ? form.status : 'pending',
          credit_card_id: form.use_credit_card ? form.credit_card_id : null,
          invoice_id: invoiceId, is_installment: true,
          installment_group_id: group.id, installment_index: i + 1,
        }
        const { data: tx } = await supabase.from('transactions').insert(txPayload).select('id').single()
        await supabase.from('installments').insert({
          user_id: user.id, transaction_id: tx?.id ?? null,
          installment_group_id: group.id,
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

      await finish(user.id, isFirstTx, `${form.installment_count}x parcelas salvas ✓`)
      return
    }

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
      category_id: form.category_id || null, goal_id: goalId,
      notes: form.notes?.trim() || null,
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

    await finish(user.id, isFirstTx, 'Transação salva ✓')
  }

  const catsFiltradas = categories.filter(c => {
    if (form.type === 'transfer') return false
    if (form.type === 'income')   return c.type === 'income'   || c.type === 'both'
    if (form.type === 'expense')  return c.type === 'expense'  || c.type === 'both' || c.type === 'investment'
    return false
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-5">Nova Transação</h2>

        <div className="space-y-4">

          <div>
            <label className="block text-sm text-gray-600 mb-1">Tipo</label>
            <div className="flex gap-2">
              {(['expense', 'income', 'transfer'] as TxType[]).map(t => (
                <button key={t}
                  onClick={() => setForm({ ...form, type: t, category_id: '', goal_id: '', use_credit_card: false })}
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

          {form.type === 'expense' && creditCards.length > 0 && (
            <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">💳</span>
                <span className="text-sm text-purple-700 font-medium">Pagar com cartão de crédito</span>
              </div>
              <button
                onClick={() => setForm({ ...form, use_credit_card: !form.use_credit_card, credit_card_id: creditCards[0]?.id ?? '' })}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.use_credit_card ? 'bg-purple-500' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.use_credit_card ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-600 mb-1">Descrição</label>
            <input type="text" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder={form.type === 'income' ? 'Ex: Salário, Freelance…' : form.type === 'expense' ? 'Ex: Mercado, Aluguel…' : 'Ex: Para reserva…'}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

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

          {form.type !== 'transfer' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Categoria <span className="text-gray-400">(opcional)</span>
              </label>
              <select value={form.category_id}
                onChange={e => setForm({ ...form, category_id: e.target.value, goal_id: '' })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="">Sem categoria</option>
                {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          )}

          {isInvestmentCategory && goals.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-3">
              <label className="block text-sm text-indigo-700 font-medium mb-1">
                📈 Objetivo financeiro <span className="text-indigo-400 font-normal">(opcional)</span>
              </label>
              <select value={form.goal_id} onChange={e => setForm({ ...form, goal_id: e.target.value })}
                className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="">Sem objetivo específico</option>
                {goals.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
              </select>
              <p className="text-xs text-indigo-400 mt-1">Vincula este aporte a um objetivo para acompanhar o progresso.</p>
            </div>
          )}

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
  )
}
