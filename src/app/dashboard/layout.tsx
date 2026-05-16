// src/app/dashboard/layout.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useThemeStore } from '@/stores/useThemeStore'
import Sidebar from '@/components/Sidebar'
import UserMenu from '@/components/UserMenu'
import FloatingActionButton from '@/components/FloatingActionButton'
import { ToastManagerProvider } from '@/components/core/ToastManager'
import { initGamificacaoListener } from '@/features/gamificacao/listeners/gamificacaoListener'

// Registrado no escopo do módulo — roda uma vez só, sobrevive a re-renders e HMR
initGamificacaoListener()

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':                'Dashboard',
  '/dashboard/transacoes':     'Transações',
  '/dashboard/recorrencias':   'Recorrências',
  '/dashboard/contas':         'Contas',
  '/dashboard/cartoes':        'Cartões',
  '/dashboard/faturas':        'Faturas',
  '/dashboard/investimentos':  'Investimentos',
  '/dashboard/categorias':     'Categorias',
  '/dashboard/conquistas':     'Conquistas',
  '/dashboard/importar':       'Importar CSV',
  '/dashboard/settings':       'Configurações',
  '/dashboard/perfil':         'Meu Perfil',
}

// ... resto do arquivo sem nenhuma alteração

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function formatDate(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
  })
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Inicializa o tema assim que o usuário é identificado
function ThemeBootstrap() {
  const load = useThemeStore(s => s.load)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) load(user.id)
    })
  }, [load])

  return null
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [firstName, setFirstName] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          const raw = data?.full_name ?? user.email ?? ''
          setFirstName(raw.split(' ')[0])
        })
    })
  }, [])

  const isDashboardHome = pathname === '/dashboard'
  const pageTitle = PAGE_TITLES[pathname] ?? ''

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Inicializa tema do Supabase — sem renderizar nada */}
      <ThemeBootstrap />

      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">

        {/* ── HEADER GLOBAL ────────────────────────────────────────────── */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between shrink-0"
          style={{
            height:       '56px',
            padding:      '0 24px',
            background:   'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div className="flex flex-col justify-center pl-10 md:pl-0">
            {isDashboardHome ? (
              <>
                <span
                  className="text-[11px] leading-none"
                  style={{ color: 'var(--color-text-muted)', letterSpacing: '0.02em' }}
                >
                  {capitalize(formatDate())}
                </span>
                <span
                  className="text-[15px] font-semibold leading-tight mt-0.5"
                  style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}
                >
                  {getGreeting()}
                  {firstName && (
                    <>, <span style={{ color: 'var(--color-brand)' }}>{firstName}</span></>
                  )}
                </span>
              </>
            ) : (
              <span
                className="text-[15px] font-semibold"
                style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}
              >
                {pageTitle}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 min-w-0">
          {children}
        </main>

      </div>

      <FloatingActionButton />
      <ToastManagerProvider />
    </div>
  )
}