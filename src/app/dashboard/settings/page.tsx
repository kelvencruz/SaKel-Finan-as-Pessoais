'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PasswordInput, getPasswordStrength } from '@/components/auth/PasswordInput'
import { WarningCircle } from '@phosphor-icons/react'

// ── Adicionado 'membros' ao tipo e array de tabs ──────────────────────────────
type Tab = 'perfil' | 'aparencia' | 'financeiro' | 'seguranca' | 'membros' | 'dados'

// REGRA INVIOLÁVEL #8 — zero emoji em navegação principal
const TABS: { id: Tab; label: string }[] = [
  { id: 'perfil',     label: 'Perfil'     },
  { id: 'aparencia',  label: 'Aparência'  },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'seguranca',  label: 'Segurança'  },
  { id: 'membros',    label: 'Membros'    },
  { id: 'dados',      label: 'Dados'      },
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
  kal_arcade_enabled:   boolean
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
  kal_arcade_enabled:   true,
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
          { value: 'light',  label: 'Claro'   },
          { value: 'dark',   label: 'Escuro'  },
          { value: 'system', label: 'Sistema' },
        ].map(t => (
          <button key={t.value} onClick={() => applyTheme(t.value)}
            className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-colors ${
              prefs.theme === t.value
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200'
            }`}
          >
            {t.label}
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
        <Toggle active={prefs.kal_arcade_enabled} onChange={() => onChange({ kal_arcade_enabled: !prefs.kal_arcade_enabled })} />
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

  const [senhaAtual,    setSenhaAtual]    = useState('')
  const [novaSenha,     setNovaSenha]     = useState('')
  const [confirmaSenha, setConfirmaSenha] = useState('')
  const [trocando,      setTrocando]      = useState(false)
  const [trocaErro,     setTrocaErro]     = useState('')
  const [trocaOk,       setTrocaOk]       = useState(false)

  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [linkErro, setLinkErro] = useState('')

  const senhasIguais = novaSenha === confirmaSenha && confirmaSenha !== ''
  const podeSubmeter =
    senhaAtual.length > 0 &&
    getPasswordStrength(novaSenha) >= 2 &&
    senhasIguais &&
    !trocando

  async function handleTrocarSenha() {
    setTrocaErro('')
    setTrocaOk(false)

    if (!senhaAtual || !novaSenha || !confirmaSenha) {
      setTrocaErro('Preencha todos os campos.')
      return
    }
    if (novaSenha !== confirmaSenha) {
      setTrocaErro('As senhas não coincidem.')
      return
    }
    if (novaSenha === senhaAtual) {
      setTrocaErro('A nova senha deve ser diferente da atual.')
      return
    }

    setTrocando(true)

    // REGRA INVIOLÁVEL #12
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: senhaAtual })
    if (signInErr) {
      setTrocaErro('Senha atual incorreta.')
      setTrocando(false)
      return
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: novaSenha })
    if (updateErr) {
      const isSamePassword = updateErr.message.toLowerCase().includes('same password') ||
                             updateErr.message.toLowerCase().includes('different from')
      setTrocaErro(
        isSamePassword
          ? 'A nova senha não pode ser igual à atual.'
          : 'Erro ao atualizar a senha. Tente novamente.'
      )
      setTrocando(false)
      return
    }

    await supabase.auth.signOut({ scope: 'others' })

    setSenhaAtual('')
    setNovaSenha('')
    setConfirmaSenha('')
    setTrocando(false)
    setTrocaOk(true)
    setTimeout(() => setTrocaOk(false), 4000)
  }

  async function handleEnviarLink() {
    setSending(true)
    setLinkErro('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (err) setLinkErro('Não foi possível enviar o link. Tente novamente.')
    else setSent(true)
    setSending(false)
  }

  return (
    <div>
      <SectionTitle>Alterar senha</SectionTitle>
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-4">
        <p className="text-xs text-gray-400">
          Confirme sua senha atual antes de definir a nova. Sessões em outros dispositivos serão encerradas automaticamente.
        </p>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Senha atual</label>
          <PasswordInput
            value={senhaAtual}
            onChange={(value: string) => setSenhaAtual(value)}
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={trocando}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Nova senha</label>
          <PasswordInput
            value={novaSenha}
            onChange={(value: string) => setNovaSenha(value)}
            showStrengthMeter={true}
            autoComplete="new-password"
            placeholder="Mín. 8 caracteres"
            disabled={trocando}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Confirmar nova senha</label>
          <PasswordInput
            value={confirmaSenha}
            onChange={(value: string) => setConfirmaSenha(value)}
            autoComplete="new-password"
            placeholder="Repita a nova senha"
            disabled={trocando}
          />
          {confirmaSenha.length > 0 && (
            <p className={`text-xs mt-1.5 ${senhasIguais ? 'text-green-600' : 'text-red-500'}`}>
              {senhasIguais ? '✓ Senhas coincidem' : '✗ Senhas não coincidem'}
            </p>
          )}
        </div>

        {trocaErro && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5" role="alert">
            <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
            <p className="text-xs text-red-600">{trocaErro}</p>
          </div>
        )}

        {trocaOk && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5" role="status">
            <p className="text-xs text-green-700 font-medium">Senha alterada. Outros dispositivos foram desconectados.</p>
          </div>
        )}

        <button
          onClick={handleTrocarSenha}
          disabled={!podeSubmeter}
          className="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          aria-busy={trocando}
        >
          {trocando ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              Verificando…
            </>
          ) : 'Alterar senha'}
        </button>
      </div>

      <SectionTitle>Esqueceu a senha atual?</SectionTitle>
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-4">
          Enviaremos um link de redefinição para <strong className="text-gray-600">{email}</strong>.
        </p>
        {sent ? (
          <p className="text-sm text-green-600 flex items-center gap-2" role="status">
            Link enviado. Verifique seu e-mail.
          </p>
        ) : (
          <button
            onClick={handleEnviarLink}
            disabled={sending}
            className="w-full sm:w-auto border border-gray-200 text-gray-600 bg-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Enviando…' : 'Enviar link por e-mail'}
          </button>
        )}
        {linkErro && <p className="text-xs text-red-500 mt-2">{linkErro}</p>}
      </div>

      <SectionTitle>Sessões ativas</SectionTitle>
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
        <p className="text-sm text-gray-700 mb-1">Gerenciar sessões em outros dispositivos</p>
        <p className="text-xs text-gray-400 mb-3">
          Ao trocar a senha, outras sessões são encerradas automaticamente.
          Visualização detalhada de dispositivos em breve.
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">
          Em desenvolvimento
        </span>
      </div>
    </div>
  )
}

// ── Aba Membros ─────────────────────────────────────────────────────────────
// Visível para todos, mas a API route rejeita quem não é 'owner'.
// O token é passado no header Authorization para a route server-side
// que usa a service_role key — jamais exposta no client.
function TabMembros() {
  const supabase = createClient()
  const [email,   setEmail]   = useState('')
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleInvite() {
    if (!email.trim()) return
    setSending(true)
    setError('')
    setSent(false)

    // Obtém token da sessão atual para passar à API route (que roda server-side)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Sessão expirada. Faça login novamente.')
      setSending(false)
      return
    }

    const res = await fetch('/api/invite', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email: email.trim() }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Erro ao enviar convite.')
    } else {
      setSent(true)
      setEmail('')
    }
    setSending(false)
  }

  return (
    <div>
      <SectionTitle>Convidar usuário</SectionTitle>
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-4">
        <p className="text-xs text-gray-400">
          O usuário receberá um e-mail com link para criar a senha e acessar a plataforma.
          O link expira em 24 horas. Apenas o owner da conta pode enviar convites.
        </p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">E-mail do convidado</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            placeholder="nome@email.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5" role="alert">
            <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {sent && (
          <p className="text-xs text-green-600" role="status">
            Convite enviado com sucesso.
          </p>
        )}

        <button
          onClick={handleInvite}
          disabled={sending || !email.trim()}
          className="w-full sm:w-auto bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {sending ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              Enviando…
            </>
          ) : 'Enviar convite'}
        </button>
      </div>
    </div>
  )
}

// ── Aba Dados ───────────────────────────────────────────────────────────────
function TabDados({ email: _email }: { email: string }) {
  const supabase = createClient()
  const [exporting,   setExporting]   = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting,    setDeleting]    = useState(false)
  const [deleteError, setDeleteError] = useState('')

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

  // REGRA INVIOLÁVEL #16 — RPC antes de signOut
  async function handleDelete() {
    if (confirmText !== 'EXCLUIR') return
    setDeleting(true)
    setDeleteError('')

    const { error } = await supabase.rpc('delete_user_data')

    if (error) {
      setDeleteError('Não foi possível excluir os dados. Tente novamente ou entre em contato com o suporte.')
      setDeleting(false)
      return
    }

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
          {exporting ? 'Exportando…' : 'Exportar CSV'}
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

            {deleteError && (
              <div className="flex items-start gap-2 bg-red-100 border border-red-200 rounded-lg px-3 py-2.5" role="alert">
                <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
                <p className="text-xs text-red-700">{deleteError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setConfirming(false); setConfirmText(''); setDeleteError('') }}
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
          kal_arcade_enabled:   p.kal_arcade_enabled   ?? true,
          gamification_enabled: p.gamification_enabled ?? true,
        })
      } else {
        // Fallback: lê de profiles quando user_preferences ainda não existe
        const { data: profile } = await supabase
          .from('profiles').select('full_name, gamification_enabled, kal_enabled').eq('id', user.id).single()
        if (profile) {
          setPrefs(prev => ({
            ...prev,
            full_name:            profile.full_name            ?? prev.full_name,
            gamification_enabled: profile.gamification_enabled ?? prev.gamification_enabled,
            kal_arcade_enabled:   profile.kal_enabled          ?? prev.kal_arcade_enabled,
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
      kal_arcade_enabled:   prefs.kal_arcade_enabled,
      gamification_enabled: prefs.gamification_enabled,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'user_id' })

    await supabase.from('profiles').update({
      full_name:            prefs.full_name,
      gamification_enabled: prefs.gamification_enabled,
      kal_enabled:          prefs.kal_arcade_enabled,
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

      {saved && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2" role="status">
          Salvo com sucesso!
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-6">

        {/* Mobile: scroll horizontal */}
        <div className="sm:hidden w-full">
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                  tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: sidebar vertical */}
        <nav className="hidden sm:flex flex-col w-44 shrink-0 gap-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${
                tab === t.id
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 bg-white border border-gray-100 rounded-xl p-4 sm:p-6 min-w-0 w-full">
          {tab === 'perfil'     && <TabPerfil     prefs={prefs} email={email} onChange={handleChange} onSave={handleSave} saving={saving} />}
          {tab === 'aparencia'  && <TabAparencia  prefs={prefs} onChange={handleChange} onSave={handleSave} saving={saving} />}
          {tab === 'financeiro' && <TabFinanceiro prefs={prefs} onChange={handleChange} onSave={handleSave} saving={saving} />}
          {tab === 'seguranca'  && <TabSeguranca  email={email} />}
          {tab === 'membros'    && <TabMembros />}
          {tab === 'dados'      && <TabDados      email={email} />}
        </div>

      </div>
    </div>
  )
}
