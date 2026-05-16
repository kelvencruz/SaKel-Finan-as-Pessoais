'use client'

// src/features/gamificacao/hooks/useGamification.ts
// Hook de LEITURA apenas — não dispara mais XP diretamente.
// DT-003: pushXPToast removido. A gamificação agora é acionada pelo
// gamificacaoListener via Event Bus, após commit no Supabase.
// Manter este hook para futura exposição de dados de gamificação na UI
// (XP atual, nível, badges, etc).

export function useGamification() {
  // Hook de leitura — expansível para expor xp, level, badges via Supabase
  return {}
}
