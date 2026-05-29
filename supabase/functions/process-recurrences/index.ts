// supabase/functions/process-recurrences/index.ts
// Lifecycle engine server-side — Sakel Finanças Sprint P0
// Idempotente por design: UNIQUE(recurrence_id, competencia) no banco
// Roda via pg_cron todo dia às 00:05 UTC (21:05 BRT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TIMEZONE = 'America/Sao_Paulo'

function getTodayBRT(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TIMEZONE })
}

function getCompetencia(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function calcNextDueDate(current: string, frequency: string): string {
  const d = new Date(current + 'T12:00:00')
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); break
    case 'weekly':  d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toLocaleDateString('sv-SE', { timeZone: TIMEZONE })
}

async function getOrCreateInvoice(
  supabase: ReturnType<typeof createClient>,
  creditCardId: string,
  userId: string,
  today: string
): Promise<string | null> {
  try {
    const { data: card } = await supabase
      .from('credit_cards')
      .select('closing_day, due_day')
      .eq('id', creditCardId)
      .single()

    if (!card) return null

    const d = new Date(today + 'T12:00:00')
    let month = d.getMonth() + 1
    let year  = d.getFullYear()

    if (d.getDate() > card.closing_day) {
      month = month === 12 ? 1 : month + 1
      year  = month === 1  ? year + 1 : year
    }

    // Tenta buscar fatura existente
    const { data: existing } = await supabase
      .from('credit_card_invoices')
      .select('id')
      .eq('credit_card_id', creditCardId)
      .eq('month', month)
      .eq('year', year)
      .single()

    if (existing) return existing.id

    // Cria nova fatura
    const dueMonth = month === 12 ? 1 : month + 1
    const dueYear  = month === 12 ? year + 1 : year
    const dueDate  = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(card.due_day).padStart(2, '0')}`

    const { data: created, error } = await supabase
      .from('credit_card_invoices')
      .insert({
        credit_card_id: creditCardId,
        user_id:        userId,
        month, year,
        total_amount:   0,
        status:         'open',
        due_date:       dueDate,
      })
      .select('id')
      .single()

    if (error) {
      // Race condition: outra execução criou primeiro — busca novamente
      const { data: retry } = await supabase
        .from('credit_card_invoices')
        .select('id')
        .eq('credit_card_id', creditCardId)
        .eq('month', month)
        .eq('year', year)
        .single()
      return retry?.id ?? null
    }

    return created?.id ?? null
  } catch {
    return null
  }
}

async function updateInvoiceTotal(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string
): Promise<void> {
  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .eq('invoice_id', invoiceId)

  const total = (data ?? []).reduce((s, t) => s + Number(t.amount), 0)

  await supabase
    .from('credit_card_invoices')
    .update({ total_amount: total })
    .eq('id', invoiceId)
}

Deno.serve(async (req) => {
  // Permite chamada manual via POST com Authorization header
  // pg_cron chama via SQL: SELECT net.http_post(...)
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const today = getTodayBRT()
    const stats = { processed: 0, skipped: 0, failed: 0, details: [] as object[] }

    // Busca todas as recorrências ativas e vencidas (next_due_date <= hoje)
    const { data: recorrencias, error: fetchErr } = await supabase
  .from('recurrences')
  .select('*')
  .eq('is_active', true)
  .lte('next_due_date', today)

    if (fetchErr) {
      return Response.json({ error: fetchErr.message }, { status: 500 })
    }

    for (const r of recorrencias ?? []) {
      try {
        // Verifica se já existe transaction para essa competência (idempotência extra)
        const competencia = getCompetencia(today)
        const { data: existing } = await supabase
          .from('transactions')
          .select('id')
          .eq('recurrence_id', r.id)
          .eq('competencia', competencia)
          .maybeSingle()

        if (existing) {
          // Já foi processada — só atualiza next_due_date se necessário
          const next = calcNextDueDate(r.next_due_date, r.frequency)
          await supabase
            .from('recurrences')
            .update({ next_due_date: next })
            .eq('id', r.id)

          stats.skipped++
          stats.details.push({ id: r.id, description: r.description, action: 'skipped', reason: 'já existe nessa competência' })
          continue
        }

        // Resolve invoice se for cartão
        let invoiceId: string | null = null
        if (r.credit_card_id) {
          invoiceId = await getOrCreateInvoice(supabase, r.credit_card_id, r.user_id, today)
        }

        // Insere transaction — o UNIQUE index é a garantia final contra duplicata
        const { error: insertErr } = await supabase
          .from('transactions')
          .insert({
            user_id:        r.user_id,
            type:           r.type,
            description:    r.description,
            amount:         r.amount,
            date:           today,
            account_id:     r.credit_card_id ? null : r.account_id,
            credit_card_id: r.credit_card_id ?? null,
            invoice_id:     invoiceId,
            category_id:    r.category_id,
            status:         r.credit_card_id ? 'posted' : 'pending',
            lifecycle_status: 'PENDING_EXPECTED',
            is_recurring:   true,
            recurrence_id:  r.id,
            competencia,
          })

        if (insertErr) {
          // Código 23505 = violação de unique — idempotência funcionando
          if (insertErr.code === '23505') {
            stats.skipped++
            stats.details.push({ id: r.id, description: r.description, action: 'skipped', reason: 'unique constraint — idempotente' })
          } else {
            stats.failed++
            stats.details.push({ id: r.id, description: r.description, action: 'failed', error: insertErr.message })
          }
          continue
        }

        // Atualiza total da fatura se houver
        if (invoiceId) {
          await updateInvoiceTotal(supabase, invoiceId)
        }

        // Avança next_due_date
        const next = calcNextDueDate(r.next_due_date, r.frequency)
        await supabase
          .from('recurrences')
          .update({ next_due_date: next })
          .eq('id', r.id)

        stats.processed++
        stats.details.push({ id: r.id, description: r.description, action: 'processed', next_due_date: next })

      } catch (err) {
        stats.failed++
        stats.details.push({ id: r.id, description: r.description, action: 'failed', error: String(err) })
      }
    }

    // Loga resultado na tabela auditável
    await supabase.from('lifecycle_engine_logs').insert({
      triggered_by: req.headers.get('x-triggered-by') ?? 'pg_cron',
      processed:    stats.processed,
      skipped:      stats.skipped,
      failed:       stats.failed,
      details:      stats.details,
    })

    return Response.json({
      ok: true,
      today,
      ...stats,
    })

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
})