'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLevelInfo, LEVELS, BADGES, getGamification, getBadgeIconDef } from '@/lib/gamification'
import { kalAvatar } from '@/lib/kalAvatarBase64'
import {
  Flame, Lock, CheckCircle,
  ArrowRight, GameController,
} from '@phosphor-icons/react'

// ─── Badge Icon Component ────────────────────────────────────────────────────

function BadgeIcon({
  badgeId,
  size = 22,
  earned = true,
}: {
  badgeId: string
  size?: number
  earned?: boolean
}) {
  const def = getBadgeIconDef(badgeId)
  const Icon = def.icon
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0"
      style={{
        width:      size + 16,
        height:     size + 16,
        background: earned ? def.bg : 'var(--border)',
        opacity:    earned ? 1 : 0.5,
      }}
    >
      <Icon
        weight="duotone"
        size={size}
        style={{ color: earned ? def.color : 'var(--text-muted)' }}
      />
    </div>
  )
}

// ─── Level Icon Component ─────────────────────────────────────────────────────

function LevelIcon({
  level,
  size = 20,
  reached = true,
}: {
  level: typeof LEVELS[number]
  size?: number
  reached?: boolean
}) {
  const Icon = level.iconDef.icon
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width:      size + 14,
        height:     size + 14,
        background: reached ? level.iconDef.bg : 'var(--border)',
        opacity:    reached ? 1 : 0.4,
      }}
    >
      <Icon
        weight="duotone"
        size={size}
        style={{ color: reached ? level.iconDef.color : 'var(--text-muted)' }}
      />
    </div>
  )
}

// ─── XP Actions ──────────────────────────────────────────────────────────────

import {
  PencilSimple, Tag, Bank, ArrowsClockwise,
  ChartLine, TrendUp, Star, CalendarCheck, Target,
} from '@phosphor-icons/react'

const XP_ACTIONS_DISPLAY = [
  { action: 'Registrar uma transação',      xp: '+10 XP',  icon: PencilSimple,    color: 'var(--primary)' },
  { action: 'Categorizar uma transação',    xp: '+5 XP',   icon: Tag,             color: 'var(--primary)' },
  { action: 'Cadastrar uma conta',          xp: '+30 XP',  icon: Bank,            color: 'var(--primary)' },
  { action: 'Cadastrar uma recorrência',    xp: '+20 XP',  icon: ArrowsClockwise, color: 'var(--primary)' },
  { action: 'Primeiro investimento',        xp: '+80 XP',  icon: ChartLine,       color: 'var(--success)' },
  { action: 'Mês no azul',                  xp: '+100 XP', icon: TrendUp,         color: 'var(--success)' },
  { action: '3 meses consecutivos no azul', xp: '+200 XP', icon: Star,            color: '#f59e0b'        },
  { action: '7 dias de streak',             xp: '+50 XP',  icon: Flame,           color: '#f97316'        },
  { action: '30 dias de streak',            xp: '+150 XP', icon: CalendarCheck,   color: 'var(--primary)' },
  { action: 'Meta de orçamento cumprida',   xp: '+80 XP',  icon: Target,          color: 'var(--danger)'  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ConquistasPage() {
  const supabase = createClient()
  const [loading,      setLoading]      = useState(true)
  const [enabled,      setEnabled]      = useState(true)
  const [hasData,      setHasData]      = useState(false)
  const [xp,           setXp]           = useState(0)
  const [streakDays,   setStreakDays]   = useState(0)
  const [earnedBadges, setEarnedBadges] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('gamification_enabled')
        .eq('user_id', user.id)
        .single()
      setEnabled(prefs?.gamification_enabled ?? true)

      const gam = await getGamification(user.id)
      if (gam) {
        setHasData(true)
        setXp(gam.xp)
        setStreakDays(gam.streakDays)
        setEarnedBadges(gam.badges)
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-4" style={{ background: 'var(--bg)' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-xl skeleton" />
        ))}
      </div>
    )
  }

  // ── Gamificação desativada ────────────────────────────────────────────────
  if (!enabled) {
    return (
      <div className="min-h-screen p-6 max-w-4xl mx-auto" style={{ background: 'var(--bg)' }}>
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Conquistas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Sua jornada financeira gamificada</p>
        </div>
        <div className="card p-10 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--primary-light)' }}
          >
            <GameController weight="duotone" size={28} style={{ color: 'var(--primary)' }} />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
            Gamificação desativada
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Ative nas configurações para acompanhar seu progresso e conquistar badges.
          </p>
          <a
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            Ir para Configurações <ArrowRight size={14} />
          </a>
        </div>
      </div>
    )
  }

  // ── Sem dados ─────────────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <div className="min-h-screen p-6 max-w-4xl mx-auto" style={{ background: 'var(--bg)' }}>
        <div className="mb-6">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Conquistas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Sua jornada financeira com o Kal</p>
        </div>
        <div className="card p-10 text-center">
          <img src={kalAvatar} alt="Kal" className="w-20 h-20 object-contain mx-auto mb-4 drop-shadow" />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
            Nenhuma atividade ainda
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Registre sua primeira transação para começar a ganhar XP e desbloquear conquistas!
          </p>
          <a
            href="/dashboard/transacoes"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            Registrar transação <ArrowRight size={14} />
          </a>
        </div>
      </div>
    )
  }

  // ── Main ──────────────────────────────────────────────────────────────────
  const levelInfo   = getLevelInfo(xp)
  const xpToNext    = levelInfo.maxXP - xp
  const earnedCount = earnedBadges.length
  const totalBadges = BADGES.length
  const LevelIconComp = levelInfo.iconDef.icon

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Conquistas</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Sua jornada financeira com o Kal</p>
      </div>

      {/* Card de nível — gradiente brand */}
      <div
        className="rounded-2xl p-6 mb-6 text-white"
        style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%)',
          boxShadow:  'var(--card-shadow-lg)',
        }}
      >
        <div className="flex items-center gap-4 mb-4">
          {/* Avatar Kal */}
          <div className="w-16 h-16 shrink-0">
            <img src={kalAvatar} alt="Kal" className="w-full h-full object-contain drop-shadow-lg" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider mb-0.5" style={{ opacity: 0.7 }}>
              Nível {levelInfo.level}
            </p>
            <div className="flex items-center gap-2">
              <LevelIconComp weight="duotone" size={18} style={{ color: '#fff', opacity: 0.9 }} />
              <h2 className="text-xl font-bold leading-tight">{levelInfo.name}</h2>
            </div>
            <p className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
              {xp.toLocaleString('pt-BR')} XP total
            </p>
          </div>
        </div>

        {/* Barra XP */}
        <div className="mb-2">
          <div className="flex justify-between text-xs mb-1" style={{ opacity: 0.7 }}>
            <span>{levelInfo.minXP.toLocaleString('pt-BR')} XP</span>
            <span>{levelInfo.maxXP === 99999 ? '∞' : levelInfo.maxXP.toLocaleString('pt-BR') + ' XP'}</span>
          </div>
          <div className="w-full rounded-full h-3" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <div
              className="rounded-full h-3 transition-all duration-700"
              style={{ width: `${levelInfo.progress}%`, background: '#fff' }}
            />
          </div>
        </div>
        {levelInfo.level < 5 && (
          <p className="text-xs" style={{ opacity: 0.6 }}>
            Faltam {xpToNext.toLocaleString('pt-BR')} XP para o próximo nível
          </p>
        )}

        {/* Stats */}
        <div
          className="grid grid-cols-3 gap-3 mt-4 pt-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}
        >
          <div className="text-center">
            <p className="text-xl font-bold">{xp.toLocaleString('pt-BR')}</p>
            <p className="text-[10px] uppercase tracking-wide" style={{ opacity: 0.6 }}>XP Total</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <p className="text-xl font-bold">{streakDays}</p>
              <Flame
                weight="duotone"
                size={16}
                style={{ color: streakDays >= 7 ? '#fb923c' : 'rgba(255,255,255,0.5)' }}
              />
            </div>
            <p className="text-[10px] uppercase tracking-wide" style={{ opacity: 0.6 }}>Dias Seguidos</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold">{earnedCount}/{totalBadges}</p>
            <p className="text-[10px] uppercase tracking-wide" style={{ opacity: 0.6 }}>Conquistas</p>
          </div>
        </div>
      </div>

      {/* Mapa de níveis */}
      <div className="card p-5 mb-6">
        <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Mapa de Progressão</p>
        <div className="space-y-2">
          {LEVELS.map(lvl => {
            const reached = xp >= lvl.minXP
            const current = levelInfo.level === lvl.level
            return (
              <div
                key={lvl.level}
                className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                style={{
                  background:  current ? 'var(--primary-light)' : reached ? 'var(--bg-secondary)' : 'transparent',
                  border:      current ? '1px solid var(--primary)20' : '1px solid transparent',
                }}
              >
                <LevelIcon level={lvl} size={18} reached={reached} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: reached ? 'var(--text)' : 'var(--text-muted)' }}
                    >
                      {lvl.name}
                    </p>
                    {current && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--primary)', color: '#fff' }}
                      >
                        Atual
                      </span>
                    )}
                    {reached && !current && (
                      <span className="text-[10px] font-medium flex items-center gap-0.5" style={{ color: 'var(--success)' }}>
                        <CheckCircle weight="duotone" size={12} /> Desbloqueado
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {lvl.minXP === 0 ? 'Início' : `A partir de ${lvl.minXP.toLocaleString('pt-BR')} XP`}
                  </p>
                </div>
                {!reached && (
                  <Lock weight="duotone" size={14} style={{ color: 'var(--text-faint)' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Badges */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Badges</p>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{earnedCount} de {totalBadges}</span>
        </div>

        {/* Barra de progresso badges */}
        <div className="w-full rounded-full h-2 mb-4" style={{ background: 'var(--border)' }}>
          <div
            className="rounded-full h-2 transition-all duration-700"
            style={{
              width:      `${(earnedCount / totalBadges) * 100}%`,
              background: 'linear-gradient(90deg, var(--primary), #8b5cf6)',
            }}
          />
        </div>

        {earnedCount === 0 && (
          <p className="text-xs text-center mb-4" style={{ color: 'var(--text-muted)' }}>
            Nenhum badge conquistado ainda — comece registrando suas finanças!
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...BADGES]
            .sort((a, b) => {
              const aE = earnedBadges.includes(a.id) ? 0 : 1
              const bE = earnedBadges.includes(b.id) ? 0 : 1
              return aE - bE
            })
            .map(badge => {
              const earned = earnedBadges.includes(badge.id)
              const def    = getBadgeIconDef(badge.id)
              return (
                <div
                  key={badge.id}
                  className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                  style={{
                    background:   earned ? def.bg : 'var(--bg-secondary)',
                    borderColor:  earned ? `${def.color}30` : 'var(--border)',
                    opacity:      earned ? 1 : 0.6,
                  }}
                >
                  <BadgeIcon badgeId={badge.id} size={20} earned={earned} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-semibold"
                      style={{ color: earned ? 'var(--text)' : 'var(--text-muted)' }}
                    >
                      {badge.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {badge.desc}
                    </p>
                  </div>
                  {earned
                    ? <CheckCircle weight="duotone" size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    : <Lock weight="duotone" size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                  }
                </div>
              )
            })}
        </div>
      </div>

      {/* Como ganhar XP */}
      <div className="card p-5">
        <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Como ganhar XP</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {XP_ACTIONS_DISPLAY.map(item => {
            const Icon = item.icon
            return (
              <div
                key={item.action}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'var(--bg-secondary)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--surface)' }}
                >
                  <Icon weight="duotone" size={16} style={{ color: item.color }} />
                </div>
                <p className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>{item.action}</p>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                >
                  {item.xp}
                </span>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
