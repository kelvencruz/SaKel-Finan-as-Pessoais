'use client'

import { useEffect, useRef } from 'react'

interface XPToastProps {
  xp:     number
  badge?: string | null
  onDone: () => void
}

export function XPToast({ xp, badge, onDone }: XPToastProps) {
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
