// src/lib/events/financialEvents.ts
// Tipos e payloads dos eventos financeiros do Event Bus client-side.
// Nenhuma lógica aqui — apenas contratos de dados.
// DT-003: Event Bus client-side para desacoplamento de UI e gamificação.

export interface TransactionCreatedPayload {
  userId: string
  isFirstTx: boolean
}

export interface FinancialEvents {
  'transaction.created': TransactionCreatedPayload
}
