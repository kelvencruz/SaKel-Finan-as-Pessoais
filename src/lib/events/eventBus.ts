// src/lib/events/eventBus.ts
// Singleton EventEmitter tipado — zero dependência externa.
// DT-003: vive na memória do browser, morre com o reload.
// Sem garantias de entrega, ordenação nem idempotência.

import type { FinancialEvents } from './financialEvents'

type Listener<T> = (payload: T) => void | Promise<void>

class EventBus {
  private listeners: {
    [K in keyof FinancialEvents]?: Listener<FinancialEvents[K]>[]
  } = {}

  on<K extends keyof FinancialEvents>(
    event: K,
    listener: Listener<FinancialEvents[K]>,
  ): void {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event]!.push(listener)
  }

  off<K extends keyof FinancialEvents>(
    event: K,
    listener: Listener<FinancialEvents[K]>,
  ): void {
    this.listeners[event] = this.listeners[event]?.filter(l => l !== listener)
  }

  emit<K extends keyof FinancialEvents>(
    event: K,
    payload: FinancialEvents[K],
  ): void {
    this.listeners[event]?.forEach(listener => {
      // Listeners assíncronos rodam sem bloquear o fluxo principal
      Promise.resolve(listener(payload)).catch(err =>
        console.error(`[EventBus] erro no listener de "${event}":`, err),
      )
    })
  }
}

// Singleton — uma única instância compartilhada por todo o app
export const eventBus = new EventBus()
