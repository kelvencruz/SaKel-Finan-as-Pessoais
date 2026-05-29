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
  Clock,
  Scales,
} from '@phosphor-icons/react'
import {
  projectForecast,
  buildExistingRecurrenceSet,
  getCurrentMonthKey,
  type ForecastItem,
  type RecurrenceForForecast,
} from '@/lib/financialEngine'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CreditCardType {
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
  recurrence_id: string | null
  competencia: string | null
  category?: { name: string; icon: string } | null
}

interface InvoiceState {
  status: 'idle' | 'loading' | 'loaded' | 'empty'
  invoice: Invoice | null
  transactions: InvoiceTransaction[]
  forecastItems: ForecastItem[]
  computedTotal: number
}

const INVOICE_IDLE: InvoiceState = {
  status: 'idle',
  invoice: null,
  transactions: [],
  forecastItems: [],
  computedTotal: 0,
}

const STATUS_LABELS: Record<string, string> = {
  open:      'Aberta',
  closed:    'Fechada',
  paid:      'Paga',
  cancelled: 'Cancelada',
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  open:      { background: 'rgba(59,130,246,0.12)',  color: 'var(--info,    #3b82f6)' },
  closed:    { background: 'rgba(234,179,8,0.12)',   color: 'var(--warning, #ca8a04)' },
  paid:      { background: 'rgba(34,197,94,0.12)',   color: 'var(--success, #16a34a)' },
  cancelled: { background: 'rgba(107,114,128,0.12)', color: 'var(--text-secondary, #6b7280)' },
}

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function isFutureCompetencia(year: number, month: number): boolean {
  const current = getCurrentMonthKey()
  const target  = `${year}-${String(month).padStart(2, '0')}`
  return target > current
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={style}>
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

function FaturasError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <PageContainer>
      <PageHeader title="Faturas" />
      <div
        className="rounded-xl p-10 text-center"
        style={{
          background:           'var(--glass-bg)',
          backdropFilter:       'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          border:               '1px solid rgba(var(--danger-rgb, 239,68,68), 0.3)',
          borderStyle:          'dashed',
        }}
      >
        <Warning size={32} weight="duotone" style={{ color: 'var(--danger)' }} className="mx-auto mb-2" />
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          Erro ao carregar faturas
        </p>
        <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>
          {message ?? 'Não foi possível buscar os dados. Verifique sua conexão.'}
        </p>
        <button onClick={onRetry} className="text-sm font-medium hover:underline" style={{ color: 'var(--primary)' }}>
          Tentar novamente
        </button>
      </div>
    </PageContainer>
  )
}

function RecorrenteBadge() {
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
      style={{
        background: 'rgba(var(--primary-rgb, 124,58,237), 0.08)',
        color:      'var(--primary)',
        border:     '1px solid rgba(var(--primary-rgb, 124,58,237), 0.2)',
      }}
    >
      Recorrente
    </span>
  )
}

// ─── Bloco de Reconciliação ───────────────────────────────────────────────────
// Princípios:
//   - computedTotal = ledger factual (LEDGER_STATUSES) — forecast não entra
//   - valorInformado = estado local/localStorage — não é dado financeiro canônico
//   - divergência = valorInformado - computedTotal — derivado em runtime, nunca persistido
//   - fatura cancelled → bloco não renderiza
//   - fatura futura → bloco não renderiza (reconciliar previsão é conceitualmente errado)
//   - fatura open → modo "parcial" com aviso discreto

interface ReconciliacaoBlockProps {
  invoice:       Invoice
  computedTotal: number
  storageKey:    string
}

function ReconciliacaoBlock({ invoice, computedTotal, storageKey }: ReconciliacaoBlockProps) {
  const [rawValue,  setRawValue]  = useState('')
  const [isFocused, setIsFocused] = useState(false)

  // Lê localStorage ao montar / quando chave muda
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      setRawValue(saved ?? '')
    } catch {
      setRawValue('')
    }
  }, [storageKey])

  // Persiste no localStorage ao digitar
  useEffect(() => {
    try {
      if (rawValue.trim()) {
        localStorage.setItem(storageKey, rawValue)
      } else {
        localStorage.removeItem(storageKey)
      }
    } catch { /* localStorage pode estar bloqueado */ }
  }, [rawValue, storageKey])

  const valorInformado = parseFloat(rawValue.replace(',', '.')) || 0
  const temValor       = valorInformado > 0
  const divergencia    = temValor ? valorInformado - computedTotal : null
  const conciliado     = divergencia !== null && Math.abs(divergencia) < 0.01
  const isOpen         = invoice.status === 'open'

  // Badge semântica por estado
  type BadgeVariant = 'conciliado' | 'divergencia' | 'parcial_ok' | 'parcial_dif' | 'aguardando'
  let badge: BadgeVariant = 'aguardando'
  if (temValor) {
    if (isOpen)      badge = conciliado ? 'parcial_ok'  : 'parcial_dif'
    else             badge = conciliado ? 'conciliado'  : 'divergencia'
  }

  const BADGE_CONFIG: Record<BadgeVariant, { label: string; background: string; color: string; border: string }> = {
    conciliado:  { label: '✓ Conciliada',         background: 'rgba(34,197,94,0.08)',   color: 'var(--success, #16a34a)', border: '1px solid rgba(34,197,94,0.2)'   },
    divergencia: { label: '⚠ Divergência',         background: 'rgba(239,68,68,0.08)',   color: 'var(--danger, #dc2626)',  border: '1px solid rgba(239,68,68,0.2)'   },
    parcial_ok:  { label: '✓ Parcial conciliada',  background: 'rgba(59,130,246,0.08)',  color: 'var(--info, #3b82f6)',    border: '1px solid rgba(59,130,246,0.2)'  },
    parcial_dif: { label: '⚠ Diferença parcial',   background: 'rgba(234,179,8,0.08)',   color: 'var(--warning, #ca8a04)', border: '1px solid rgba(234,179,8,0.2)'   },
    aguardando:  { label: '— Aguardando valor',    background: 'rgba(107,114,128,0.08)', color: 'var(--text-secondary)',   border: '1px solid rgba(107,114,128,0.15)' },
  }
  const badgeCfg = BADGE_CONFIG[badge]

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background:           'var(--glass-bg)',
        backdropFilter:       'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        border:               '1px solid var(--glass-border)',
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <div className="flex items-center gap-2">
          <Scales size={14} weight="duotone" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Reconciliação
          </p>
        </div>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: badgeCfg.background, color: badgeCfg.color, border: badgeCfg.border }}
        >
          {badgeCfg.label}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">

        {/* Aviso discreto para fatura aberta */}
        {isOpen && (
          <div
            className="flex items-start gap-2 rounded-lg px-3 py-2"
            style={{
              background: 'rgba(59,130,246,0.06)',
              border:     '1px solid rgba(59,130,246,0.12)',
            }}
          >
            <Clock size={12} weight="duotone" style={{ color: 'var(--info, #3b82f6)', marginTop: 1, flexShrink: 0 }} />
            <p className="text-[11px]" style={{ color: 'var(--info, #3b82f6)' }}>
              Fatura aberta — novos lançamentos podem alterar o total do Sakel.
            </p>
          </div>
        )}

        {/* Linha: Total Sakel */}
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Sakel</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {fmt(computedTotal)}
          </p>
        </div>

        {/* Linha: Valor da fatura real (input) */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm shrink-0" style={{ color: 'var(--text-secondary)' }}>
            Valor do banco
          </p>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
              style={{ color: isFocused ? 'var(--primary)' : 'var(--text-secondary)' }}
            >
              R$
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={rawValue}
              onChange={e => setRawValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="0,00"
              className="w-36 pl-9 pr-3 py-1.5 rounded-lg text-sm text-right focus:outline-none"
              style={{
                background:   'var(--glass-bg)',
                color:        'var(--text-primary)',
                border:       `1px solid ${isFocused ? 'var(--primary)' : 'var(--glass-border)'}`,
                boxShadow:    isFocused ? '0 0 0 2px rgba(var(--primary-rgb, 124,58,237), 0.12)' : 'none',
                transition:   'border-color 0.15s, box-shadow 0.15s',
              }}
            />
          </div>
        </div>

        {/* Divider sutil */}
        <div style={{ borderTop: '1px solid var(--glass-border)' }} />

        {/* Linha: Divergência */}
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Divergência</p>
          {!temValor ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)', opacity: 0.4 }}>—</p>
          ) : conciliado ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle size={14} weight="duotone" style={{ color: 'var(--success, #16a34a)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--success, #16a34a)' }}>
                Nenhuma
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Warning size={14} weight="duotone" style={{ color: divergencia! > 0 ? 'var(--warning, #ca8a04)' : 'var(--danger, #dc2626)' }} />
              <p
                className="text-sm font-semibold"
                style={{ color: divergencia! > 0 ? 'var(--warning, #ca8a04)' : 'var(--danger, #dc2626)' }}
              >
                {divergencia! > 0 ? '+' : ''}{fmt(divergencia!)}
              </p>
            </div>
          )}
        </div>

        {/* Nota explicativa quando há divergência */}
        {temValor && !conciliado && divergencia !== null && (
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
            {divergencia > 0
              ? 'O banco registra mais do que o Sakel. Verifique lançamentos faltantes.'
              : 'O Sakel registra mais do que o banco. Verifique duplicidades ou cancelamentos.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FaturasPage() {
  const supabase = createClient()

  const [cards,        setCards]        = useState<CreditCardType[]>([])
  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [selectedCard, setSelectedCard] = useState<CreditCardType | null>(null)
  const [history,      setHistory]      = useState<Invoice[]>([])
  const [viewMonth,    setViewMonth]    = useState(() => new Date().getMonth() + 1)
  const [viewYear,     setViewYear]     = useState(() => new Date().getFullYear())

  const [pageLoading, setPageLoading] = useState(true)
  const [loadError,   setLoadError]   = useState<string | null>(null)

  const [invoiceState, setInvoiceState] = useState<InvoiceState>(INVOICE_IDLE)

  const [showPayModal, setShowPayModal] = useState(false)
  const [payAccountId, setPayAccountId] = useState('')
  const [paying,       setPaying]       = useState(false)
  const [payError,     setPayError]     = useState<string | null>(null)

  const [hoveredCard,    setHoveredCard]    = useState<string | null>(null)
  const [hoveredHistory, setHoveredHistory] = useState<string | null>(null)

  const loadSeq = useRef(0)

  // ─── Carrega fatura + forecast ────────────────────────────────────────────

  const loadInvoicePeriod = useCallback(async (
    card:  CreditCardType,
    month: number,
    year:  number,
    seq:   number,
  ) => {
    setInvoiceState(prev => ({ ...prev, status: 'loading' }))

    const isFuture = isFutureCompetencia(year, month)

    const { data: invData } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('credit_card_id', card.id)
      .eq('month', month)
      .eq('year', year)
      .gt('total_amount', 0)
      .order('total_amount', { ascending: false })
      .maybeSingle()

    if (seq !== loadSeq.current) return

    let transactions: InvoiceTransaction[] = []
    if (invData) {
      const { data: txData } = await supabase
        .from('transactions')
        .select('id, description, amount, date, status, recurrence_id, competencia, category:categories(name, icon)')
        .eq('invoice_id', invData.id)
        .is('deleted_at', null)
        .order('date', { ascending: false })

      if (seq !== loadSeq.current) return

      transactions = (txData ?? []).map((tx: any) => ({
        ...tx,
        category: Array.isArray(tx.category) ? (tx.category[0] ?? null) : tx.category,
      }))
    }

    // ── Forecast layer — só para faturas futuras não fechadas ─────────────────
    let forecastItems: ForecastItem[] = []

    const invoiceStatus = invData?.status
    const isClosed = invoiceStatus === 'closed' || invoiceStatus === 'paid' || invoiceStatus === 'cancelled'

    if (isFuture && !isClosed) {
      const { data: recData } = await supabase
        .from('recurrences')
        .select('id, description, amount, type, frequency, next_due_date, end_date, credit_card_id, category_id, is_active')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
        .eq('is_active', true)
        .eq('credit_card_id', card.id)

      if (seq !== loadSeq.current) return

      const recurrences = (recData ?? []) as RecurrenceForForecast[]
      const existing    = buildExistingRecurrenceSet(transactions)
      const competencia = `${year}-${String(month).padStart(2, '0')}`
      forecastItems     = projectForecast(recurrences, [competencia], existing)
    }

    if (seq !== loadSeq.current) return

    // computedTotal NUNCA inclui forecast — princípio contábil inviolável
    const computedTotal = transactions.reduce((s, t) => s + Number(t.amount), 0)

    if (!invData && forecastItems.length === 0) {
      setInvoiceState({ status: 'empty', invoice: null, transactions: [], forecastItems: [], computedTotal: 0 })
      return
    }

    if (!invData && forecastItems.length > 0) {
      setInvoiceState({ status: 'loaded', invoice: null, transactions: [], forecastItems, computedTotal: 0 })
      return
    }

    setInvoiceState({
      status:        'loaded',
      invoice:       invData,
      transactions,
      forecastItems,
      computedTotal: computedTotal > 0 ? computedTotal : Number(invData!.total_amount),
    })
  }, [])

  const loadHistory = useCallback(async (cardId: string, seq: number) => {
    const { data } = await supabase
      .from('credit_card_invoices')
      .select('*')
      .eq('credit_card_id', cardId)
      .gt('total_amount', 0)
      .order('year',  { ascending: false })
      .order('month', { ascending: false })
      .limit(12)

    if (seq !== loadSeq.current) return
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

  useEffect(() => {
    if (!selectedCard) return
    setInvoiceState(INVOICE_IDLE)
    const seq = ++loadSeq.current
    loadHistory(selectedCard.id, seq)
    loadInvoicePeriod(selectedCard, viewMonth, viewYear, seq)
  }, [selectedCard?.id, viewMonth, viewYear])

  function selectFromHistory(inv: Invoice) {
    if (inv.credit_card_id !== selectedCard?.id) return
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
      invoice:       prev.invoice ? { ...prev.invoice, status: 'paid', paid_account_id: payAccountId } : null,
      forecastItems: [],
    }))
    setHistory(prev => prev.map(h => h.id === invoice.id ? { ...h, status: 'paid' } : h))
    setShowPayModal(false)
    setPaying(false)
  }

  const { invoice, transactions, forecastItems, computedTotal, status: invStatus } = invoiceState
  const isLoading   = invStatus === 'loading'
  const isEmpty     = invStatus === 'empty' || invStatus === 'idle'
  const hasForecast = forecastItems.length > 0
  const isFuture    = isFutureCompetencia(viewYear, viewMonth)

  // Totais derivados
  const forecastTotal = forecastItems.reduce((s, f) => s + f.amount, 0)
  const expectedTotal = computedTotal + forecastTotal

  // Chave de reconciliação — por cartão + competência (não por invoice id, para persistir entre reloads)
  const reconStorageKey = selectedCard
    ? `reconciliacao:${selectedCard.id}:${viewYear}-${String(viewMonth).padStart(2, '0')}`
    : ''

  // Condição para mostrar bloco de reconciliação:
  //   - invoice existe (fatura real)
  //   - não é futura (reconciliar previsão é conceitualmente errado)
  //   - não está cancelada
  const showReconciliacao = !!(
    invoice &&
    !isFuture &&
    invoice.status !== 'cancelled' &&
    invStatus === 'loaded'
  )

  if (pageLoading) return <FaturasSkeleton />
  if (loadError)   return <FaturasError message={loadError} onRetry={boot} />

  return (
    <PageContainer>
      <PageHeader
        title="Faturas"
        action={
          <a href="/dashboard/cartoes" className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>
            Gerenciar cartões →
          </a>
        }
      />

      {cards.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{
            background:           'var(--glass-bg)',
            backdropFilter:       'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            border:               '1px dashed var(--glass-border)',
            borderRadius:         '0.75rem',
          }}
        >
          <CreditCard size={40} weight="duotone" className="mx-auto mb-3" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum cartão ativo.</p>
          <a href="/dashboard/cartoes" className="mt-3 text-sm hover:underline block" style={{ color: 'var(--primary)' }}>
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
                background:           'var(--glass-bg)',
                backdropFilter:       'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                border:               '1px solid var(--glass-border)',
                borderRadius:         '0.75rem',
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
                background:           'var(--glass-bg)',
                backdropFilter:       'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                border:               '1px solid var(--glass-border)',
                borderRadius:         '0.75rem',
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
                <div className="text-center">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {MONTHS[viewMonth - 1]} {viewYear}
                  </span>
                  {isFuture && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--primary)' }}>
                      Mês futuro
                    </p>
                  )}
                </div>
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
                  background:           'var(--glass-bg)',
                  backdropFilter:       'blur(var(--glass-blur))',
                  WebkitBackdropFilter: 'blur(var(--glass-blur))',
                  border:               '1px solid var(--glass-border)',
                  borderRadius:         '0.75rem',
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

            {/* Hero card */}
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
                <div className="flex items-center gap-2">
                  {isFuture && !invoice && (
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}
                    >
                      Projeção
                    </span>
                  )}
                  {invoice && (
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{
                        background: invoice.status === 'paid'   ? 'rgba(52,211,153,0.25)'  :
                                    invoice.status === 'closed' ? 'rgba(251,191,36,0.25)'  :
                                    'rgba(255,255,255,0.15)',
                        color:      invoice.status === 'paid'   ? '#d1fae5' :
                                    invoice.status === 'closed' ? '#fef3c7' :
                                    'white',
                      }}
                    >
                      {STATUS_LABELS[invoice.status]}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-white/70 text-xs">
                    {hasForecast ? 'Total esperado' : 'Total da fatura'}
                  </p>
                  {isLoading ? (
                    <div className="h-9 w-36 bg-white/20 rounded-lg animate-pulse mt-1" />
                  ) : isEmpty ? (
                    <p className="text-2xl font-bold opacity-50">—</p>
                  ) : (
                    <div>
                      <p className="text-3xl font-bold">
                        {hasForecast
                          ? (expectedTotal > 0 ? fmt(expectedTotal) : '—')
                          : (computedTotal > 0 ? fmt(computedTotal) : '—')
                        }
                      </p>
                      {hasForecast && computedTotal > 0 && (
                        <p className="text-white/60 text-xs mt-0.5">
                          {fmt(computedTotal)} confirmados · {fmt(forecastTotal)} recorrentes
                        </p>
                      )}
                      {hasForecast && computedTotal === 0 && (
                        <p className="text-white/60 text-xs mt-0.5">
                          {fmt(forecastTotal)} em recorrências estimadas
                        </p>
                      )}
                    </div>
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

            {/* ── Bloco de Reconciliação ── */}
            {/* Renderiza apenas para faturas reais não-futuras não-canceladas */}
            {showReconciliacao && (
              <ReconciliacaoBlock
                invoice={invoice!}
                computedTotal={computedTotal}
                storageKey={reconStorageKey}
              />
            )}

            {/* Lista de lançamentos */}
            {invStatus === 'loaded' && (transactions.length > 0 || hasForecast) && (
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background:           'var(--glass-bg)',
                  backdropFilter:       'blur(var(--glass-blur))',
                  WebkitBackdropFilter: 'blur(var(--glass-blur))',
                  border:               '1px solid var(--glass-border)',
                }}
              >
                {/* Header da lista */}
                <div
                  className="px-5 py-3 flex items-center justify-between"
                  style={{ borderBottom: '1px solid var(--glass-border)' }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Lançamentos — {MONTHS[viewMonth - 1]}/{viewYear}
                  </p>
                  <div className="flex items-center gap-2">
                    {hasForecast && (
                      <span className="text-xs" style={{ color: 'var(--primary)' }}>
                        {forecastItems.length} recorrente{forecastItems.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {transactions.length > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {transactions.length} confirmado{transactions.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  {/* Transações reais */}
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
                      {(i < transactions.length - 1 || hasForecast) && <Divider />}
                    </div>
                  ))}

                  {/* Itens recorrentes (forecast layer) */}
                  {hasForecast && (
                    <>
                      {transactions.length > 0 && (
                        <div
                          className="px-5 py-2 flex items-center gap-2"
                          style={{
                            background:   'rgba(var(--primary-rgb, 124,58,237), 0.03)',
                            borderBottom: '1px solid var(--glass-border)',
                          }}
                        >
                          <Clock size={11} weight="duotone" style={{ color: 'var(--primary)' }} />
                          <p className="text-[11px] font-medium" style={{ color: 'var(--primary)' }}>
                            Recorrências estimadas
                          </p>
                        </div>
                      )}

                      {forecastItems.map((item, i) => (
                        <div key={`forecast-${item.recurrenceId}`} style={{ opacity: 0.75 }}>
                          <div className="flex items-center gap-4 px-5 py-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                              style={{
                                background: 'rgba(var(--primary-rgb, 124,58,237), 0.08)',
                                border:     '1px solid rgba(var(--primary-rgb, 124,58,237), 0.2)',
                              }}
                            >
                              <Clock size={14} weight="duotone" style={{ color: 'var(--primary)' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                  {item.description}
                                </p>
                                <RecorrenteBadge />
                              </div>
                              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                Cobrança estimada para {new Date(item.expectedDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                            <p className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--danger)', opacity: 0.8 }}>
                              -{fmt(item.amount)}
                            </p>
                          </div>
                          {i < forecastItems.length - 1 && <Divider />}
                        </div>
                      ))}
                    </>
                  )}

                  {/* Rodapé de totais */}
                  {hasForecast ? (
                    <div
                      className="px-5 py-3 space-y-1"
                      style={{
                        background: 'rgba(var(--primary-rgb, 124,58,237), 0.05)',
                        borderTop:  '1px solid var(--glass-border)',
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          Total esperado
                        </p>
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {fmt(expectedTotal)}
                        </p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {computedTotal > 0 ? `Confirmados · Recorrentes` : 'Recorrentes estimados'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {computedTotal > 0
                            ? `${fmt(computedTotal)} · ${fmt(forecastTotal)}`
                            : fmt(forecastTotal)}
                        </p>
                      </div>
                    </div>
                  ) : transactions.length > 0 ? (
                    <div
                      className="px-5 py-3 flex justify-between items-center"
                      style={{
                        background: 'rgba(var(--primary-rgb, 124,58,237), 0.05)',
                        borderTop:  '1px solid var(--glass-border)',
                      }}
                    >
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total confirmado</p>
                      <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        {fmt(computedTotal)}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Skeleton da lista */}
            {isLoading && (
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background:           'var(--glass-bg)',
                  backdropFilter:       'blur(var(--glass-blur))',
                  WebkitBackdropFilter: 'blur(var(--glass-blur))',
                  border:               '1px solid var(--glass-border)',
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
              style={{ border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', background: 'transparent' }}
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
            style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={e  => (e.target.style.borderColor = 'var(--glass-border)')}
          >
            <option value="">Selecione a conta</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {payError && <p className="text-sm mt-3" style={{ color: 'var(--danger)' }}>{payError}</p>}
      </AppModal>
    </PageContainer>
  )
}
