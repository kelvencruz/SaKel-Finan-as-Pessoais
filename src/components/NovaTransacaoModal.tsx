// src/components/NovaTransacaoModal.tsx
'use client'

import { useState, useEffect } from 'react'
import {
  ArrowUp,
  ArrowDown,
  ArrowsLeftRight,
  CreditCard,
  ArrowClockwise,
  CalendarDots,
  Target,
  CheckCircle,
  Clock,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react'
import { createClient } from '@/lib/supabase/client'
import { toastManager } from '@/components/core/ToastManager'
import { saveTransaction } from '@/features/financas/services/transactionService'
import { ModalShell } from '@/components/ui/ModalShell'

type TxType = 'income' | 'expense' | 'transfer'
type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface Account        { id: string; name: string; color: string; current_balance: number }
interface Category       { id: string; name: string; type: string; icon: string }
interface CreditCard     { id: string; name: string; color: string; closing_day: number; due_day: number }
interface InvestmentGoal { id: string; name: string; icon: string; color: string }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TYPE_CONFIG: Record<TxType, { label: string; Icon: React.ElementType; activeStyle: React.CSSProperties }> = {
  income: {
    label: 'Receita',
    Icon: ArrowUp,
    activeStyle: {
      background: 'rgba(34,197,94,0.12)',
      color: 'var(--color-success, #16a34a)',
      borderColor: 'rgba(34,197,94,0.35)',
    },
  },
  expense: {
    label: 'Despesa',
    Icon: ArrowDown,
    activeStyle: {
      background: 'rgba(239,68,68,0.12)',
      color: 'var(--color-danger, #DC2626)',
      borderColor: 'rgba(239,68,68,0.35)',
    },
  },
  transfer: {
    label: 'Transferência',
    Icon: ArrowsLeftRight,
    activeStyle: {
      background: 'rgba(var(--primary-rgb, 124,58,237),0.12)',
      color: 'var(--primary)',
      borderColor: 'rgba(var(--primary-rgb, 124,58,237),0.35)',
    },
  },
}

const FREQ_LABELS: Record<Frequency, string> = {
  daily:   'Diária',
  weekly:  'Semanal',
  monthly: 'Mensal',
  yearly:  'Anual',
}

const STATUS_CONFIG = [
  { value: 'paid',      label: 'Pago',      Icon: CheckCircle },
  { value: 'pending',   label: 'Pendente',  Icon: Clock },
  { value: 'overdue',   label: 'Vencido',   Icon: WarningCircle },
  { value: 'cancelled', label: 'Cancelado', Icon: XCircle },
]

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
  open:     boolean
  onClose:  () => void
  onSaved?: () => void
}

// ─── Toggle Luminous ──────────────────────────────────────────────────────────
function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        position:    'relative',
        width:        '2.5rem',
        height:       '1.25rem',
        borderRadius: '9999px',
        transition:   'background 200ms',
        background:   active ? 'var(--primary)' : 'var(--glass-border)',
        border:       'none',
        cursor:       'pointer',
        flexShrink:   0,
      }}
    >
      <span style={{
        position:     'absolute',
        top:           '0.125rem',
        width:         '1rem',
        height:        '1rem',
        background:    'white',
        borderRadius:  '9999px',
        boxShadow:     '0 1px 3px rgba(0,0,0,0.2)',
        transition:    'transform 200ms',
        transform:     active ? 'translateX(1.25rem)' : 'translateX(0.125rem)',
      }} />
    </button>
  )
}

// ─── Input style helper ───────────────────────────────────────────────────────
function inputStyle(focused: boolean): React.CSSProperties {
  return {
    width:        '100%',
    borderRadius: '0.5rem',
    padding:      '0.5rem 0.75rem',
    fontSize:     '0.875rem',
    outline:      'none',
    background:   'var(--glass-bg)',
    border:       `1px solid ${focused ? 'var(--primary)' : 'var(--glass-border)'}`,
    color:        'var(--color-text-primary)',
    transition:   'border-color 150ms',
  }
}

// ─── useFocus helper ──────────────────────────────────────────────────────────
function useFocus() {
  const [focused, setFocused] = useState(false)
  return {
    focused,
    onFocus: () => setFocused(true),
    onBlur:  () => setFocused(false),
  }
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

  // focus states
  const descFocus   = useFocus()
  const amountFocus = useFocus()
  const dateFocus   = useFocus()
  const notesFocus  = useFocus()

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

  const selectedCategory     = categories.find(c => c.id === form.category_id)
  const isInvestmentCategory = selectedCategory?.type === 'investment'

  // ─── FIN-002: getOrCreateInvoice com tratamento de race condition ────────────
  // Cenário: duas abas criam despesa no mesmo cartão/mês simultaneamente.
  // Ambas fazem SELECT → null, ambas tentam INSERT.
  // O segundo INSERT falha com código 23505 (unique_violation).
  // Fix: capturar o erro 23505 e re-buscar a fatura criada pela primeira aba.
  // Requer migration: ALTER TABLE credit_card_invoices ADD CONSTRAINT
  //   uq_invoice_card_month_year UNIQUE (credit_card_id, month, year);
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

    // Tentativa 1: busca fatura existente
    const { data: existing } = await supabase
      .from('credit_card_invoices').select('id')
      .eq('credit_card_id', cardId).eq('month', month).eq('year', year).single()
    if (existing) return existing.id

    // Tentativa 2: cria fatura
    const dueMonth = month === 12 ? 1 : month + 1
    const dueYear  = month === 12 ? year + 1 : year
    const dueDate  = `${dueYear}-${String(dueMonth).padStart(2,'0')}-${String(card.due_day).padStart(2,'0')}`

    const { data: created, error: insertErr } = await supabase
      .from('credit_card_invoices')
      .insert({ credit_card_id: cardId, user_id: userId, month, year, total_amount: 0, status: 'open', due_date: dueDate })
      .select('id').single()

    // FIX FIN-002: se outro processo criou a fatura no mesmo instante (race condition),
    // o INSERT falha com 23505 (unique_violation). Buscamos a fatura existente e retornamos.
    if (insertErr) {
      if (insertErr.code === '23505') {
        // Unique violation — fatura já existe (criada por outra aba/request)
        const { data: fallback } = await supabase
          .from('credit_card_invoices').select('id')
          .eq('credit_card_id', cardId).eq('month', month).eq('year', year).single()
        return fallback?.id ?? null
      }
      // Erro inesperado — propaga null para interromper o save
      console.error('[getOrCreateInvoice] erro inesperado:', insertErr)
      return null
    }

    return created?.id ?? null
  }

  // ─── updateInvoiceTotal com filtro deleted_at ────────────────────────────────
  // Sem o filtro, transações soft-deleted inflam o total da fatura.
  // Alinhado com FIN-001 aplicado em faturas-page.tsx.
  async function updateInvoiceTotal(invoiceId: string) {
    const { data } = await supabase
      .from('transactions')
      .select('amount')
      .eq('invoice_id', invoiceId)
      .is('deleted_at', null)           // ← consistência com FIN-001
    const total = (data ?? []).reduce((s: number, t: any) => s + Number(t.amount), 0)
    await supabase.from('credit_card_invoices').update({ total_amount: total }).eq('id', invoiceId)
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

  async function finish(confirmMessage: string) {
    toastManager.push({ kind: 'confirm', message: confirmMessage })
    await new Promise(resolve => setTimeout(resolve, 300))
    onSaved?.()
    onClose()
    setSaving(false)
  }

  async function handleSave() {
    setError(null)
    if (!form.description.trim())     { setError('Descricao e obrigatoria.'); return }
    if (isNaN(amount) || amount <= 0) { setError('Valor deve ser maior que zero.'); return }
    if (form.is_recurring && form.is_installment) {
      setError('Uma transacao nao pode ser recorrente e parcelada ao mesmo tempo.'); return
    }
    if (form.use_credit_card && form.type === 'expense') {
      if (!form.credit_card_id) { setError('Selecione um cartao.'); return }
    } else {
      if (!form.account_id) { setError('Selecione uma conta.'); return }
      if (form.type === 'transfer' && !form.destination_account_id) { setError('Selecione a conta de destino.'); return }
      if (form.type === 'transfer' && form.account_id === form.destination_account_id) { setError('Contas devem ser diferentes.'); return }
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Nao autenticado.'); setSaving(false); return }

    const goalId = isInvestmentCategory && form.goal_id ? form.goal_id : null

    // ─── RECORRENCIA ────────────────────────────────────────────────────────
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
        // TODO FIN-004: mover para RPC Supabase com NOW() server-side
        // calcNextDue client-side pode gerar D-1 para usuários em UTC-3
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
        setError(recErr?.message ?? 'Erro ao criar recorrencia.')
        setSaving(false)
        return
      }

      let invoiceId: string | null = null
      const accountId = form.use_credit_card ? null : (form.account_id || null)
      if (form.use_credit_card && form.type === 'expense') {
        invoiceId = await getOrCreateInvoice(form.credit_card_id, form.date, user.id)
        if (invoiceId === null && form.use_credit_card) {
          setError('Erro ao obter fatura do cartão. Tente novamente.')
          setSaving(false)
          return
        }
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

      if (invoiceId) await updateInvoiceTotal(invoiceId)

      await finish('Recorrencia salva')
      return
    }

    // ─── PARCELAMENTO ────────────────────────────────────────────────────────
    if (form.is_installment) {
      const dates   = getInstallmentDates()
      const groupId = crypto.randomUUID()
      const parcela = parseFloat(valorParcela.toFixed(2))

      for (let i = 0; i < dates.length; i++) {
        let invoiceId: string | null = null
        let accountId = form.account_id || null

        if (form.use_credit_card && form.type === 'expense') {
          invoiceId = await getOrCreateInvoice(form.credit_card_id, dates[i], user.id)
          if (invoiceId === null) {
            setError(`Erro ao obter fatura para parcela ${i + 1}. Tente novamente.`)
            setSaving(false)
            return
          }
          accountId = null
        }

        const txPayload = {
          user_id:             user.id,
          type:                form.type,
          description:         `${form.description.trim()} (${i + 1}/${form.installment_count})`,
          amount:              parcela,
          date:                dates[i],
          account_id:          accountId,
          category_id:         form.category_id || null,
          goal_id:             goalId,
          notes:               form.notes?.trim() || null,
          status:              i === 0 ? form.status : 'pending',
          credit_card_id:      form.use_credit_card ? form.credit_card_id : null,
          invoice_id:          invoiceId,
          is_installment:      true,
          installment_group:   groupId,
          installment_current: i + 1,
          installment_total:   form.installment_count,
        }

        if (i === 0) {
          const { error: txErr } = await saveTransaction({ userId: user.id, payload: txPayload })
          if (txErr) { setError(`Erro na parcela 1: ${txErr}`); setSaving(false); return }
        } else {
          const { error: txErr } = await supabase.from('transactions').insert(txPayload)
          if (txErr) { setError(`Erro na parcela ${i + 1}: ${txErr.message}`); setSaving(false); return }
        }

        if (invoiceId) await updateInvoiceTotal(invoiceId)
      }

      await finish(`${form.installment_count}x parcelas salvas`)
      return
    }

    // ─── TRANSACAO SIMPLES ───────────────────────────────────────────────────
    let invoiceId: string | null = null
    let accountId = form.account_id || null
    if (form.use_credit_card && form.type === 'expense') {
      invoiceId = await getOrCreateInvoice(form.credit_card_id, form.date, user.id)
      if (invoiceId === null) {
        setError('Erro ao obter fatura do cartão. Tente novamente.')
        setSaving(false)
        return
      }
      accountId = null
    }

    const payload: Record<string, unknown> = {
      user_id:                user.id,
      type:                   form.type,
      description:            form.description.trim(),
      amount,
      date:                   form.date,
      account_id:             accountId,
      destination_account_id: form.type === 'transfer' ? form.destination_account_id : null,
      category_id:            form.category_id || null,
      goal_id:                goalId,
      notes:                  form.notes?.trim() || null,
      status:                 form.use_credit_card ? 'posted' : form.status,
      credit_card_id:         form.use_credit_card ? form.credit_card_id : null,
      invoice_id:             invoiceId,
    }

    const { error: txErr } = await saveTransaction({ userId: user.id, payload })
    if (txErr) { setError(txErr); setSaving(false); return }

    if (invoiceId) await updateInvoiceTotal(invoiceId)

    await finish('Transacao salva')
  }

  const catsFiltradas = categories.filter(c => {
    if (form.type === 'transfer') return false
    if (form.type === 'income')   return c.type === 'income'  || c.type === 'both'
    if (form.type === 'expense')  return c.type === 'expense' || c.type === 'both' || c.type === 'investment'
    return false
  })

  function saveButtonStyle(): React.CSSProperties {
    if (saving) return { background: 'var(--primary)', opacity: 0.5, cursor: 'not-allowed' }
    if (form.use_credit_card)    return { background: 'var(--primary)' }
    if (form.type === 'income')  return { background: 'var(--color-success, #16a34a)' }
    if (form.type === 'expense') return { background: 'var(--color-danger, #DC2626)' }
    return { background: 'var(--primary)' }
  }

  const labelStyle: React.CSSProperties = {
    display:      'block',
    fontSize:     '0.875rem',
    marginBottom: '0.25rem',
    color:        'var(--color-text-muted)',
  }

  const mutedSmall: React.CSSProperties = {
    fontSize: '0.6875rem',
    color:    'var(--color-text-muted)',
    opacity:   0.6,
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <ModalShell open={open} onClose={onClose} title="Nova Transacao">

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Tipo */}
        <div>
          <label style={labelStyle}>Tipo</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['expense', 'income', 'transfer'] as TxType[]).map(t => {
              const { label, Icon, activeStyle } = TYPE_CONFIG[t]
              const isActive = form.type === t
              return (
                <button key={t}
                  onClick={() => setForm({ ...form, type: t, category_id: '', goal_id: '', use_credit_card: false })}
                  style={{
                    flex:           1,
                    padding:        '0.5rem 0',
                    borderRadius:   '0.5rem',
                    fontSize:       '0.75rem',
                    fontWeight:     500,
                    transition:     'all 150ms',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    gap:            '0.375rem',
                    cursor:         'pointer',
                    border:         '1px solid',
                    ...(isActive ? activeStyle : {
                      background:  'transparent',
                      color:       'var(--color-text-muted)',
                      borderColor: 'var(--glass-border)',
                    }),
                  }}
                >
                  <Icon size={14} weight="duotone" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Cartao de credito toggle */}
        {form.type === 'expense' && creditCards.length > 0 && (
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            background:     'rgba(var(--primary-rgb, 124,58,237),0.08)',
            border:         '1px solid rgba(var(--primary-rgb, 124,58,237),0.18)',
            borderRadius:   '0.5rem',
            padding:        '0.625rem 0.75rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CreditCard size={16} weight="duotone" style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: '0.875rem', color: 'var(--primary)', fontWeight: 500 }}>
                Pagar com cartao de credito
              </span>
            </div>
            <Toggle
              active={form.use_credit_card}
              onChange={() => setForm({ ...form, use_credit_card: !form.use_credit_card, credit_card_id: creditCards[0]?.id ?? '' })}
            />
          </div>
        )}

        {/* Descricao */}
        <div>
          <label style={labelStyle}>Descricao</label>
          <input type="text" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder={
              form.type === 'income'   ? 'Ex: Salario, Freelance...' :
              form.type === 'expense'  ? 'Ex: Mercado, Aluguel...' :
              'Ex: Para reserva...'
            }
            style={inputStyle(descFocus.focused)}
            onFocus={descFocus.onFocus}
            onBlur={descFocus.onBlur}
          />
        </div>

        {/* Valor + Data */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>
              {form.is_installment ? 'Valor total (R$)' : 'Valor (R$)'}
            </label>
            <input type="text" inputMode="decimal" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              placeholder="0,00"
              style={inputStyle(amountFocus.focused)}
              onFocus={amountFocus.onFocus}
              onBlur={amountFocus.onBlur}
            />
          </div>
          <div>
            <label style={labelStyle}>
              {form.is_installment ? 'Data 1a parcela' : 'Data'}
            </label>
            <input type="date"
              value={form.is_installment ? form.installment_first_date : form.date}
              onChange={e => setForm({ ...form, ...(form.is_installment ? { installment_first_date: e.target.value } : { date: e.target.value }) })}
              style={inputStyle(dateFocus.focused)}
              onFocus={dateFocus.onFocus}
              onBlur={dateFocus.onBlur}
            />
          </div>
        </div>

        {/* Cartao ou Conta/Status */}
        {form.use_credit_card && form.type === 'expense' ? (
          <div>
            <label style={labelStyle}>Cartao</label>
            <SelectField
              value={form.credit_card_id}
              onChange={v => setForm({ ...form, credit_card_id: v })}
            >
              <option value="">Selecione o cartao...</option>
              {creditCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
            <p style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '0.25rem' }}>
              A despesa sera lancada na fatura do cartao.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label style={labelStyle}>Status</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.375rem' }}>
                {STATUS_CONFIG.map(({ value, label, Icon }) => {
                  const isActive = form.status === value
                  return (
                    <button key={value}
                      onClick={() => setForm({ ...form, status: value })}
                      style={{
                        padding:        '0.375rem 0.25rem',
                        borderRadius:   '0.5rem',
                        fontSize:       '0.6875rem',
                        fontWeight:     500,
                        transition:     'all 150ms',
                        display:        'flex',
                        flexDirection:  'column',
                        alignItems:     'center',
                        gap:            '0.25rem',
                        cursor:         'pointer',
                        border:         '1px solid',
                        background:     isActive ? 'rgba(var(--primary-rgb, 124,58,237),0.12)' : 'transparent',
                        color:          isActive ? 'var(--primary)' : 'var(--color-text-muted)',
                        borderColor:    isActive ? 'rgba(var(--primary-rgb, 124,58,237),0.35)' : 'var(--glass-border)',
                      }}
                    >
                      <Icon size={14} weight="duotone" />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label style={labelStyle}>
                {form.type === 'transfer' ? 'Conta de Origem' : 'Conta'}
              </label>
              <SelectField
                value={form.account_id}
                onChange={v => setForm({ ...form, account_id: v })}
              >
                <option value="">Selecione...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} — {fmt(a.current_balance)}</option>
                ))}
              </SelectField>
            </div>

            {form.type === 'transfer' && (
              <div>
                <label style={labelStyle}>Conta de Destino</label>
                <SelectField
                  value={form.destination_account_id}
                  onChange={v => setForm({ ...form, destination_account_id: v })}
                >
                  <option value="">Selecione...</option>
                  {accounts.filter(a => a.id !== form.account_id).map(a => (
                    <option key={a.id} value={a.id}>{a.name} — {fmt(a.current_balance)}</option>
                  ))}
                </SelectField>
              </div>
            )}
          </>
        )}

        {/* Categoria */}
        {form.type !== 'transfer' && (
          <div>
            <label style={labelStyle}>
              Categoria <span style={mutedSmall}>(opcional)</span>
            </label>
            <SelectField
              value={form.category_id}
              onChange={v => setForm({ ...form, category_id: v, goal_id: '' })}
            >
              <option value="">Sem categoria</option>
              {catsFiltradas.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </SelectField>
          </div>
        )}

        {/* Objetivo de investimento */}
        {isInvestmentCategory && goals.length > 0 && (
          <div style={{
            background:   'rgba(var(--primary-rgb, 124,58,237),0.06)',
            border:       '1px solid rgba(var(--primary-rgb, 124,58,237),0.18)',
            borderRadius: '0.75rem',
            padding:      '0.75rem',
          }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--primary)', fontWeight: 500 }}>
              <Target size={14} weight="duotone" />
              Objetivo financeiro <span style={{ ...mutedSmall, color: 'var(--primary)', opacity: 0.5 }}>(opcional)</span>
            </label>
            <SelectField
              value={form.goal_id}
              onChange={v => setForm({ ...form, goal_id: v })}
            >
              <option value="">Sem objetivo especifico</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
            </SelectField>
            <p style={{ fontSize: '0.6875rem', color: 'var(--primary)', marginTop: '0.375rem', opacity: 0.7 }}>
              Vincula este aporte a um objetivo para acompanhar o progresso.
            </p>
          </div>
        )}

        {/* Recorrente */}
        {form.type !== 'transfer' && (
          <ExpandableSection
            icon={<ArrowClockwise size={16} weight="duotone" />}
            title="Recorrente"
            subtitle="Repete automaticamente"
            active={form.is_recurring}
            onToggle={() => setForm({ ...form, is_recurring: !form.is_recurring, is_installment: false })}
          >
            <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '0.75rem' }}>Frequencia</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.25rem' }}>
                  {(['daily','weekly','monthly','yearly'] as Frequency[]).map(f => (
                    <button key={f}
                      onClick={() => setForm({ ...form, recurrence_frequency: f })}
                      style={{
                        padding:     '0.375rem 0',
                        borderRadius:'0.5rem',
                        fontSize:    '0.6875rem',
                        fontWeight:  500,
                        transition:  'all 150ms',
                        cursor:      'pointer',
                        border:      '1px solid',
                        background:  form.recurrence_frequency === f ? 'var(--primary)' : 'transparent',
                        color:       form.recurrence_frequency === f ? '#fff' : 'var(--color-text-muted)',
                        borderColor: form.recurrence_frequency === f ? 'var(--primary)' : 'var(--glass-border)',
                      }}
                    >{FREQ_LABELS[f]}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: '0.75rem' }}>
                  Data de encerramento <span style={mutedSmall}>(opcional)</span>
                </label>
                <input type="date" value={form.recurrence_end_date}
                  onChange={e => setForm({ ...form, recurrence_end_date: e.target.value })}
                  style={inputStyle(false)}
                />
              </div>
              <p style={{ fontSize: '0.6875rem', color: 'var(--primary)', opacity: 0.8 }}>
                A partir de {form.date ? new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}, repete {FREQ_LABELS[form.recurrence_frequency].toLowerCase()}
                {form.recurrence_end_date ? ` ate ${new Date(form.recurrence_end_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ' sem data de encerramento'}.
              </p>
            </div>
          </ExpandableSection>
        )}

        {/* Parcelado */}
        {form.type === 'expense' && (
          <ExpandableSection
            icon={<CalendarDots size={16} weight="duotone" />}
            title="Parcelado"
            subtitle="Divide em varias parcelas"
            active={form.is_installment}
            onToggle={() => setForm({ ...form, is_installment: !form.is_installment, is_recurring: false })}
          >
            <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ ...labelStyle, fontSize: '0.75rem' }}>Numero de parcelas</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button
                    onClick={() => setForm({ ...form, installment_count: Math.max(2, form.installment_count - 1) })}
                    style={{
                      width:'2rem', height:'2rem', borderRadius:'0.5rem', flexShrink:0,
                      border:'1px solid var(--glass-border)', background:'var(--glass-bg)',
                      color:'var(--color-text-primary)', cursor:'pointer', fontSize:'1.125rem',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}
                  >−</button>
                  <span style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--color-text-primary)', minWidth:'2rem', textAlign:'center' }}>
                    {form.installment_count}x
                  </span>
                  <button
                    onClick={() => setForm({ ...form, installment_count: Math.min(48, form.installment_count + 1) })}
                    style={{
                      width:'2rem', height:'2rem', borderRadius:'0.5rem', flexShrink:0,
                      border:'1px solid var(--glass-border)', background:'var(--glass-bg)',
                      color:'var(--color-text-primary)', cursor:'pointer', fontSize:'1.125rem',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}
                  >+</button>
                  <div style={{ display:'flex', gap:'0.25rem', marginLeft:'auto' }}>
                    {[2,3,6,12,24].map(n => (
                      <button key={n}
                        onClick={() => setForm({ ...form, installment_count: n })}
                        style={{
                          padding:'0.25rem 0.375rem', borderRadius:'0.375rem', fontSize:'0.6875rem',
                          fontWeight:500, cursor:'pointer', border:'1px solid',
                          background:  form.installment_count === n ? 'var(--primary)' : 'transparent',
                          color:       form.installment_count === n ? '#fff' : 'var(--color-text-muted)',
                          borderColor: form.installment_count === n ? 'var(--primary)' : 'var(--glass-border)',
                          transition:  'all 150ms',
                        }}
                      >{n}x</button>
                    ))}
                  </div>
                </div>
              </div>

              {amount > 0 && (
                <div style={{
                  background:   'var(--glass-bg)',
                  border:       '1px solid var(--glass-border)',
                  borderRadius: '0.5rem',
                  padding:      '0.625rem 0.75rem',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:'0.75rem', color:'var(--color-text-muted)' }}>Valor por parcela</span>
                    <span style={{ fontSize:'0.875rem', fontWeight:700, color:'var(--primary)' }}>{fmt(valorParcela)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'0.25rem' }}>
                    <span style={{ fontSize:'0.6875rem', color:'var(--color-text-muted)', opacity:0.7 }}>Total</span>
                    <span style={{ fontSize:'0.6875rem', color:'var(--color-text-muted)', opacity:0.7 }}>
                      {form.installment_count}x de {fmt(valorParcela)} = {fmt(amount)}
                    </span>
                  </div>
                </div>
              )}

              <p style={{ fontSize:'0.6875rem', color:'var(--primary)', opacity:0.8 }}>
                {form.installment_count} parcelas mensais a partir de{' '}
                {form.installment_first_date
                  ? new Date(form.installment_first_date + 'T12:00:00').toLocaleDateString('pt-BR')
                  : '—'}.{' '}
                A 1a fica com status <strong>{form.status === 'paid' ? 'Pago' : 'Pendente'}</strong>, as demais como Pendente.
              </p>
            </div>
          </ExpandableSection>
        )}

        {/* Observacao */}
        <div>
          <label style={labelStyle}>
            Observacao <span style={mutedSmall}>(opcional)</span>
          </label>
          <textarea value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Notas adicionais..."
            style={{ ...inputStyle(notesFocus.focused), resize: 'none' }}
            onFocus={notesFocus.onFocus}
            onBlur={notesFocus.onBlur}
          />
        </div>

        {error && (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-danger, #DC2626)' }}>{error}</p>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display:    'flex',
        gap:        '0.75rem',
        marginTop:  '1.5rem',
        paddingTop: '1rem',
        borderTop:  '1px solid var(--glass-border)',
      }}>
        <button onClick={onClose}
          style={{
            flex:         1,
            borderRadius: '0.5rem',
            padding:      '0.5rem 0',
            fontSize:     '0.875rem',
            fontWeight:   500,
            cursor:       'pointer',
            border:       '1px solid var(--glass-border)',
            color:        'var(--color-text-secondary)',
            background:   'transparent',
            transition:   'background 150ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-hover-border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{
            flex:         1,
            color:        '#fff',
            borderRadius: '0.5rem',
            padding:      '0.5rem 0',
            fontSize:     '0.875rem',
            fontWeight:   500,
            cursor:       saving ? 'not-allowed' : 'pointer',
            border:       'none',
            transition:   'opacity 150ms',
            ...saveButtonStyle(),
          }}
        >
          {saving ? 'Salvando...' :
            form.is_installment ? `Salvar ${form.installment_count}x parcelas` :
            form.is_recurring   ? 'Salvar recorrencia' : 'Salvar'}
        </button>
      </div>

    </ModalShell>
  )
}

// ─── Sub-componentes locais ───────────────────────────────────────────────────

function SelectField({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  const [focused, setFocused] = useState(false)
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width:        '100%',
        borderRadius: '0.5rem',
        padding:      '0.5rem 0.75rem',
        fontSize:     '0.875rem',
        outline:      'none',
        background:   'var(--glass-bg)',
        border:       `1px solid ${focused ? 'var(--primary)' : 'var(--glass-border)'}`,
        color:        'var(--color-text-primary)',
        transition:   'border-color 150ms',
        cursor:       'pointer',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {children}
    </select>
  )
}

function ExpandableSection({
  icon,
  title,
  subtitle,
  active,
  onToggle,
  children,
}: {
  icon:     React.ReactNode
  title:    string
  subtitle: string
  active:   boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{
      borderRadius: '0.75rem',
      overflow:     'hidden',
      border:       `1px solid ${active ? 'rgba(var(--primary-rgb, 124,58,237),0.3)' : 'var(--glass-border)'}`,
      transition:   'border-color 200ms',
    }}>
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0.75rem 1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: active ? 'var(--primary)' : 'var(--color-text-muted)', transition: 'color 200ms' }}>
            {icon}
          </span>
          <div>
            <p style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--color-text-primary)', margin:0 }}>{title}</p>
            <p style={{ fontSize:'0.6875rem', color:'var(--color-text-muted)', margin:0 }}>{subtitle}</p>
          </div>
        </div>
        <Toggle active={active} onChange={onToggle} />
      </div>

      {active && (
        <div style={{
          background: 'rgba(var(--primary-rgb, 124,58,237),0.05)',
          borderTop:  '1px solid rgba(var(--primary-rgb, 124,58,237),0.12)',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}
