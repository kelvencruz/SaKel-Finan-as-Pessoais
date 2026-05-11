'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

type TxType = 'income' | 'expense' | 'transfer'

interface Transaction {
  id: string
  type: TxType
  description: string
  amount: number
  date: string
  account_id: string
  destination_account_id?: string | null
  category_id?: string | null
  notes?: string | null
  status?: string | null
  credit_card_id?: string | null
  invoice_id?: string | null
  is_recurring?: boolean
  recurrence?: string | null
  recurrence_start?: string | null
  recurrence_end?: string | null
  installment_total?: number | null
  installment_current?: number | null
  installment_group?: string | null
  account_name?: string
  destination_account_name?: string
  category_name?: string
  category_icon?: string
  credit_card_name?: string
}

interface Account    { id: string; name: string; color: string; current_balance: number }
interface Category   { id: string; name: string; type: string; icon: string }
interface CreditCard { id: string; name: string; color: string; closing_day: number; due_day: number }

type Toast = { message: string; type: 'success' | 'error' }

const fmt     = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')

const TYPE_LABELS: Record<TxType, string> = {
  income:   'Receita',
  expense:  'Despesa',
  transfer: 'Transferencia',
}

const RECURRENCE_LABELS: Record<string, string> = {
  daily:   'Diaria',
  weekly:  'Semanal',
  monthly: 'Mensal',
  yearly:  'Anual',
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  paid:      { label: 'Pago',      className: 'bg-green-50 text-green-600' },
  pending:   { label: 'Pendente',  className: 'bg-yellow-50 text-yellow-600' },
  overdue:   { label: 'Vencido',   className: 'bg-red-50 text-red-500' },
  cancelled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-400' },
  posted:    { label: 'Na fatura', className: 'bg-purple-50 text-purple-600' },
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
  // recorrencia
  is_recurring: false,
  recurrence: 'monthly',
  recurrence_end: '',
  // parcelamento
  is_installment: false,
  installment_total: '2',
}

function getMonthOptions() {
  const opts: { value: string; label: string }[] = [{ value: '', label: 'Todos os meses' }]
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opts
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function addWeeks(dateStr: string, weeks: number): string {
  return addDays(dateStr, weeks * 7)
}

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

function nextDate(dateStr: string, recurrence: string, i: number): string {
  switch (recurrence) {
    case 'daily':   return addDays(dateStr, i)
    case 'weekly':  return addWeeks(dateStr, i)
    case 'monthly': return addMonths(dateStr, i)
    case 'yearly':  return addYears(dateStr, i)
    default:        return addMonths(dateStr, i)
  }
}

function SkeletonRow() {
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-4 animate-pulse">
      <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-gray-100 rounded w-2/5" />
        <div className="h-2.5 bg-gray-100 rounded w-1/3" />
      </div>
      <div className="text-right space-y-2 shrink-0">
        <div className="h-3 bg-gray-100 rounded w-20" />
        <div className="h-2.5 bg-gray-100 rounded w-14 ml-auto" />
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function TransacoesPage() {
  const supabase = createClient()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [categories,   setCategories]   = useState<Category[]>([])
  const [creditCards,  setCreditCards]  = useState<CreditCard[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)
  const [toast,        setToast]        = useState<Toast | null>(null)

  const [search,         setSearch]         = useState('')
  const [filterType,     setFilterType]     = useState<TxType | ''>('')
  const [filterAccount,  setFilterAccount]  = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMonth,    setFilterMonth]    = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form,      setForm]      = useState(emptyForm)
  const [error,     setError]     = useState<string | null>(null)

  const monthOptions = useMemo(() => getMonthOptions(), [])

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }

    const [{ data: tx }, { data: acc }, { data: cat }, { data: cards }] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, type, description, amount, date, account_id, destination_account_id, category_id, notes, status, credit_card_id, invoice_id, is_recurring, recurrence, recurrence_start, recurrence_end, installment_total, installment_current, installment_group')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(500),
      supabase.from('accounts').select('id, name, color, current_balance').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('id, name, type, icon').eq('user_id', user.id).order('name'),
      supabase.from('credit_cards').select('id, name, color, closing_day, due_day').eq('user_id', user.id).eq('is_active', true).order('name'),
    ])

    const accList  = (acc   ?? []) as Account[]
    const catList  = (cat   ?? []) as Category[]
    const cardList = (cards ?? []) as CreditCard[]
    const txRaw    = (tx    ?? []) as any[]

    const accMap  = Object.fromEntries(accList.map(a  => [a.id, a]))
    const catMap  = Object.fromEntries(catList.map(c  => [c.id, c]))
    const cardMap = Object.fromEntries(cardList.map(c => [c.id, c]))

    setTransactions(txRaw.map(t => ({
      ...t,
      type: t.type as TxType,
      account_name:             accMap[t.account_id]?.name ?? '-',
      destination_account_name: t.destination_account_id ? (accMap[t.destination_account_id]?.name ?? '-') : undefined,
      category_name:            t.category_id    ? catMap[t.category_id]?.name    : undefined,
      category_icon:            t.category_id    ? catMap[t.category_id]?.icon    : undefined,
      credit_card_name:         t.credit_card_id ? cardMap[t.credit_card_id]?.name : undefined,
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

  function openEdit(tx: Transaction) {
    setForm({
      type:                   tx.type,
      description:            tx.description,
      amount:                 String(tx.amount),
      date:                   tx.date,
      account_id:             tx.account_id ?? '',
      destination_account_id: tx.destination_account_id ?? '',
      category_id:            tx.category_id ?? '',
      notes:                  tx.notes ?? '',
      status:                 tx.status ?? 'paid',
      use_credit_card:        !!tx.credit_card_id,
      credit_card_id:         tx.credit_card_id ?? '',
      is_recurring:           tx.is_recurring ?? false,
      recurrence:             tx.recurrence ?? 'monthly',
      recurrence_end:         tx.recurrence_end ?? '',
      is_installment:         !!tx.installment_total,
      installment_total:      String(tx.installment_total ?? '2'),
    })
    setEditingId(tx.id)
    setError(null)
    setShowModal(true)
  }

  async function getOrCreateInvoice(cardId: string, date: string, userId: string): Promise<string | null> {
    const d    = new Date(date + 'T12:00:00')
    const card = creditCards.find(c => c.id === cardId)
    if (!card) return null

    let month = d.getMonth() + 1
    let year  = d.getFullYear()
    if (d.getDate() > card.closing_day) {
      month = month === 12 ? 1 : month + 1
      year  = month === 1 ? year + 1 : year
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

  async function updateInvoiceTotal(invoiceId: string) {
    const { data } = await supabase.from('transactions').select('amount').eq('invoice_id', invoiceId)
    const total = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
    await supabase.from('credit_card_invoices').update({ total_amount: total }).eq('id', invoiceId)
  }

  async function handleSave() {
    setError(null)
    const amount = parseFloat(String(form.amount).replace(',', '.'))
    if (!form.description.trim())     { setError('Descricao e obrigatoria.'); return }
    if (isNaN(amount) || amount <= 0) { setError('Valor deve ser maior que zero.'); return }

    if (form.use_credit_card && form.type === 'expense') {
      if (!form.credit_card_id) { setError('Selecione um cartao.'); return }
    } else {
      if (!form.account_id) { setError('Selecione uma conta.'); return }
      if (form.type === 'transfer' && !form.destination_account_id) { setError('Selecione a conta de destino.'); return }
      if (form.type === 'transfer' && form.account_id === form.destination_account_id) { setError('Contas devem ser diferentes.'); return }
    }

    if (form.is_installment && form.type !== 'transfer') {
      const total = parseInt(form.installment_total)
      if (isNaN(total) || total < 2 || total > 48) { setError('Parcelas: entre 2 e 48.'); return }
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Nao autenticado.'); setSaving(false); return }

    // ── PARCELAMENTO ──────────────────────────────────────────
    if (form.is_installment && !editingId && form.type !== 'transfer') {
      const total = parseInt(form.installment_total)
      const groupId = crypto.randomUUID()
      const rows = []

      for (let i = 0; i < total; i++) {
        const installDate = addMonths(form.date, i)
        let invoiceId: string | null = null
        let accountId = form.account_id || null

        if (form.use_credit_card && form.type === 'expense') {
          invoiceId = await getOrCreateInvoice(form.credit_card_id, installDate, user.id)
          accountId = null
        }

        rows.push({
          user_id:                user.id,
          type:                   form.type,
          description:            `${form.description.trim()} (${i + 1}/${total})`,
          amount,
          date:                   installDate,
          account_id:             accountId,
          destination_account_id: null,
          category_id:            form.category_id || null,
          notes:                  form.notes?.trim() || null,
          status:                 form.use_credit_card ? 'posted' : form.status,
          credit_card_id:         form.use_credit_card ? form.credit_card_id : null,
          invoice_id:             invoiceId,
          installment_total:      total,
          installment_current:    i + 1,
          installment_group:      groupId,
          is_recurring:           false,
        })
      }

      const { error: err } = await supabase.from('transactions').insert(rows)
      if (err) { setError(err.message); setSaving(false); return }

      // atualiza faturas
      const invoiceIds = [...new Set(rows.map(r => r.invoice_id).filter(Boolean))]
      for (const iid of invoiceIds) { if (iid) await updateInvoiceTotal(iid) }

      showToast(`${total} parcelas criadas!`)
      await loadAll()
      setShowModal(false)
      setSaving(false)
      return
    }

    // ── TRANSACAO NORMAL / RECORRENTE ─────────────────────────
    let invoiceId: string | null = null
    let accountId = form.account_id || null

    if (form.use_credit_card && form.type === 'expense') {
      invoiceId = await getOrCreateInvoice(form.credit_card_id, form.date, user.id)
      accountId = null
    }

    const payload: any = {
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
      is_recurring:           form.is_recurring,
      recurrence:             form.is_recurring ? form.recurrence : null,
      recurrence_start:       form.is_recurring ? form.date : null,
      recurrence_end:         form.is_recurring && form.recurrence_end ? form.recurrence_end : null,
      installment_total:      null,
      installment_current:    null,
      installment_group:      null,
    }

    if (editingId) {
      const { error: err } = await supabase.from('transactions').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
      if (invoiceId) await updateInvoiceTotal(invoiceId)
      showToast('Transacao atualizada!')
    } else {
      const { error: err } = await supabase.from('transactions').insert({ ...payload, user_id: user.id })
      if (err) { setError(err.message); setSaving(false); return }
      if (invoiceId) await updateInvoiceTotal(invoiceId)
      showToast('Transacao criada!')
    }

    await loadAll()
    setShowModal(false)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta transacao?')) return
    setDeletingId(id)
    const { error: err } = await supabase.from('transactions').delete().eq('id', id)
    if (err) showToast('Erro ao excluir.', 'error')
    else showToast('Transacao excluida.')
    await loadAll()
    setDeletingId(null)
  }

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (filterType     && tx.type        !== filterType)     return false
      if (filterAccount  && tx.account_id  !== filterAccount)  return false
      if (filterCategory && tx.category_id !== filterCategory) return false
      if (filterMonth && tx.date.slice(0, 7) !== filterMonth)  return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !tx.description.toLowerCase().includes(q) &&
          !(tx.account_name ?? '').toLowerCase().includes(q) &&
          !(tx.category_name ?? '').toLowerCase().includes(q) &&
          !(tx.credit_card_name ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [transactions, filterType, filterAccount, filterCategory, filterMonth, search])

  const summary = useMemo(() => {
    const income  = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { income, expense, balance: income - expense }
  }, [filtered])

  const hasActiveFilters = filterType || filterAccount || filterCategory || search
  function clearFilters() { setFilterType(''); setFilterAccount(''); setFilterCategory(''); setSearch('') }

  const amountColor  = (type: TxType) => type === 'income' ? 'text-green-600' : type === 'expense' ? 'text-red-500' : 'text-indigo-600'
  const amountPrefix = (type: TxType) => type === 'income' ? '+' : type === 'expense' ? '-' : ''
  const catsFiltradas = categories.filter(c => form.type !== 'transfer' && (c.type === form.type || c.type === 'both'))

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">

      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">Dashboard</a>
          <h1 className="text-xl font-semibold mt-1">Transacoes</h1>
        </div>
        <button onClick={openCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          + Nova Transacao
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 space-y-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm">🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por descricao, conta, cartao ou categoria..."
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1.5">
            {([['', 'Todas'], ['income', 'Receitas'], ['expense', 'Despesas'], ['transfer', 'Transf.']] as [TxType | '', string][]).map(([val, label]) => (
              <button key={val} onClick={() => setFilterType(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterType === val ? 'bg-indigo-600 text-white' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                {label}
              </button>
            ))}
          </div>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {accounts.length > 0 && (
            <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Todas as contas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {categories.length > 0 && (
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Todas as categorias</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-100 transition-colors">
              Limpar
            </button>
          )}
        </div>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400">Receitas</p>
            <p className="text-sm font-semibold text-green-600 mt-0.5">{fmt(summary.income)}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400">Despesas</p>
            <p className="text-sm font-semibold text-red-500 mt-0.5">{fmt(summary.expense)}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400">Saldo</p>
            <p className={`text-sm font-semibold mt-0.5 ${summary.balance >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{fmt(summary.balance)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          {transactions.length === 0 ? (
            <>
              <p className="text-2xl mb-2">📭</p>
              <p className="text-gray-600 text-sm font-medium">Nenhuma transacao ainda</p>
              <p className="text-gray-400 text-xs mt-1 mb-4">Registre sua primeira receita ou despesa para comecar.</p>
              <button onClick={openCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                + Nova Transacao
              </button>
            </>
          ) : (
            <>
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-gray-600 text-sm font-medium">Nenhum resultado</p>
              <button onClick={clearFilters} className="text-indigo-600 text-sm hover:underline mt-2">Limpar filtros</button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-2">{filtered.length} transacao{filtered.length !== 1 ? 'oes' : ''}</p>
          {filtered.map(tx => {
            const statusInfo = tx.status ? STATUS_LABELS[tx.status] : null
            return (
              <div key={tx.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-4 group hover:border-gray-200 transition-colors">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  tx.type === 'income' ? 'bg-green-50 text-green-600' : tx.type === 'expense' ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  {tx.category_icon ?? (tx.type === 'income' ? '↑' : tx.type === 'expense' ? '↓' : '⇄')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                    {tx.is_recurring && tx.recurrence && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 shrink-0">
                        🔁 {RECURRENCE_LABELS[tx.recurrence] ?? tx.recurrence}
                      </span>
                    )}
                    {tx.installment_total && tx.installment_current && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 shrink-0">
                        {tx.installment_current}/{tx.installment_total}x
                      </span>
                    )}
                    {statusInfo && tx.status !== 'paid' && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${statusInfo.className}`}>{statusInfo.label}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {tx.credit_card_name ? `💳 ${tx.credit_card_name}` : tx.account_name}
                    {tx.type === 'transfer' && tx.destination_account_name ? ` → ${tx.destination_account_name}` : ''}
                    {tx.category_name ? ` · ${tx.category_name}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold ${amountColor(tx.type)}`}>{amountPrefix(tx.type)} {fmt(tx.amount)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(tx.date)}</p>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-all flex gap-1 shrink-0">
                  <button onClick={() => openEdit(tx)} className="text-gray-300 hover:text-indigo-500 text-sm px-1.5 py-1 rounded hover:bg-indigo-50 transition-colors" title="Editar">✏️</button>
                  <button onClick={() => handleDelete(tx.id)} disabled={deletingId === tx.id}
                    className="text-gray-300 hover:text-red-400 text-sm px-1.5 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-30" title="Excluir">
                    {deletingId === tx.id ? '…' : '🗑️'}
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
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-5">{editingId ? 'Editar Transacao' : 'Nova Transacao'}</h2>

            <div className="space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Tipo</label>
                <div className="flex gap-2">
                  {(['expense', 'income', 'transfer'] as TxType[]).map(t => (
                    <button key={t} onClick={() => setForm({ ...form, type: t, category_id: '', use_credit_card: false, is_installment: false, is_recurring: false })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                        form.type === t
                          ? t === 'income' ? 'bg-green-100 text-green-700' : t === 'expense' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-700'
                          : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}>
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle cartao */}
              {form.type === 'expense' && creditCards.length > 0 && (
                <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">💳</span>
                    <span className="text-sm text-purple-700 font-medium">Pagar com cartao de credito</span>
                  </div>
                  <Toggle
                    checked={form.use_credit_card}
                    onChange={() => setForm({ ...form, use_credit_card: !form.use_credit_card, credit_card_id: creditCards[0]?.id ?? '' })}
                  />
                </div>
              )}

              {/* Descricao */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Descricao</label>
                <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder={form.type === 'income' ? 'Ex: Salario, Freelance...' : form.type === 'expense' ? 'Ex: Mercado, Aluguel...' : 'Ex: Para reserva...'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {/* Valor + Data */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Valor (R$)</label>
                  <input type="text" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                    placeholder="0,00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Data</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* Cartao ou Conta */}
              {form.use_credit_card && form.type === 'expense' ? (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Cartao</label>
                  <select value={form.credit_card_id} onChange={e => setForm({ ...form, credit_card_id: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">Selecione o cartao...</option>
                    {creditCards.map(c => <option key={c.id} value={c.id}>💳 {c.name}</option>)}
                  </select>
                  <p className="text-xs text-purple-500 mt-1">A despesa sera lancada na fatura do cartao.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="paid">Pago</option>
                      <option value="pending">Pendente</option>
                      <option value="overdue">Vencido</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      {form.type === 'transfer' ? 'Conta de Origem' : 'Conta'}
                    </label>
                    <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="">Selecione...</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.current_balance)}</option>)}
                    </select>
                  </div>
                  {form.type === 'transfer' && (
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Conta de Destino</label>
                      <select value={form.destination_account_id} onChange={e => setForm({ ...form, destination_account_id: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                        <option value="">Selecione...</option>
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
                  <label className="block text-sm text-gray-600 mb-1">Categoria <span className="text-gray-400">(opcional)</span></label>
                  <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">Sem categoria</option>
                    {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Recorrencia — so para income/expense, nao parcelado */}
              {form.type !== 'transfer' && !form.is_installment && (
                <div className="border border-gray-100 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🔁</span>
                      <span className="text-sm font-medium text-gray-700">Recorrente</span>
                    </div>
                    <Toggle
                      checked={form.is_recurring}
                      onChange={() => setForm({ ...form, is_recurring: !form.is_recurring })}
                    />
                  </div>
                  {form.is_recurring && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Frequencia</label>
                        <select value={form.recurrence} onChange={e => setForm({ ...form, recurrence: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                          <option value="daily">Diaria</option>
                          <option value="weekly">Semanal</option>
                          <option value="monthly">Mensal</option>
                          <option value="yearly">Anual</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Data fim (opcional)</label>
                        <input type="date" value={form.recurrence_end} onChange={e => setForm({ ...form, recurrence_end: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Parcelamento — so para income/expense, nao recorrente */}
              {form.type !== 'transfer' && !form.is_recurring && !editingId && (
                <div className="border border-gray-100 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📅</span>
                      <span className="text-sm font-medium text-gray-700">Parcelado</span>
                    </div>
                    <Toggle
                      checked={form.is_installment}
                      onChange={() => setForm({ ...form, is_installment: !form.is_installment })}
                    />
                  </div>
                  {form.is_installment && (
                    <div className="pt-1">
                      <label className="block text-xs text-gray-500 mb-1">Numero de parcelas</label>
                      <input
                        type="number"
                        min={2}
                        max={48}
                        value={form.installment_total}
                        onChange={e => setForm({ ...form, installment_total: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Ex: 12"
                      />
                      {form.installment_total && parseInt(form.installment_total) >= 2 && (
                        <p className="text-xs text-gray-400 mt-1">
                          {parseInt(form.installment_total)}x de {fmt(parseFloat(String(form.amount).replace(',', '.')) || 0)} — total {fmt((parseFloat(String(form.amount).replace(',', '.')) || 0) * parseInt(form.installment_total))}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Observacao */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Observacao <span className="text-gray-400">(opcional)</span></label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} placeholder="Notas adicionais..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className={`flex-1 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  form.use_credit_card    ? 'bg-purple-600 hover:bg-purple-700' :
                  form.type === 'income'  ? 'bg-green-600 hover:bg-green-700'  :
                  form.type === 'expense' ? 'bg-red-500 hover:bg-red-600'      :
                  'bg-indigo-600 hover:bg-indigo-700'
                }`}>
                {saving ? 'Salvando...' : form.is_installment ? `Criar ${form.installment_total || '?'} parcelas` : editingId ? 'Salvar alteracoes' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
