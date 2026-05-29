// src/components/NovaContaModal.tsx
//
// Modal canônico de criação/edição de conta.
// Extraído de contas/page.tsx na sprint TD-006.
//
// CONTRATO:
//  - Criação: open=true, account=undefined → insere nova conta
//  - Edição:  open=true, account={...}    → edita conta existente
//  - onSaved: chamado após insert/update bem-sucedido
//  - onClose: chamado em cancelar ou após save
//
// REGRAS ARQUITETURAIS:
//  - Nunca abrir diretamente de página ou FAB
//    → sempre via dispatch('nova-conta') → ActionHubController
//  - Edição ainda pode ser aberta diretamente pela página (openEdit)
//    enquanto a página mantiver modal próprio — migrável futuramente
//  - Não usa framer-motion — transições max 300ms opacity/translate
//  - Tokens Luminous: var(--glass-*), var(--primary), var(--text-*)

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { awardXP } from '@/lib/gamification'
import { Account, AccountType } from '@/types'
import { AppModal } from '@/components/AppModal'
import { Bank, PiggyBank, Wallet, TrendUp, Folder } from '@phosphor-icons/react'

// ─── Constantes ──────────────────────────────────────────────────────────────

const ACCOUNT_TYPES: { value: AccountType; label: string; Icon: React.ElementType }[] = [
  { value: 'checking',   label: 'Conta Corrente', Icon: Bank },
  { value: 'savings',    label: 'Poupança',        Icon: PiggyBank },
  { value: 'cash',       label: 'Dinheiro',        Icon: Wallet },
  { value: 'investment', label: 'Investimentos',   Icon: TrendUp },
  { value: 'other',      label: 'Outro',            Icon: Folder },
]

const COLORS = [
  '#6366f1','#3b82f6','#22c55e','#f97316',
  '#ef4444','#ec4899','#14b8a6','#f59e0b',
  '#8b5cf6','#6b7280',
]

const emptyForm = {
  name:            '',
  type:            'checking' as AccountType,
  initial_balance: '',
  color:           '#6366f1',
  icon:            '',
  is_active:       true,
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NovaContaModalProps {
  open:     boolean
  onClose:  () => void
  onSaved:  () => void
  /** Passado pela página ao editar conta existente. Undefined = modo criação. */
  account?: Account
  /** Total de contas existentes — para gamification de primeira conta */
  accountCount?: number
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NovaContaModal({
  open,
  onClose,
  onSaved,
  account,
  accountCount = 0,
}: NovaContaModalProps) {
  const supabase   = createClient()
  const isEditing  = Boolean(account)

  const [form,   setForm]   = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Preencher form ao abrir no modo edição
  useEffect(() => {
    if (open && account) {
      setForm({
        name:            account.name,
        type:            account.type === 'credit' ? 'checking' : account.type,
        initial_balance: String(account.initial_balance),
        color:           account.color,
        icon:            account.icon ?? '',
        is_active:       account.is_active,
      })
    } else if (open && !account) {
      setForm(emptyForm)
    }
    setError(null)
  }, [open, account])

  async function handleSave() {
    setError(null)

    if (!form.name.trim()) {
      setError('Nome é obrigatório.')
      return
    }

    const initialBalance = parseFloat(
      String(form.initial_balance).replace(',', '.') || '0'
    )
    if (isNaN(initialBalance)) {
      setError('Saldo inicial inválido.')
      return
    }
    if (!isEditing && initialBalance < 0) {
      setError('Saldo inicial não pode ser negativo.')
      return
    }

    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Não autenticado.')
      setSaving(false)
      return
    }

    if (isEditing && account) {
      const { error: err } = await supabase
        .from('accounts')
        .update({
          name:      form.name.trim(),
          type:      form.type,
          color:     form.color,
          icon:      form.icon || null,
          is_active: form.is_active,
        })
        .eq('id', account.id)

      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }
    } else {
      const { error: err } = await supabase.from('accounts').insert({
        user_id:         user.id,
        name:            form.name.trim(),
        type:            form.type,
        initial_balance: initialBalance,
        current_balance: initialBalance,
        color:           form.color,
        icon:            form.icon || null,
        is_active:       true,
      })

      if (err) {
        setError(err.message)
        setSaving(false)
        return
      }

      const isFirstAccount = accountCount === 0
      await awardXP(
        user.id,
        'account_created',
        isFirstAccount ? 'first_account' : undefined
      ).catch(() => {})
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar Conta' : 'Nova Conta'}
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
            {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar conta'}
          </button>
        </AppModal.Footer>
      }
    >
      <div className="space-y-4">

        {/* Nome */}
        <div>
          <label
            className="block text-sm mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Nome da conta
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Ex: Nubank, Bradesco..."
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background:  'var(--glass-bg)',
              color:       'var(--text-primary)',
              border:      '1px solid var(--glass-border)',
              borderRadius:'0.5rem',
            }}
            onFocus={e  => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e   => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
          />
        </div>

        {/* Tipo */}
        <div>
          <label
            className="block text-sm mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Tipo
          </label>
          <select
            value={form.type}
            onChange={e => setForm({ ...form, type: e.target.value as AccountType })}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background:  'var(--glass-bg)',
              color:       'var(--text-primary)',
              border:      '1px solid var(--glass-border)',
              borderRadius:'0.5rem',
            }}
            onFocus={e  => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e   => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
          >
            {ACCOUNT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
            Para cartões de crédito, use{' '}
            <a
              href="/dashboard/cartoes"
              style={{ color: 'var(--primary)' }}
              className="hover:underline"
            >
              Cartões
            </a>.
          </p>
        </div>

        {/* Ícone — category_icon: única exceção permitida para emoji */}
        <div>
          <label
            className="block text-sm mb-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            Ícone{' '}
            <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>(emoji opcional)</span>
          </label>
          <input
            type="text"
            value={form.icon}
            onChange={e => setForm({ ...form, icon: e.target.value })}
            placeholder="Ex: 💜 🏦 💰"
            maxLength={4}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background:  'var(--glass-bg)',
              color:       'var(--text-primary)',
              border:      '1px solid var(--glass-border)',
              borderRadius:'0.5rem',
            }}
            onFocus={e  => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e   => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
          />
        </div>

        {/* Saldo inicial — apenas criação */}
        {!isEditing && (
          <div>
            <label
              className="block text-sm mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Saldo inicial (R$)
            </label>
            <input
              type="number"
              value={form.initial_balance}
              onChange={e => setForm({ ...form, initial_balance: e.target.value })}
              placeholder="0,00"
              min="0"
              step="0.01"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background:  'var(--glass-bg)',
                color:       'var(--text-primary)',
                border:      '1px solid var(--glass-border)',
                borderRadius:'0.5rem',
              }}
              onFocus={e  => (e.currentTarget.style.borderColor = 'var(--primary)')}
              onBlur={e   => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
              Saldo atual da conta no momento do cadastro.
            </p>
          </div>
        )}

        {/* Cor */}
        <div>
          <label
            className="block text-sm mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cor
          </label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map(color => (
              <button
                key={color}
                onClick={() => setForm({ ...form, color })}
                className="w-7 h-7 rounded-full transition-all"
                style={{
                  backgroundColor: color,
                  outline:         form.color === color ? `3px solid ${color}` : 'none',
                  outlineOffset:   '2px',
                  boxShadow:       form.color === color ? `0 0 8px ${color}60` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Ativo/inativo — apenas edição */}
        {isEditing && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="nova-conta-is-active"
              checked={form.is_active}
              onChange={e => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4"
              style={{ accentColor: 'var(--primary)' }}
            />
            <label
              htmlFor="nova-conta-is-active"
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              Conta ativa
            </label>
          </div>
        )}

        {/* Erro */}
        {error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
        )}

      </div>
    </AppModal>
  )
}
