// src/app/dashboard/layout.tsx
//
// MUDANÇAS DESTA VERSÃO (mobile responsiveness):
//  - main: padding-bottom mobile aumentado para FAB não cobrir conteúdo
//  - Header: padding horizontal reduzido em mobile (px-4 md:px-6)
//  - Sidebar trigger area (pl-10) mantida — necessária para o toggle mobile
//  - ActionHub: já é hidden md:flex — sem mudança
//  - FloatingActionButton: já é md:hidden — sem mudança
//
// NÃO ALTERAR:
//  - Script de bootstrap de tema em src/app/layout.tsx
//  - useThemeStore localStorage behavior
//  - initGamificacaoListener() — chamada no módulo, não no componente

'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useThemeStore } from '@/stores/useThemeStore'
import { usePrivacyStore } from '@/stores/usePrivacyStore'
import Sidebar from '@/components/Sidebar'
import UserMenu from '@/components/UserMenu'
import FloatingActionButton from '@/components/FloatingActionButton'
import ActionHub from '@/components/ActionHub'
import ActionHubController from '@/components/ActionHubController'
import { ToastManagerProvider } from '@/components/core/ToastManager'
import { initGamificacaoListener } from '@/features/gamificacao/listeners/gamificacaoListener'

initGamificacaoListener()

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':               'Dashboard',
  '/dashboard/transacoes':    'Transações',
  '/dashboard/recorrencias':  'Recorrências',
  '/dashboard/contas':        'Contas',
  '/dashboard/cartoes':       'Cartões',
  '/dashboard/faturas':       'Faturas',
  '/dashboard/investimentos': 'Investimentos',
  '/dashboard/categorias':    'Categorias',
  '/dashboard/conquistas':    'Conquistas',
  '/dashboard/importar':      'Importar CSV',
  '/dashboard/settings':      'Configurações',
  '/dashboard/perfil':        'Meu Perfil',
}

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

function AppBootstrap() {
  const loadTheme   = useThemeStore(s => s.load)
  const syncPrivacy = usePrivacyStore(s => s.syncFromDB)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      loadTheme(user.id)
      syncPrivacy()
    })
  }, [loadTheme, syncPrivacy])

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
  const pageTitle       = PAGE_TITLES[pathname] ?? ''

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'var(--color-bg)' }}
    >
      <AppBootstrap />
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">

        <header
          className="sticky top-0 flex items-center justify-between shrink-0"
          style={{
            zIndex:       10,
            height:       '56px',
            // Mobile: px-4, Desktop: px-6
            padding:      '0 1rem',
            background:   'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {/* pl-10: reserva espaço para o botão de toggle da Sidebar em mobile */}
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
            {/* ActionHub: hidden md:flex — desktop apenas */}
            <ActionHub />
            <UserMenu />
          </div>
        </header>

        <main
          className="flex-1 min-w-0"
          style={{
            // Mobile: padding-bottom generoso para o FAB não cobrir o último item
            // O FAB tem 52px de altura + 1.5rem de bottom = ~76px
            // Adicionamos 96px em mobile para folga confortável
            // Em desktop (md+): sem padding extra (FAB não existe)
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/*
            Wrapper interno que aplica padding-bottom mobile via Tailwind.
            Não colocar no <main> direto para não interferir com PageContainer.
          */}
          <div className="pb-24 md:pb-0">
            {children}
          </div>
        </main>

      </div>

      {/* FAB: md:hidden — renderizado em todas as rotas, auto-oculta por registry */}
      <FloatingActionButton />

      {/* Modal Orchestration Layer — único ponto de abertura de modais globais */}
      <ActionHubController />

      <ToastManagerProvider />
    </div>
  )
}
