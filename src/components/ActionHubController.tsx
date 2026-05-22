// src/components/ActionHubController.tsx
'use client'

import { useEffect, useState } from 'react'
import { useActionHubStore } from '@/stores/useActionHubStore'
import NovaTransacaoModal from './NovaTransacaoModal'
// Quando existirem: import NovaRecorrenciaModal from './NovaRecorrenciaModal'
// Quando existirem: import TransferenciaModal   from './TransferenciaModal'

export default function ActionHubController() {
  const { pendingAction, clear } = useActionHubStore()
  const [modal, setModal] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingAction) return
    setModal(pendingAction)
    clear()
  }, [pendingAction, clear])

  function handleSaved() {
    window.dispatchEvent(new CustomEvent('transacao-criada'))
    setModal(null)
  }

  return (
    <>
      <NovaTransacaoModal
        open={modal === 'nova-transacao'}
        onClose={() => setModal(null)}
        onSaved={handleSaved}
      />
      {/* Futuros modais entram aqui sem tocar no ActionHub ou FAB */}
    </>
  )
}