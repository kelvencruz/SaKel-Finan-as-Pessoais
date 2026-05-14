'use client'

import { useEffect, useRef, useState } from 'react'

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
  // Chamado APENAS pelo handleDone — avança para o próximo
  advance() {
    const [next, ...rest] = _state.queue
    _state = { queue: rest, current: next ?? null }
    notify()
  },
  // Kickstart: move o primeiro da fila para current (só se current for null)
  start() {
    if (_state.current !== null || _state.queue.length === 0) return
    const [next, ...rest] = _state.queue
    _state = { queue: rest, current: next }
    notify()
  },
  clear() {
    _state = { queue: [], current: null }
    notify()
  },
}

// ─── Componentes de toast ─────────────────────────────────────────────────────

function ConfirmToast({ message, onDone }: { message: string; onDone: () => void }) {
  const called = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => {
      if (!called.current) { called.current = true; onDone() }
    }, 2500)
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
  const called = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => {
      if (!called.current) { called.current = true; onDone() }
    }, 4500)
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
// Lógica da fila (sem race condition):
//   1. push() só adiciona à fila — nunca toca em `current`
//   2. useEffect detecta fila com itens e current nulo → chama start() UMA vez
//   3. start() é idempotente: só age se current === null
//   4. O toast renderiza; ao terminar, chama handleDone()
//   5. handleDone() chama advance() → move próximo da fila para current
//   6. Se fila vazia, current vira null → useEffect de kickstart age de novo
//      quando/se novos itens chegarem
//
// `start()` e `advance()` são as únicas funções que alteram `current`.
// O useEffect só chama `start()` — nunca `advance()` — eliminando o double-advance.

export function ToastManagerProvider() {
  const [state, setState] = useState<ToastManagerState>(
    () => ({ ..._state, queue: [..._state.queue] })
  )

  useEffect(() => {
    _listeners.add(setState)
    return () => { _listeners.delete(setState) }
  }, [])

  // Kickstart: só inicia quando current for null e houver itens esperando
  useEffect(() => {
    if (state.current === null && state.queue.length > 0) {
      toastManager.start()
    }
  }, [state.current, state.queue.length])

  function handleDone() {
    toastManager.advance()
  }

  if (!state.current) return null

  const item = state.current

  if (item.kind === 'confirm') {
    return (
      <ConfirmToast
        key={`confirm-${item.message}`}
        message={item.message}
        onDone={handleDone}
      />
    )
  }
  if (item.kind === 'xp') {
    return (
      <XPToast
        key={`xp-${item.xp}-${item.badge ?? 'none'}`}
        xp={item.xp}
        badge={item.badge}
        onDone={handleDone}
      />
    )
  }
  return null
}
