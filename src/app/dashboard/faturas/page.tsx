'use client'

import { useEffect, useState } from 'react'
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

interface Account {
  id: string
  name: string
}

interface InvoiceTransaction {
  id: string
  description: string
  amount: number
  date: string
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  category?: any
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

export default function FaturasPage() {
  const supabase = createClient()

  const [cards,               setCards]               = useState<CreditCard[]>([])
  const [accounts,            setAccounts]            = useState<Account[]>([])
  const [selectedCard,        setSelectedCard]        = useState<CreditCard | null>(null)
  const [invoices,            setInvoices]            = useState<Invoice[]>([])
  const [selectedInvoice,     setSelectedInvoice]     = useState<Invoice | null>(null)
  const [invoiceTransactions, setInvoiceTransactions] = useState<InvoiceTransaction[]>([])
  const [loading,             setLoading]             = useState(true)
  const [loadingTx,           setLoadingTx]           = useState(false)
  const [paying,              setPaying]              = useState(false)
  const [payAccountId,        setPayAccountId]        = useState('')
  const [showPayModal,        setShowPayModal]        = useState(false)
  const [error,               setError]               = useState<string | null>(null)

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [viewYear,  setViewYear]  = useState(now.getFullYear())

  // ── carregamento inicial ────────────────────────────────────────────────────
  async function loadCards() {
    const [{ data: cardsData }, { data: accData }] = await Promise.all([
      supabase.from('credit_cards').select('*').eq('is_active', true).order('name'),
      supabase.from('accounts').select('id, name').order('name'),
    ])
    setCards(cardsData ?? [])
    setAccounts(accData ?? [])
    if (cardsData && cardsData.length > 0) setSelectedCard(cardsData[0])
    setLoading(false)
  }

  // Busca só faturas com lançamentos (total_amount > 0) para o histórico
  async function loadInvoices(cardId: string) {
    const { data } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('credit_card_id', cardId)
      .gt('total_amount', 0)
      .order('year',  { ascending: false })
      .order('month', { ascending: false })
    setInvoices(data ?? [])
    setSelectedInvoice(null)
    setInvoiceTransactions([])
  }

  async function loadInvoiceTransactions(invoiceId: string) {
    setLoadingTx(true)
    const { data } = await supabase
      .from('transactions')
      .select('id, description, amount, date, status, category:categories(name, icon)')
      .eq('invoice_id', invoiceId)
      .order('date', { ascending: false })
    setInvoiceTransactions(data ?? [])
    setLoadingTx(false)
  }

  // ── navegação de mês — só BUSCA, nunca cria ─────────────────────────────────
  // CORREÇÃO: trocado .single() por .maybeSingle() + filtro .gt('total_amount', 0)
  // Motivo: .single() lançava erro quando havia fatura zerada (total_amount=0),
  // fazendo data ficar null e apagando a fatura real da tela.
  async function loadCurrentMonthInvoice(cardId: string, month: number, year: number) {
    const { data } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('credit_card_id', cardId)
      .eq('month', month)
      .eq('year',  year)
      .gt('total_amount', 0)
      .order('total_amount', { ascending: false })
      .maybeSingle()

    if (!data) {
      setSelectedInvoice(null)
      setInvoiceTransactions([])
    } else {
      setSelectedInvoice(data)
      loadInvoiceTransactions(data.id)
    }
  }

  // ── pagar fatura ────────────────────────────────────────────────────────────
  async function handlePayInvoice() {
    if (!selectedInvoice || !payAccountId) { setError('Selecione a conta para pagamento.'); return }
    setPaying(true)
    setError(null)

    const { error: err } = await supabase
      .from('credit_card_invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString(), paid_account_id: payAccountId })
      .eq('id', selectedInvoice.id)

    if (err) { setError(err.message); setPaying(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('transactions').insert({
        user_id:     user.id,
        account_id:  payAccountId,
        type:        'expense',
        amount:      selectedInvoice.total_amount,
        description: `Pagamento fatura ${selectedCard?.name} ${MONTHS[selectedInvoice.month - 1]}/${selectedInvoice.year}`,
        date:        new Date().toISOString().split('T')[0],
        status:      'paid',
      })
    }

    await loadInvoices(selectedCard!.id)
    setSelectedInvoice(prev => prev ? { ...prev, status: 'paid', paid_account_id: payAccountId } : null)
    setShowPayModal(false)
    setPaying(false)
  }

  // ── effects ─────────────────────────────────────────────────────────────────
  useEffect(() => { loadCards() }, [])

  // CORREÇÃO: os dois useEffects anteriores (selectedCard e viewMonth/viewYear)
  // foram unificados em um só. selectedCard?.id evita loop infinito de re-render.
  useEffect(() => {
    if (selectedCard) {
      loadInvoices(selectedCard.id)
      loadCurrentMonthInvoice(selectedCard.id, viewMonth, viewYear)
    }
  }, [selectedCard?.id, viewMonth, viewYear])

  // ── helpers de navegação ────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</a>
          <h1 className="text-xl font-semibold mt-1">Faturas</h1>
        </div>
        <a href="/dashboard/cartoes" className="text-sm text-indigo-600 hover:underline">Gerenciar cartões →</a>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : cards.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-4xl mb-3">💳</p>
          <p className="text-gray-400 text-sm">Nenhum cartão ativo.</p>
          <a href="/dashboard/cartoes" className="mt-3 text-indigo-600 text-sm hover:underline block">Cadastrar cartão</a>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Esquerda */}
          <div className="space-y-4">
            {/* Seletor de cartão */}
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Cartão</p>
              <div className="space-y-2">
                {cards.map(card => (
                  <button key={card.id} onClick={() => setSelectedCard(card)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      selectedCard?.id === card.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
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

            {/* Navegação mês */}
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Período</p>
              <div className="flex items-center justify-between">
                <button onClick={prevMonth} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors">‹</button>
                <span className="text-sm font-semibold text-gray-800">{MONTHS[viewMonth - 1]} {viewYear}</span>
                <button onClick={nextMonth} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors">›</button>
              </div>
            </div>

            {/* Histórico — só faturas com valor */}
            {invoices.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Histórico</p>
                <div className="space-y-1">
                  {invoices.slice(0, 6).map(inv => (
                    <button key={inv.id}
                      onClick={() => {
                        setViewMonth(inv.month)
                        setViewYear(inv.year)
                        setSelectedInvoice(inv)
                        loadInvoiceTransactions(inv.id)
                      }}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left">
                      <span className="text-xs text-gray-600">{MONTHS[inv.month - 1]}/{inv.year}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">{fmt(Number(inv.total_amount))}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[inv.status]}`}>{STATUS_LABELS[inv.status]}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Direita */}
          <div className="lg:col-span-2 space-y-4">
            {/* Card da fatura */}
            <div className="rounded-xl p-5 text-white" style={{ backgroundColor: selectedCard?.color ?? '#6366f1' }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-white/70 text-sm">💳 {selectedCard?.name}</p>
                  <p className="text-xl font-bold mt-1">{MONTHS[viewMonth - 1]} {viewYear}</p>
                </div>
                {selectedInvoice && (
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    selectedInvoice.status === 'paid'   ? 'bg-green-400/30 text-green-100' :
                    selectedInvoice.status === 'closed' ? 'bg-yellow-400/30 text-yellow-100' :
                    'bg-white/20 text-white'
                  }`}>
                    {STATUS_LABELS[selectedInvoice.status]}
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-white/70 text-xs">Total da fatura</p>
                  <p className="text-3xl font-bold">{fmt(Number(selectedInvoice?.total_amount ?? 0))}</p>
                </div>
                {selectedInvoice && (
                  <p className="text-white/70 text-sm">Vence {selectedInvoice.due_date}</p>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-3">
              {selectedInvoice ? (
                <>
                  <button
                    onClick={() => loadInvoiceTransactions(selectedInvoice.id)}
                    className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors">
                    Ver lançamentos
                  </button>
                  {selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'cancelled' && Number(selectedInvoice.total_amount) > 0 && (
                    <button onClick={() => { setShowPayModal(true); setError(null) }}
                      className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700 transition-colors">
                      Pagar fatura
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 py-2">Nenhuma despesa registrada neste mês.</p>
              )}
            </div>

            {/* Lançamentos */}
            {selectedInvoice && (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50">
                  <p className="text-sm font-medium text-gray-700">
                    Lançamentos — {MONTHS[selectedInvoice.month - 1]}/{selectedInvoice.year}
                  </p>
                </div>
                {loadingTx ? (
                  <p className="text-gray-400 text-sm p-5">Carregando...</p>
                ) : invoiceTransactions.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-gray-400 text-sm">Nenhum lançamento nesta fatura.</p>
                  </div>
                ) : (
                  <div>
                    {invoiceTransactions.map((tx, i) => (
                      <div key={tx.id}
                        className={`flex items-center gap-4 px-5 py-3 ${i < invoiceTransactions.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-sm flex-shrink-0">
                          {tx.category?.icon ?? '💸'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{tx.description}</p>
                          <p className="text-xs text-gray-400">
                            {tx.date}{tx.category?.name ? ` · ${tx.category.name}` : ''}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-red-500 flex-shrink-0">
                          -{fmt(Number(tx.amount))}
                        </p>
                      </div>
                    ))}
                    <div className="px-5 py-3 bg-gray-50 flex justify-between items-center">
                      <p className="text-sm text-gray-500">Total</p>
                      <p className="text-sm font-bold text-gray-800">
                        {fmt(invoiceTransactions.reduce((s, t) => s + Number(t.amount), 0))}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal pagar */}
      {showPayModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Pagar fatura</h2>
            <p className="text-sm text-gray-500 mb-5">
              {selectedCard?.name} · {MONTHS[selectedInvoice.month - 1]}/{selectedInvoice.year} ·{' '}
              <span className="font-semibold text-gray-700">{fmt(Number(selectedInvoice.total_amount))}</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Débitar da conta</label>
                <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Selecione a conta</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
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
