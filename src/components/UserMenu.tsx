'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const AVATAR_COLORS = [
  ['#4f46e5','#7c3aed'], ['#0ea5e9','#6366f1'], ['#10b981','#0ea5e9'],
  ['#f59e0b','#ef4444'], ['#ec4899','#8b5cf6'], ['#14b8a6','#6366f1'],
]

function getAvatarColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string, email: string) {
  if (name && name.trim()) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export default function UserMenu() {
  const supabase = createClient()
  const [open,    setOpen]    = useState(false)
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).single()
      setName(profile?.full_name ?? '')
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) return (
    <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: 'var(--color-border)' }} />
  )

  const initials = getInitials(name, email)
  const displayName = name || email.split('@')[0]
  const [c1, c2] = getAvatarColor(email)

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors"
        style={{ background: open ? 'var(--color-brand-light)' : 'transparent' }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
        >
          {initials}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium leading-tight" style={{ color: 'var(--color-text-primary)' }}>
            {displayName}
          </p>
          <p className="text-[10px] leading-tight" style={{ color: 'var(--color-text-muted)' }}>
            {email}
          </p>
        </div>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          className={`hidden sm:block transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-lg z-50 overflow-hidden"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{displayName}</p>
                <p className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{email}</p>
              </div>
            </div>
          </div>

          <div className="p-1.5">
            <a href="/dashboard/perfil"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-brand-light)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <span>👤</span> Meu perfil
            </a>
            <a href="/dashboard/settings"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-brand-light)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <span>⚙️</span> Configurações
            </a>

            <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left"
              style={{ color: 'var(--color-danger)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fff1f0'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <span>🚪</span> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
