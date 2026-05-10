'use client'

import { useState } from 'react'
import NovaTransacaoModal from './NovaTransacaoModal'

export default function FloatingActionButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Nova Transação"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full text-white text-2xl shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
      >
        +
      </button>

      <NovaTransacaoModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          // Recarrega a página atual para refletir a nova transação
          window.location.reload()
        }}
      />
    </>
  )
}