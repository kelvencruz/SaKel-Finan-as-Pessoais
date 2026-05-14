'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CreditCard {
  id: string
  name: string
  color: string
  limit_amount: number
  closing_day: number
  due_day: number
}

interface Invoice {
  id: string
  credit_card_id: string
  user_id: string
  month: number
  year: number
  total_amount: number
  status: 'open' | 'closed' | 'paid' | 'cancelled'
  due_date: string
  paid_at: string | null
  paid_account_id: string | null
}

interface Account { id: string; name: string }

interface InvoiceTransaction {
  id: string
  description: string
  amount: number
  date: string
  status: string
  category?: { name: string; icon: string } | null
}

interface InvoiceState {
  status: 'idle' | 'loading' | 'loaded' | 'empty'
  invoice: Invoice | null
  transactions: InvoiceTransaction[]
  computedTotal: number
}

const INVOICE_IDLE: InvoiceState = {
  status: 'idle',
  invoice: null,
  transactions: [],
  computedTotal: 0,
}

const STATUS_LABELS: Record<string, string> = {
  open:      'Aberta',
  closed:    'Fechada',
  paid:      'Paga',
  cancelled: 'Cancelada',
}

const STATUS_COLORS: Record<string, string> = {
  open:      'bg-blue-100 text-blue-700',
  closed:    'bg-yellow-100 text-yellow-700',
  paid:      'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─────────────────────────────────────────────────────────────────────────────
// S1-007 — Loading skeleton (página inteira)
// ─────────────────────────────────────────────────────────────────────────────
function FaturasSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto space-y-4">
      <div className="h-8 w-24 bg-gray-100 rounded-lg animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="h-40 bg-white border border-gray-100 rounded-xl animate-pulse" />
          <div className="h-24 bg-white border border-gray-100 rounded-xl animate-pulse" />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="h-36 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-48 bg-white border border-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// S1-007 — Error state
// ─────────────────────────────────────────────────────────────────────────────
function FaturasError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</a>
          <h1 className="text-xl font-semibold mt-1">Faturas</h1>
        </div>
      </div>
      <div className="bg-white border border-dashed border-red-100 rounded-xl p-10 text-center">
        <p className="text-2xl mb-2">⚠️</p>
        <p className="text-sm font-medium text-gray-600 mb-1">Erro ao carregar faturas</p>
        <p className="text-xs text-gray-400 mb-5">
          {message ?? 'Não foi possível buscar os dados. Verifique sua conexão.'}
        </p>
        <button onClick={onRetry} className="text-sm font-medium text-indigo-600 hover:underline">
          Tentar novamente
        </button>
      </div>
    </div>
  )
}

export default function FaturasPage() {
  const supabase = createClient()

  const [cards,        setCards]        = useState<CreditCard[]>([])
  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null)
  const [history,      setHistory]      = useState<Invoice[]>([])
  const [viewMonth,    setViewMonth]    = useState(() => new Date().getMonth() + 1)
  const [viewYear,     setViewYear]     = useState(() => new Date().getFullYear())

  // S1-007: três estados explícitos
  const [pageLoading,  setPageLoading]  = useState(true)
  const [loadError,    setLoadError]    = useState<string | null>(null)

  const [invoiceState, setInvoiceState] = useState<InvoiceState>(INVOICE_IDLE)

  const [showPayModal, setShowPayModal] = useState(false)
  const [payAccountId, setPayAccountId] = useState('')
  const [paying,       setPaying]       = useState(false)
  const [payError,     setPayError]     = useState<string | null>(null)

  const loadSeq = useRef(0)

  const loadInvoicePeriod = useCallback(async (cardId: string, month: number, year: number) => {
    const seq = ++loadSeq.current
    setInvoiceState(prev => ({ ...prev, status: 'loading' }))

    const { data: invData } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('credit_card_id', cardId)
      .eq('month', month)
      .eq('year', year)
      .gt('total_amount', 0)
      .order('total_amount', { ascending: false })
      .maybeSingle()

    if (seq !== loadSeq.current) return

    if (!invData) {
      setInvoiceState({ status: 'empty', invoice: null, transactions: [], computedTotal: 0 })
      return
    }

    const { data: txData } = await supabase
      .from('transactions')
      .select('id, description, amount, date, status, category:categories(name, icon)')
      .eq('invoice_id', invData.id)
      .order('date', { ascending: false })

    if (seq !== loadSeq.current) return

    const transactions: InvoiceTransaction[] = (txData ?? []).map((tx: any) => ({
      ...tx,
      category: Array.isArray(tx.category) ? (tx.category[0] ?? null) : tx.category,
    }))
    const computedTotal = transactions.reduce((s, t) => s + Number(t.amount), 0)

    setInvoiceState({
      status: 'loaded',
      invoice: invData,
      transactions,
      computedTotal: computedTotal > 0 ? computedTotal : Number(invData.total_amount),
    })
  }, [])

  const loadHistory = useCallback(async (cardId: string) => {
    const { data } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('credit_card_id', cardId)
      .gt('total_amount', 0)
      .order('year',  { ascending: false })
      .order('month', { ascending: false })
      .limit(12)
    setHistory(data ?? [])
  }, [])

  // S1-007: boot com try/catch/finally
  async function boot() {
    setPageLoading(true)
    setLoadError(null)
    try {
      const [{ data: cardsData, error: cardsErr }, { data: accData }] = await Promise.all([
        supabase.from('credit_cards').select('*').eq('is_active', true).order('name'),
        supabase.from('accounts').select('id, name').order('name'),
      ])

      if (cardsErr) { setLoadError(cardsErr.message); return }

      setCards(cardsData ?? [])
      setAccounts(accData ?? [])
      if (cardsData && cardsData.length > 0) setSelectedCard(cardsData[0])
    } catch (e: any) {
      setLoadError(e?.message ?? 'Erro inesperado ao carregar dados.')
    } finally {
      setPageLoading(false)
    }
  }

  useEffect(() => { boot() }, [])

  useEffect(() => {
    if (!selectedCard) return
    setInvoiceState(INVOICE_IDLE)
    loadHistory(selectedCard.id)
    loadInvoicePeriod(selectedCard.id, viewMonth, viewYear)
  }, [selectedCard?.id, viewMonth, viewYear])

  function selectFromHistory(inv: Invoice) {
    setViewMonth(inv.month)
    setViewYear(inv.year)
  }

  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  async function handlePayInvoice() {
    const { invoice } = invoiceState
    if (!invoice || !payAccountId) { setPayError('Selecione a conta para pagamento.'); return }
    setPaying(true)
    setPayError(null)

    const { error: err } = await supabase
      .from('credit_card_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString(), paid_account_id: payAccountId })
      .eq('id', invoice.id)

    if (err) { setPayError(err.message); setPaying(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('transactions').insert({
        user_id:     user.id,
        account_id:  payAccountId,
        type:        'expense',
        amount:      invoiceState.computedTotal,
        description: `Pagamento fatura ${selectedCard?.name} ${MONTHS[invoice.month - 1]}/${invoice.year}`,
        date:        new Date().toISOString().split('T')[0],
        status:      'paid',
      })
    }

    setInvoiceState(prev => ({
      ...prev,
      invoice: prev.invoice ? { ...prev.invoice, status: 'paid', paid_account_id: payAccountId } : null,
    }))
    setHistory(prev => prev.map(h => h.id === invoice.id ? { ...h, status: 'paid' } : h))
    setShowPayModal(false)
    setPaying(false)
  }

  const { invoice, transactions, computedTotal, status: invStatus } = invoiceState
  const isLoading = invStatus === 'loading'
  const isEmpty   = invStatus === 'empty' || invStatus === 'idle'

  // S1-007: loading → skeleton | error → error state
  if (pageLoading) return <FaturasSkeleton />
  if (loadError)   return <FaturasError message={loadError} onRetry={boot} />

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">

      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</a>
          <h1 className="text-xl font-semibold mt-1">Faturas</h1>
        </div>
        <a href="/dashboard/cartoes" className="text-sm text-indigo-600 hover:underline">Gerenciar cartões →</a>
      </div>

      {/* S1-007: empty — sem cartões cadastrados */}
      {cards.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-4xl mb-3">💳</p>
          <p className="text-gray-400 text-sm">Nenhum cartão ativo.</p>
          <a href="/dashboard/cartoes" className="mt-3 text-indigo-600 text-sm hover:underline block">Cadastrar cartão</a>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Coluna esquerda */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Cartão</p>
              <div className="space-y-2">
                {cards.map(card => (
                  <button key={card.id} onClick={() => setSelectedCard(card)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      selectedCard?.id === card.id
                        ? 'bg-indigo-50 border border-indigo-200'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}>
                    <div className="w-8 h-6 rounded flex items-center justify-center text-white text-xs flex-shrink-0"
                      style={{ backgroundColor: card.color }}>💳</div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{card.name}</p>
                      <p className="text-xs text-gray-400">Limite {fmt(Number(card.limit_amount))}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Período</p>
              <div className="flex items-center justify-between">
                <button onClick={prevMonth} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors">‹</button>
                <span className="text-sm font-semibold text-gray-800">{MONTHS[viewMonth - 1]} {viewYear}</span>
                <button onClick={nextMonth} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors">›</button>
              </div>
            </div>

            {history.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Histórico</p>
                <div className="space-y-1">
                  {history.slice(0, 6).map(inv => (
                    <button key={inv.id} onClick={() => selectFromHistory(inv)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors text-left ${
                        invoice?.id === inv.id ? 'bg-indigo-50' : 'hover:bg-gray-50'
                      }`}>
                      <span className="text-xs text-gray-600">{MONTHS[inv.month - 1]}/{inv.year}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">{fmt(Number(inv.total_amount))}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[inv.status]}`}>
                          {STATUS_LABELS[inv.status]}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Coluna direita */}
          <div className="lg:col-span-2 space-y-4">

            <div className="rounded-xl p-5 text-white relative overflow-hidden"
              style={{ backgroundColor: selectedCard?.color ?? '#6366f1' }}>

              {isLoading && (
                <div className="absolute inset-0 bg-black/10 flex items-center justify-center rounded-xl">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-white/70 text-sm">💳 {selectedCard?.name}</p>
                  <p className="text-xl font-bold mt-1">{MONTHS[viewMonth - 1]} {viewYear}</p>
                </div>
                {invoice && (
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    invoice.status === 'paid'   ? 'bg-green-400/30 text-green-100' :
                    invoice.status === 'closed' ? 'bg-yellow-400/30 text-yellow-100' :
                    'bg-white/20 text-white'
                  }`}>
                    {STATUS_LABELS[invoice.status]}
                  </span>
                )}
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-white/70 text-xs">Total da fatura</p>
                  {isLoading ? (
                    <div className="h-9 w-36 bg-white/20 rounded-lg animate-pulse mt-1" />
                  ) : isEmpty ? (
                    <p className="text-2xl font-bold opacity-50">—</p>
                  ) : (
                    <p className="text-3xl font-bold">{fmt(computedTotal)}</p>
                  )}
                </div>
                {invoice?.due_date && !isLoading && (
                  <p className="text-white/70 text-sm">
                    Vence {new Date(invoice.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              {isLoading ? (
                <div className="h-10 flex-1 bg-gray-100 rounded-lg animate-pulse" />
              ) : isEmpty ? (
                <p className="text-sm text-gray-400 py-2">Nenhuma despesa registrada neste mês.</p>
              ) : (
                <>
                  {invoice && invoice.status !== 'paid' && invoice.status !== 'cancelled' && computedTotal > 0 && (
                    <button onClick={() => { setShowPayModal(true); setPayError(null) }}
                      className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700 transition-colors">
                      Pagar fatura
                    </button>
                  )}
                  {invoice?.status === 'paid' && (
                    <div className="flex-1 flex items-center gap-2 justify-center border border-green-200 bg-green-50 rounded-lg py-2.5 text-sm font-medium text-green-700">
                      ✅ Fatura paga
                    </div>
                  )}
                </>
              )}
            </div>

            {invStatus === 'loaded' && invoice && (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">
                    Lançamentos — {MONTHS[invoice.month - 1]}/{invoice.year}
                  </p>
                  <span className="text-xs text-gray-400">{transactions.length} item(ns)</span>
                </div>
                {transactions.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-gray-400 text-sm">Nenhum lançamento nesta fatura.</p>
                  </div>
                ) : (
                  <div>
                    {transactions.map((tx, i) => (
                      <div key={tx.id}
                        className={`flex items-center gap-4 px-5 py-3 ${i < transactions.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-sm flex-shrink-0">
                          {tx.category?.icon ?? '💸'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                          <p className="text-xs text-gray-400">
                            {new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                            {tx.category?.name ? ` · ${tx.category.name}` : ''}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-red-500 flex-shrink-0">-{fmt(Number(tx.amount))}</p>
                      </div>
                    ))}
                    <div className="px-5 py-3 bg-gray-50 flex justify-between items-center">
                      <p className="text-sm text-gray-500">Total</p>
                      <p className="text-sm font-bold text-gray-800">{fmt(computedTotal)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isLoading && (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50">
                  <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                </div>
                {[1,2,3].map(i => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50">
                    <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 bg-gray-100 rounded animate-pulse" />
                      <div className="h-3 w-1/3 bg-gray-100 rounded animate-pulse" />
                    </div>
                    <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal pagar fatura */}
      {showPayModal && invoice && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Pagar fatura</h2>
            <p className="text-sm text-gray-500 mb-5">
              {selectedCard?.name} · {MONTHS[invoice.month - 1]}/{invoice.year} ·{' '}
              <span className="font-semibold text-gray-700">{fmt(computedTotal)}</span>
            </p>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Débitar da conta</label>
              <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Selecione a conta</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {payError && <p className="text-sm text-red-500 mt-3">{payError}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPayModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handlePayInvoice} disabled={paying}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                {paying ? 'Processando...' : 'Confirmar pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
