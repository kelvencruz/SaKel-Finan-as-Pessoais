// src/components/FloatingActionButton.tsx
'use client'

import { Plus } from '@phosphor-icons/react'
import { useActionHubStore } from '@/stores/useActionHubStore'

export default function FloatingActionButton() {
  const dispatch = useActionHubStore(s => s.dispatch)

  return (
    <button
      onClick={() => dispatch('nova-transacao')}
      title="Nova transação"
      className="md:hidden fixed z-40 w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
      style={{
        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
        bottom:     '1.5rem',
        right:      '1.5rem',
      }}
      aria-label="Nova transação"
    >
      <Plus size={22} weight="bold" />
    </button>
  )
}