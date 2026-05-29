// src/lib/fabRegistry.ts
//
// FAB Registry — fonte de verdade da ação primária por rota.
//
// REGRAS ARQUITETURAIS (Sakel):
//  1. Cada rota tem NO MÁXIMO uma ação primária (FAB + botão header desktop)
//  2. Páginas sem ação clara (settings, perfil, conquistas) NÃO têm FAB
//  3. O label mobile pode ser abreviado (prop `shortLabel`) para caber no FAB
//  4. Ao adicionar nova rota/ação: apenas editar este arquivo — zero impacto
//     nos componentes FAB, ActionHub ou ActionHubController
//
// ADICIONANDO NOVA PÁGINA:
//  1. Adicionar entrada em FAB_REGISTRY abaixo
//  2. Adicionar handler correspondente em ActionHubController.tsx
//  Só isso. Nada mais muda.

import {
  ArrowsDownUp,
  TrendUp,
  CreditCard,
  Wallet,
  ArrowClockwise,
  Tag,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'

export type ActionKey =
  | 'nova-transacao'
  | 'novo-investimento'
  | 'novo-cartao'
  | 'nova-conta'
  | 'nova-recorrencia'
  | 'nova-categoria'
  | 'novo-objetivo'

export interface FabConfig {
  /** Chave despachada para o ActionHubController */
  actionKey: ActionKey
  /** Label completo — usado no header desktop e no FAB expandido */
  label: string
  /** Label curto — exibido no FAB mobile compacto (máx ~16 chars) */
  shortLabel: string
  /** Ícone Phosphor (weight="duotone" aplicado nos componentes) */
  Icon: Icon
}

/**
 * Registry de ação primária por pathname.
 *
 * Chave = pathname exato do Next.js App Router (sem trailing slash).
 * Valor = configuração completa do FAB para aquela rota.
 *
 * Rotas AUSENTES aqui → FAB não é renderizado (ex: /dashboard/settings).
 */
export const FAB_REGISTRY: Record<string, FabConfig> = {
  '/dashboard': {
    actionKey:  'nova-transacao',
    label:      'Nova Transação',
    shortLabel: 'Transação',
    Icon:       ArrowsDownUp,
  },
  '/dashboard/transacoes': {
    actionKey:  'nova-transacao',
    label:      'Nova Transação',
    shortLabel: 'Transação',
    Icon:       ArrowsDownUp,
  },
  '/dashboard/faturas': {
    actionKey:  'nova-transacao',
    label:      'Nova Transação',
    shortLabel: 'Transação',
    Icon:       ArrowsDownUp,
  },
  '/dashboard/investimentos': {
    actionKey:  'novo-investimento',
    label:      'Novo Investimento',
    shortLabel: 'Investimento',
    Icon:       TrendUp,
  },
  '/dashboard/cartoes': {
    actionKey:  'novo-cartao',
    label:      'Novo Cartão',
    shortLabel: 'Cartão',
    Icon:       CreditCard,
  },
  '/dashboard/contas': {
    actionKey:  'nova-conta',
    label:      'Nova Conta',
    shortLabel: 'Conta',
    Icon:       Wallet,
  },
  '/dashboard/recorrencias': {
    actionKey:  'nova-recorrencia',
    label:      'Nova Recorrência',
    shortLabel: 'Recorrência',
    Icon:       ArrowClockwise,
  },
  '/dashboard/categorias': {
    actionKey:  'nova-categoria',
    label:      'Nova Categoria',
    shortLabel: 'Categoria',
    Icon:       Tag,
  },
  // Rotas SEM FAB (intencionalmente ausentes):
  // /dashboard/conquistas  → página de leitura, sem ação primária
  // /dashboard/perfil      → página de configuração pessoal
  // /dashboard/settings    → página de configuração do sistema
  // /dashboard/importar    → fluxo próprio, sem FAB global
}

/**
 * Resolve a configuração do FAB para o pathname atual.
 * Retorna `null` se a rota não deve exibir FAB.
 */
export function resolveFabConfig(pathname: string): FabConfig | null {
  return FAB_REGISTRY[pathname] ?? null
}