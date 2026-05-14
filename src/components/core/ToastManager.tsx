'use client'

import { useEffect, useState } from 'react'

export type ToastItem =
  | { kind: 'confirm'; message: string }
  | { kind: 'xp';      xp: number; badge?: string | null }

interface ToastManagerState {
  queue:   ToastItem[]
  current: ToastItem | null
}

// ─── Store global (singleton fora do React) ───────────────────────────────────
type Listener = (state: ToastManagerState) => void
let _state: ToastManagerState = { queue: [], current: null }
const _listeners = new Set<Listener>()

function notify() {
  _listeners.forEach(fn => fn({ ..._state, queue: [..._state.queue] }))
}

export const toastManager = {
  push(item: ToastItem) {
    _state = { ..._state, queue: [..._state.queue, item] }
    notify()
  },
  // Chamado apenas quando o toast atual termina — avança para o próximo
  advance() {
    const [next, ...rest] = _state.queue
    _state = { queue: rest, current: next ?? null }
    notify()
  },
  clear() {
    _state = { queue: [], current: null }
    notify()
  },
}

// ─── Componentes de toast ─────────────────────────────────────────────────────

function ConfirmToast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] animate-bounce-in">
      <div className="bg-gray-900 text-white px-5 py-2.5 rounded-2xl shadow-xl text-sm font-medium">
        {message}
      </div>
    </div>
  )
}

function XPToast({ xp, badge, onDone }: { xp: number; badge?: string | null; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-1 animate-bounce-in">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-semibold">
        <span>⚡</span> +{xp} XP ganhos!
      </div>
      {badge && (
        <div className="bg-yellow-400 text-yellow-900 px-4 py-1.5 rounded-xl shadow text-xs font-semibold">
          🏅 Nova conquista desbloqueada!
        </div>
      )}
    </div>
  )
}

// ─── Provider — montar UMA VEZ no layout ─────────────────────────────────────
//
// Lógica da fila:
//   1. push() adiciona à fila — nunca toca em `current`
//   2. useEffect detecta que a fila tem itens e current é null → chama advance()
//   3. advance() move o primeiro da fila para `current`
//   4. O toast renderiza e, ao terminar seu timer, chama handleDone()
//   5. handleDone() chama advance() → limpa current e pega o próximo da fila
//   6. Volta ao passo 2 se ainda houver itens
//
// Nunca dois toasts em paralelo. Nunca um toast perdido.

export function ToastManagerProvider() {
  const [state, setState] = useState<ToastManagerState>(() => ({ ..._state, queue: [..._state.queue] }))

  useEffect(() => {
    _listeners.add(setState)
    return () => { _listeners.delete(setState) }
  }, [])

  // Só avança quando não há nada sendo exibido
  useEffect(() => {
    if (state.current === null && state.queue.length > 0) {
      // Pequeno delay para o React processar o unmount do toast anterior
      const t = setTimeout(() => toastManager.advance(), 80)
      return () => clearTimeout(t)
    }
  }, [state.current, state.queue.length])

  function handleDone() {
    toastManager.advance()
  }

  if (!state.current) return null

  const item = state.current

  if (item.kind === 'confirm') {
    return <ConfirmToast key={item.message + Date.now()} message={item.message} onDone={handleDone} />
  }
  if (item.kind === 'xp') {
    return <XPToast key={'xp-' + Date.now()} xp={item.xp} badge={item.badge} onDone={handleDone} />
  }
  return null
}
