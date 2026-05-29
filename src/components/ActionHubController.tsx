// src/components/ActionHubController.tsx
//
// Modal Orchestration Layer do Sakel.
//
// RESPONSABILIDADE ÚNICA:
//  - Observar pendingAction da store
//  - Abrir o modal correto para cada ActionKey
//  - Emitir evento de atualização após save
//  - Nunca interferir na lógica de UI ou pathname
//
// PRINCÍPIO ARQUITETURAL:
//  - Modais de domínio têm implementação ÚNICA e canônica
//  - Este arquivo apenas abre/fecha — nunca altera identidade visual dos modais
//  - FAB, ActionHub e botões de página JAMAIS abrem modais diretamente
//    → sempre passam pelo dispatch → store → aqui
//
// ADICIONANDO NOVO MODAL:
//  1. Importar o modal (ex: NovaContaModal)
//  2. Adicionar case no useEffect abaixo
//  3. Adicionar <NovaContaModal ... /> no JSX
//  4. Adicionar entrada em fabRegistry.ts
//  Zero impacto em FAB, ActionHub ou páginas.
//
// EVENTOS DE ATUALIZAÇÃO:
//  Cada modal emite um evento CustomEvent diferente ao salvar.
//  Páginas interessadas escutam o evento relevante via useEffect.
//  Isso desacopla o controller das páginas.

'use client'

import { useEffect, useState } from 'react'
import { useActionHubStore } from '@/stores/useActionHubStore'
import type { ActionKey } from '@/lib/fabRegistry'

// ─── Modais canônicos ────────────────────────────────────────────────────────
// Cada modal tem UMA implementação. Nunca fork, nunca clone local.
import NovaTransacaoModal  from './NovaTransacaoModal'
import NovaContaModal      from './NovaContaModal'
import NovaCategoriaModal  from './NovaCategoriaModal'

// TODO: descomentar quando os modais forem implementados
// import NovoInvestimentoModal from './NovoInvestimentoModal'
// import NovoCartaoModal       from './NovoCartaoModal'
// import NovaRecorrenciaModal  from './NovaRecorrenciaModal'

// ─── Mapa de evento por ActionKey ────────────────────────────────────────────
// Páginas escutam o evento correspondente para recarregar dados.
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
  if (eventName) {
    window.dispatchEvent(new CustomEvent(eventName))
  }
}

export default function ActionHubController() {
  const { pendingAction, clear } = useActionHubStore()
  const [modal, setModal] = useState<ActionKey | null>(null)

  useEffect(() => {
    if (!pendingAction) return
    setModal(pendingAction)
    clear()
  }, [pendingAction, clear])

  function handleClose() {
    setModal(null)
  }

  function handleSaved(actionKey: ActionKey) {
    emitSaveEvent(actionKey)
    setModal(null)
  }

  return (
    <>
      {/* ── Nova Transação ── */}
      <NovaTransacaoModal
        open={modal === 'nova-transacao'}
        onClose={handleClose}
        onSaved={() => handleSaved('nova-transacao')}
      />

      {/* ── Nova Conta ── */}
      <NovaContaModal
        open={modal === 'nova-conta'}
        onClose={handleClose}
        onSaved={() => handleSaved('nova-conta')}
      />

      {/* ── Nova Categoria ── */}
      <NovaCategoriaModal
        open={modal === 'nova-categoria'}
        onClose={handleClose}
        onSaved={() => handleSaved('nova-categoria')}
        mode="categoria"
      />

      {/* ── Novo Objetivo ── */}
      <NovaCategoriaModal
        open={modal === 'novo-objetivo'}
        onClose={handleClose}
        onSaved={() => handleSaved('novo-objetivo')}
        mode="objetivo"
      />

      {/* ── Novo Investimento ──────────────────────────────────────────────
          TODO: substituir pelo modal canônico quando implementado.
          A página de investimentos tem modal próprio (AppModal inline).
          Migrar para cá na próxima sprint de infraestrutura.
          Enquanto isso, o FAB em /investimentos despacha 'novo-investimento'
          mas o controller ainda não tem modal registrado → sem efeito.
          Para ativar: implementar NovoInvestimentoModal e descomentar abaixo.
      ──────────────────────────────────────────────────────────────────── */}
      {/*
      <NovoInvestimentoModal
        open={modal === 'novo-investimento'}
        onClose={handleClose}
        onSaved={() => handleSaved('novo-investimento')}
      />
      */}

      {/* ── Novo Cartão ── */}
      {/*
      <NovoCartaoModal
        open={modal === 'novo-cartao'}
        onClose={handleClose}
        onSaved={() => handleSaved('novo-cartao')}
      />
      */}

      {/* ── Nova Recorrência ── */}
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
