'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { AppModal } from '@/components/AppModal'
import {
  CreditCard,
  CaretLeft,
  CaretRight,
  Warning,
  ArrowsClockwise,
  CheckCircle,
} from '@phosphor-icons/react'

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

// FIX: STATUS_STYLE com rgba + CSS vars — substitui STATUS_COLORS Tailwind hardcoded
// Motivo: classes como bg-blue-100 text-blue-700 não funcionam em dark/arcade
const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  open:      { background: 'rgba(59,130,246,0.12)',  color: 'var(--info,    #3b82f6)' },
  closed:    { background: 'rgba(234,179,8,0.12)',   color: 'var(--warning, #ca8a04)' },
  paid:      { background: 'rgba(34,197,94,0.12)',   color: 'var(--success, #16a34a)' },
  cancelled: { background: 'rgba(107,114,128,0.12)', color: 'var(--text-secondary, #6b7280)' },
}

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </p>
  )
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.cancelled
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full font-medium"
      style={style}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function Divider() {
  return <div style={{ borderBottom: '1px solid var(--glass-border)' }} />
}

function SkeletonPulse({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ background: 'rgba(var(--primary-rgb, 124,58,237), 0.08)' }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────
function FaturasSkeleton() {
  return (
    <PageContainer>
      <div className="space-y-4">
        <SkeletonPulse className="h-8 w-24" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <SkeletonPulse className="h-40" />
            <SkeletonPulse className="h-24" />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <SkeletonPulse className="h-36" />
            <SkeletonPulse className="h-48" />
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────
function FaturasError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <PageContainer>
      <PageHeader title="Faturas" />
      <div
        className="rounded-xl p-10 text-center"
        style={{
          background:    'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          border:        '1px solid rgba(var(--danger-rgb, 239,68,68), 0.3)',
          borderStyle:   'dashed',
        }}
      >
        <Warning size={32} weight="duotone" style={{ color: 'var(--danger)' }} className="mx-auto mb-2" />
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          Erro ao carregar faturas
        </p>
        <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>
          {message ?? 'Não foi possível buscar os dados. Verifique sua conexão.'}
        </p>
        <button
          onClick={onRetry}
          className="text-sm font-medium hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          Tentar novamente
        </button>
      </div>
    </PageContainer>
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

  const [pageLoading,  setPageLoading]  = useState(true)
  const [loadError,    setLoadError]    = useState<string | null>(null)

  const [invoiceState, setInvoiceState] = useState<InvoiceState>(INVOICE_IDLE)

  const [showPayModal, setShowPayModal] = useState(false)
  const [payAccountId, setPayAccountId] = useState('')
  const [paying,       setPaying]       = useState(false)
  const [payError,     setPayError]     = useState<string | null>(null)

  // Hover state para itens de cartão e histórico
  const [hoveredCard,    setHoveredCard]    = useState<string | null>(null)
  const [hoveredHistory, setHoveredHistory] = useState<string | null>(null)

  // FIX FIN-003: loadSeq agora cobre tanto loadInvoicePeriod quanto loadHistory
  const loadSeq = useRef(0)

  const loadInvoicePeriod = useCallback(async (
    cardId: string,
    month: number,
    year: number,
    seq: number,   // recebe seq externamente para participar do mesmo controle
  ) => {
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

    // FIX FIN-001: .is('deleted_at', null) obrigatório — sem esse filtro transações
    // soft-deleted inflam computedTotal e o valor errado vai para o pagamento (irreversível)
    const { data: txData } = await supabase
      .from('transactions')
      .select('id, description, amount, date, status, category:categories(name, icon)')
      .eq('invoice_id', invData.id)
      .is('deleted_at', null)            // ← FIN-001
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

  // FIX FIN-003: loadHistory recebe seq e abandona resposta obsoleta
  const loadHistory = useCallback(async (cardId: string, seq: number) => {
    const { data } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('credit_card_id', cardId)
      .gt('total_amount', 0)
      .order('year',  { ascending: false })
      .order('month', { ascending: false })
      .limit(12)

    if (seq !== loadSeq.current) return   // ← FIN-003: descarta resposta se cartão mudou
    setHistory(data ?? [])
  }, [])

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

  // FIX FIN-003: incrementa seq uma única vez e passa para ambas as funções
  useEffect(() => {
    if (!selectedCard) return
    setInvoiceState(INVOICE_IDLE)
    const seq = ++loadSeq.current
    loadHistory(selectedCard.id, seq)
    loadInvoicePeriod(selectedCard.id, viewMonth, viewYear, seq)
  }, [selectedCard?.id, viewMonth, viewYear])

  // FIX FIN-006: guard — só navega se a fatura pertence ao cartão selecionado
  function selectFromHistory(inv: Invoice) {
    if (inv.credit_card_id !== selectedCard?.id) return  // ← FIN-006
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
        // computedTotal agora é confiável pois FIN-001 garante que deleted são excluídos
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

  if (pageLoading) return <FaturasSkeleton />
  if (loadError)   return <FaturasError message={loadError} onRetry={boot} />

  return (
    <PageContainer>
      <PageHeader
        title="Faturas"
        action={
          <a
            href="/dashboard/cartoes"
            className="text-sm hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Gerenciar cartões →
          </a>
        }
      />

      {cards.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{
            background:          'var(--glass-bg)',
            backdropFilter:      'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            border:              '1px dashed var(--glass-border)',
            borderRadius:        '0.75rem',
          }}
        >
          <CreditCard size={40} weight="duotone" className="mx-auto mb-3" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum cartão ativo.</p>
          <a
            href="/dashboard/cartoes"
            className="mt-3 text-sm hover:underline block"
            style={{ color: 'var(--primary)' }}
          >
            Cadastrar cartão
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Coluna esquerda ── */}
          <div className="space-y-4">

            {/* Seletor de cartão */}
            <div
              className="rounded-xl p-4"
              style={{
                background:          'var(--glass-bg)',
                backdropFilter:      'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                border:              '1px solid var(--glass-border)',
                borderRadius:        '0.75rem',
              }}
            >
              <SectionLabel>Cartão</SectionLabel>
              <div className="space-y-2">
                {cards.map(card => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    onMouseEnter={() => setHoveredCard(card.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                    style={{
                      border: selectedCard?.id === card.id
                        ? '1px solid var(--glass-hover-border)'
                        : `1px solid ${hoveredCard === card.id ? 'var(--glass-hover-border)' : 'transparent'}`,
                      background: selectedCard?.id === card.id
                        ? 'rgba(var(--primary-rgb, 124,58,237), 0.08)'
                        : 'transparent',
                    }}
                  >
                    <div
                      className="w-8 h-6 rounded flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: card.color }}
                    >
                      <CreditCard size={14} weight="duotone" className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{card.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Limite {fmt(Number(card.limit_amount))}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Seletor de período */}
            <div
              className="rounded-xl p-4"
              style={{
                background:          'var(--glass-bg)',
                backdropFilter:      'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                border:              '1px solid var(--glass-border)',
                borderRadius:        '0.75rem',
              }}
            >
              <SectionLabel>Período</SectionLabel>
              <div className="flex items-center justify-between">
                <button
                  onClick={prevMonth}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--primary-rgb, 124,58,237), 0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <CaretLeft size={16} weight="bold" />
                </button>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {MONTHS[viewMonth - 1]} {viewYear}
                </span>
                <button
                  onClick={nextMonth}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--primary-rgb, 124,58,237), 0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <CaretRight size={16} weight="bold" />
                </button>
              </div>
            </div>

            {/* Histórico */}
            {history.length > 0 && (
              <div
                className="rounded-xl p-4"
                style={{
                  background:          'var(--glass-bg)',
                  backdropFilter:      'blur(var(--glass-blur))',
                  WebkitBackdropFilter: 'blur(var(--glass-blur))',
                  border:              '1px solid var(--glass-border)',
                  borderRadius:        '0.75rem',
                }}
              >
                <SectionLabel>Histórico</SectionLabel>
                <div className="space-y-1">
                  {history.slice(0, 6).map(inv => (
                    <button
                      key={inv.id}
                      onClick={() => selectFromHistory(inv)}
                      onMouseEnter={() => setHoveredHistory(inv.id)}
                      onMouseLeave={() => setHoveredHistory(null)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors text-left"
                      style={{
                        background: invoice?.id === inv.id
                          ? 'rgba(var(--primary-rgb, 124,58,237), 0.08)'
                          : hoveredHistory === inv.id
                            ? 'rgba(var(--primary-rgb, 124,58,237), 0.05)'
                            : 'transparent',
                      }}
                    >
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {MONTHS[inv.month - 1]}/{inv.year}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {fmt(Number(inv.total_amount))}
                        </span>
                        <StatusBadge status={inv.status} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Coluna direita ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Hero card do cartão */}
            <div
              className="rounded-xl p-5 text-white relative overflow-hidden"
              style={{ backgroundColor: selectedCard?.color ?? '#7C3AED' }}
            >
              {isLoading && (
                <div className="absolute inset-0 bg-black/10 flex items-center justify-center rounded-xl">
                  <ArrowsClockwise size={24} weight="duotone" className="text-white/70 animate-spin" />
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={14} weight="duotone" className="text-white/70" />
                    <p className="text-white/70 text-sm">{selectedCard?.name}</p>
                  </div>
                  <p className="text-xl font-bold mt-1">{MONTHS[viewMonth - 1]} {viewYear}</p>
                </div>
                {invoice && (
                  <span
                    className="text-xs px-2 py-1 rounded-full font-medium"
                    style={{
                      background: invoice.status === 'paid'   ? 'rgba(52,211,153,0.25)' :
                                  invoice.status === 'closed' ? 'rgba(251,191,36,0.25)' :
                                  'rgba(255,255,255,0.15)',
                      color: invoice.status === 'paid'   ? '#d1fae5' :
                             invoice.status === 'closed' ? '#fef3c7' :
                             'white',
                    }}
                  >
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

            {/* Botões de ação */}
            <div className="flex gap-3">
              {isLoading ? (
                <SkeletonPulse className="h-10 flex-1" />
              ) : isEmpty ? (
                <p className="text-sm py-2" style={{ color: 'var(--text-secondary)' }}>
                  Nenhuma despesa registrada neste mês.
                </p>
              ) : (
                <>
                  {invoice && invoice.status !== 'paid' && invoice.status !== 'cancelled' && computedTotal > 0 && (
                    <button
                      onClick={() => { setShowPayModal(true); setPayAccountId(''); setPayError(null) }}
                      className="flex-1 rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                      style={{ background: 'var(--success, #16a34a)' }}
                    >
                      Pagar fatura
                    </button>
                  )}
                  {invoice?.status === 'paid' && (
                    <div
                      className="flex-1 flex items-center gap-2 justify-center rounded-lg py-2.5 text-sm font-medium"
                      style={{
                        border:     '1px solid rgba(34,197,94,0.3)',
                        background: 'rgba(34,197,94,0.08)',
                        color:      'var(--success, #16a34a)',
                      }}
                    >
                      <CheckCircle size={16} weight="duotone" />
                      Fatura paga
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Lista de lançamentos */}
            {invStatus === 'loaded' && invoice && (
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background:          'var(--glass-bg)',
                  backdropFilter:      'blur(var(--glass-blur))',
                  WebkitBackdropFilter: 'blur(var(--glass-blur))',
                  border:              '1px solid var(--glass-border)',
                }}
              >
                <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Lançamentos — {MONTHS[invoice.month - 1]}/{invoice.year}
                  </p>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {transactions.length} item(ns)
                  </span>
                </div>

                {transactions.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Nenhum lançamento nesta fatura.
                    </p>
                  </div>
                ) : (
                  <div>
                    {transactions.map((tx, i) => (
                      <div key={tx.id}>
                        <div className="flex items-center gap-4 px-5 py-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                            style={{ background: 'rgba(var(--danger-rgb, 239,68,68), 0.1)' }}
                          >
                            {tx.category?.icon ?? ''}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {tx.description}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                              {tx.category?.name ? ` · ${tx.category.name}` : ''}
                            </p>
                          </div>
                          <p className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--danger)' }}>
                            -{fmt(Number(tx.amount))}
                          </p>
                        </div>
                        {i < transactions.length - 1 && <Divider />}
                      </div>
                    ))}

                    <div
                      className="px-5 py-3 flex justify-between items-center"
                      style={{ background: 'rgba(var(--primary-rgb, 124,58,237), 0.05)', borderTop: '1px solid var(--glass-border)' }}
                    >
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total</p>
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(computedTotal)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Skeleton da lista */}
            {isLoading && (
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background:          'var(--glass-bg)',
                  backdropFilter:      'blur(var(--glass-blur))',
                  WebkitBackdropFilter: 'blur(var(--glass-blur))',
                  border:              '1px solid var(--glass-border)',
                }}
              >
                <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <SkeletonPulse className="h-4 w-40" />
                </div>
                {[1, 2, 3].map(i => (
                  <div key={i}>
                    <div className="flex items-center gap-4 px-5 py-3">
                      <SkeletonPulse className="w-8 h-8 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <SkeletonPulse className="h-3 w-3/4" />
                        <SkeletonPulse className="h-3 w-1/3" />
                      </div>
                      <SkeletonPulse className="h-3 w-16" />
                    </div>
                    {i < 3 && <Divider />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal pagar fatura ── */}
      <AppModal
        open={showPayModal && !!invoice}
        onClose={() => setShowPayModal(false)}
        title="Pagar fatura"
        size="sm"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setShowPayModal(false)}
              className="flex-1 rounded-lg py-2 text-sm transition-colors hover:opacity-80"
              style={{
                border:     '1px solid var(--glass-border)',
                color:      'var(--text-secondary)',
                background: 'transparent',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handlePayInvoice}
              disabled={paying}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--success, #16a34a)' }}
            >
              {paying ? 'Processando...' : 'Confirmar pagamento'}
            </button>
          </AppModal.Footer>
        }
      >
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
          {selectedCard?.name} · {invoice ? `${MONTHS[invoice.month - 1]}/${invoice.year}` : ''} ·{' '}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {fmt(computedTotal)}
          </span>
        </p>

        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Débitar da conta
          </label>
          <select
            value={payAccountId}
            onChange={e => setPayAccountId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background: 'var(--glass-bg)',
              color:      'var(--text-primary)',
              border:     '1px solid var(--glass-border)',
            }}
            onFocus={e  => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e   => (e.target.style.borderColor = 'var(--glass-border)')}
          >
            <option value="">Selecione a conta</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {payError && (
          <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>
            {payError}
          </p>
        )}
      </AppModal>
    </PageContainer>
  )
}
