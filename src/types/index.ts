// src/types/index.ts

export type TransactionType   = 'income' | 'expense' | 'transfer'
export type TransactionStatus = 'paid' | 'pending' | 'overdue' | 'cancelled'
export type AccountType       = 'checking' | 'savings' | 'cash' | 'credit' | 'investment' | 'other'
export type CategoryType      = 'income' | 'expense' | 'both' | 'investment'
export type BudgetPeriod      = 'monthly' | 'yearly'
export type Frequency         = 'daily' | 'weekly' | 'monthly' | 'yearly'

// ─────────────────────────────────────────────────────────────────────────────
// App roles
// Adicionado para controle de permissões de convite e futuro RBAC.
// SQL necessário (rodar UMA vez no Supabase):
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
//   UPDATE profiles SET role = 'owner' WHERE id = '<seu-user-id>';
// ─────────────────────────────────────────────────────────────────────────────

export type AppRole = 'user' | 'owner' | 'admin' | 'platform_admin'

export type PlanType = 'free' | 'pro' | 'business'

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle engine
// ATENÇÃO: os valores abaixo espelham o enum PostgreSQL criado na Sprint 2·S4.
// O banco usa SCREAMING_SNAKE_CASE — não alterar sem migração SQL correspondente.
// ─────────────────────────────────────────────────────────────────────────────

export type LifecycleStatus =
  | 'CONFIRMED'
  | 'PENDING_EXPECTED'
  | 'PENDING_REVIEW'
  | 'OVERDUE'
  | 'CANCELLED'

// Estados que não aceitam mais transições (regra inviolável #11)
export const TERMINAL_STATUSES: LifecycleStatus[] = ['CONFIRMED', 'CANCELLED']

export function isTerminal(status: LifecycleStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// Mapa de transições válidas — espelha a tabela no checklist
export const VALID_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  PENDING_EXPECTED: ['CONFIRMED', 'OVERDUE',    'CANCELLED'],
  PENDING_REVIEW:   ['CONFIRMED', 'CANCELLED'],
  OVERDUE:          ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:        [],
  CANCELLED:        [],
}

export function isValidTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export interface TransitionResult {
  ok:      boolean
  from:    LifecycleStatus
  to:      LifecycleStatus
  reason?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// User preferences
// Espelha a tabela `user_preferences` no Supabase.
// FIX BUG-007: campo correto é `kal_arcade_enabled`, não `kaldiz_enabled`.
// ─────────────────────────────────────────────────────────────────────────────

export interface UserPreferences {
  user_id:              string
  full_name:            string | null
  timezone:             string
  theme:                'light' | 'dark' | 'system'
  accent_color:         string
  sidebar_collapsed:    boolean
  compact_mode:         boolean
  currency:             string
  hide_balances:        boolean
  number_format:        'pt-BR' | 'en-US'
  kal_arcade_enabled:   boolean   // coluna real em user_preferences
  gamification_enabled: boolean
  updated_at:           string
}

// ─────────────────────────────────────────────────────────────────────────────
// Gamification
// ─────────────────────────────────────────────────────────────────────────────

export type ToastKind = 'success' | 'error' | 'warning' | 'info' | 'xp' | 'achievement'

export interface GamificationEvent {
  type:         'xp_gained' | 'level_up' | 'achievement_unlocked' | 'streak_updated'
  xp?:          number
  level?:       number
  achievement?: string
  streak?:      number
}

export interface GamificationResult {
  events: GamificationEvent[]
  toast?: { kind: ToastKind; message: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core entities
// ─────────────────────────────────────────────────────────────────────────────

export interface Profile {
  id:           string
  full_name:    string | null
  avatar_url:   string | null
  currency:     string
  role:         AppRole
  plan:         PlanType | null        // ← adicionar essa linha
  kal_enabled:          boolean
  gamification_enabled: boolean
  created_at:   string
  updated_at:   string
}

export interface Account {
  id:              string
  user_id:         string
  name:            string
  type:            AccountType
  initial_balance: number
  current_balance: number
  color:           string
  icon:            string
  is_active:       boolean
  created_at:      string
  updated_at:      string
}

export interface Category {
  id:         string
  user_id:    string
  parent_id:  string | null
  name:       string
  type:       CategoryType
  color:      string
  icon:       string
  created_at: string
}

export interface CreditCard {
  id:          string
  user_id:     string
  name:        string
  closing_day: number
  due_day:     number
  is_active:   boolean
  created_at:  string
}

export interface InvestmentGoal {
  id:            string
  user_id:       string
  name:          string
  icon:          string
  color:         string
  target_amount: number | null
  target_date:   string | null
  created_at:    string
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────────────────────

export interface Transaction {
  id:                  string
  user_id:             string
  account_id:          string
  category_id:         string | null
  goal_id:             string | null
  type:                TransactionType
  amount:              number
  description:         string
  date:                string
  status:              TransactionStatus
  // lifecycle_status gerenciado pelo lifecycleEngine.ts
  // null apenas em transações criadas antes da Sprint 2·S4
  lifecycle_status:    LifecycleStatus | null
  notes:               string | null
  transfer_account_id: string | null
  is_recurring:        boolean
  recurrence_id:       string | null
  recurrence:          string | null
  installment_total:   number | null
  installment_current: number | null
  installment_group:   string | null
  invoice_id:          string | null
  credit_card_id:      string | null
  created_at:          string
  updated_at:          string
  // joins
  category?: Category
  account?:  Account
  goal?:     InvestmentGoal
}

// ─────────────────────────────────────────────────────────────────────────────
// Recurrences
// ─────────────────────────────────────────────────────────────────────────────

export interface Recorrencia {
  id:              string
  user_id:         string
  type:            'income' | 'expense'
  description:     string
  amount:          number
  category_id:     string | null
  account_id:      string | null
  credit_card_id:  string | null
  frequency:       Frequency
  start_date:      string
  end_date:        string | null
  next_due_date:   string
  is_active:       boolean
  created_at:      string
  // joins (populados no front)
  account_name?:     string
  category_name?:    string
  category_icon?:    string
  credit_card_name?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget
// ─────────────────────────────────────────────────────────────────────────────

export interface Budget {
  id:          string
  user_id:     string
  category_id: string
  amount:      number
  period:      BudgetPeriod
  start_date:  string
  end_date:    string | null
  created_at:  string
  updated_at:  string
  // join
  category?: Category
}