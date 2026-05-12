export type TransactionType = 'income' | 'expense' | 'transfer'
export type TransactionStatus = 'paid' | 'pending' | 'overdue' | 'cancelled'
export type AccountType = 'checking' | 'savings' | 'cash' | 'credit' | 'investment' | 'other'
export type CategoryType = 'income' | 'expense' | 'investment'  // ← 'investment' adicionado
export type BudgetPeriod = 'monthly' | 'yearly'

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  currency: string
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

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  goal_id: string | null          // ← novo
  type: TransactionType
  amount: number
  description: string
  date: string
  status: TransactionStatus
  notes: string | null
  transfer_account_id: string | null
  is_recurring: boolean
  recurrence: string | null
  installment_total: number | null
  installment_current: number | null
  installment_group: string | null
  created_at: string
  updated_at: string
  // joins
  category?: Category
  account?: Account
  goal?: InvestmentGoal
}

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
  category?: Category
}
