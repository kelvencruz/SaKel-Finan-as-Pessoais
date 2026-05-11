'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Investment {
  id: string
  user_id: string
  name: string
  type: string
  objective: string | null
  institution: string | null
  initial_amount: number
  current_amount: number
  profitability: number | null
  liquidity: string | null
  start_date: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

const TYPES = ['Renda Fixa','Renda Variável','Tesouro','CDB','LCI/LCA','ETF','Ações','FII','Cripto','Outro']
const OBJECTIVES = ['Reserva de emergência','Aposentadoria','Viagem','Casa','Carro','Educação','Outro']
const LIQUIDITY = ['Diária','30 dias','60 dias','90 dias','180 dias','1 ano','Sem liquidez']

const TYPE_COLORS: Record<string, string> = {
  'Renda Fixa':    '#22c55e',
  'Renda Variável':'#6366f1',
  'Tesouro':       '#f59e0b',
  'CDB':           '#3b82f6',
  'LCI/LCA':       '#14b8a6',
  'ETF':           '#8b5cf6',
  'Ações':         '#ef4444',
  'FII':           '#f97316',
  'Cripto':        '#ec4899',
  'Outro':         '#6b7280',
}

const OBJECTIVE_EMOJI: Record<string, string> = {
  'Reserva de emergência': '🛡️',
  'Aposentadoria':         '🏖️',
  'Viagem':                '✈️',
  'Casa':                  '🏠',
  'Carro':                 '🚗',
  'Educação':              '📚',
  'Outro':                 '🎯',
}

const emptyForm = {
  name: '',
  type: 'Renda Fixa',
  objective: '',
  institution: '',
  initial_amount: '',
  current_amount: '',
  profitability: '',
  liquidity: 'Diária',
  start_date: new Date().toISOString().split('T')[0],
  notes: '',
}

type Toast = { message: string; type: 'success' | 'error' }

export default function InvestimentosPage() {
  const supabase = createClient()
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [filterType, setFilterType] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadInvestments() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    const { data } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setInvestments(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadInvestments() }, [])

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setError(null)
    setShowModal(true)
  }

  function openEdit(inv: Investment) {
    setForm({
      name:           inv.name,
      type:           inv.type,
      objective:      inv.objective ?? '',
      institution:    inv.institution ?? '',
      initial_amount: String(inv.initial_amount),
      current_amount: String(inv.current_amount),
      profitability:  inv.profitability != null ? String(inv.profitability) : '',
      liquidity:      inv.liquidity ?? 'Diária',
      start_date:     inv.start_date ?? new Date().toISOString().split('T')[0],
      notes:          inv.notes ?? '',
    })
    setEditingId(inv.id)
    setError(null)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }
    if (!form.current_amount || parseFloat(form.current_amount) < 0) { setError('Valor atual inválido.'); return }

    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    const payload = {
      user_id:        user.id,
      name:           form.name.trim(),
      type:           form.type,
      objective:      form.objective || null,
      institution:    form.institution.trim() || null,
      initial_amount: parseFloat(form.initial_amount || '0'),
      current_amount: parseFloat(form.current_amount || '0'),
      profitability:  form.profitability ? parseFloat(form.profitability) : null,
      liquidity:      form.liquidity || null,
      start_date:     form.start_date || null,
      notes:          form.notes.trim() || null,
    }

    if (editingId) {
      const { error: err } = await supabase.from('investments').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
      showToast('Investimento atualizado!')
    } else {
      const { error: err } = await supabase.from('investments').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
      showToast('Investimento cadastrado!')
    }

    await loadInvestments()
    setShowModal(false)
    setSaving(false)
  }

  async function handleToggleActive(inv: Investment) {
    await supabase.from('investments').update({ is_active: !inv.is_active }).eq('id', inv.id)
    await loadInvestments()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este investimento?')) return
    setDeletingId(id)
    await supabase.from('investments').delete().eq('id', id)
    showToast('Investimento excluído.')
    await loadInvestments()
    setDeletingId(null)
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`

  const filtered = useMemo(() => {
    return investments.filter(inv => {
      if (!showInactive && !inv.is_active) return false
      if (filterType && inv.type !== filterType) return false
      return true
    })
  }, [investments, filterType, showInactive])

  const activeInvestments = investments.filter(i => i.is_active)
  const totalInvested     = activeInvestments.reduce((s, i) => s + Number(i.current_amount), 0)
  const totalInitial      = activeInvestments.reduce((s, i) => s + Number(i.initial_amount), 0)
  const totalGain         = totalInvested - totalInitial
  const gainPct           = totalInitial > 0 ? (totalGain / totalInitial) * 100 : 0

  // Distribuição por tipo
  const byType = useMemo(() => {
    const map: Record<string, number> = {}
    activeInvestments.forEach(i => {
      map[i.type] = (map[i.type] ?? 0) + Number(i.current_amount)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [investments])

  // Objetivos com progresso
  const byObjective = useMemo(() => {
    const map: Record<string, number> = {}
    activeInvestments.forEach(i => {
      if (i.objective) map[i.objective] = (map[i.objective] ?? 0) + Number(i.current_amount)
    })
    return Object.entries(map)
  }, [investments])

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">

      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</a>
          <h1 className="text-xl font-semibold mt-1">Investimentos</h1>
          <p className="text-xs text-gray-400 mt-0.5">Patrimônio separado do saldo operacional</p>
        </div>
        <button onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          + Novo Investimento
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-100 rounded-xl p-4 sm:col-span-2">
          <p className="text-xs text-gray-400 mb-1">Patrimônio investido</p>
          <p className="text-3xl font-bold text-indigo-600">{fmt(totalInvested)}</p>
          <p className="text-xs text-gray-400 mt-1">Não incluso no saldo disponível</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Rendimento total</p>
          <p className={`text-xl font-bold ${totalGain >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(totalGain)}</p>
          <p className={`text-xs mt-1 ${gainPct >= 0 ? 'text-green-500' : 'text-red-400'}`}>{fmtPct(gainPct)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Ativos</p>
          <p className="text-xl font-bold text-gray-800">{activeInvestments.length}</p>
          <p className="text-xs text-gray-400 mt-1">investimentos</p>
        </div>
      </div>

      {/* Distribuição + Objetivos */}
      {activeInvestments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Por tipo */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Por tipo</p>
            <div className="space-y-2">
              {byType.map(([type, amount]) => {
                const pct = totalInvested > 0 ? (amount / totalInvested) * 100 : 0
                return (
                  <div key={type}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">{type}</span>
                      <span className="text-gray-500">{fmt(amount)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: TYPE_COLORS[type] ?? '#6b7280' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Por objetivo */}
          {byObjective.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Por objetivo</p>
              <div className="space-y-2">
                {byObjective.map(([obj, amount]) => {
                  const pct = totalInvested > 0 ? (amount / totalInvested) * 100 : 0
                  return (
                    <div key={obj}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 font-medium">{OBJECTIVE_EMOJI[obj]} {obj}</span>
                        <span className="text-gray-500">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap mb-4 items-center">
        <button onClick={() => setFilterType('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filterType ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          Todos
        </button>
        {TYPES.map(t => investments.some(i => i.type === t) && (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterType === t ? 'text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            style={filterType === t ? { backgroundColor: TYPE_COLORS[t] } : {}}>
            {t}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Mostrar inativos
        </label>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">📈</p>
          <p className="text-gray-500 text-sm font-medium">Nenhum investimento cadastrado</p>
          <p className="text-gray-400 text-xs mt-1 mb-4">Cadastre seus investimentos para acompanhar seu patrimônio separado do saldo operacional.</p>
          <button onClick={openCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            + Novo Investimento
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(inv => {
            const gain    = Number(inv.current_amount) - Number(inv.initial_amount)
            const gainPct = Number(inv.initial_amount) > 0 ? (gain / Number(inv.initial_amount)) * 100 : 0
            return (
              <div key={inv.id}
                className={`bg-white border rounded-xl p-4 transition-opacity ${!inv.is_active ? 'opacity-50' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-8 rounded-full" style={{ backgroundColor: TYPE_COLORS[inv.type] ?? '#6b7280' }} />
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{inv.name}</p>
                      <p className="text-xs text-gray-400">{inv.type}{inv.institution ? ` · ${inv.institution}` : ''}</p>
                    </div>
                  </div>
                  {inv.objective && (
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                      {OBJECTIVE_EMOJI[inv.objective]} {inv.objective}
                    </span>
                  )}
                </div>

                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-400">Valor atual</p>
                    <p className="text-xl font-bold text-gray-800">{fmt(Number(inv.current_amount))}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(gain)}</p>
                    <p className={`text-xs ${gainPct >= 0 ? 'text-green-500' : 'text-red-400'}`}>{fmtPct(gainPct)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {inv.liquidity && (
                    <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full border border-gray-100">
                      💧 {inv.liquidity}
                    </span>
                  )}
                  {inv.profitability != null && (
                    <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full border border-green-100">
                      📊 {inv.profitability}% a.a.
                    </span>
                  )}
                  {inv.start_date && (
                    <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full border border-gray-100">
                      📅 {new Date(inv.start_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>

                <div className="flex gap-1 pt-2 border-t border-gray-50">
                  <button onClick={() => openEdit(inv)}
                    className="text-xs text-gray-400 hover:text-indigo-600 px-2 py-1 rounded hover:bg-indigo-50 transition-colors">
                    ✏️ Editar
                  </button>
                  <button onClick={() => handleToggleActive(inv)}
                    className="text-xs text-gray-400 hover:text-yellow-600 px-2 py-1 rounded hover:bg-yellow-50 transition-colors">
                    {inv.is_active ? '⏸ Desativar' : '▶ Ativar'}
                  </button>
                  <button onClick={() => handleDelete(inv.id)} disabled={deletingId === inv.id}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50">
                    {deletingId === inv.id ? '…' : '🗑️ Excluir'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-5">{editingId ? 'Editar Investimento' : 'Novo Investimento'}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nome</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Tesouro Selic 2029, PETR4..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Tipo</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Objetivo</label>
                  <select value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">Sem objetivo</option>
                    {OBJECTIVES.map(o => <option key={o} value={o}>{OBJECTIVE_EMOJI[o]} {o}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Instituição <span className="text-gray-400">(opcional)</span></label>
                <input type="text" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })}
                  placeholder="Ex: XP, Nubank, Rico..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Valor inicial (R$)</label>
                  <input type="number" value={form.initial_amount} onChange={e => setForm({ ...form, initial_amount: e.target.value })}
                    placeholder="0,00" step="0.01" min="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Valor atual (R$)</label>
                  <input type="number" value={form.current_amount} onChange={e => setForm({ ...form, current_amount: e.target.value })}
                    placeholder="0,00" step="0.01" min="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Rentabilidade a.a. (%)</label>
                  <input type="number" value={form.profitability} onChange={e => setForm({ ...form, profitability: e.target.value })}
                    placeholder="Ex: 11.25" step="0.01"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Liquidez</label>
                  <select value={form.liquidity} onChange={e => setForm({ ...form, liquidity: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    {LIQUIDITY.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Data de início</label>
                <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Observações <span className="text-gray-400">(opcional)</span></label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} placeholder="Notas adicionais..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
