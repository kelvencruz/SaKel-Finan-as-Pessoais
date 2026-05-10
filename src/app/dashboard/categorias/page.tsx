'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Category, CategoryType } from '@/types'

const COLORS = [
  '#6366f1','#3b82f6','#22c55e','#f97316',
  '#ef4444','#ec4899','#14b8a6','#f59e0b',
  '#8b5cf6','#6b7280',
]

const ICONS = [
  '🛒','🚗','🏠','❤️','🎵','📚','👕','📱','✈️','🍔',
  '💼','💻','📈','💰','🎮','⚽','🐾','💊','🎁','⚡',
  '🍕','☕','🎓','🏋️','🧾','🎬','🏥','🐶','🌱','🧴',
]

const emptyForm = { name: '', type: 'expense' as CategoryType, color: '#6366f1', icon: '🛒', customIcon: '' }

type Toast = { message: string; type: 'success' | 'error' }

export default function CategoriasPage() {
  const supabase = createClient()

  const [categories, setCategories] = useState<Category[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState(emptyForm)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [tab,        setTab]        = useState<CategoryType>('expense')
  const [toast,      setToast]      = useState<Toast | null>(null)

  // ── helpers ──────────────────────────────────────────────
  function showToast(message: string, type: Toast['type'] = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadCategories() {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('name')
    setCategories(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadCategories() }, [])

  // ── modal ────────────────────────────────────────────────
  function openCreate() {
    setForm({ ...emptyForm, type: tab })
    setEditingId(null)
    setError(null)
    setShowModal(true)
  }

  function openEdit(cat: Category) {
    const isCustom = !ICONS.includes(cat.icon)
    setForm({
      name:       cat.name,
      type:       cat.type,
      color:      cat.color,
      icon:       isCustom ? ICONS[0] : cat.icon,
      customIcon: isCustom ? cat.icon : '',
    })
    setEditingId(cat.id)
    setError(null)
    setShowModal(true)
  }

  // ── save ─────────────────────────────────────────────────
  async function handleSave() {
    setError(null)
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return }

    const finalIcon = form.customIcon.trim() || form.icon

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Não autenticado.'); setSaving(false); return }

    if (editingId) {
      const { error: err } = await supabase
        .from('categories')
        .update({ name: form.name.trim(), type: form.type, color: form.color, icon: finalIcon })
        .eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
      showToast('Categoria atualizada!')
    } else {
      const { error: err } = await supabase
        .from('categories')
        .insert({ name: form.name.trim(), type: form.type, color: form.color, icon: finalIcon, user_id: user.id })
      if (err) { setError(err.message); setSaving(false); return }
      showToast('Categoria criada!')
    }

    await loadCategories()
    setShowModal(false)
    setSaving(false)
  }

  // ── delete ───────────────────────────────────────────────
  async function handleDelete(cat: Category) {
    const confirmed = confirm(`Excluir a categoria "${cat.name}"?`)
    if (!confirmed) return

    // verifica transações vinculadas
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id)

    if (count && count > 0) {
      alert(
        `Não é possível excluir "${cat.name}" pois ela possui ${count} transação(ões) vinculada(s).\n\nAltere a categoria dessas transações antes de remover.`
      )
      return
    }

    setDeletingId(cat.id)
    const { error: err } = await supabase.from('categories').delete().eq('id', cat.id)

    if (err) {
      showToast('Erro ao excluir categoria.', 'error')
    } else {
      showToast('Categoria excluída.')
    }

    await loadCategories()
    setDeletingId(null)
  }

  // ── derived ──────────────────────────────────────────────
  const filtered       = categories.filter(c => c.type === tab)
  const expenseCount   = categories.filter(c => c.type === 'expense').length
  const incomeCount    = categories.filter(c => c.type === 'income').length
  const activeIcon     = form.customIcon.trim() || form.icon

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success' ? '✓ ' : '✕ '}{toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</a>
          <h1 className="text-xl font-semibold mt-1">Categorias</h1>
        </div>
        <button
          onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + Nova Categoria
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['expense', 'income'] as CategoryType[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? t === 'expense' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t === 'expense' ? '💸 Despesas' : '💰 Receitas'}
            <span className="ml-2 text-xs opacity-60">
              {t === 'expense' ? expenseCount : incomeCount}
            </span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-400 text-sm">
            Nenhuma categoria de {tab === 'expense' ? 'despesa' : 'receita'} ainda.
          </p>
          <button onClick={openCreate} className="mt-3 text-indigo-600 text-sm hover:underline">
            Criar primeira categoria
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(cat => (
            <div
              key={cat.id}
              className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between group hover:border-gray-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                  style={{ backgroundColor: cat.color + '22', border: `2px solid ${cat.color}44` }}
                >
                  {cat.icon}
                </div>
                <span className="font-medium text-gray-800 text-sm">{cat.name}</span>
              </div>

              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(cat)}
                  className="text-xs text-gray-400 hover:text-indigo-600 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(cat)}
                  disabled={deletingId === cat.id}
                  className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {deletingId === cat.id ? '...' : 'Excluir'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-5">
              {editingId ? 'Editar Categoria' : 'Nova Categoria'}
            </h2>

            <div className="space-y-4">

              {/* Nome */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Alimentação, Salário..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Tipo</label>
                <div className="flex gap-2">
                  {(['expense', 'income'] as CategoryType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm({ ...form, type: t })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        form.type === t
                          ? t === 'expense' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                          : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {t === 'expense' ? '💸 Despesa' : '💰 Receita'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ícone predefinido */}
              <div>
                <label className="block text-sm text-gray-600 mb-2">Ícone</label>
                <div className="flex gap-2 flex-wrap">
                  {ICONS.map(icon => (
                    <button
                      key={icon}
                      onClick={() => setForm({ ...form, icon, customIcon: '' })}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                        form.icon === icon && !form.customIcon
                          ? 'bg-indigo-100 ring-2 ring-indigo-400 scale-110'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>

                {/* Ícone personalizado */}
                <div className="mt-2">
                  <input
                    type="text"
                    value={form.customIcon}
                    onChange={e => setForm({ ...form, customIcon: e.target.value })}
                    placeholder="Ou digite um emoji personalizado…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    maxLength={4}
                  />
                </div>
              </div>

              {/* Cor */}
              <div>
                <label className="block text-sm text-gray-600 mb-2">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setForm({ ...form, color })}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: color,
                        outline: form.color === color ? `3px solid ${color}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                  style={{ backgroundColor: form.color + '22', border: `2px solid ${form.color}55` }}
                >
                  {activeIcon}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">{form.name || 'Prévia da categoria'}</p>
                  <p className="text-xs text-gray-400">{form.type === 'expense' ? 'Despesa' : 'Receita'}</p>
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar categoria'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
