'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  transitionStatus,
  availableTransitions,
  isTerminal,
  type LifecycleStatus,
} from '@/features/financas/services/lifecycleEngine'

// TODO S1-005 (Etapa 2): remover handleTransactionGamification daqui e garantir
// que o EventBus cobre o fluxo via gamificacaoListener.
import { awardXP, getGamification } from '@/lib/gamification'

import {
  MagnifyingGlass,
  ArrowUp,
  ArrowDown,
  ArrowsLeftRight,
  ArrowCounterClockwise,
  CreditCard,
  Repeat,
  CalendarBlank,
  PencilSimple,
  Trash,
  Warning,
  CheckCircle,
  Clock,
  XCircle,
  Receipt,
  Spinner,
} from '@phosphor-icons/react'

import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader }    from '@/components/layout/PageHeader'
import { AppModal }      from '@/components/AppModal'
import { AnimatedValue } from '@/components/ui/AnimatedValue'
import {
  calcDualSummary,
  getCurrentMonthKey,
} from '@/lib/financialEngine'

// ─── Tipos ────────────────────────────────────────────────────────────────────

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
  lifecycle_status?: LifecycleStatus | null
  credit_card_id?: string | null
  invoice_id?: string | null
  is_recurring?: boolean
  recurrence_id?: string | null
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

// ─── Helpers de formatação ────────────────────────────────────────────────────

const fmt     = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')

const TYPE_LABELS: Record<TxType, string> = {
  income:   'Receita',
  expense:  'Despesa',
  transfer: 'Transferencia',
}

// ─── Lifecycle config — tokens Luminous, sem hardcode de cor ─────────────────
// ANTES: className com bg-green-50, text-green-700, border-green-200 etc.
// DEPOIS: inline style com CSS variables semânticas do design system

const LIFECYCLE_CONFIG: Record<LifecycleStatus, {
  label: string
  style: React.CSSProperties
  dotStyle: React.CSSProperties
  Icon: React.ElementType
}> = {
  CONFIRMED: {
    label: 'Confirmado',
    style: { background: 'rgba(var(--color-success-rgb, 22,163,74), 0.08)', color: 'var(--color-success, #16A34A)', border: '1px solid rgba(var(--color-success-rgb, 22,163,74), 0.2)' },
    dotStyle: { background: 'var(--color-success, #16A34A)' },
    Icon: CheckCircle,
  },
  PENDING_EXPECTED: {
    label: 'Esperado',
    style: { background: 'rgba(var(--color-info-rgb, 59,130,246), 0.08)', color: 'var(--color-info, #3B82F6)', border: '1px solid rgba(var(--color-info-rgb, 59,130,246), 0.2)' },
    dotStyle: { background: 'var(--color-info, #3B82F6)' },
    Icon: Clock,
  },
  PENDING_REVIEW: {
    label: 'Em revisao',
    style: { background: 'rgba(var(--color-warning-rgb, 234,179,8), 0.08)', color: 'var(--color-warning, #CA8A04)', border: '1px solid rgba(var(--color-warning-rgb, 234,179,8), 0.2)' },
    dotStyle: { background: 'var(--color-warning, #CA8A04)' },
    Icon: Warning,
  },
  OVERDUE: {
    label: 'Vencido',
    style: { background: 'rgba(var(--color-danger-rgb, 220,38,38), 0.08)', color: 'var(--color-danger, #DC2626)', border: '1px solid rgba(var(--color-danger-rgb, 220,38,38), 0.2)' },
    dotStyle: { background: 'var(--color-danger, #DC2626)' },
    Icon: Warning,
  },
  CANCELLED: {
    label: 'Cancelado',
    style: { background: 'var(--glass-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--glass-border)' },
    dotStyle: { background: 'var(--color-text-muted)' },
    Icon: XCircle,
  },
}

// ─── Transition buttons — tokens Luminous ─────────────────────────────────────

const TRANSITION_BUTTON_CONFIG: Record<LifecycleStatus, {
  label: string
  style: React.CSSProperties
}> = {
  CONFIRMED:        { label: 'Confirmar pagamento',  style: { color: 'var(--color-success)',  background: 'rgba(22,163,74,0.08)',   border: '1px solid rgba(22,163,74,0.2)'   } },
  CANCELLED:        { label: 'Cancelar',             style: { color: 'var(--color-text-muted)', background: 'var(--glass-bg)',        border: '1px solid var(--glass-border)'  } },
  OVERDUE:          { label: 'Marcar como vencido',  style: { color: 'var(--color-danger)',   background: 'rgba(220,38,38,0.08)',   border: '1px solid rgba(220,38,38,0.2)'   } },
  PENDING_EXPECTED: { label: 'Marcar como esperado', style: { color: 'var(--color-info, #3B82F6)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' } },
  PENDING_REVIEW:   { label: 'Colocar em revisao',   style: { color: 'var(--color-warning, #CA8A04)', background: 'rgba(234,179,8,0.08)',  border: '1px solid rgba(234,179,8,0.2)'  } },
}

// ─── Form default ─────────────────────────────────────────────────────────────

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
  is_recurring: false,
  recurrence: 'monthly',
  recurrence_end: '',
  is_installment: false,
  installment_total: '2',
}

// ─── Utils de data ────────────────────────────────────────────────────────────

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

// ─── Componentes auxiliares — Luminous ───────────────────────────────────────

// ANTES: bg-white border-gray-100 — quebrava dark e arcade
// DEPOIS: var(--glass-bg) var(--glass-border) — funciona nos 3 temas

function SkeletonRow() {
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-4 animate-pulse"
      style={{
        background:   'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        border:       '1px solid var(--glass-border)',
      }}
    >
      <div className="w-9 h-9 rounded-full shrink-0" style={{ background: 'var(--glass-border)' }} />
      <div className="flex-1 space-y-2">
        <div className="h-3 rounded w-2/5" style={{ background: 'var(--glass-border)' }} />
        <div className="h-2.5 rounded w-1/3" style={{ background: 'var(--glass-border)' }} />
      </div>
      <div className="text-right space-y-2 shrink-0">
        <div className="h-3 rounded w-20" style={{ background: 'var(--glass-border)' }} />
        <div className="h-2.5 rounded w-14 ml-auto" style={{ background: 'var(--glass-border)' }} />
      </div>
    </div>
  )
}

interface PageEmptyStateProps {
  Icon: React.ElementType
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

function PageEmptyState({ Icon, title, description, action }: PageEmptyStateProps) {
  return (
    <div
      className="rounded-xl p-10 text-center"
      style={{
        background:   'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        border:       '1px dashed var(--glass-border)',
      }}
    >
      <div className="flex justify-center mb-3">
        <Icon size={28} weight="duotone" style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{title}</p>
      {description && (
        <p className="text-xs mt-1 mb-4" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm mt-2 transition-opacity hover:opacity-70"
          style={{ color: 'var(--primary)' }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

interface PageErrorStateProps {
  message?: string
  onRetry: () => void
}

function PageErrorState({ message, onRetry }: PageErrorStateProps) {
  return (
    <div
      className="rounded-xl p-10 text-center"
      style={{
        background:   'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        border:       '1px dashed rgba(220,38,38,0.2)',
      }}
    >
      <div className="flex justify-center mb-3">
        <Warning size={28} weight="duotone" style={{ color: 'var(--color-danger)', opacity: 0.5 }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
        Erro ao carregar
      </p>
      <p className="text-xs mt-1 mb-4" style={{ color: 'var(--color-text-muted)' }}>
        {message ?? 'Nao foi possivel buscar os dados. Verifique sua conexao.'}
      </p>
      <button
        onClick={onRetry}
        className="text-sm font-medium transition-opacity hover:opacity-70"
        style={{ color: 'var(--primary)' }}
      >
        Tentar novamente
      </button>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative w-10 h-5 rounded-full transition-colors"
      style={{ background: checked ? 'var(--primary)' : 'var(--glass-border)' }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ transform: checked ? 'translateX(1.25rem)' : 'translateX(0.125rem)' }}
      />
    </button>
  )
}

// ─── Gamificação ──────────────────────────────────────────────────────────────
// TODO S1-005 (Etapa 2): mover para gamificacaoListener via EventBus.

async function handleTransactionGamification(
  userId: string,
  txCount: number,
  hasCategoryId: boolean,
) {
  try {
    const gam = await getGamification(userId)
    const earned = gam?.badges ?? []

    if (txCount === 1 && !earned.includes('first_transaction')) {
      await awardXP(userId, 'transaction_created', 'first_transaction')
    } else if (txCount === 10 && !earned.includes('ten_transactions')) {
      await awardXP(userId, 'transaction_created', 'ten_transactions')
    } else if (txCount === 50 && !earned.includes('fifty_transactions')) {
      await awardXP(userId, 'transaction_created', 'fifty_transactions')
    } else {
      await awardXP(userId, 'transaction_created')
    }

    if (hasCategoryId) {
      await awardXP(userId, 'transaction_categorized')
    }

    const gamAfter = await getGamification(userId)
    const streakDays = gamAfter?.streakDays ?? 0
    const earnedAfter = gamAfter?.badges ?? []

    if (streakDays >= 30 && !earnedAfter.includes('streak_30')) {
      await awardXP(userId, 'streak_30', 'streak_30')
    } else if (streakDays >= 7 && !earnedAfter.includes('streak_7')) {
      await awardXP(userId, 'streak_7', 'streak_7')
    }
  } catch {
    // Gamificação nunca bloqueia o fluxo principal
  }
}

// ─── LifecycleActions ─────────────────────────────────────────────────────────

interface LifecycleActionsProps {
  tx: Transaction
  onTransition: (id: string, to: LifecycleStatus) => Promise<void>
  transitioning: string | null
}

function LifecycleActions({ tx, onTransition, transitioning }: LifecycleActionsProps) {
  const current = tx.lifecycle_status ?? 'CONFIRMED'
  const actions = availableTransitions(current)

  if (actions.length === 0) return null

  return (
    <div className="flex gap-1 flex-wrap">
      {actions.map(to => {
        const cfg = TRANSITION_BUTTON_CONFIG[to]
        const isLoading = transitioning === tx.id
        return (
          <button
            key={to}
            onClick={() => onTransition(tx.id, to)}
            disabled={isLoading}
            title={cfg.label}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-opacity disabled:opacity-40 hover:opacity-80"
            style={cfg.style}
          >
            {isLoading && (
              <Spinner size={12} weight="bold" className="animate-spin" />
            )}
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Ícone de tipo ────────────────────────────────────────────────────────────

function TxTypeIcon({ type }: { type: TxType }) {
  if (type === 'income')  return <ArrowUp   size={16} weight="duotone" />
  if (type === 'expense') return <ArrowDown size={16} weight="duotone" />
  return <ArrowsLeftRight size={16} weight="duotone" />
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function TransacoesPage() {
  const supabase = createClient()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [categories,   setCategories]   = useState<Category[]>([])
  const [creditCards,  setCreditCards]  = useState<CreditCard[]>([])

  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState<string | null>(null)
  const [toast,         setToast]         = useState<Toast | null>(null)

  const [search,          setSearch]          = useState('')
  const [filterType,      setFilterType]      = useState<TxType | ''>('')
  const [filterAccount,   setFilterAccount]   = useState('')
  const [filterCategory,  setFilterCategory]  = useState('')
  const [filterLifecycle, setFilterLifecycle] = useState<LifecycleStatus | ''>('')
  const [filterMonth,     setFilterMonth]     = useState(getCurrentMonthKey)

  const [showEditModal,       setShowEditModal]       = useState(false)
  const [editingId,           setEditingId]           = useState<string | null>(null)
  const [form,                setForm]                = useState(emptyForm)
  const [formError,           setFormError]           = useState<string | null>(null)

  const [showDeleteModal,     setShowDeleteModal]     = useState(false)
  const [deleteTargetId,      setDeleteTargetId]      = useState<string | null>(null)

  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false)
  const [recurrenceTx,        setRecurrenceTx]        = useState<Transaction | null>(null)

  const monthOptions = useMemo(() => getMonthOptions(), [])

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ─── Carregar dados ─────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true)
    setLoadError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const [
        { data: tx, error: txErr },
        { data: acc },
        { data: cat },
        { data: cards },
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, type, description, amount, date, account_id, destination_account_id, category_id, notes, status, lifecycle_status, credit_card_id, invoice_id, is_recurring, recurrence_id, recurrence, recurrence_start, recurrence_end, installment_total, installment_current, installment_group')
          .eq('user_id', user.id)
          // Soft delete: exclui registros deletados
          .is('deleted_at', null)
          .order('date', { ascending: false })
          .limit(500),
        supabase.from('accounts').select('id, name, color, current_balance').eq('user_id', user.id).order('name'),
        supabase.from('categories').select('id, name, type, icon').eq('user_id', user.id).order('name'),
        supabase.from('credit_cards').select('id, name, color, closing_day, due_day').eq('user_id', user.id).eq('is_active', true).order('name'),
      ])

      if (txErr) { setLoadError(txErr.message); return }

      const accList  = (acc   ?? []) as Account[]
      const catList  = (cat   ?? []) as Category[]
      const cardList = (cards ?? []) as CreditCard[]
      const txRaw    = (tx    ?? []) as any[]

      const accMap  = Object.fromEntries(accList.map(a  => [a.id, a]))
      const catMap  = Object.fromEntries(catList.map(c  => [c.id, c]))
      const cardMap = Object.fromEntries(cardList.map(c => [c.id, c]))

      setTransactions(txRaw.map(t => ({
        ...t,
        type:                     t.type as TxType,
        lifecycle_status:         (t.lifecycle_status ?? 'CONFIRMED') as LifecycleStatus,
        account_name:             accMap[t.account_id]?.name ?? '-',
        destination_account_name: t.destination_account_id ? (accMap[t.destination_account_id]?.name ?? '-') : undefined,
        category_name:            t.category_id    ? catMap[t.category_id]?.name     : undefined,
        category_icon:            t.category_id    ? catMap[t.category_id]?.icon     : undefined,
        credit_card_name:         t.credit_card_id ? cardMap[t.credit_card_id]?.name : undefined,
      })))

      setAccounts(accList)
      setCategories(catList)
      setCreditCards(cardList)
    } catch (e: any) {
      setLoadError(e?.message ?? 'Erro inesperado ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    const handler = () => loadAll()
    window.addEventListener('transacao-criada', handler)
    return () => window.removeEventListener('transacao-criada', handler)
  }, [])

  // ─── Transição lifecycle ────────────────────────────────────────────────────

  async function handleTransition(id: string, to: LifecycleStatus) {
    setTransitioning(id)
    try {
      const result = await transitionStatus(id, to)
      if (result.success) {
        setTransactions(prev =>
          prev.map(tx => tx.id === id ? { ...tx, lifecycle_status: to } : tx)
        )
        showToast(`Status atualizado: ${LIFECYCLE_CONFIG[to].label}`)
      } else {
        showToast(result.error ?? 'Erro ao atualizar status.', 'error')
      }
    } catch {
      showToast('Erro inesperado ao atualizar status.', 'error')
    } finally {
      setTransitioning(null)
    }
  }

  // ─── Editar ─────────────────────────────────────────────────────────────────

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
    setFormError(null)
    setShowEditModal(true)
  }

  // ─── Invoice helpers ────────────────────────────────────────────────────────

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

  // NOTA TÉCNICA: updateInvoiceTotal() é dívida técnica P1.
  // Reduz correndo no frontend com race condition potencial.
  // Destino correto: trigger Supabase ou RPC server-side.
  // Mantido aqui por compatibilidade — não remover sem substituto pronto.
  async function updateInvoiceTotal(invoiceId: string) {
    const { data } = await supabase.from('transactions').select('amount').eq('invoice_id', invoiceId)
    const total = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
    await supabase.from('credit_card_invoices').update({ total_amount: total }).eq('id', invoiceId)
  }

  // ─── Salvar transação ───────────────────────────────────────────────────────

  async function handleSave() {
    setFormError(null)
    const amount = parseFloat(String(form.amount).replace(',', '.'))
    if (!form.description.trim())     { setFormError('Descricao e obrigatoria.'); return }
    if (isNaN(amount) || amount <= 0) { setFormError('Valor deve ser maior que zero.'); return }

    if (form.use_credit_card && form.type === 'expense') {
      if (!form.credit_card_id) { setFormError('Selecione um cartao.'); return }
    } else {
      if (!form.account_id) { setFormError('Selecione uma conta.'); return }
      if (form.type === 'transfer' && !form.destination_account_id) { setFormError('Selecione a conta de destino.'); return }
      if (form.type === 'transfer' && form.account_id === form.destination_account_id) { setFormError('Contas devem ser diferentes.'); return }
    }

    if (form.is_installment && form.type !== 'transfer') {
      const total = parseInt(form.installment_total)
      if (isNaN(total) || total < 2 || total > 48) { setFormError('Parcelas: entre 2 e 48.'); return }
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFormError('Nao autenticado.'); setSaving(false); return }

    // ── PARCELAMENTO ───────────────────────────────────────────
    if (form.is_installment && !editingId && form.type !== 'transfer') {
      const total   = parseInt(form.installment_total)
      const groupId = crypto.randomUUID()
      const rows    = []

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
          lifecycle_status:       form.status === 'pending' || form.status === 'overdue' ? 'PENDING_EXPECTED' : 'CONFIRMED',
        })
      }

      const { error: err } = await supabase.from('transactions').insert(rows)
      if (err) { setFormError(err.message); setSaving(false); return }

      const invoiceIds = [...new Set(rows.map(r => r.invoice_id).filter(Boolean))]
      for (const iid of invoiceIds) { if (iid) await updateInvoiceTotal(iid) }

      const { count: txCount } = await supabase
        .from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      await handleTransactionGamification(user.id, txCount ?? 0, !!form.category_id)

      showToast(`${total} parcelas criadas!`)
      await loadAll()
      setShowEditModal(false)
      setSaving(false)
      return
    }

    // ── RECORRENTE ─────────────────────────────────────────────
    if (form.is_recurring && !editingId) {
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
        frequency:      form.recurrence,
        next_due_date:  calcNextDue(form.date, form.recurrence),
        start_date:     form.date,
        end_date:       form.recurrence_end || null,
        account_id:     form.use_credit_card ? null : (form.account_id || null),
        credit_card_id: form.use_credit_card ? form.credit_card_id : null,
        category_id:    form.category_id || null,
        is_active:      true,
      }

      const { data: recData, error: recErr } = await supabase
        .from('recurrences').insert(recPayload).select('id').single()

      if (recErr || !recData) {
        setFormError(recErr?.message ?? 'Erro ao criar recorrencia.')
        setSaving(false)
        return
      }

      let invoiceId: string | null = null
      const accountId = form.use_credit_card ? null : (form.account_id || null)
      if (form.use_credit_card && form.type === 'expense') {
        invoiceId = await getOrCreateInvoice(form.credit_card_id, form.date, user.id)
      }

      const { error: txErr } = await supabase.from('transactions').insert({
        user_id:                user.id,
        type:                   form.type,
        description:            form.description.trim(),
        amount,
        date:                   form.date,
        account_id:             accountId,
        destination_account_id: null,
        category_id:            form.category_id || null,
        notes:                  form.notes?.trim() || null,
        status:                 form.use_credit_card ? 'posted' : form.status,
        credit_card_id:         form.use_credit_card ? form.credit_card_id : null,
        invoice_id:             invoiceId,
        is_recurring:           true,
        recurrence_id:          recData.id,
        lifecycle_status:       form.status === 'pending' || form.status === 'overdue' ? 'PENDING_EXPECTED' : 'CONFIRMED',
      })

      if (txErr) { setFormError(txErr.message); setSaving(false); return }
      if (invoiceId) await updateInvoiceTotal(invoiceId)

      const { count: txCount } = await supabase
        .from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      await handleTransactionGamification(user.id, txCount ?? 0, !!form.category_id)

      showToast('Recorrencia criada!')
      await loadAll()
      setShowEditModal(false)
      setSaving(false)
      return
    }

    // ── TRANSACAO NORMAL ───────────────────────────────────────
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
      is_recurring:           false,
    }

    if (editingId) {
      const { error: err } = await supabase.from('transactions').update(payload).eq('id', editingId)
      if (err) { setFormError(err.message); setSaving(false); return }
      if (invoiceId) await updateInvoiceTotal(invoiceId)
      showToast('Transacao atualizada!')
    } else {
      const { error: err } = await supabase.from('transactions').insert({
        ...payload,
        user_id:          user.id,
        lifecycle_status: form.status === 'pending' || form.status === 'overdue' ? 'PENDING_EXPECTED' : 'CONFIRMED',
      })
      if (err) { setFormError(err.message); setSaving(false); return }
      if (invoiceId) await updateInvoiceTotal(invoiceId)

      const { count: txCount } = await supabase
        .from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      await handleTransactionGamification(user.id, txCount ?? 0, !!form.category_id)

      showToast('Transacao criada!')
    }

    await loadAll()
    setShowEditModal(false)
    setSaving(false)
  }

  // ─── Excluir — soft delete ──────────────────────────────────────────────────
  // ANTES: supabase.from('transactions').delete().eq('id', id)
  // DEPOIS: update({ deleted_at: now }) — dados financeiros não desaparecem

  function handleDeleteClick(tx: Transaction) {
    if (tx.is_recurring && tx.recurrence_id) {
      setRecurrenceTx(tx)
      setShowRecurrenceModal(true)
    } else {
      setDeleteTargetId(tx.id)
      setShowDeleteModal(true)
    }
  }

  async function executeDeleteNormal() {
    if (!deleteTargetId) return
    setShowDeleteModal(false)
    setDeletingId(deleteTargetId)
    const { error: err } = await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTargetId)
    if (err) showToast('Erro ao excluir.', 'error')
    else showToast('Transacao excluida.')
    await loadAll()
    setDeletingId(null)
    setDeleteTargetId(null)
  }

  async function executeTxDelete(mode: 'single' | 'all') {
    if (!recurrenceTx) return
    const { id, recurrence_id } = recurrenceTx
    setDeletingId(id)
    setShowRecurrenceModal(false)
    setRecurrenceTx(null)

    if (mode === 'single') {
      const { error: err } = await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (err) showToast('Erro ao excluir.', 'error')
      else showToast('Lancamento excluido. Recorrencia mantida.')
    } else {
      await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (recurrence_id) {
        await supabase.from('recurrences').update({ is_active: false }).eq('id', recurrence_id)
      }
      showToast('Lancamento excluido e recorrencia pausada.')
    }

    await loadAll()
    setDeletingId(null)
  }

  // ─── Filtros ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (filterType      && tx.type             !== filterType)      return false
      if (filterAccount   && tx.account_id       !== filterAccount)   return false
      if (filterCategory  && tx.category_id      !== filterCategory)  return false
      if (filterLifecycle && tx.lifecycle_status !== filterLifecycle) return false
      if (filterMonth     && tx.date.slice(0, 7) !== filterMonth)     return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !tx.description.toLowerCase().includes(q) &&
          !(tx.account_name       ?? '').toLowerCase().includes(q) &&
          !(tx.category_name      ?? '').toLowerCase().includes(q) &&
          !(tx.credit_card_name   ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [transactions, filterType, filterAccount, filterCategory, filterLifecycle, filterMonth, search])

  // TD-001: calcDualSummary no React é dívida técnica.
  // Destino correto: Supabase view get_financial_summary(user_id).
  // Mantido aqui até sprint de infraestrutura financeira.
  const dualSummary = useMemo(
    () => calcDualSummary(
      filtered.map(t => ({
        type:             t.type,
        amount:           t.amount,
        lifecycle_status: t.lifecycle_status ?? 'CONFIRMED',
      }))
    ),
    [filtered]
  )

  const hasActiveFilters = filterType || filterAccount || filterCategory || filterLifecycle || search
  function clearFilters() {
    setFilterType('')
    setFilterAccount('')
    setFilterCategory('')
    setFilterLifecycle('')
    setSearch('')
  }

  const amountColor  = (type: TxType) =>
    type === 'income'   ? 'var(--color-success, #16A34A)'
    : type === 'expense' ? 'var(--color-danger, #DC2626)'
    : 'var(--primary)'

  const amountPrefix = (type: TxType) =>
    type === 'income' ? '+' : type === 'expense' ? '-' : ''

  const catsFiltradas = categories.filter(
    c => form.type !== 'transfer' && (c.type === form.type || c.type === 'both')
  )

  // ─── Conteúdo da lista ───────────────────────────────────────────────────────

  function renderContent() {
    if (loading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )
    }

    if (loadError) {
      return <PageErrorState message={loadError} onRetry={loadAll} />
    }

    if (filtered.length === 0) {
      if (transactions.length === 0) {
        return (
          <PageEmptyState
            Icon={Receipt}
            title="Nenhuma transacao ainda"
            description="Registre sua primeira receita ou despesa para comecar."
          />
        )
      }
      return (
        <PageEmptyState
          Icon={MagnifyingGlass}
          title="Nenhum resultado"
          action={{ label: 'Limpar filtros', onClick: clearFilters }}
        />
      )
    }

    return (
      <div className="space-y-2">
        <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
          {filtered.length} transacao{filtered.length !== 1 ? 'oes' : ''}
        </p>
        {filtered.map(tx => {
          const lcStatus     = tx.lifecycle_status ?? 'CONFIRMED'
          const lcCfg        = LIFECYCLE_CONFIG[lcStatus]
          const isNonDefault = lcStatus !== 'CONFIRMED'

          return (
            <div
              key={tx.id}
              className="rounded-xl px-4 py-3 flex gap-4 group transition-all"
              style={{
                background:      'var(--glass-bg)',
                backdropFilter:  'blur(var(--glass-blur))',
                border:          '1px solid var(--glass-border)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--glass-hover-border)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--glass-border)'
              }}
            >
              {isNonDefault && (
                <div
                  className="w-1 rounded-full shrink-0 self-stretch"
                  style={lcCfg.dotStyle}
                />
              )}

              {/* Ícone de tipo */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 self-start mt-0.5"
                style={{
                  background: tx.type === 'income'
                    ? 'rgba(22,163,74,0.1)'
                    : tx.type === 'expense'
                    ? 'rgba(220,38,38,0.1)'
                    : 'rgba(var(--primary-rgb, 124,58,237), 0.1)',
                  color: amountColor(tx.type),
                }}
              >
                {tx.category_icon
                  ? <span className="text-sm">{tx.category_icon}</span>
                  : <TxTypeIcon type={tx.type} />
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {tx.description}
                  </p>

                  {tx.is_recurring && tx.recurrence_id && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        background: 'rgba(59,130,246,0.08)',
                        color:      'var(--color-info, #3B82F6)',
                        border:     '1px solid rgba(59,130,246,0.15)',
                      }}
                    >
                      <Repeat size={10} weight="duotone" />
                      Recorrente
                    </span>
                  )}

                  {tx.installment_total && tx.installment_current && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        background: 'rgba(234,88,12,0.08)',
                        color:      '#EA580C',
                        border:     '1px solid rgba(234,88,12,0.15)',
                      }}
                    >
                      <CalendarBlank size={10} weight="duotone" />
                      {tx.installment_current}/{tx.installment_total}x
                    </span>
                  )}

                  {isNonDefault && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                      style={lcCfg.style}
                    >
                      <lcCfg.Icon size={10} weight="duotone" />
                      {lcCfg.label}
                    </span>
                  )}
                </div>

                <p className="text-xs mt-0.5 truncate flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                  {tx.credit_card_name
                    ? <><CreditCard size={11} weight="duotone" /> {tx.credit_card_name}</>
                    : tx.account_name
                  }
                  {tx.type === 'transfer' && tx.destination_account_name ? ` → ${tx.destination_account_name}` : ''}
                  {tx.category_name ? ` · ${tx.category_name}` : ''}
                </p>

                {!isTerminal(lcStatus) && (
                  <div className="mt-2">
                    <LifecycleActions
                      tx={tx}
                      onTransition={handleTransition}
                      transitioning={transitioning}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <p className="text-sm font-semibold" style={{ color: amountColor(tx.type) }}>
                  {amountPrefix(tx.type)} {fmt(tx.amount)}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {fmtDate(tx.date)}
                </p>
                <div className="opacity-0 group-hover:opacity-100 transition-all flex gap-1 mt-1">
                  <button
                    onClick={() => openEdit(tx)}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = 'var(--primary)'
                      e.currentTarget.style.background = 'rgba(var(--primary-rgb, 124,58,237), 0.08)'
                      e.currentTarget.style.opacity = '1'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = 'var(--color-text-muted)'
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.opacity = '0.5'
                    }}
                    title="Editar"
                  >
                    <PencilSimple size={14} weight="duotone" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(tx)}
                    disabled={deletingId === tx.id}
                    className="p-1.5 rounded transition-colors disabled:opacity-30"
                    style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = 'var(--color-danger)'
                      e.currentTarget.style.background = 'rgba(220,38,38,0.08)'
                      e.currentTarget.style.opacity = '1'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = 'var(--color-text-muted)'
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.opacity = '0.5'
                    }}
                    title="Excluir"
                  >
                    {deletingId === tx.id
                      ? <Spinner size={14} weight="bold" className="animate-spin" style={{ color: 'var(--primary)' }} />
                      : <Trash size={14} weight="duotone" />
                    }
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageContainer>

      {/* ── Toast Luminous ── */}
      {toast && (
        <div
          className="fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2"
          style={{
            background:     'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            border: toast.type === 'success'
              ? '1px solid rgba(22,163,74,0.25)'
              : '1px solid rgba(220,38,38,0.25)',
            color: toast.type === 'success'
              ? 'var(--color-success, #16A34A)'
              : 'var(--color-danger, #DC2626)',
          }}
        >
          {toast.type === 'success'
            ? <CheckCircle size={14} weight="duotone" />
            : <Warning     size={14} weight="duotone" />
          }
          {toast.message}
        </div>
      )}

      <PageHeader
        title="Transacoes"
        action={
          <button
            onClick={() => { setEditingId(null); setForm(emptyForm); setFormError(null); setShowEditModal(true) }}
            className="btn-primary"
          >
            Nova transacao
          </button>
        }
      />

      {/* ── Filtros — glass-card ── */}
      <div
        className="rounded-xl p-4 mb-4 space-y-3"
        style={{
          background:     'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          border:         '1px solid var(--glass-border)',
        }}
      >
        <div className="relative">
          <MagnifyingGlass
            size={16}
            weight="duotone"
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por descricao, conta, cartao ou categoria..."
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{
              background: 'var(--glass-bg)',
              color:      'var(--color-text-primary)',
              border:     '1px solid var(--glass-border)',
            }}
            onFocus={e  => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--primary-rgb,124,58,237),0.15)' }}
            onBlur={e   => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Tipo */}
          <div className="flex gap-1.5">
            {([['', 'Todas'], ['income', 'Receitas'], ['expense', 'Despesas'], ['transfer', 'Transf.']] as [TxType | '', string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterType(val)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={
                  filterType === val
                    ? { background: 'var(--primary)', color: '#fff', border: '1px solid transparent' }
                    : { background: 'var(--glass-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--glass-border)' }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* Mês */}
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            style={{
              background: 'var(--glass-bg)',
              color:      'var(--color-text-primary)',
              border:     '1px solid var(--glass-border)',
            }}
          >
            {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>

          {/* Status lifecycle */}
          <select
            value={filterLifecycle}
            onChange={e => setFilterLifecycle(e.target.value as LifecycleStatus | '')}
            className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
            style={{
              background: 'var(--glass-bg)',
              color:      'var(--color-text-primary)',
              border:     '1px solid var(--glass-border)',
            }}
          >
            <option value="">Todos os status</option>
            {(Object.keys(LIFECYCLE_CONFIG) as LifecycleStatus[]).map(s => (
              <option key={s} value={s}>{LIFECYCLE_CONFIG[s].label}</option>
            ))}
          </select>

          {/* Conta */}
          {accounts.length > 0 && (
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
              style={{
                background: 'var(--glass-bg)',
                color:      'var(--color-text-primary)',
                border:     '1px solid var(--glass-border)',
              }}
            >
              <option value="">Todas as contas</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}

          {/* Categoria */}
          {categories.length > 0 && (
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-xs focus:outline-none"
              style={{
                background: 'var(--glass-bg)',
                color:      'var(--color-text-primary)',
                border:     '1px solid var(--glass-border)',
              }}
            >
              <option value="">Todas as categorias</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          )}

          {/* Limpar */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-70"
              style={{
                color:      'var(--color-danger)',
                background: 'rgba(220,38,38,0.06)',
                border:     '1px solid rgba(220,38,38,0.15)',
              }}
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Summary dual — ledger + operacional — AnimatedValue ── */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="space-y-3 mb-4">

          {/* Confirmado + Vencido */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
              Confirmado + Vencido
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Receitas',   value: dualSummary.ledger.income,  color: 'var(--color-success, #16A34A)' },
                { label: 'Despesas',   value: dualSummary.ledger.expense, color: 'var(--color-danger, #DC2626)'  },
                { label: 'Saldo real', value: dualSummary.ledger.balance, color: dualSummary.ledger.balance >= 0 ? 'var(--primary)' : 'var(--color-danger, #DC2626)' },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="rounded-xl px-4 py-3"
                  style={{
                    background:     'var(--glass-bg)',
                    backdropFilter: 'blur(var(--glass-blur))',
                    border:         '1px solid var(--glass-border)',
                  }}
                >
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                  <AnimatedValue
                    value={value}
                    group="financial"
                    className="text-sm font-semibold mt-0.5"
                    style={{ color }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Previsto / Em revisão */}
          {(dualSummary.operational.income > 0 || dualSummary.operational.expense > 0) && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Previsto / Em revisao
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Receitas',       value: dualSummary.operational.income,   color: 'var(--color-success, #16A34A)' },
                  { label: 'Despesas',       value: dualSummary.operational.expense,  color: 'var(--color-danger, #DC2626)'  },
                  { label: 'Impacto prev.',  value: dualSummary.operational.balance,  color: dualSummary.operational.balance >= 0 ? 'var(--primary)' : 'var(--color-danger, #DC2626)' },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    className="rounded-xl px-4 py-3"
                    style={{
                      background:     'var(--glass-bg)',
                      backdropFilter: 'blur(var(--glass-blur))',
                      border:         '1px dashed var(--glass-border)',
                    }}
                  >
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                    <AnimatedValue
                      value={value}
                      group="financial"
                      className="text-sm font-semibold mt-0.5 opacity-60"
                      style={{ color }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {renderContent()}

      {/* ── Modal confirmação exclusão simples ── */}
      <AppModal
        open={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeleteTargetId(null) }}
        title="Excluir transacao"
        size="sm"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => { setShowDeleteModal(false); setDeleteTargetId(null) }}
              className="flex-1 rounded-lg py-2 text-sm transition-opacity hover:opacity-80"
              style={{
                border:     '1px solid var(--glass-border)',
                color:      'var(--color-text-muted)',
                background: 'transparent',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={executeDeleteNormal}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-danger)' }}
            >
              Excluir
            </button>
          </AppModal.Footer>
        }
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(220,38,38,0.1)' }}
          >
            <Trash size={20} weight="duotone" style={{ color: 'var(--color-danger)' }} />
          </div>
          <p className="text-sm pt-2" style={{ color: 'var(--color-text-muted)' }}>
            Essa acao nao pode ser desfeita.
          </p>
        </div>
      </AppModal>

      {/* ── Modal exclusão recorrente ── */}
      <AppModal
        open={showRecurrenceModal && !!recurrenceTx}
        onClose={() => { setShowRecurrenceModal(false); setRecurrenceTx(null) }}
        title="Excluir lancamento recorrente"
        size="sm"
      >
        {recurrenceTx && (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(59,130,246,0.1)' }}
              >
                <Repeat size={20} weight="duotone" style={{ color: 'var(--color-info, #3B82F6)' }} />
              </div>
              <p className="text-sm pt-2" style={{ color: 'var(--color-text-muted)' }}>
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  "{recurrenceTx.description}"
                </span>
                {' · '}{fmtDate(recurrenceTx.date)}
              </p>
            </div>

            <div
              className="rounded-xl px-4 py-3 mb-4 text-xs"
              style={{
                background: 'rgba(59,130,246,0.06)',
                border:     '1px solid rgba(59,130,246,0.15)',
                color:      'var(--color-info, #3B82F6)',
              }}
            >
              <p className="font-semibold mb-1 flex items-center gap-1">
                <Warning size={12} weight="duotone" />
                Este lancamento faz parte de uma recorrencia ativa.
              </p>
              <p>Excluir apenas este lancamento nao afeta os demais nem a automacao futura.</p>
              <p className="mt-1">Para gerenciar a recorrencia completa, acesse <strong>Recorrencias</strong>.</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => executeTxDelete('single')}
                className="w-full text-left rounded-xl px-4 py-3 transition-all"
                style={{ border: '2px solid var(--glass-border)', background: 'transparent' }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(234,88,12,0.4)'
                  e.currentTarget.style.background  = 'rgba(234,88,12,0.05)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--glass-border)'
                  e.currentTarget.style.background  = 'transparent'
                }}
              >
                <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                  <Trash size={14} weight="duotone" style={{ color: '#EA580C' }} />
                  Excluir so este lancamento
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Remove {fmtDate(recurrenceTx.date)}. Recorrencia continua gerando normalmente.
                </p>
              </button>

              <button
                onClick={() => executeTxDelete('all')}
                className="w-full text-left rounded-xl px-4 py-3 transition-all"
                style={{ border: '2px solid var(--glass-border)', background: 'transparent' }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(220,38,38,0.4)'
                  e.currentTarget.style.background  = 'rgba(220,38,38,0.05)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--glass-border)'
                  e.currentTarget.style.background  = 'transparent'
                }}
              >
                <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-danger)' }}>
                  <ArrowCounterClockwise size={14} weight="duotone" />
                  Excluir e pausar recorrencia
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Remove este lancamento e para de gerar novos. Historico passado preservado.
                </p>
              </button>
            </div>

            <button
              onClick={() => { setShowRecurrenceModal(false); setRecurrenceTx(null) }}
              className="w-full rounded-lg py-2 text-sm mt-4 transition-opacity hover:opacity-80"
              style={{
                border:     '1px solid var(--glass-border)',
                color:      'var(--color-text-muted)',
                background: 'transparent',
              }}
            >
              Cancelar
            </button>
          </>
        )}
      </AppModal>

      {/* ── Modal criar/editar transacao ── */}
      <AppModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={editingId ? 'Editar Transacao' : 'Nova Transacao'}
        size="md"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setShowEditModal(false)}
              className="flex-1 rounded-lg py-2 text-sm transition-opacity hover:opacity-80"
              style={{
                border:     '1px solid var(--glass-border)',
                color:      'var(--color-text-muted)',
                background: 'transparent',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{
                background: form.use_credit_card    ? '#9333ea'
                          : form.type === 'income'  ? 'var(--color-success)'
                          : form.type === 'expense' ? 'var(--color-danger)'
                          : 'var(--primary)',
              }}
            >
              {saving
                ? 'Salvando...'
                : form.is_installment
                ? `Criar ${form.installment_total || '?'} parcelas`
                : form.is_recurring
                ? 'Salvar recorrencia'
                : editingId
                ? 'Salvar alteracoes'
                : 'Salvar'
              }
            </button>
          </AppModal.Footer>
        }
      >
        <div className="space-y-4">

          {/* Tipo */}
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Tipo</label>
            <div className="flex gap-2">
              {(['expense', 'income', 'transfer'] as TxType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, type: t, category_id: '', use_credit_card: false, is_installment: false, is_recurring: false })}
                  className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                  style={
                    form.type === t
                      ? t === 'income'
                        ? { background: 'rgba(22,163,74,0.12)', color: 'var(--color-success)', border: '1px solid rgba(22,163,74,0.25)' }
                        : t === 'expense'
                        ? { background: 'rgba(220,38,38,0.12)', color: 'var(--color-danger)', border: '1px solid rgba(220,38,38,0.25)' }
                        : { background: 'rgba(var(--primary-rgb,124,58,237),0.12)', color: 'var(--primary)', border: '1px solid rgba(var(--primary-rgb,124,58,237),0.25)' }
                      : { border: '1px solid var(--glass-border)', color: 'var(--color-text-muted)', background: 'transparent' }
                  }
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Cartão de crédito toggle */}
          {form.type === 'expense' && creditCards.length > 0 && (
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2.5"
              style={{
                background: 'rgba(147,51,234,0.06)',
                border:     '1px solid rgba(147,51,234,0.15)',
              }}
            >
              <div className="flex items-center gap-2">
                <CreditCard size={16} weight="duotone" className="text-purple-500" />
                <span className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
                  Pagar com cartao de credito
                </span>
              </div>
              <Toggle
                checked={form.use_credit_card}
                onChange={() => setForm({ ...form, use_credit_card: !form.use_credit_card, credit_card_id: creditCards[0]?.id ?? '' })}
              />
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Descricao</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder={form.type === 'income' ? 'Ex: Salario, Freelance...' : form.type === 'expense' ? 'Ex: Mercado, Aluguel...' : 'Ex: Para reserva...'}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
              onFocus={e  => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--primary-rgb,124,58,237),0.15)' }}
              onBlur={e   => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Valor (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                onFocus={e  => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--primary-rgb,124,58,237),0.15)' }}
                onBlur={e   => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </div>
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Data</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                onFocus={e  => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--primary-rgb,124,58,237),0.15)' }}
                onBlur={e   => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </div>
          </div>

          {form.use_credit_card && form.type === 'expense' ? (
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Cartao</label>
              <select
                value={form.credit_card_id}
                onChange={e => setForm({ ...form, credit_card_id: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
              >
                <option value="">Selecione o cartao...</option>
                {creditCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs mt-1" style={{ color: 'var(--primary)' }}>
                A despesa sera lancada na fatura do cartao.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                >
                  <option value="paid">Pago</option>
                  <option value="pending">Pendente</option>
                  <option value="overdue">Vencido</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  {form.type === 'transfer' ? 'Conta de Origem' : 'Conta'}
                </label>
                <select
                  value={form.account_id}
                  onChange={e => setForm({ ...form, account_id: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                >
                  <option value="">Selecione...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.current_balance)}</option>)}
                </select>
              </div>
              {form.type === 'transfer' && (
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>Conta de Destino</label>
                  <select
                    value={form.destination_account_id}
                    onChange={e => setForm({ ...form, destination_account_id: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                  >
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
              <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Categoria <span style={{ opacity: 0.5 }}>(opcional)</span>
              </label>
              <select
                value={form.category_id}
                onChange={e => setForm({ ...form, category_id: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
              >
                <option value="">Sem categoria</option>
                {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          )}

          {/* Recorrente */}
          {form.type !== 'transfer' && !form.is_installment && (
            <div
              className="rounded-xl p-3 space-y-3"
              style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat size={16} weight="duotone" style={{ color: 'var(--color-text-muted)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    Recorrente
                  </span>
                </div>
                <Toggle
                  checked={form.is_recurring}
                  onChange={() => setForm({ ...form, is_recurring: !form.is_recurring })}
                />
              </div>
              {form.is_recurring && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Frequencia</label>
                    <select
                      value={form.recurrence}
                      onChange={e => setForm({ ...form, recurrence: e.target.value })}
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                    >
                      <option value="daily">Diaria</option>
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Data fim (opcional)</label>
                    <input
                      type="date"
                      value={form.recurrence_end}
                      onChange={e => setForm({ ...form, recurrence_end: e.target.value })}
                      className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Parcelado */}
          {form.type !== 'transfer' && !form.is_recurring && !editingId && (
            <div
              className="rounded-xl p-3 space-y-3"
              style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarBlank size={16} weight="duotone" style={{ color: 'var(--color-text-muted)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    Parcelado
                  </span>
                </div>
                <Toggle
                  checked={form.is_installment}
                  onChange={() => setForm({ ...form, is_installment: !form.is_installment })}
                />
              </div>
              {form.is_installment && (
                <div className="pt-1">
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                    Numero de parcelas
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={48}
                    value={form.installment_total}
                    onChange={e => setForm({ ...form, installment_total: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                    style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
                    placeholder="Ex: 12"
                  />
                  {form.installment_total && parseInt(form.installment_total) >= 2 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {parseInt(form.installment_total)}x de {fmt(parseFloat(String(form.amount).replace(',', '.')) || 0)}
                      {' '}— total {fmt((parseFloat(String(form.amount).replace(',', '.')) || 0) * parseInt(form.installment_total))}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Observação */}
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Observacao <span style={{ opacity: 0.5 }}>(opcional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Notas adicionais..."
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
              style={{ background: 'var(--glass-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--glass-border)' }}
              onFocus={e  => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--primary-rgb,124,58,237),0.15)' }}
              onBlur={e   => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          {formError && (
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{formError}</p>
          )}
        </div>
      </AppModal>
    </PageContainer>
  )
}
