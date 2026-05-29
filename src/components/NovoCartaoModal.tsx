'use client'

// src/components/NovoCartaoModal.tsx
//
// Modal canônico para criar e editar cartões de crédito.
// Implementação ÚNICA — nunca clonar nem reimplementar inline em páginas.
// Aberto exclusivamente via ActionHubController (dispatch → store → controller).
//
// Props:
//   open      — controla visibilidade
//   onClose   — fecha sem salvar
//   onSaved   — chamado após insert/update bem-sucedido
//   editCard  — se fornecido, entra em modo edição

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AppModal } from '@/components/AppModal'
import { CreditCard, Warning } from '@phosphor-icons/react'

// ── tipos locais ──────────────────────────────────────────────────────────────

export interface CardPayload {
  id:           string
  name:         string
  limit_amount: number
  closing_day:  number
  due_day:      number
  account_id:   string | null
  color:        string
  is_active:    boolean
}

interface Account {
  id:   string
  name: string
}

interface Props {
  open:      boolean
  onClose:   () => void
  onSaved:   () => void
  editCard?: CardPayload | null
}

// ── constantes ────────────────────────────────────────────────────────────────

const COLORS = [
  '#6366f1','#3b82f6','#22c55e','#f97316',
  '#ef4444','#ec4899','#14b8a6','#f59e0b',
  '#8b5cf6','#1e293b',
]

const emptyForm = {
  name:         '',
  limit_amount: '',
  closing_day:  '1',
  due_day:      '10',
  account_id:   '',
  color:        '#6366f1',
}

const fmtPreview = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ── componente ────────────────────────────────────────────────────────────────

export default function NovoCartaoModal({ open, onClose, onSaved, editCard }: Props) {
  const supabase = createClient()

  const [form,     setForm]     = useState(emptyForm)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // carrega contas para o select de vínculo
  useEffect(() => {
    supabase
      .from('accounts')
      .select('id, name')
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setAccounts(data ?? []))
  }, [])

  // popula form ao entrar em modo edição
  useEffect(() => {
    if (!open) return
    if (editCard) {
      setForm({
        name:         editCard.name,
        limit_amount: String(editCard.limit_amount),
        closing_day:  String(editCard.closing_day),
        due_day:      String(editCard.due_day),
        account_id:   editCard.account_id ?? '',
        color:        editCard.color,
      })
    } else {
      setForm(emptyForm)
    }
    setError(null)
  }, [open, editCard])

  // ── validação e save ───────────────────────────────────────────────────────

  async function handleSave() {
    setError(null)
    if (!form.name.trim())                                         { setError('Nome é obrigatório.'); return }
    const limit = parseFloat(form.limit_amount)
    if (!form.limit_amount || isNaN(limit) || limit < 0)           { setError('Limite inválido.'); return }
    const closing = parseInt(form.closing_day)
    const due     = parseInt(form.due_day)
    if (closing < 1 || closing > 31) { setError('Dia de fechamento inválido (1–31).'); return }
    if (due     < 1 || due     > 31) { setError('Dia de vencimento inválido (1–31).'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    const payload = {
      user_id:      user.id,
      name:         form.name.trim(),
      limit_amount: limit,
      closing_day:  closing,
      due_day:      due,
      account_id:   form.account_id || null,
      color:        form.color,
    }

    if (editCard) {
      const { error: err } = await supabase
        .from('credit_cards')
        .update(payload)
        .eq('id', editCard.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from('credit_cards')
        .insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false)
    onSaved()  // controller emite 'sakel:cartao-criado' e fecha
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const previewLimit = parseFloat(form.limit_amount) || 0

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={editCard ? 'Editar Cartão' : 'Novo Cartão'}
      size="md"
      footer={
        <AppModal.Footer align="between">
          <button
            onClick={onClose}
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
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 btn-primary"
          >
            {saving ? 'Salvando...' : editCard ? 'Salvar' : 'Adicionar'}
          </button>
        </AppModal.Footer>
      }
    >
      <div className="space-y-4">

        {/* Nome */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Nome do cartão
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Ex: Nubank, Itaú Platinum..."
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background:   'var(--glass-bg)',
              color:        'var(--text-primary)',
              border:       '1px solid var(--glass-border)',
              outlineColor: 'var(--primary)',
            }}
          />
        </div>

        {/* Limite */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Limite (R$)
          </label>
          <input
            type="number"
            value={form.limit_amount}
            onChange={e => setForm({ ...form, limit_amount: e.target.value })}
            placeholder="0,00"
            step="0.01"
            min="0"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background:   'var(--glass-bg)',
              color:        'var(--text-primary)',
              border:       '1px solid var(--glass-border)',
              outlineColor: 'var(--primary)',
            }}
          />
        </div>

        {/* Fechamento + Vencimento */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Dia de fechamento
            </label>
            <input
              type="number"
              value={form.closing_day}
              onChange={e => setForm({ ...form, closing_day: e.target.value })}
              min="1"
              max="31"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background:   'var(--glass-bg)',
                color:        'var(--text-primary)',
                border:       '1px solid var(--glass-border)',
                outlineColor: 'var(--primary)',
              }}
            />
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Dia de vencimento
            </label>
            <input
              type="number"
              value={form.due_day}
              onChange={e => setForm({ ...form, due_day: e.target.value })}
              min="1"
              max="31"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background:   'var(--glass-bg)',
                color:        'var(--text-primary)',
                border:       '1px solid var(--glass-border)',
                outlineColor: 'var(--primary)',
              }}
            />
          </div>
        </div>

        {/* Conta para pagamento */}
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            Conta para pagamento{' '}
            <span style={{ opacity: 0.6 }}>(opcional)</span>
          </label>
          <select
            value={form.account_id}
            onChange={e => setForm({ ...form, account_id: e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background:   'var(--glass-bg)',
              color:        'var(--text-primary)',
              border:       '1px solid var(--glass-border)',
              outlineColor: 'var(--primary)',
            }}
          >
            <option value="">Nenhuma conta vinculada</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Cor */}
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            Cor do cartão
          </label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(color => (
              <button
                key={color}
                onClick={() => setForm({ ...form, color })}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  outline:         form.color === color ? `3px solid ${color}` : 'none',
                  outlineOffset:   '2px',
                }}
              />
            ))}
          </div>
        </div>

        {/* Preview */}
        <div
          className="rounded-xl p-4 text-white text-sm font-medium flex items-center justify-between"
          style={{ backgroundColor: form.color }}
        >
          <span className="flex items-center gap-2">
            <CreditCard weight="duotone" size={18} />
            {form.name || 'Nome do cartão'}
          </span>
          <span>{fmtPreview(previewLimit)}</span>
        </div>

        {/* Erro */}
        {error && (
          <div className="flex items-center gap-2">
            <Warning weight="duotone" size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        )}

      </div>
    </AppModal>
  )
}
