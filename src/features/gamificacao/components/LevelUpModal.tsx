'use client'

import { useEffect, useRef } from 'react'
import { Confetti } from '@phosphor-icons/react'

interface LevelUpModalProps {
  level:     number
  levelName: string
  onDone:    () => void
}

export function LevelUpModal({ level, levelName, onDone }: LevelUpModalProps) {
  const called = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => {
      if (!called.current) { called.current = true; onDone() }
    }, 5000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="rounded-2xl p-8 text-center max-w-xs w-full animate-bounce-in"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--primary-light)' }}>
          <Confetti weight="duotone" size={32} style={{ color: 'var(--primary)' }} />
        </div>
        <p className="text-xs font-medium uppercase tracking-wider mb-1"
          style={{ color: 'var(--text-muted)' }}>Você subiu de nível!</p>
        <p className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
          Nível {level}
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--primary)' }}>{levelName}</p>
        <button
          onClick={() => { if (!called.current) { called.current = true; onDone() } }}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}>
          Continuar
        </button>
      </div>
    </div>
  )
}
