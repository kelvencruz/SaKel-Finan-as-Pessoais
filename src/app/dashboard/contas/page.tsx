// src/app/contas/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Account, AccountType } from '@/types'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader }    from '@/components/layout/PageHeader'
import { AppModal }      from '@/components/AppModal'
import { AnimatedValue } from '@/components/ui/AnimatedValue'
import { useActionHubStore } from '@/stores/useActionHubStore'
import {
  Bank, PiggyBank, Wallet, TrendUp, Folder,
  Plus, CheckCircle, XCircle, Warning,
} from '@phosphor-icons/react'

const ACCOUNT_TYPES: { value: AccountType; label: string; Icon: React.ElementType }[] = [
  { value: 'checking',   label: 'Conta Corrente', Icon: Bank },
  { value: 'savings',    label: 'Poupança',        Icon: PiggyBank },
  { value: 'cash',       label: 'Dinheiro',        Icon: Wallet },
  { value: 'investment', label: 'Investimentos',   Icon: TrendUp },
  { value: 'other',      label: 'Outro',            Icon: Folder },
]

type Toast        = { message: string; type: 'success' | 'error' }
type ConfirmState = { open: boolean; title: string; body: string; onConfirm: () => void }
const CONFIRM_CLOSED: ConfirmState = { open: false, title: '', body: '', onConfirm: () => {} }

export default function ContasPage() {
  const supabase = createClient()
  const dispatch = useActionHubStore(s => s.dispatch)

  const [accounts,   setAccounts]   = useState<Account[]>([])
  const [loading,    setLoading]    = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast,      setToast]      = useState<Toast | null>(null)
  const [confirm,    setConfirm]    = useState<ConfirmState>(CONFIRM_CLOSED)
  const [hoveredId,  setHoveredId]  = useState<string | null>(null)

  // ── helpers ───────────────────────────────────────────────────────────────

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function openConfirm(title: string, body: string, onConfirm: () => void) {
    setConfirm({ open: true, title, body, onConfirm })
  }

  // ── data ──────────────────────────────────────────────────────────────────

  const loadAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .neq('type', 'credit')
      .is('deleted_at', null)
      .order('created_at')
    setAccounts(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  // Escuta o evento canônico emitido pelo ActionHubController após save
  useEffect(() => {
    const handler = () => loadAccounts()
    window.addEventListener('sakel:conta-criada', handler)
    return () => window.removeEventListener('sakel:conta-criada', handler)
  }, [loadAccounts])

  // ── dispatch via controller ───────────────────────────────────────────────

  function openCreate() {
    dispatch('nova-conta')
  }

  function openEdit(account: Account) {
    dispatch('nova-conta', account)
  }

  // ── soft delete ───────────────────────────────────────────────────────────

  async function handleDelete(account: Account) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', account.id)
      .is('deleted_at', null)

    if (count && count > 0) {
      openConfirm(
        'Não é possível excluir',
        `"${account.name}" possui ${count} transação(ões) vinculada(s) e não pode ser excluída.`,
        () => setConfirm(CONFIRM_CLOSED),
      )
      return
    }

    openConfirm(
      'Excluir conta',
      `Tem certeza que deseja excluir "${account.name}"? Esta ação não poderá ser desfeita.`,
      async () => {
        setConfirm(CONFIRM_CLOSED)
        setDeletingId(account.id)
        const { error: err } = await supabase
          .from('accounts')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', account.id)
        if (err) showToast('Erro ao excluir conta.', 'error')
        else     showToast('Conta excluída.')
        await loadAccounts()
        setDeletingId(null)
      },
    )
  }

  async function toggleActive(account: Account) {
    await supabase
      .from('accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id)
    showToast(account.is_active ? 'Conta desativada.' : 'Conta reativada.')
    await loadAccounts()
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0)
  const activeCount  = accounts.filter(a => a.is_active).length
  const typeInfo     = (type: AccountType) =>
    ACCOUNT_TYPES.find(t => t.value === type) ?? { label: type, Icon: Folder }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <PageContainer>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle weight="duotone" size={16} />
            : <XCircle    weight="duotone" size={16} />}
          {toast.message}
        </div>
      )}

      {/* ── Header ── */}
      <PageHeader
        title="Contas Financeiras"
        description="Gerencie suas contas bancárias e carteiras"
        action={
          <div className="hidden md:flex">
            <button
              onClick={openCreate}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2 rounded-lg"
            >
              <Plus weight="bold" size={16} />
              Nova Conta
            </button>
          </div>
        }
      />

      {/* ── Banner cartões ── */}
      <div
        className="rounded-xl px-4 py-3 mb-6 flex items-center justify-between"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Cartões de crédito são gerenciados separadamente.
        </p>
        
         <a href="/dashboard/cartoes"
          className="text-xs font-medium hover:underline"
          style={{ color: 'var(--primary)' }}
        >
          Ir para Cartões →
        </a>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div
          className="glass-card rounded-xl p-5 sm:col-span-2"
          style={{ border: '1px solid var(--glass-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Saldo total</p>
          <div className="mt-1">
            <AnimatedValue
              value={totalBalance}
              format="currency"
              group="financial"
              className={`text-3xl font-bold ${
                totalBalance >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'
              }`}
            />
          </div>
        </div>

        <div
          className="glass-card rounded-xl p-5"
          style={{ border: '1px solid var(--glass-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Contas ativas</p>
          <div className="mt-1">
            <AnimatedValue
              value={activeCount}
              format="number"
              group="financial"
              className="text-3xl font-bold"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* ── Lista ── */}
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
      ) : accounts.length === 0 ? (
        <div
          className="glass-card rounded-xl p-10 text-center"
          style={{ border: '1px dashed var(--glass-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nenhuma conta cadastrada ainda.
          </p>
          <button
            onClick={openCreate}
            className="mt-3 text-sm hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Criar primeira conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map(account => {
            const info      = typeInfo(account.type)
            const isHovered = hoveredId === account.id
            return (
              <div
                key={account.id}
                className={`glass-card rounded-xl p-5 flex items-start justify-between transition-all duration-200 ${
                  account.is_active ? '' : 'opacity-60'
                }`}
                style={{
                  border: `1px solid ${isHovered ? 'var(--glass-hover-border)' : 'var(--glass-border)'}`,
                }}
                onMouseEnter={() => setHoveredId(account.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* esquerda — avatar + info */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                    style={{ backgroundColor: account.color }}
                  >
                    {account.icon ? account.icon : account.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        {account.name}
                      </p>
                      {!account.is_active && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)' }}
                        >
                          inativa
                        </span>
                      )}
                    </div>
                    <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <info.Icon weight="duotone" size={12} />
                      {info.label}
                    </p>
                    <div className="mt-1">
                      <AnimatedValue
                        value={Number(account.current_balance)}
                        format="currency"
                        group="financial"
                        className={`text-sm font-semibold ${
                          Number(account.current_balance) >= 0
                            ? 'text-[var(--success)]'
                            : 'text-[var(--danger)]'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* direita — ações */}
                <div className="flex flex-col gap-1 items-end">
                  <button
                    onClick={() => openEdit(account)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLElement).style.color      = 'var(--primary)'
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLElement).style.color      = 'var(--text-secondary)'
                      ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(account)}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLElement).style.color      = 'var(--warning)'
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLElement).style.color      = 'var(--text-secondary)'
                      ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    {account.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => handleDelete(account)}
                    disabled={deletingId === account.id}
                    className="text-xs px-2 py-1 rounded transition-colors disabled:opacity-50"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLElement).style.color      = 'var(--danger)'
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLElement).style.color      = 'var(--text-secondary)'
                      ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    {deletingId === account.id ? '...' : 'Excluir'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal de confirmação (excluir/desativar) ── */}
      {/* Mantido inline pois é utilitário da página, não domínio canônico */}
      <AppModal
        open={confirm.open}
        onClose={() => setConfirm(CONFIRM_CLOSED)}
        title={confirm.title}
        size="sm"
        footer={
          <AppModal.Footer align="between">
            <button
              onClick={() => setConfirm(CONFIRM_CLOSED)}
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
              onClick={confirm.onConfirm}
              className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--danger)' }}
            >
              Confirmar
            </button>
          </AppModal.Footer>
        }
      >
        <div className="flex items-start gap-3 py-1">
          <Warning weight="duotone" size={20} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {confirm.body}
          </p>
        </div>
      </AppModal>

    </PageContainer>
  )
}