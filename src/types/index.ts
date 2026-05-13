// src/types/index.ts

export type TransactionType   = 'income' | 'expense' | 'transfer'
export type TransactionStatus = 'paid' | 'pending' | 'overdue' | 'cancelled'
export type AccountType       = 'checking' | 'savings' | 'cash' | 'credit' | 'investment' | 'other'
export type CategoryType      = 'income' | 'expense' | 'both' | 'investment'
export type BudgetPeriod      = 'monthly' | 'yearly'
export type Frequency         = 'daily' | 'weekly' | 'monthly' | 'yearly'

// ─────────────────────────────────────────────────────────────────────────────
// Core entities
// ─────────────────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  currency: string
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  type: AccountType
  initial_balance: number
  current_balance: number
  color: string
  icon: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  type: CategoryType
  color: string
  icon: string
  created_at: string
}

export interface CreditCard {
  id: string
  user_id: string
  name: string
  closing_day: number
  due_day: number
  is_active: boolean
  created_at: string
}

export interface InvestmentGoal {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  target_amount: number | null
  target_date: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────────────────────

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  goal_id: string | null
  type: TransactionType
  amount: number
  description: string
  date: string
  status: TransactionStatus
  notes: string | null
  transfer_account_id: string | null
  is_recurring: boolean
  recurrence_id: string | null
  recurrence: string | null
  installment_total: number | null
  installment_current: number | null
  installment_group: string | null
  invoice_id: string | null
  credit_card_id: string | null
  created_at: string
  updated_at: string
  // joins
  category?: Category
  account?: Account
  goal?: InvestmentGoal
}

// ─────────────────────────────────────────────────────────────────────────────
// Recurrences
// ─────────────────────────────────────────────────────────────────────────────

export interface Recorrencia {
  id: string
  user_id: string
  type: 'income' | 'expense'
  description: string
  amount: number
  category_id: string | null
  account_id: string | null
  credit_card_id: string | null
  frequency: Frequency
  start_date: string
  end_date: string | null
  next_due_date: string
  is_active: boolean
  created_at: string
  // joins (populados no front)
  account_name?: string
  category_name?: string
  category_icon?: string
  credit_card_name?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget
// ─────────────────────────────────────────────────────────────────────────────

export interface Budget {
  id: string
  user_id: string
  category_id: string
  amount: number
  period: BudgetPeriod
  start_date: string
  end_date: string | null
  created_at: string
  updated_at: string
  // join
  category?: Category
}
