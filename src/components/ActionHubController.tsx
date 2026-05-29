// src/components/ActionHubController.tsx
'use client'

import { useEffect, useState } from 'react'
import { useActionHubStore }   from '@/stores/useActionHubStore'
import type { ActionKey }      from '@/lib/fabRegistry'
import type { Account }        from '@/types'

import NovaTransacaoModal  from './NovaTransacaoModal'
import NovaContaModal      from './NovaContaModal'
import NovaCategoriaModal  from './NovaCategoriaModal'
import NovoCartaoModal     from './NovoCartaoModal'
import type { CardPayload } from './NovoCartaoModal'

const SAVE_EVENTS: Record<ActionKey, string> = {
  'nova-transacao':    'sakel:transacao-criada',
  'novo-investimento': 'sakel:investimento-criado',
  'novo-cartao':       'sakel:cartao-criado',
  'nova-conta':        'sakel:conta-criada',
  'nova-recorrencia':  'sakel:recorrencia-criada',
  'nova-categoria':    'sakel:categoria-criada',
  'novo-objetivo':     'sakel:objetivo-criado',
}

function emitSaveEvent(actionKey: ActionKey) {
  const eventName = SAVE_EVENTS[actionKey]
  if (eventName) window.dispatchEvent(new CustomEvent(eventName))
}

export default function ActionHubController() {
  const { pendingAction, actionPayload, clear } = useActionHubStore()

  const [modal,       setModal]       = useState<ActionKey | null>(null)
  const [editCard,    setEditCard]    = useState<CardPayload | null>(null)
  const [editAccount, setEditAccount] = useState<Account | null>(null)

  useEffect(() => {
    if (!pendingAction) return

    if (pendingAction === 'novo-cartao') {
      setEditCard((actionPayload as CardPayload) ?? null)
      setEditAccount(null)
    } else if (pendingAction === 'nova-conta') {
      setEditAccount((actionPayload as Account) ?? null)
      setEditCard(null)
    } else {
      setEditCard(null)
      setEditAccount(null)
    }

    setModal(pendingAction)
    clear()
  }, [pendingAction, actionPayload, clear])

  function handleClose() {
    setModal(null)
    setEditCard(null)
    setEditAccount(null)
  }

  function handleSaved(actionKey: ActionKey) {
    emitSaveEvent(actionKey)
    setModal(null)
    setEditCard(null)
    setEditAccount(null)
  }

  return (
    <>
      <NovaTransacaoModal
        open={modal === 'nova-transacao'}
        onClose={handleClose}
        onSaved={() => handleSaved('nova-transacao')}
      />

      {/* ── Nova Conta ─────────────────────────────────────────────────────
          Suporta criação (editAccount = null) e edição (editAccount = Account).
          contas/page.tsx despacha 'nova-conta' com payload opcional via
          dispatch('nova-conta', account) para o modo edição.
      ──────────────────────────────────────────────────────────────────── */}
      <NovaContaModal
        open={modal === 'nova-conta'}
        onClose={handleClose}
        onSaved={() => handleSaved('nova-conta')}
        account={editAccount ?? undefined}
      />

      <NovaCategoriaModal
        open={modal === 'nova-categoria'}
        onClose={handleClose}
        onSaved={() => handleSaved('nova-categoria')}
        mode="categoria"
      />

      <NovaCategoriaModal
        open={modal === 'novo-objetivo'}
        onClose={handleClose}
        onSaved={() => handleSaved('novo-objetivo')}
        mode="objetivo"
      />

      {/* ── Novo Cartão ── */}
      <NovoCartaoModal
        open={modal === 'novo-cartao'}
        onClose={handleClose}
        onSaved={() => handleSaved('novo-cartao')}
        editCard={editCard}
      />

      {/* ── Novo Investimento — pendente TD-002 ── */}
      {/*
      <NovoInvestimentoModal
        open={modal === 'novo-investimento'}
        onClose={handleClose}
        onSaved={() => handleSaved('novo-investimento')}
      />
      */}

      {/* ── Nova Recorrência — pendente Etapa 16 ── */}
      {/*
      <NovaRecorrenciaModal
        open={modal === 'nova-recorrencia'}
        onClose={handleClose}
        onSaved={() => handleSaved('nova-recorrencia')}
      />
      */}
    </>
  )
}