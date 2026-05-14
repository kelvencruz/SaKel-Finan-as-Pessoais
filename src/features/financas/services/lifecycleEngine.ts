import { createClient } from '@/lib/supabase/client'
const supabase = createClient()

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type LifecycleStatus =
  | 'CONFIRMED'
  | 'PENDING_EXPECTED'
  | 'PENDING_REVIEW'
  | 'OVERDUE'
  | 'CANCELLED'

export interface LifecycleTransitionResult {
  success: boolean
  from: LifecycleStatus
  to: LifecycleStatus
  transactionId: string
  error?: string
}

// ─── Transições válidas ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  PENDING_EXPECTED: ['CONFIRMED', 'OVERDUE', 'CANCELLED'],
  PENDING_REVIEW:   ['CONFIRMED', 'CANCELLED'],
  OVERDUE:          ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:        [],  // terminal
  CANCELLED:        [],  // terminal
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function canTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

export function isTerminal(status: LifecycleStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0
}

export function availableTransitions(status: LifecycleStatus): LifecycleStatus[] {
  return VALID_TRANSITIONS[status]
}

// ─── Engine principal ─────────────────────────────────────────────────────────

export async function transitionStatus(
  transactionId: string,
  to: LifecycleStatus
): Promise<LifecycleTransitionResult> {
  // 1. Busca o status atual
  const { data, error: fetchError } = await supabase
    .from('transactions')
    .select('lifecycle_status')
    .eq('id', transactionId)
    .single()

  if (fetchError || !data) {
    return {
      success: false,
      from: 'CONFIRMED',
      to,
      transactionId,
      error: `Transação não encontrada: ${fetchError?.message}`,
    }
  }

  const from = data.lifecycle_status as LifecycleStatus

  // 2. Valida a transição
  if (!canTransition(from, to)) {
    return {
      success: false,
      from,
      to,
      transactionId,
      error: `Transição inválida: ${from} → ${to}`,
    }
  }

  // 3. Aplica a transição
  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      lifecycle_status: to,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transactionId)

  if (updateError) {
    return {
      success: false,
      from,
      to,
      transactionId,
      error: `Erro ao atualizar: ${updateError.message}`,
    }
  }

  return { success: true, from, to, transactionId }
}

// ─── Transição em lote (ex: marcar várias como CANCELLED) ────────────────────

export async function transitionMany(
  transactionIds: string[],
  to: LifecycleStatus
): Promise<{ succeeded: string[]; failed: string[] }> {
  const results = await Promise.all(
    transactionIds.map((id) => transitionStatus(id, to))
  )

  return {
    succeeded: results.filter((r) => r.success).map((r) => r.transactionId),
    failed:    results.filter((r) => !r.success).map((r) => r.transactionId),
  }
}

// ─── Marcar vencidas (chamado por cron job ou edge function) ──────────────────

export async function markOverdueTransactions(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('transactions')
    .update({ lifecycle_status: 'OVERDUE', updated_at: new Date().toISOString() })
    .eq('lifecycle_status', 'PENDING_EXPECTED')
    .lt('date', today)
    .select('id')

  if (error) {
    console.error('[lifecycle] markOverdueTransactions falhou:', error.message)
    return 0
  }

  return data?.length ?? 0
}

// ─── Queries por status (usadas no dashboard e na página de transações) ────────

export async function fetchByStatus(
  userId: string,
  status: LifecycleStatus | LifecycleStatus[]
) {
  const statuses = Array.isArray(status) ? status : [status]

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .in('lifecycle_status', statuses)
    .order('date', { ascending: false })

  if (error) {
    console.error('[lifecycle] fetchByStatus falhou:', error.message)
    return []
  }

  return data ?? []
}

export async function fetchPending(userId: string) {
  return fetchByStatus(userId, ['PENDING_EXPECTED', 'PENDING_REVIEW'])
}

export async function fetchOverdue(userId: string) {
  return fetchByStatus(userId, 'OVERDUE')
}

export async function fetchConfirmed(userId: string) {
  return fetchByStatus(userId, 'CONFIRMED')
}