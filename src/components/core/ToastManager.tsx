'use client'

import { useEffect, useRef, useState } from 'react'

export type ToastItem =
  | { kind: 'confirm'; message: string }
  | { kind: 'xp';      xp: number; badge?: string | null }

interface ToastManagerState {
  queue:    ToastItem[]
  current:  ToastItem | null
}

// ─── Store global (singleton fora do React) ───────────────────────────────────
type Listener = (state: ToastManagerState) => void
let _state: ToastManagerState = { queue: [], current: null }
const _listeners = new Set<Listener>()

function notify() {
  _listeners.forEach(fn => fn({ ..._state }))
}

export const toastManager = {
  push(item: ToastItem) {
    _state = { ..._state, queue: [..._state.queue, item] }
    notify()
  },
  next() {
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

export function ToastManagerProvider() {
  const [state, setState] = useState<ToastManagerState>(_state)
  const processingRef     = useRef(false)

  useEffect(() => {
    _listeners.add(setState)
    return () => { _listeners.delete(setState) }
  }, [])

  // Avança a fila quando não há toast ativo
  useEffect(() => {
    if (!state.current && state.queue.length > 0 && !processingRef.current) {
      processingRef.current = true
      toastManager.next()
      processingRef.current = false
    }
  }, [state])

  function handleDone() {
    toastManager.next()
  }

  if (!state.current) return null

  const item = state.current

  if (item.kind === 'confirm') {
    return <ConfirmToast message={item.message} onDone={handleDone} />
  }
  if (item.kind === 'xp') {
    return <XPToast xp={item.xp} badge={item.badge} onDone={handleDone} />
  }
  return null
}