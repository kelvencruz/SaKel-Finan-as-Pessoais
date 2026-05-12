// src/lib/gamification.ts

import { createClient } from '@/lib/supabase/client'

export const LEVELS = [
  { level: 1, name: 'Novato Financeiro',      emoji: '🌱', minXP: 0,    maxXP: 500   },
  { level: 2, name: 'Poupador Consistente',   emoji: '💰', minXP: 500,  maxXP: 1500  },
  { level: 3, name: 'Orçamentista Eficiente', emoji: '📊', minXP: 1500, maxXP: 3000  },
  { level: 4, name: 'Estrategista Financeiro',emoji: '⚡', minXP: 3000, maxXP: 6000  },
  { level: 5, name: 'Mestre do Cofrinho',     emoji: '👑', minXP: 6000, maxXP: 99999 },
]

export const BADGES = [
  { id: 'first_transaction',  name: 'Primeira Transação',     emoji: '🏅', desc: 'Registrou sua primeira transação'          },
  { id: 'streak_7',           name: 'Fogo na Semana',         emoji: '🔥', desc: '7 dias seguidos usando o app'              },
  { id: 'streak_30',          name: 'Mês Consistente',        emoji: '📅', desc: '30 dias seguidos usando o app'             },
  { id: 'month_positive',     name: 'Mês no Azul',            emoji: '💚', desc: 'Terminou o mês com saldo positivo'         },
  { id: 'all_categorized',    name: 'Tudo Organizado',        emoji: '🏷️', desc: 'Categorizou todas as transações do mês'   },
  { id: 'first_investment',   name: 'Primeiro Investimento',  emoji: '📈', desc: 'Cadastrou seu primeiro investimento'       },
  { id: 'first_recurring',    name: 'Automatizador',          emoji: '🔁', desc: 'Cadastrou sua primeira recorrência'        },
  { id: 'budget_goal',        name: 'Meta Cumprida',          emoji: '🎯', desc: 'Cumpriu uma meta de orçamento'             },
  { id: 'three_months_blue',  name: 'Trio Positivo',          emoji: '🌟', desc: '3 meses consecutivos no azul'              },
  { id: 'first_account',      name: 'Bem-vindo!',             emoji: '🏦', desc: 'Cadastrou sua primeira conta'              },
  { id: 'ten_transactions',   name: 'Em Ritmo',               emoji: '💪', desc: 'Registrou 10 transações'                  },
  { id: 'fifty_transactions', name: 'Veterano',               emoji: '🦅', desc: 'Registrou 50 transações'                  },
]

export const XP_ACTIONS = {
  transaction_created:   10,
  transaction_categorized: 5,
  month_positive:       100,
  streak_7:              50,
  streak_30:            150,
  first_investment:      80,
  first_recurring:       20,
  budget_goal:           80,
  account_created:       30,
  three_months_blue:    200,
}

export function getLevelInfo(xp: number) {
  const level = LEVELS.slice().reverse().find(l => xp >= l.minXP) ?? LEVELS[0]
  const progress = ((xp - level.minXP) / (level.maxXP - level.minXP)) * 100
  return { ...level, progress: Math.min(progress, 100), xp }
}

export async function awardXP(userId: string, action: keyof typeof XP_ACTIONS, badgeId?: string) {
  const supabase = createClient()
  const xpAmount = XP_ACTIONS[action]

  // Busca gamificação atual
  const { data: current } = await supabase
    .from('user_gamification')
    .select('*')
    .eq('user_id', userId)
    .single()

  const currentXP     = current?.xp ?? 0
  const currentBadges = (current?.badges ?? []) as string[]
  const newXP         = currentXP + xpAmount
  const newLevel      = getLevelInfo(newXP).level

  // Adiciona badge se fornecido e ainda não tem
  const newBadges = badgeId && !currentBadges.includes(badgeId)
    ? [...currentBadges, badgeId]
    : currentBadges

  // Atualiza streak
  const today      = new Date().toISOString().split('T')[0]
  const lastActivity = current?.last_activity
  const streakDays = lastActivity === today
    ? current?.streak_days ?? 1
    : lastActivity === new Date(Date.now() - 86400000).toISOString().split('T')[0]
      ? (current?.streak_days ?? 0) + 1
      : 1

  await supabase.from('user_gamification').upsert({
    user_id:       userId,
    xp:            newXP,
    level:         newLevel,
    streak_days:   streakDays,
    last_activity: today,
    badges:        newBadges,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'user_id' })

  return { newXP, newLevel, leveledUp: newLevel > (current?.level ?? 1), newBadge: badgeId && !currentBadges.includes(badgeId) ? badgeId : null }
}

export async function getGamification(userId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('user_gamification')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!data) return null

  return {
    xp:          data.xp ?? 0,
    level:       getLevelInfo(data.xp ?? 0),
    streakDays:  data.streak_days ?? 0,
    badges:      (data.badges ?? []) as string[],
    lastActivity: data.last_activity,
  }
}
