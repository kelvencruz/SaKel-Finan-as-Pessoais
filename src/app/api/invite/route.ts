// src/app/api/invite/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'

export async function POST(request: Request) {
  // ── 1. Parse do body ──────────────────────────────────────────────────────
  const { email } = await request.json().catch(() => ({ email: null }))

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'E-mail obrigatório.' }, { status: 400 })
  }

  // ── 2. Valida sessão do chamador via cookie ───────────────────────────────
  // Usa o client de service_role para poder chamar admin APIs,
  // mas primeiro autentica o usuário pelo header Authorization que o browser envia.
  const authHeader = request.headers.get('authorization') ?? ''
  const callerToken = authHeader.replace('Bearer ', '').trim()

  if (!callerToken) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Verifica o token do chamador e obtém o user_id
  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(callerToken)

  if (authErr || !caller) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
  }

  // ── 3. Verifica se o chamador tem role 'owner' ────────────────────────────
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 403 })
  }

  if (profile.role !== 'owner') {
    return NextResponse.json(
      { error: 'Sem permissão. Apenas o owner pode convidar usuários.' },
      { status: 403 },
    )
  }

  // ── 4. Envia o convite ────────────────────────────────────────────────────
  const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/accept-invite`,
  })

  if (inviteErr) {
    // Supabase retorna "User already registered" para emails existentes
    const alreadyExists = inviteErr.message.toLowerCase().includes('already')
    return NextResponse.json(
      { error: alreadyExists ? 'Este e-mail já possui uma conta.' : inviteErr.message },
      { status: 400 },
    )
  }

  return NextResponse.json({ success: true })
}