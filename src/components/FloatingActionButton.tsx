'use client'

import { useState } from 'react'
import NovaTransacaoModal from './NovaTransacaoModal'

export default function FloatingActionButton() {
  const [open, setOpen] = useState(false)

  function handleSaved() {
    // Dispara evento para as páginas que precisam recarregar dados
    window.dispatchEvent(new CustomEvent('transacao-criada'))
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Nova Transacao"
        className="fixed z-40 w-14 h-14 rounded-full text-white text-2xl shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          bottom: '1.5rem',
          right: '1.5rem',
        }}
      >
        +
      </button>

      <NovaTransacaoModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={handleSaved}
      />
    </>
  )
}