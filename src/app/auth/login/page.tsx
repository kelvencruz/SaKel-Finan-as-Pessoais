'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [message,  setMessage]  = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Verifique seu e-mail para confirmar o cadastro.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-mail ou senha incorretos.')
    } else {
      console.log('Login OK:', data.user?.email)
      window.location.replace('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'linear-gradient(135deg, #050816 0%, #090B1A 50%, #0A1020 100%)' }}
    >
      {/* Glow de fundo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent)', filter: 'blur(80px)' }}
        />
        <div
          className="absolute -bottom-40 -right-20 w-80 h-80 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #4f46e5, transparent)', filter: 'blur(100px)' }}
        />
        <div
          className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6d28d9, transparent)', filter: 'blur(120px)' }}
        />
      </div>

      {/* Esquerda — branding (só desktop) */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative">
        {/* Logo */}
        <img src="/sakel-logo.png" alt="SaKel Finanças" className="h-12 w-auto" />

        {/* Headline central */}
        <div>
          <h2
            className="text-4xl font-bold leading-tight mb-4"
            style={{ color: '#ffffff', letterSpacing: '-.02em' }}
          >
            Controle financeiro<br />
            <span style={{ background: 'linear-gradient(90deg, #a78bfa, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              inteligente e elegante.
            </span>
          </h2>
          <p className="text-base" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Organize receitas, despesas, cartões e faturas em um só lugar.
          </p>

          {/* Mini stats */}
          <div className="flex gap-6 mt-10">
            {[
              { value: '100%', label: 'Seus dados' },
              { value: 'R$0', label: 'Para começar' },
              { value: '∞', label: 'Transações' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-2xl font-bold" style={{ color: '#a78bfa' }}>{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          © 2026 SaKel Finanças. Todos os direitos reservados.
        </p>
      </div>

      {/* Direita — card de login */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div
          className="w-full max-w-md"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px',
            padding: '40px',
            boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
          }}
        >
          {/* Logo mobile */}
          <div className="lg:hidden mb-8 flex justify-center">
            <img src="/sakel-logo.png" alt="SaKel Finanças" className="h-10 w-auto" />
          </div>

          {/* Headline */}
          <div className="mb-8">
            <h1
              className="text-2xl font-bold mb-1.5"
              style={{ color: '#ffffff', letterSpacing: '-.02em' }}
            >
              {isSignUp ? 'Criar sua conta' : 'Bem-vindo de volta'}
            </h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {isSignUp
                ? 'Comece a organizar suas finanças agora.'
                : 'Acesse sua central financeira.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label
                className="block text-xs font-medium mb-2"
                style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '.04em', textTransform: 'uppercase' }}
              >
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="w-full h-12 px-4 rounded-xl text-sm transition-all outline-none"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  caretColor: '#a78bfa',
                }}
                onFocus={e => { e.target.style.border = '1px solid rgba(167,139,250,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(167,139,250,0.1)' }}
                onBlur={e =>  { e.target.style.border = '1px solid rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Senha */}
            <div>
              <label
                className="block text-xs font-medium mb-2"
                style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '.04em', textTransform: 'uppercase' }}
              >
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full h-12 px-4 rounded-xl text-sm transition-all outline-none"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ffffff',
                  caretColor: '#a78bfa',
                }}
                onFocus={e => { e.target.style.border = '1px solid rgba(167,139,250,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(167,139,250,0.1)' }}
                onBlur={e =>  { e.target.style.border = '1px solid rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Erros / mensagens */}
            {error && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}
              >
                {error}
              </div>
            )}
            {message && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}
              >
                {message}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: '#ffffff',
                boxShadow: '0 4px 24px rgba(124,58,237,0.35)',
                letterSpacing: '-.01em',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 28px rgba(124,58,237,0.5)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)';    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(124,58,237,0.35)' }}
              onMouseDown={e =>  { (e.currentTarget as HTMLElement).style.transform = 'scale(0.99)' }}
              onMouseUp={e =>    { (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)' }}
            >
              {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          {/* Toggle signup/login */}
          <div className="mt-6 text-center">
            {isSignUp ? (
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Já tem conta?{' '}
                <button
                  onClick={() => { setIsSignUp(false); setError(null); setMessage(null) }}
                  className="font-medium transition-colors"
                  style={{ color: '#a78bfa' }}
                >
                  Entrar
                </button>
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Não tem conta?{' '}
                <button
                  onClick={() => { setIsSignUp(true); setError(null); setMessage(null) }}
                  className="font-medium transition-colors"
                  style={{ color: '#a78bfa' }}
                >
                  Criar conta
                </button>
              </p>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs mt-8" style={{ color: 'rgba(255,255,255,0.15)' }}>
            © 2026 SaKel Finanças
          </p>
        </div>
      </div>
    </div>
  )
}
