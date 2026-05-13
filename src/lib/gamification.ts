// src/lib/gamification.ts

import { createClient } from '@/lib/supabase/client'
import {
  Medal, Flame, CalendarCheck, TrendUp, Tag, ChartLine,
  ArrowsClockwise, Target, Star, Bank, Lightning, Crown,
  Barbell, Bird, Seedling, CurrencyDollar, ChartBar,
} from '@phosphor-icons/react'

// ─────────────────────────────────────────────────────────────────────────────
// Badge icon type
// ─────────────────────────────────────────────────────────────────────────────

export interface BadgeIconDef {
  icon: React.ElementType   // componente Phosphor
  color: string             // CSS token ou hex
  bg: string                // CSS token para background
}

// ─────────────────────────────────────────────────────────────────────────────
// LEVELS
// ─────────────────────────────────────────────────────────────────────────────

export const LEVELS = [
  { level: 1, name: 'Novato Financeiro',       iconDef: { icon: Seedling,       color: 'var(--success)',  bg: 'var(--success-light)'  }, minXP: 0,    maxXP: 500   },
  { level: 2, name: 'Poupador Consistente',    iconDef: { icon: CurrencyDollar, color: 'var(--warning)',  bg: 'var(--warning-light)'  }, minXP: 500,  maxXP: 1500  },
  { level: 3, name: 'Orçamentista Eficiente',  iconDef: { icon: ChartBar,       color: 'var(--primary)',  bg: 'var(--primary-light)'  }, minXP: 1500, maxXP: 3000  },
  { level: 4, name: 'Estrategista Financeiro', iconDef: { icon: Lightning,      color: 'var(--warning)',  bg: 'var(--warning-light)'  }, minXP: 3000, maxXP: 6000  },
  { level: 5, name: 'Mestre do Cofrinho',      iconDef: { icon: Crown,          color: '#f59e0b',         bg: 'var(--warning-light)'  }, minXP: 6000, maxXP: 99999 },
]

// ─────────────────────────────────────────────────────────────────────────────
// BADGES
// ─────────────────────────────────────────────────────────────────────────────

export const BADGES = [
  {
    id: 'first_transaction',
    name: 'Primeira Transação',
    desc: 'Registrou sua primeira transação',
    iconDef: { icon: Medal,           color: 'var(--warning)',  bg: 'var(--warning-light)'  },
  },
  {
    id: 'streak_7',
    name: 'Fogo na Semana',
    desc: '7 dias seguidos usando o app',
    iconDef: { icon: Flame,           color: '#f97316',         bg: 'var(--warning-light)'  },
  },
  {
    id: 'streak_30',
    name: 'Mês Consistente',
    desc: '30 dias seguidos usando o app',
    iconDef: { icon: CalendarCheck,   color: 'var(--primary)',  bg: 'var(--primary-light)'  },
  },
  {
    id: 'month_positive',
    name: 'Mês no Azul',
    desc: 'Terminou o mês com saldo positivo',
    iconDef: { icon: TrendUp,         color: 'var(--success)',  bg: 'var(--success-light)'  },
  },
  {
    id: 'all_categorized',
    name: 'Tudo Organizado',
    desc: 'Categorizou todas as transações do mês',
    iconDef: { icon: Tag,             color: 'var(--primary)',  bg: 'var(--primary-light)'  },
  },
  {
    id: 'first_investment',
    name: 'Primeiro Investimento',
    desc: 'Cadastrou seu primeiro investimento',
    iconDef: { icon: ChartLine,       color: 'var(--success)',  bg: 'var(--success-light)'  },
  },
  {
    id: 'first_recurring',
    name: 'Automatizador',
    desc: 'Cadastrou sua primeira recorrência',
    iconDef: { icon: ArrowsClockwise, color: 'var(--primary)',  bg: 'var(--primary-light)'  },
  },
  {
    id: 'budget_goal',
    name: 'Meta Cumprida',
    desc: 'Cumpriu uma meta de orçamento',
    iconDef: { icon: Target,          color: 'var(--danger)',   bg: 'var(--danger-light)'   },
  },
  {
    id: 'three_months_blue',
    name: 'Trio Positivo',
    desc: '3 meses consecutivos no azul',
    iconDef: { icon: Star,            color: '#f59e0b',         bg: 'var(--warning-light)'  },
  },
  {
    id: 'first_account',
    name: 'Bem-vindo!',
    desc: 'Cadastrou sua primeira conta',
    iconDef: { icon: Bank,            color: 'var(--primary)',  bg: 'var(--primary-light)'  },
  },
  {
    id: 'ten_transactions',
    name: 'Em Ritmo',
    desc: 'Registrou 10 transações',
    iconDef: { icon: Barbell,         color: 'var(--success)',  bg: 'var(--success-light)'  },
  },
  {
    id: 'fifty_transactions',
    name: 'Veterano',
    desc: 'Registrou 50 transações',
    iconDef: { icon: Bird,            color: 'var(--primary)',  bg: 'var(--primary-light)'  },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// XP ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const XP_ACTIONS = {
  transaction_created:      10,
  transaction_categorized:   5,
  month_positive:          100,
  streak_7:                 50,
  streak_30:               150,
  first_investment:         80,
  first_recurring:          20,
  budget_goal:              80,
  account_created:          30,
  three_months_blue:       200,
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getLevelInfo(xp: number) {
  const level = LEVELS.slice().reverse().find(l => xp >= l.minXP) ?? LEVELS[0]
  const progress = ((xp - level.minXP) / (level.maxXP - level.minXP)) * 100
  return { ...level, progress: Math.min(progress, 100), xp }
}

/** Retorna o iconDef de um badge pelo id, com fallback seguro */
export function getBadgeIconDef(badgeId: string): BadgeIconDef {
  const badge = BADGES.find(b => b.id === badgeId)
  return badge?.iconDef ?? { icon: Medal, color: 'var(--text-muted)', bg: 'var(--border)' }
}

// ─────────────────────────────────────────────────────────────────────────────
// awardXP
// ─────────────────────────────────────────────────────────────────────────────

export async function awardXP(
  userId: string,
  action: keyof typeof XP_ACTIONS,
  badgeId?: string,
) {
  const supabase = createClient()
  const xpAmount = XP_ACTIONS[action]

  const { data: current, error: fetchErr } = await supabase
    .from('user_gamification')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (fetchErr && fetchErr.code !== 'PGRST116') {
    console.error('[awardXP] fetch error:', fetchErr)
  }

  const currentXP = current?.xp ?? 0

  const rawBadges = current?.badges
  const currentBadges: string[] = Array.isArray(rawBadges)
    ? (rawBadges as string[])
    : rawBadges
      ? (JSON.parse(JSON.stringify(rawBadges)) as string[])
      : []

  const newXP    = currentXP + xpAmount
  const newLevel = getLevelInfo(newXP).level

  const newBadges: string[] =
    badgeId && !currentBadges.includes(badgeId)
      ? [...currentBadges, badgeId]
      : [...currentBadges]

  const today        = new Date().toISOString().split('T')[0]
  const lastActivity = current?.last_activity ?? null
  const yesterday    = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const streakDays =
    lastActivity === today
      ? (current?.streak_days ?? 1)
      : lastActivity === yesterday
        ? (current?.streak_days ?? 0) + 1
        : 1

  const payload = {
    user_id:       userId,
    xp:            newXP,
    level:         newLevel,
    streak_days:   streakDays,
    last_activity: today,
    badges:        newBadges,
    updated_at:    new Date().toISOString(),
  }

  const { error: upsertErr } = await supabase
    .from('user_gamification')
    .upsert(payload, { onConflict: 'user_id' })

  if (upsertErr) {
    console.error('[awardXP] upsert error:', upsertErr)
  }

  return {
    newXP,
    newLevel,
    leveledUp:  newLevel > (current?.level ?? 1),
    newBadge:   badgeId && !currentBadges.includes(badgeId) ? badgeId : null,
    streakDays,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getGamification
// ─────────────────────────────────────────────────────────────────────────────

export async function getGamification(userId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('user_gamification')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[getGamification] error:', error)
    }
    return null
  }

  if (!data) return null

  const rawBadges = data.badges
  const badges: string[] = Array.isArray(rawBadges)
    ? (rawBadges as string[])
    : rawBadges
      ? (JSON.parse(JSON.stringify(rawBadges)) as string[])
      : []

  return {
    xp:           data.xp ?? 0,
    level:        getLevelInfo(data.xp ?? 0),
    streakDays:   data.streak_days ?? 0,
    badges,
    lastActivity: data.last_activity,
  }
}
