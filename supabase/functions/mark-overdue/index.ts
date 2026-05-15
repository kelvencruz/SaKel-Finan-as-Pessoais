// supabase/functions/mark-overdue/index.ts
// Cron job: marca transações PENDING_EXPECTED vencidas como OVERDUE
// Roda diariamente via pg_cron (configurado no Supabase Dashboard)

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Segurança: só aceita chamadas internas do Supabase (cron)
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transactions')
    .update({
      lifecycle_status: 'OVERDUE',
      updated_at: new Date().toISOString(),
    })
    .eq('lifecycle_status', 'PENDING_EXPECTED')
    .lt('date', today)
    .select('id')

  if (error) {
    console.error('[mark-overdue] falhou:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const count = data?.length ?? 0
  console.log(`[mark-overdue] ${count} transações marcadas como OVERDUE`)

  return new Response(JSON.stringify({ marked: count, date: today }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})