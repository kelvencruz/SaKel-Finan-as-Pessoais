'use client'

import { useEffect, useRef, useState } from 'react'
import { XPToast } from '@/features/gamificacao/components/XPToast'

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
  advance() {
    const [next, ...rest] = _state.queue
    _state = { queue: rest, current: next ?? null }
    notify()
  },
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

// ─── ConfirmToast — mantido inline (componente simples, sem justificativa para mover) ──

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

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastManagerProvider() {
  const [state, setState] = useState<ToastManagerState>(
    () => ({ ..._state, queue: [..._state.queue] })
  )

  useEffect(() => {
    _listeners.add(setState)
    return () => { _listeners.delete(setState) }
  }, [])

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
