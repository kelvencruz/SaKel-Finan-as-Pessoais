'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'
import type { Account, Category, CreditCard, Recorrencia, Frequency } from '@/types'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
// linha 31 — troca por:
import { Warning, ArrowsClockwise } from '@phosphor-icons/react'
type TxType = 'income' | 'expense'
type Toast  = { message: string; type: 'success' | 'error' }

interface DeleteModalState {
  open: boolean
  recorrencia: Recorrencia | null
  txCount: number
  futureTxCount: number
}

const fmt     = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')

const FREQ_LABELS: Record<Frequency, string> = {
  daily:   'Diária',
  weekly:  'Semanal',
  monthly: 'Mensal',
  yearly:  'Anual',
}

function nextDueDate(startDate: string, frequency: Frequency): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(startDate + 'T12:00:00')
  while (d < today) {
    switch (frequency) {
      case 'daily':   d.setDate(d.getDate() + 1); break
      case 'weekly':  d.setDate(d.getDate() + 7); break
      case 'monthly': d.setMonth(d.getMonth() + 1); break
      case 'yearly':  d.setFullYear(d.getFullYear() + 1); break
    }
  }
  return d.toISOString().split('T')[0]
}

const emptyForm = {
  type:            'expense' as TxType,
  description:     '',
  amount:          '',
  category_id:     '',
  account_id:      '',
  credit_card_id:  '',
  use_credit_card: false,
  frequency:       'monthly' as Frequency,
  start_date:      new Date().toISOString().split('T')[0],
  end_date:        '',
}

function RecorrenciasError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <PageContainer maxWidth="lg">
      <PageHeader title="Recorrências" />
      <div className="rounded-2xl p-10 text-center"
        style={{ background: 'var(--surface)', border: '1px dashed #fca5a5' }}>
        <Warning weight="duotone" size={32} style={{ color: 'var(--danger)' }} className="mx-auto mb-2" />
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Erro ao carregar recorrências</p>
        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
          {message ?? 'Não foi possível buscar os dados. Verifique sua conexão.'}
        </p>
        <button onClick={onRetry} className="text-sm font-medium" style={{ color: 'var(--primary)' }}>
          Tentar novamente
        </button>
      </div>
    </PageContainer>
  )
}

export default function RecorrenciasPage() {
  const supabase = createClient()

  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])
  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [categories,   setCategories]   = useState<Category[]>([])
  const [creditCards,  setCreditCards]  = useState<CreditCard[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [toast,        setToast]        = useState<Toast | null>(null)
  const [showModal,    setShowModal]    = useState(false)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [form,         setForm]         = useState(emptyForm)
  const [formError,    setFormError]    = useState<string | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [deleteModal,  setDeleteModal]  = useState<DeleteModalState>({
    open: false, recorrencia: null, txCount: 0, futureTxCount: 0,
  })
  const [deleting, setDeleting] = useState(false)

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadAll() {
    setLoading(true)
    setLoadError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const [{ data: rec, error: recErr }, { data: acc }, { data: cat }, { data: cards }] = await Promise.all([
        supabase.from('recurrences').select('*').eq('user_id', user.id).order('next_due_date'),
        supabase.from('accounts').select('id, name, current_balance').eq('user_id', user.id).order('name'),
        supabase.from('categories').select('id, name, type, icon').eq('user_id', user.id).order('name'),
        supabase.from('credit_cards').select('id, name, closing_day, due_day').eq('user_id', user.id).eq('is_active', true).order('name'),
      ])

      if (recErr) { setLoadError(recErr.message); return }

      const accList  = (acc   ?? []) as Account[]
      const catList  = (cat   ?? []) as Category[]
      const cardList = (cards ?? []) as CreditCard[]
      const recList  = (rec   ?? []) as Recorrencia[]

      const accMap  = Object.fromEntries(accList.map(a  => [a.id, a]))
      const catMap  = Object.fromEntries(catList.map(c  => [c.id, c]))
      const cardMap = Object.fromEntries(cardList.map(c => [c.id, c]))

      setRecorrencias(recList.map(r => ({
        ...r,
        account_name:     r.account_id     ? accMap[r.account_id]?.name      : undefined,
        category_name:    r.category_id    ? catMap[r.category_id]?.name     : undefined,
        category_icon:    r.category_id    ? catMap[r.category_id]?.icon     : undefined,
        credit_card_name: r.credit_card_id ? cardMap[r.credit_card_id]?.name : undefined,
      })))
      setAccounts(accList)
      setCategories(catList)
      setCreditCards(cardList)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Erro inesperado ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  function openCreate() {
    setForm({ ...emptyForm, account_id: accounts[0]?.id ?? '' })
    setEditingId(null)
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(r: Recorrencia) {
    setForm({
      type:            r.type,
      description:     r.description,
      amount:          String(r.amount),
      category_id:     r.category_id    ?? '',
      account_id:      r.account_id     ?? '',
      credit_card_id:  r.credit_card_id ?? '',
      use_credit_card: !!r.credit_card_id,
      frequency:       r.frequency,
      start_date:      r.start_date,
      end_date:        r.end_date ?? '',
    })
    setEditingId(r.id)
    setFormError(null)
    setShowModal(true)
  }

  async function handleSave() {
    setFormError(null)
    const amount = parseFloat(String(form.amount).replace(',', '.'))
    if (!form.description.trim())                      { setFormError('Descrição é obrigatória.'); return }
    if (isNaN(amount) || amount <= 0)                  { setFormError('Valor deve ser maior que zero.'); return }
    if (!form.use_credit_card && !form.account_id)     { setFormError('Selecione uma conta.'); return }
    if (form.use_credit_card  && !form.credit_card_id) { setFormError('Selecione um cartão.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFormError('Não autenticado.'); setSaving(false); return }

    const next = nextDueDate(form.start_date, form.frequency)
    const payload = {
      type:           form.type,
      description:    form.description.trim(),
      amount,
      category_id:    form.category_id    || null,
      account_id:     form.use_credit_card ? null : (form.account_id || null),
      credit_card_id: form.use_credit_card ? form.credit_card_id : null,
      frequency:      form.frequency,
      start_date:     form.start_date,
      end_date:       form.end_date || null,
      is_active:      true,
    }

    if (editingId) {
      const { error: err } = await supabase.from('recurrences').update(payload).eq('id', editingId)
      if (err) { setFormError(err.message); setSaving(false); return }
      showToast('Recorrência atualizada!')
    } else {
      const { error: err } = await supabase
        .from('recurrences').insert({ ...payload, user_id: user.id, next_due_date: next })
      if (err) { setFormError(err.message); setSaving(false); return }
      try {
        const result = await awardXP(user.id, 'first_recurring', 'first_recurring')
        if (result.newBadge) showToast('🔁 Badge desbloqueado: Automatizador! +20 XP')
        else showToast('Recorrência criada! +20 XP 🎉')
      } catch {
        showToast('Recorrência criada!')
      }
    }

    await loadAll()
    setShowModal(false)
    setSaving(false)
  }

  async function toggleActive(r: Recorrencia) {
    await supabase.from('recurrences').update({ is_active: !r.is_active }).eq('id', r.id)
    showToast(r.is_active ? 'Recorrência pausada.' : 'Recorrência reativada.')
    await loadAll()
  }

  async function handleDeleteClick(r: Recorrencia) {
    const today = new Date().toISOString().split('T')[0]
    const [{ count: total }, { count: future }] = await Promise.all([
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('recurrence_id', r.id),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('recurrence_id', r.id).gte('date', today),
    ])
    setDeleteModal({ open: true, recorrencia: r, txCount: total ?? 0, futureTxCount: future ?? 0 })
  }

  async function executeDelete(mode: 'pause' | 'future' | 'all') {
    if (!deleteModal.recorrencia) return
    setDeleting(true)
    const { id } = deleteModal.recorrencia
    const today = new Date().toISOString().split('T')[0]

    if (mode === 'pause') {
      await supabase.from('recurrences').update({ is_active: false }).eq('id', id)
      showToast('Recorrência pausada. Histórico preservado.')
    } else if (mode === 'future') {
      await supabase.from('transactions').delete().eq('recurrence_id', id).gte('date', today)
      await supabase.from('recurrences').update({ is_active: false }).eq('id', id)
      showToast(`Recorrência pausada e ${deleteModal.futureTxCount} lançamento(s) futuro(s) removido(s).`)
    } else {
      await supabase.from('transactions').delete().eq('recurrence_id', id)
      await supabase.from('recurrences').delete().eq('id', id)
      showToast('Recorrência e todos os lançamentos excluídos.')
    }

    setDeleteModal({ open: false, recorrencia: null, txCount: 0, futureTxCount: 0 })
    setDeleting(false)
    await loadAll()
  }

  async function generateNow(r: Recorrencia) {
    setGeneratingId(r.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGeneratingId(null); return }

    const today = new Date().toISOString().split('T')[0]
    let invoiceId: string | null = null

    if (r.credit_card_id) {
      const card = creditCards.find(c => c.id === r.credit_card_id)
      if (card) {
        const d = new Date(today + 'T12:00:00')
        let month = d.getMonth() + 1
        let year  = d.getFullYear()
        if (d.getDate() > card.closing_day) {
          month = month === 12 ? 1 : month + 1
          year  = month === 1  ? year + 1 : year
        }
        const { data: existing } = await supabase
          .from('credit_card_invoices').select('id')
          .eq('credit_card_id', r.credit_card_id).eq('month', month).eq('year', year).single()

        if (existing) {
          invoiceId = existing.id
        } else {
          const dueMonth = month === 12 ? 1 : month + 1
          const dueYear  = month === 12 ? year + 1 : year
          const dueDate  = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(card.due_day).padStart(2, '0')}`
          const { data: created } = await supabase
            .from('credit_card_invoices')
            .insert({ credit_card_id: r.credit_card_id, user_id: user.id, month, year, total_amount: 0, status: 'open', due_date: dueDate })
            .select('id').single()
          invoiceId = created?.id ?? null
        }
      }
    }

    const { error: err } = await supabase.from('transactions').insert({
      user_id:        user.id,
      type:           r.type,
      description:    r.description,
      amount:         r.amount,
      date:           today,
      account_id:     r.credit_card_id ? null : r.account_id,
      credit_card_id: r.credit_card_id ?? null,
      invoice_id:     invoiceId,
      category_id:    r.category_id,
      status:         r.credit_card_id ? 'posted' : 'pending',
      is_recurring:   true,
      recurrence_id:  r.id,
    })

    if (err) { showToast('Erro ao gerar transação.', 'error'); setGeneratingId(null); return }

    if (invoiceId) {
      const { data } = await supabase.from('transactions').select('amount').eq('invoice_id', invoiceId)
      const total = (data ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)
      await supabase.from('credit_card_invoices').update({ total_amount: total }).eq('id', invoiceId)
    }

    await awardXP(user.id, 'transaction_created').catch(() => {})
    const next = nextDueDate(today, r.frequency)
    await supabase.from('recurrences').update({ next_due_date: next }).eq('id', r.id)
    showToast(r.credit_card_id ? 'Transação gerada e lançada na fatura!' : 'Transação gerada com sucesso!')
    await loadAll()
    setGeneratingId(null)
  }

  const catsFiltradas = categories.filter(c => c.type === form.type || c.type === 'both')
  const ativas        = recorrencias.filter(r =>  r.is_active)
  const inativas      = recorrencias.filter(r => !r.is_active)

  if (loadError) return <RecorrenciasError message={loadError} onRetry={loadAll} />

  return (
    <PageContainer maxWidth="lg">

      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}

      <PageHeader
        title="Recorrências"
        description="Gerencie salário, aluguel, assinaturas e contas fixas."
        action={
          <button onClick={openCreate} className="btn-primary">
            + Nova Recorrência
          </button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl animate-pulse"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      ) : recorrencias.length === 0 ? (
        <div className="rounded-2xl p-12 text-center"
          style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>
          <p className="text-4xl mb-3">🔁</p>
          <p className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>
            Nenhuma recorrência ainda
          </p>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            Cadastre salário, aluguel, assinaturas e o sistema gera as transações automaticamente.
          </p>
          <button onClick={openCreate} className="btn-primary">
            Criar primeira recorrência
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {ativas.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Ativas ({ativas.length})
              </p>
              <div className="space-y-2">
                {ativas.map(r => (
                  <RecorrenciaCard key={r.id} r={r}
                    onEdit={openEdit} onToggle={toggleActive}
                    onDelete={handleDeleteClick} onGenerate={generateNow}
                    generatingId={generatingId} />
                ))}
              </div>
            </div>
          )}
          {inativas.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Pausadas ({inativas.length})
              </p>
              <div className="space-y-2 opacity-60">
                {inativas.map(r => (
                  <RecorrenciaCard key={r.id} r={r}
                    onEdit={openEdit} onToggle={toggleActive}
                    onDelete={handleDeleteClick} onGenerate={generateNow}
                    generatingId={generatingId} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal exclusão */}
      {deleteModal.open && deleteModal.recorrencia && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-sm p-6 shadow-xl" style={{ background: 'var(--surface)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg"
                style={{ background: 'var(--danger-light)' }}>⚠️</div>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Excluir recorrência</h3>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>"{deleteModal.recorrencia.description}"</span>
                  {' · '}{fmt(deleteModal.recorrencia.amount)}{' · '}{FREQ_LABELS[deleteModal.recorrencia.frequency]}
                </p>
              </div>
            </div>

            {deleteModal.txCount > 0 && (
              <div className="rounded-xl px-4 py-3 mb-4 text-xs space-y-1"
                style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', color: 'var(--text)' }}>
                <p className="font-semibold">⚠️ Esta recorrência possui lançamentos vinculados:</p>
                <p>• <span className="font-medium">{deleteModal.txCount} transação(ões)</span> no total</p>
                {deleteModal.futureTxCount > 0 && (
                  <p>• <span className="font-medium">{deleteModal.futureTxCount} futura(s)</span> (data ≥ hoje)</p>
                )}
              </div>
            )}

            <div className="space-y-2 mb-5">
              <button onClick={() => executeDelete('pause')} disabled={deleting}
                className="w-full text-left rounded-xl px-4 py-3 transition-colors disabled:opacity-40"
                style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>⏸ Pausar automação</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Para de gerar novas transações. Histórico completo preservado.</p>
              </button>
              {deleteModal.futureTxCount > 0 && (
                <button onClick={() => executeDelete('future')} disabled={deleting}
                  className="w-full text-left rounded-xl px-4 py-3 transition-colors disabled:opacity-40"
                  style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>🗓️ Pausar + remover futuras</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Remove {deleteModal.futureTxCount} lançamento(s) com data ≥ hoje.
                  </p>
                </button>
              )}
              <button onClick={() => executeDelete('all')} disabled={deleting}
                className="w-full text-left rounded-xl px-4 py-3 transition-colors disabled:opacity-40"
                style={{ border: '1px solid var(--danger)', background: 'var(--danger-light)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>🗑️ Excluir tudo</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Remove a recorrência e todos os {deleteModal.txCount} lançamento(s). Irreversível.
                </p>
              </button>
            </div>

            <button
              onClick={() => setDeleteModal({ open: false, recorrencia: null, txCount: 0, futureTxCount: 0 })}
              disabled={deleting}
              className="w-full rounded-lg py-2 text-sm disabled:opacity-40"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {deleting ? 'Processando...' : 'Cancelar'}
            </button>
          </div>
        </div>
      )}

      {/* Modal criar/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--surface)' }}>
            <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text)' }}>
              {editingId ? 'Editar Recorrência' : 'Nova Recorrência'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Tipo</label>
                <div className="flex gap-2">
                  {(['expense', 'income'] as TxType[]).map(t => (
                    <button key={t} onClick={() => setForm({ ...form, type: t, category_id: '' })}
                      className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors border"
                      style={{
                        background:  form.type === t ? (t === 'income' ? 'var(--success-light)' : 'var(--danger-light)') : 'transparent',
                        color:       form.type === t ? (t === 'income' ? 'var(--success)' : 'var(--danger)') : 'var(--text-muted)',
                        borderColor: form.type === t ? 'transparent' : 'var(--border)',
                      }}>
                      {t === 'income' ? '↑ Receita' : '↓ Despesa'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Descrição</label>
                <input type="text" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder={form.type === 'income' ? 'Ex: Salário, Aluguel recebido...' : 'Ex: Aluguel, Netflix, Academia...'}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>

              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Valor (R$)</label>
                <input type="text" inputMode="decimal" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="0,00"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Frequência</label>
                  <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value as Frequency })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="daily">Diária</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Data início</label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Data fim <span style={{ color: 'var(--text-muted)' }}>(opcional)</span>
                </label>
                <input type="date" value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>

              {form.type === 'expense' && creditCards.length > 0 && (
                <div className="flex items-center justify-between rounded-lg px-3 py-2.5"
                  style={{ background: 'var(--primary-light)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <span>💳</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--primary)' }}>Pagar com cartão</span>
                  </div>
                  <button
                    onClick={() => setForm({ ...form, use_credit_card: !form.use_credit_card, credit_card_id: creditCards[0]?.id ?? '' })}
                    className="relative w-10 h-5 rounded-full transition-colors"
                    style={{ background: form.use_credit_card ? 'var(--primary)' : 'var(--border-md)' }}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.use_credit_card ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}

              {form.use_credit_card && form.type === 'expense' ? (
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Cartão</label>
                  <select value={form.credit_card_id} onChange={e => setForm({ ...form, credit_card_id: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="">Selecione...</option>
                    {creditCards.map(c => <option key={c.id} value={c.id}>💳 {c.name}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Conta</label>
                  <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="">Selecione...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Categoria <span style={{ color: 'var(--text-muted)' }}>(opcional)</span>
                </label>
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">Sem categoria</option>
                  {catsFiltradas.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </div>

              {formError && <p className="text-sm" style={{ color: 'var(--danger)' }}>{formError}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg py-2 text-sm"
                style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: form.type === 'income' ? 'var(--success)' : 'var(--primary)' }}>
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar recorrência'}
              </button>
            </div>
          </div>
        </div>
      )}

    </PageContainer>
  )
}

function RecorrenciaCard({
  r, onEdit, onToggle, onDelete, onGenerate, generatingId,
}: {
  r: Recorrencia
  onEdit: (r: Recorrencia) => void
  onToggle: (r: Recorrencia) => void
  onDelete: (r: Recorrencia) => void
  onGenerate: (r: Recorrencia) => void
  generatingId: string | null
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const nextDate  = new Date(r.next_due_date + 'T12:00:00')
  const daysUntil = Math.round((nextDate.getTime() - today.getTime()) / 86400000)
  const isOverdue = daysUntil < 0
  const isDueSoon = daysUntil <= 3 && daysUntil >= 0

  return (
    <div className="rounded-xl px-4 py-3 flex items-center gap-4 group transition-colors"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
        style={{ background: r.type === 'income' ? 'var(--success-light)' : 'var(--danger-light)' }}>
        {r.category_icon
  ? <span>{r.category_icon}</span>
  : <ArrowsClockwise weight="duotone" size={18} style={{ color: 'var(--primary)' }} />
}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
            {r.description}
          </p>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
            {FREQ_LABELS[r.frequency]}
          </span>
          {r.credit_card_id && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
              💳 Cartão
            </span>
          )}
          {isOverdue && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
              Atrasada
            </span>
          )}
          {isDueSoon && !isOverdue && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
              Vence em {daysUntil}d
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
          {r.credit_card_name ? `💳 ${r.credit_card_name}` : (r.account_name ?? '—')}
          {r.category_name ? ` · ${r.category_name}` : ''}
          {' · Próxima: '}{fmtDate(r.next_due_date)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold"
          style={{ color: r.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
          {r.type === 'income' ? '+' : '−'} {fmt(r.amount)}
        </p>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-all flex gap-1 shrink-0">
        <button onClick={() => onGenerate(r)} disabled={generatingId === r.id}
          title="Gerar transação agora"
          className="text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-30"
          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
          {generatingId === r.id ? '...' : '▶'}
        </button>
        <button onClick={() => onToggle(r)} title={r.is_active ? 'Pausar' : 'Ativar'}
          className="text-xs px-2 py-1 rounded-lg transition-colors"
          style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          {r.is_active ? '⏸' : '▶'}
        </button>
        <button onClick={() => onEdit(r)} title="Editar"
          className="text-sm px-1.5 py-1 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}>✏️</button>
        <button onClick={() => onDelete(r)} title="Excluir"
          className="text-sm px-1.5 py-1 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}>🗑️</button>
      </div>
    </div>
  )
}