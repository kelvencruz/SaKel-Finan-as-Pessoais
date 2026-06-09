/**
 * src/lib/format.ts
 * Funções de formatação centralizadas — TD-026
 *
 * Regras:
 * - Nunca criar outro arquivo de formatação após este (regra inviolável pós-TD-026)
 * - Apenas lógica pura — sem imports React, sem componentes
 */

// ─── Moeda ────────────────────────────────────────────────────────────────────

/**
 * Formata um número como moeda BRL.
 * Ex.: 1500.5 → "R$ 1.500,50"
 */
export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Formata um número como moeda compacta para eixos de gráfico.
 * Ex.: 1500 → "R$2k" | 500 → "R$500"
 */
export function formatCurrencyCompact(value: number): string {
  if (value >= 1000) return `R$${(value / 1000).toFixed(0)}k`
  return `R$${value.toFixed(0)}`
}

// ─── Percentual ───────────────────────────────────────────────────────────────

/**
 * Formata um número como percentual com sinal.
 * Ex.: 2.5 → "+2.50%" | -1.3 → "-1.30%"
 */
export function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

// ─── Data ─────────────────────────────────────────────────────────────────────

/**
 * Formata uma string de data ISO (YYYY-MM-DD ou ISO completo) para pt-BR.
 * Adiciona T12:00:00 em datas sem hora para evitar off-by-one de fuso.
 *
 * @param iso  - Data em formato ISO (ex.: "2025-06-08" ou "2025-06-08T15:00:00Z")
 * @param options - Intl.DateTimeFormatOptions (padrão: dd/mm/aaaa)
 * @param timeZone - Fuso horário (padrão: "America/Sao_Paulo")
 */
export function formatDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
  timeZone = 'America/Sao_Paulo',
): string {
  const normalized = iso.length === 10 ? `${iso}T12:00:00` : iso
  return new Date(normalized).toLocaleDateString('pt-BR', { ...options, timeZone })
}

/**
 * Formata data abreviada para listas (ex.: "08 jun").
 */
export function formatDateShort(iso: string, timeZone = 'America/Sao_Paulo'): string {
  return formatDate(iso, { day: '2-digit', month: 'short' }, timeZone)
}