'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getLevelInfo, LEVELS, BADGES, getGamification } from '@/lib/gamification'

export default function ConquistasPage() {
  const supabase = createClient()
  const [loading,     setLoading]     = useState(true)
  const [enabled,     setEnabled]     = useState(true)
  const [xp,          setXp]          = useState(0)
  const [streakDays,  setStreakDays]  = useState(0)
  const [earnedBadges,setEarnedBadges]= useState<string[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      // Verifica se gamificação está ativa
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('gamification_enabled')
        .eq('user_id', user.id)
        .single()
      setEnabled(prefs?.gamification_enabled ?? true)

      const gam = await getGamification(user.id)
      if (gam) {
        setXp(gam.xp)
        setStreakDays(gam.streakDays)
        setEarnedBadges(gam.badges)
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-white border border-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Conquistas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Sua jornada financeira gamificada</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
          <span className="text-5xl mb-4 block">🎮</span>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Gamificação desativada</h2>
          <p className="text-sm text-gray-400 mb-4">Ative nas configurações para acompanhar seu progresso e conquistar badges.</p>
          <a href="/dashboard/settings"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
            Ir para Configurações
          </a>
        </div>
      </div>
    )
  }

  const levelInfo    = getLevelInfo(xp)
  const xpToNext     = levelInfo.maxXP - xp
  const earnedCount  = earnedBadges.length
  const totalBadges  = BADGES.length

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Conquistas</h1>
        <p className="text-sm text-gray-400 mt-0.5">Sua jornada financeira com o Kal</p>
      </div>

      {/* Card de nível */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-6 mb-6 text-white">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 shrink-0">
            <img src="/kal-avatar.png" alt="Kal" className="w-full h-full object-contain drop-shadow-lg" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium opacity-70 uppercase tracking-wider mb-0.5">Nível {levelInfo.level}</p>
            <h2 className="text-xl font-bold leading-tight">{levelInfo.emoji} {levelInfo.name}</h2>
            <p className="text-xs opacity-70 mt-0.5">{xp.toLocaleString('pt-BR')} XP total</p>
          </div>
        </div>

        {/* Barra de XP */}
        <div className="mb-2">
          <div className="flex justify-between text-xs opacity-70 mb-1">
            <span>{levelInfo.minXP} XP</span>
            <span>{levelInfo.maxXP === 99999 ? '∞' : levelInfo.maxXP + ' XP'}</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3">
            <div
              className="bg-white rounded-full h-3 transition-all duration-700"
              style={{ width: `${levelInfo.progress}%` }}
            />
          </div>
        </div>
        {levelInfo.level < 5 && (
          <p className="text-xs opacity-60">Faltam {xpToNext.toLocaleString('pt-BR')} XP para o próximo nível</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/20">
          <div className="text-center">
            <p className="text-xl font-bold">{xp.toLocaleString('pt-BR')}</p>
            <p className="text-[10px] opacity-60 uppercase tracking-wide">XP Total</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold">{streakDays}🔥</p>
            <p className="text-[10px] opacity-60 uppercase tracking-wide">Dias Seguidos</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold">{earnedCount}/{totalBadges}</p>
            <p className="text-[10px] opacity-60 uppercase tracking-wide">Conquistas</p>
          </div>
        </div>
      </div>

      {/* Mapa de níveis */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-4">Mapa de Progressão</p>
        <div className="space-y-3">
          {LEVELS.map((lvl, i) => {
            const reached  = xp >= lvl.minXP
            const current  = levelInfo.level === lvl.level
            return (
              <div key={lvl.level} className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${current ? 'bg-indigo-50 border border-indigo-100' : reached ? 'bg-gray-50' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0 ${reached ? 'bg-white shadow-sm' : 'bg-gray-100 opacity-40 grayscale'}`}>
                  {lvl.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${reached ? 'text-gray-800' : 'text-gray-400'}`}>{lvl.name}</p>
                    {current && <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-medium">Atual</span>}
                    {reached && !current && <span className="text-[10px] text-green-600">✓ Desbloqueado</span>}
                  </div>
                  <p className="text-xs text-gray-400">{lvl.minXP === 0 ? 'Início' : `A partir de ${lvl.minXP.toLocaleString('pt-BR')} XP`}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Badges */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-700">Badges</p>
          <span className="text-xs text-gray-400">{earnedCount} de {totalBadges} conquistados</span>
        </div>

        {/* Barra de progresso dos badges */}
        <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
          <div
            className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full h-2 transition-all"
            style={{ width: `${(earnedCount / totalBadges) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BADGES.map(badge => {
            const earned = earnedBadges.includes(badge.id)
            return (
              <div key={badge.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  earned
                    ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100'
                    : 'bg-gray-50 border-gray-100 opacity-50 grayscale'
                }`}
              >
                <span className="text-2xl shrink-0">{badge.emoji}</span>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${earned ? 'text-gray-800' : 'text-gray-500'}`}>{badge.name}</p>
                  <p className="text-xs text-gray-400 truncate">{badge.desc}</p>
                </div>
                {earned && <span className="text-green-500 shrink-0 ml-auto">✓</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Como ganhar XP */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-700 mb-4">Como ganhar XP</p>
        <div className="space-y-2">
          {[
            { action: 'Registrar uma transação',         xp: '+10 XP' },
            { action: 'Categorizar uma transação',       xp: '+5 XP'  },
            { action: 'Cadastrar uma conta',             xp: '+30 XP' },
            { action: 'Cadastrar uma recorrência',       xp: '+20 XP' },
            { action: 'Primeiro investimento',           xp: '+80 XP' },
            { action: 'Mês no azul',                     xp: '+100 XP'},
            { action: '3 meses consecutivos no azul',   xp: '+200 XP'},
            { action: '7 dias de streak',                xp: '+50 XP' },
            { action: '30 dias de streak',               xp: '+150 XP'},
            { action: 'Meta de orçamento cumprida',      xp: '+80 XP' },
          ].map(item => (
            <div key={item.action} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <p className="text-sm text-gray-600">{item.action}</p>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{item.xp}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
