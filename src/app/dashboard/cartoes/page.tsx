'use client'

// src/app/dashboard/cartoes/page.tsx
//
// REGRAS INVIOLÁVEIS observadas:
//  • AnimatedValue em todo valor financeiro (limit_amount nos cards e KPI)
//  • Tokens: var(--glass-bg), var(--glass-border), var(--primary), var(--text-primary),
//    var(--text-secondary), var(--danger), var(--warning) — zero tokens legados --color-*
//  • Hover: onMouseEnter/onMouseLeave com var(--glass-hover-border) — nunca hover:bg-white/5
//  • hidden md:flex no CTA primário do PageHeader
//  • Controller importa modais — esta página NÃO importa nem renderiza modais
//  • NUNCA .delete() — soft delete obrigatório (deleted_at = now())
//  • NUNCA omitir .is('deleted_at', null) em queries de leitura
//  • Phosphor Icons weight=duotone exclusivamente
//  • Abertura de modal via dispatch → store → ActionHubController

import { useEffect, useState, useCallback } from 'react'
import { createClient }         from '@/lib/supabase/client'
import { useActionHubStore }    from '@/stores/useActionHubStore'
import { PageContainer }        from '@/components/layout/PageContainer'
import { PageHeader }           from '@/components/layout/PageHeader'
import { AnimatedValue }        from '@/components/ui/AnimatedValue'
import { CreditCard, Plus, PencilSimple, Power, Trash } from '@phosphor-icons/react'

// ── tipos ─────────────────────────────────────────────────────────────────────

interface Card {
  id:           string
  user_id:      string
  account_id:   string | null
  name:         string
  limit_amount: number
  closing_day:  number
  due_day:      number
  color:        string
  icon:         string
  is_active:    boolean
  created_at:   string
  account?:     { name: string } | null
}

// ── página ────────────────────────────────────────────────────────────────────

export default function CartoesPage() {
  const supabase = createClient()
  const dispatch = useActionHubStore(s => s.dispatch)

  const [cards,      setCards]      = useState<Card[]>([])
  const [loading,    setLoading]    = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── queries ────────────────────────────────────────────────────────────────

  const loadCards = useCallback(async () => {
    const { data } = await supabase
      .from('credit_cards')
      .select('*, account:accounts(name)')
      .is('deleted_at', null)
      .order('created_at')
    setCards(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadCards() }, [loadCards])

  useEffect(() => {
    const handler = () => loadCards()
    window.addEventListener('sakel:cartao-criado', handler)
    return () => window.removeEventListener('sakel:cartao-criado', handler)
  }, [loadCards])

  // ── ações ──────────────────────────────────────────────────────────────────

  function openCreate() {
    dispatch('novo-cartao')
  }

  function openEdit(card: Card) {
    dispatch('novo-cartao', {
      id:           card.id,
      name:         card.name,
      limit_amount: card.limit_amount,
      closing_day:  card.closing_day,
      due_day:      card.due_day,
      account_id:   card.account_id,
      color:        card.color,
      is_active:    card.is_active,
    })
  }

  async function handleToggleActive(card: Card) {
    await supabase
      .from('credit_cards')
      .update({ is_active: !card.is_active })
      .eq('id', card.id)
    await loadCards()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await supabase
      .from('credit_cards')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    await loadCards()
    setDeletingId(null)
  }

  // ── derivados ──────────────────────────────────────────────────────────────

  const activeCards   = cards.filter(c => c.is_active)
  const inactiveCards = cards.filter(c => !c.is_active)
  const totalLimit    = activeCards.reduce((s, c) => s + Number(c.limit_amount), 0)

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader
        title="Cartões de Crédito"
        description="Gerencie seus cartões e limites"
        action={
          <button
            onClick={openCreate}
            className="hidden md:flex items-center gap-2 text-sm px-4 py-2 rounded-lg btn-primary"
          >
            <Plus weight="duotone" size={16} />
            Novo Cartão
          </button>
        }
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">

        <div
          className="relative rounded-xl p-4 border overflow-hidden"
          style={{
            background:           'var(--glass-bg)',
            backdropFilter:       'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            borderColor:          'var(--glass-border)',
          }}
        >
          <div className="absolute bottom-0 left-0 h-0.5 w-full rounded-b-xl" style={{ background: 'var(--primary)' }} />
          <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Total de cartões</p>
          <AnimatedValue
            value={activeCards.length}
            group="financial"
            format="number"
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <div
          className="relative rounded-xl p-4 border overflow-hidden"
          style={{
            background:           'var(--glass-bg)',
            backdropFilter:       'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            borderColor:          'var(--glass-border)',
          }}
        >
          <div className="absolute bottom-0 left-0 h-0.5 w-full rounded-b-xl" style={{ background: 'var(--chart-line-start)' }} />
          <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Limite total</p>
          <AnimatedValue
            value={totalLimit}
            group="financial"
            format="currency"
            className="text-2xl font-bold"
            style={{ color: 'var(--primary)' }}
          />
        </div>

        <div
          className="relative rounded-xl p-4 border overflow-hidden hidden sm:block"
          style={{
            background:           'var(--glass-bg)',
            backdropFilter:       'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            borderColor:          'var(--glass-border)',
          }}
        >
          <div className="absolute bottom-0 left-0 h-0.5 w-full rounded-b-xl" style={{ background: 'var(--text-secondary)' }} />
          <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Inativos</p>
          <AnimatedValue
            value={inactiveCards.length}
            group="financial"
            format="number"
            className="text-2xl font-bold"
            style={{ color: 'var(--text-secondary)' }}
          />
        </div>

      </div>

      {/* ── Lista ── */}
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Carregando...</p>

      ) : cards.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center border border-dashed"
          style={{ borderColor: 'var(--glass-border)', background: 'var(--glass-bg)' }}
        >
          <CreditCard
            weight="duotone"
            size={40}
            className="mx-auto mb-3"
            style={{ color: 'var(--text-secondary)' }}
          />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nenhum cartão cadastrado ainda.
          </p>
          <button
            onClick={openCreate}
            className="mt-3 text-sm hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Adicionar primeiro cartão
          </button>
        </div>

      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <div
              key={card.id}
              className="rounded-xl border transition-all duration-200"
              style={{
                background:           'var(--glass-bg)',
                backdropFilter:       'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                borderColor:          'var(--glass-border)',
                opacity:              card.is_active ? 1 : 0.5,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-hover-border)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border)'
              }}
            >
              {/* ── linha superior: ícone + info ── */}
              <div className="flex items-center gap-4 p-4 pb-3">
                {/* ícone colorido */}
                <div
                  className="w-14 h-10 rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: card.color }}
                >
                  <CreditCard weight="duotone" size={22} />
                </div>

                {/* info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {card.name}
                    </p>
                    {!card.is_active && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: 'var(--glass-bg)',
                          border:     '1px solid var(--glass-border)',
                          color:      'var(--text-secondary)',
                        }}
                      >
                        Inativo
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Limite:{' '}
                      <AnimatedValue
                        value={Number(card.limit_amount)}
                        group="financial"
                        format="currency"
                        className="text-xs font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      />
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Fecha dia{' '}
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {card.closing_day}
                      </span>
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Vence dia{' '}
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {card.due_day}
                      </span>
                    </span>
                    {card.account && (
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Conta:{' '}
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {card.account.name}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── linha inferior: ações — full width em mobile, alinhado à direita em md+ ── */}
              <div
                className="flex items-center justify-end gap-1 px-3 pb-3 pt-0 border-t md:border-t-0 md:px-4 md:pb-4 md:pt-0 md:mt-[-8px]"
                style={{ borderColor: 'var(--glass-border)' }}
              >
                <button
                  onClick={() => openEdit(card)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 py-2 md:py-1 px-3 md:px-2 rounded-lg text-xs transition-colors"
                  style={{ color: 'var(--text-secondary)', background: 'transparent', border: '1px solid transparent' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color       = 'var(--primary)'
                    e.currentTarget.style.borderColor = 'var(--glass-hover-border)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color       = 'var(--text-secondary)'
                    e.currentTarget.style.borderColor = 'transparent'
                  }}
                >
                  <PencilSimple weight="duotone" size={14} />
                  Editar
                </button>

                <button
                  onClick={() => handleToggleActive(card)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 py-2 md:py-1 px-3 md:px-2 rounded-lg text-xs transition-colors"
                  style={{ color: 'var(--text-secondary)', background: 'transparent', border: '1px solid transparent' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color       = 'var(--warning)'
                    e.currentTarget.style.borderColor = 'var(--glass-hover-border)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color       = 'var(--text-secondary)'
                    e.currentTarget.style.borderColor = 'transparent'
                  }}
                >
                  <Power weight="duotone" size={14} />
                  {card.is_active ? 'Desativar' : 'Ativar'}
                </button>

                <button
                  onClick={() => handleDelete(card.id)}
                  disabled={deletingId === card.id}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 py-2 md:py-1 px-3 md:px-2 rounded-lg text-xs transition-colors disabled:opacity-50"
                  style={{ color: 'var(--text-secondary)', background: 'transparent', border: '1px solid transparent' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color       = 'var(--danger)'
                    e.currentTarget.style.borderColor = 'var(--glass-hover-border)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color       = 'var(--text-secondary)'
                    e.currentTarget.style.borderColor = 'transparent'
                  }}
                >
                  <Trash weight="duotone" size={14} />
                  {deletingId === card.id ? '...' : 'Excluir'}
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* ── sem modal inline — NovoCartaoModal vive no ActionHubController ── */}
    </PageContainer>
  )
}
