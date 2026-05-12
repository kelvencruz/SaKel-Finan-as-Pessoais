'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Tab = 'perfil' | 'aparencia' | 'financeiro' | 'seguranca' | 'dados'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'perfil',     label: 'Perfil',     emoji: '👤' },
  { id: 'aparencia',  label: 'Aparência',  emoji: '🎨' },
  { id: 'financeiro', label: 'Financeiro', emoji: '💰' },
  { id: 'seguranca',  label: 'Segurança',  emoji: '🔒' },
  { id: 'dados',      label: 'Dados',      emoji: '📦' },
]

interface Prefs {
  full_name:            string
  timezone:             string
  theme:                string
  accent_color:         string
  sidebar_collapsed:    boolean
  compact_mode:         boolean
  currency:             string
  hide_balances:        boolean
  number_format:        string
  kaldiz_enabled:       boolean
  gamification_enabled: boolean
}

const DEFAULT_PREFS: Prefs = {
  full_name:            '',
  timezone:             'America/Sao_Paulo',
  theme:                'system',
  accent_color:         '#4f46e5',
  sidebar_collapsed:    false,
  compact_mode:         false,
  currency:             'BRL',
  hide_balances:        false,
  number_format:        'pt-BR',
  kaldiz_enabled:       true,
  gamification_enabled: true,
}

const ACCENT_COLORS = [
  { value: '#4f46e5', label: 'Índigo'   },
  { value: '#7c3aed', label: 'Violeta'  },
  { value: '#0ea5e9', label: 'Azul'     },
  { value: '#10b981', label: 'Verde'    },
  { value: '#f59e0b', label: 'Âmbar'   },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#ec4899', label: 'Rosa'     },
  { value: '#14b8a6', label: 'Teal'     },
]

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${active ? 'bg-indigo-500' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 mt-5 first:mt-0">{children}</h3>
}

function SaveButton({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <button
      onClick={onSave}
      disabled={saving}
      className="mt-6 w-full sm:w-auto bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
    >
      {saving ? 'Salvando…' : 'Salvar alterações'}
    </button>
  )
}

// ── Aba Perfil ──────────────────────────────────────────────────────────────
function TabPerfil({ prefs, email, onChange, onSave, saving }: {
  prefs: Prefs; email: string
  onChange: (p: Partial<Prefs>) => void; onSave: () => void; saving: boolean
}) {
  return (
    <div>
      <SectionTitle>Informações pessoais</SectionTitle>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nome completo</label>
          <input
            type="text"
            value={prefs.full_name}
            onChange={e => onChange({ full_name: e.target.value })}
            placeholder="Seu nome"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">E-mail</label>
          <input type="email" value={email} disabled
            className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
          <p className="text-[11px] text-gray-400 mt-1">O e-mail não pode ser alterado aqui.</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Fuso horário</label>
          <select
            value={prefs.timezone}
            onChange={e => onChange({ timezone: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="America/Sao_Paulo">Brasília (UTC-3)</option>
            <option value="America/Manaus">Manaus (UTC-4)</option>
            <option value="America/Fortaleza">Fortaleza (UTC-3)</option>
            <option value="America/Recife">Recife (UTC-3)</option>
            <option value="America/Noronha">Fernando de Noronha (UTC-2)</option>
          </select>
        </div>
      </div>
      <SaveButton onSave={onSave} saving={saving} />
    </div>
  )
}

// ── Aba Aparência ───────────────────────────────────────────────────────────
function TabAparencia({ prefs, onChange, onSave, saving }: {
  prefs: Prefs; onChange: (p: Partial<Prefs>) => void; onSave: () => void; saving: boolean
}) {
  function applyTheme(theme: string) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('sakel-theme', 'dark')
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
      localStorage.setItem('sakel-theme', 'light')
    } else {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
      localStorage.removeItem('sakel-theme')
    }
    onChange({ theme })
  }

  return (
    <div>
      <SectionTitle>Tema</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {[
          { value: 'light',  label: 'Claro',   emoji: '☀️' },
          { value: 'dark',   label: 'Escuro',  emoji: '🌙' },
          { value: 'system', label: 'Sistema', emoji: '💻' },
        ].map(t => (
          <button key={t.value} onClick={() => applyTheme(t.value)}
            className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-colors ${
              prefs.theme === t.value
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200'
            }`}
          >
            <span className="text-xl">{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      <SectionTitle>Cor de destaque</SectionTitle>
      <div className="flex flex-wrap gap-3">
        {ACCENT_COLORS.map(c => (
          <button key={c.value} onClick={() => onChange({ accent_color: c.value })} title={c.label}
            className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${prefs.accent_color === c.value ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
            style={{ background: c.value }}
          />
        ))}
      </div>

      <SectionTitle>Layout</SectionTitle>
      <Field label="Modo compacto" hint="Reduz o espaçamento entre elementos">
        <Toggle active={prefs.compact_mode} onChange={() => onChange({ compact_mode: !prefs.compact_mode })} />
      </Field>
      <Field label="Sidebar recolhida por padrão" hint="Mostra apenas ícones no desktop">
        <Toggle active={prefs.sidebar_collapsed} onChange={() => onChange({ sidebar_collapsed: !prefs.sidebar_collapsed })} />
      </Field>

      <SaveButton onSave={onSave} saving={saving} />
    </div>
  )
}

// ── Aba Financeiro ──────────────────────────────────────────────────────────
function TabFinanceiro({ prefs, onChange, onSave, saving }: {
  prefs: Prefs; onChange: (p: Partial<Prefs>) => void; onSave: () => void; saving: boolean
}) {
  return (
    <div>
      <SectionTitle>Moeda e formato</SectionTitle>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Moeda padrão</label>
          <select value={prefs.currency} onChange={e => onChange({ currency: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="BRL">R$ — Real Brasileiro</option>
            <option value="USD">$ — Dólar Americano</option>
            <option value="EUR">€ — Euro</option>
            <option value="GBP">£ — Libra Esterlina</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Formato numérico</label>
          <select value={prefs.number_format} onChange={e => onChange({ number_format: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="pt-BR">1.234,56 (padrão brasileiro)</option>
            <option value="en-US">1,234.56 (padrão americano)</option>
          </select>
        </div>
      </div>

      <SectionTitle>Privacidade</SectionTitle>
      <Field label="Ocultar saldos" hint="Substitui valores por •••••• em todas as telas">
        <Toggle active={prefs.hide_balances} onChange={() => onChange({ hide_balances: !prefs.hide_balances })} />
      </Field>

      <SectionTitle>Inteligência</SectionTitle>
      <Field label="Kal diz (insights)" hint="Exibe insights automáticos no dashboard">
        <Toggle active={prefs.kaldiz_enabled} onChange={() => onChange({ kaldiz_enabled: !prefs.kaldiz_enabled })} />
      </Field>
      <Field label="Gamificação" hint="Conquistas, XP e marcos financeiros">
        <Toggle active={prefs.gamification_enabled} onChange={() => onChange({ gamification_enabled: !prefs.gamification_enabled })} />
      </Field>

      <SaveButton onSave={onSave} saving={saving} />
    </div>
  )
}

// ── Aba Segurança ───────────────────────────────────────────────────────────
function TabSeguranca({ email }: { email: string }) {
  const supabase = createClient()
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleReset() {
    setSending(true); setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (err) setError(err.message); else setSent(true)
    setSending(false)
  }

  return (
    <div>
      <SectionTitle>Senha</SectionTitle>
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4">
        <p className="text-sm text-gray-700 mb-1">Alterar senha</p>
        <p className="text-xs text-gray-400 mb-4">
          Um link de redefinição será enviado para <strong>{email}</strong>.
        </p>
        {sent ? (
          <p className="text-sm text-green-600 flex items-center gap-2"><span>✅</span> Link enviado! Verifique seu e-mail.</p>
        ) : (
          <button onClick={handleReset} disabled={sending}
            className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {sending ? 'Enviando…' : 'Enviar link de redefinição'}
          </button>
        )}
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      <SectionTitle>Sessões</SectionTitle>
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
        <p className="text-sm text-gray-700 mb-1">Gerenciar sessões ativas</p>
        <p className="text-xs text-gray-400 mb-3">Visualize e encerre sessões em outros dispositivos.</p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">
          🚧 Em desenvolvimento
        </span>
      </div>
    </div>
  )
}

// ── Aba Dados ───────────────────────────────────────────────────────────────
function TabDados({ email }: { email: string }) {
  const supabase = createClient()
  const [exporting,   setExporting]   = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting,    setDeleting]    = useState(false)

  async function handleExport() {
    setExporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setExporting(false); return }
    const { data: txs } = await supabase
      .from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false })
    const rows = (txs ?? []) as Record<string, unknown>[]
    if (rows.length === 0) { alert('Nenhuma transação para exportar.'); setExporting(false); return }
    const headers = Object.keys(rows[0]).join(',')
    const lines   = rows.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const csv     = [headers, ...lines].join('\n')
    const blob    = new Blob([csv], { type: 'text/csv' })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement('a'); a.href = url
    a.download    = `sakel-transacoes-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
    setExporting(false)
  }

  async function handleDelete() {
    if (confirmText !== 'EXCLUIR') return
    setDeleting(true)
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  return (
    <div>
      <SectionTitle>Exportar dados</SectionTitle>
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4">
        <p className="text-sm text-gray-700 mb-1">Exportar transações</p>
        <p className="text-xs text-gray-400 mb-4">Baixe todas as suas transações em formato CSV.</p>
        <button onClick={handleExport} disabled={exporting}
          className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {exporting ? 'Exportando…' : '⬇ Exportar CSV'}
        </button>
      </div>

      <SectionTitle>Zona de perigo</SectionTitle>
      <div className="border border-red-100 rounded-xl p-4 bg-red-50">
        <p className="text-sm font-medium text-red-700 mb-1">Excluir conta</p>
        <p className="text-xs text-red-400 mb-4">Ação irreversível. Todos os dados serão permanentemente removidos.</p>
        {!confirming ? (
          <button onClick={() => setConfirming(true)}
            className="w-full sm:w-auto border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">
            Excluir minha conta
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-red-600 font-medium">Digite <strong>EXCLUIR</strong> para confirmar:</p>
            <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="EXCLUIR"
              className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            <div className="flex gap-2">
              <button onClick={() => { setConfirming(false); setConfirmText('') }}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={confirmText !== 'EXCLUIR' || deleting}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition-colors">
                {deleting ? 'Excluindo…' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const supabase = createClient()
  const [tab,     setTab]     = useState<Tab>('perfil')
  const [email,   setEmail]   = useState('')
  const [prefs,   setPrefs]   = useState<Prefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }
      setEmail(user.email ?? '')

      const { data: p } = await supabase
        .from('user_preferences').select('*').eq('user_id', user.id).single()

      if (p) {
        setPrefs({
          full_name:            p.full_name            ?? '',
          timezone:             p.timezone             ?? DEFAULT_PREFS.timezone,
          theme:                p.theme                ?? DEFAULT_PREFS.theme,
          accent_color:         p.accent_color         ?? DEFAULT_PREFS.accent_color,
          sidebar_collapsed:    p.sidebar_collapsed    ?? false,
          compact_mode:         p.compact_mode         ?? false,
          currency:             p.currency             ?? DEFAULT_PREFS.currency,
          hide_balances:        p.hide_balances        ?? false,
          number_format:        p.number_format        ?? DEFAULT_PREFS.number_format,
          kaldiz_enabled:       p.kaldiz_enabled       ?? true,
          gamification_enabled: p.gamification_enabled ?? true,
        })
      } else {
        // Sem registro em user_preferences ainda — lê o que tem em profiles
        const { data: profile } = await supabase
          .from('profiles').select('full_name, gamification_enabled, kal_enabled').eq('id', user.id).single()
        if (profile) {
          setPrefs(prev => ({
            ...prev,
            full_name:            profile.full_name            ?? prev.full_name,
            gamification_enabled: profile.gamification_enabled ?? prev.gamification_enabled,
            kaldiz_enabled:       profile.kal_enabled          ?? prev.kaldiz_enabled,
          }))
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  function handleChange(partial: Partial<Prefs>) {
    setPrefs(prev => ({ ...prev, ...partial }))
  }

  async function handleSave() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    // Salva tudo em user_preferences (fonte primária)
    await supabase.from('user_preferences').upsert({
      user_id:              user.id,
      full_name:            prefs.full_name,
      timezone:             prefs.timezone,
      theme:                prefs.theme,
      accent_color:         prefs.accent_color,
      sidebar_collapsed:    prefs.sidebar_collapsed,
      compact_mode:         prefs.compact_mode,
      currency:             prefs.currency,
      hide_balances:        prefs.hide_balances,
      number_format:        prefs.number_format,
      kaldiz_enabled:       prefs.kaldiz_enabled,
      gamification_enabled: prefs.gamification_enabled,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // Sincroniza profiles (outras partes do app leem daqui)
    await supabase.from('profiles').update({
      full_name:            prefs.full_name,
      gamification_enabled: prefs.gamification_enabled,
      kal_enabled:          prefs.kaldiz_enabled,
      updated_at:           new Date().toISOString(),
    }).eq('id', user.id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 max-w-4xl mx-auto">
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-white border border-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 max-w-4xl mx-auto">

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-400 mt-0.5">Gerencie seu perfil, aparência e preferências</p>
      </div>

      {/* Toast */}
      {saved && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <span>✅</span> Salvo com sucesso!
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-6">

        {/* Tabs — mobile */}
        <div className="sm:hidden w-full">
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                  tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-100'
                }`}
              >
                <span>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar — desktop */}
        <nav className="hidden sm:flex flex-col w-44 shrink-0 gap-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${
                tab === t.id
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              <span>{t.emoji}</span> {t.label}
            </button>
          ))}
        </nav>

        {/* Conteúdo */}
        <div className="flex-1 bg-white border border-gray-100 rounded-xl p-4 sm:p-6 min-w-0 w-full">
          {tab === 'perfil'     && <TabPerfil     prefs={prefs} email={email} onChange={handleChange} onSave={handleSave} saving={saving} />}
          {tab === 'aparencia'  && <TabAparencia  prefs={prefs} onChange={handleChange} onSave={handleSave} saving={saving} />}
          {tab === 'financeiro' && <TabFinanceiro prefs={prefs} onChange={handleChange} onSave={handleSave} saving={saving} />}
          {tab === 'seguranca'  && <TabSeguranca  email={email} />}
          {tab === 'dados'      && <TabDados      email={email} />}
        </div>

      </div>
    </div>
  )
}
