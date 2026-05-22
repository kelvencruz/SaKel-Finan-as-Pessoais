// src/lib/quickActions.ts
import {
  PlusCircle,
  ArrowsClockwise,
  ArrowsLeftRight,
  DownloadSimple,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'

export type ActionKey = 'nova-transacao' | 'nova-recorrencia' | 'transferencia' | 'importar-csv'

export interface QuickAction {
  key:      ActionKey
  label:    string
  icon:     Icon
  shortcut?: string
  dividerBefore?: boolean
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    key:      'nova-transacao',
    label:    'Nova transação',
    icon:     PlusCircle,
    shortcut: 'Enter',
  },
  {
    key:   'nova-recorrencia',
    label: 'Nova recorrência',
    icon:  ArrowsClockwise,
  },
  {
    key:   'transferencia',
    label: 'Transferência',
    icon:  ArrowsLeftRight,
  },
  {
    key:           'importar-csv',
    label:         'Importar CSV',
    icon:          DownloadSimple,
    dividerBefore: true,
  },
]