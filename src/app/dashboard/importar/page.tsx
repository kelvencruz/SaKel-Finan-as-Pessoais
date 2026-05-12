'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'

// ── tipos ─────────────────────────────────────────────────────────────────────
interface ParsedRow {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  category_suggestion?: string
  status: 'ok' | 'error' | 'duplicate'
  error?: string
  original: Record<string, string>
}

interface ImportResult {
  imported: number
  duplicates: number
  errors: number
}

interface Account { id: string; name: string }
interface Category { id: string; name: string; type: string }

// ── categorização automática por palavra-chave ────────────────────────────────
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Alimentação':   ['mercado', 'supermercado', 'padaria', 'restaurante', 'lanche', 'ifood', 'rappi', 'delivery', 'açougue', 'hortifruti'],
  'Transporte':    ['uber', 'cabify', '99', 'combustivel', 'gasolina', 'posto', 'onibus', 'metro', 'estacionamento', 'pedagio', 'transporte'],
  'Saúde':         ['farmacia', 'drogaria', 'medico', 'clinica', 'hospital', 'exame', 'plano saude', 'dentista'],
  'Educação':      ['escola', 'faculdade', 'curso', 'livro', 'udemy', 'alura', 'mensalidade', 'colegio'],
  'Lazer':         ['netflix', 'spotify', 'cinema', 'teatro', 'show', 'steam', 'playstation', 'amazon prime'],
  'Moradia':       ['aluguel', 'condominio', 'luz', 'agua', 'gas', 'internet', 'telefone', 'energia'],
  'Vestuário':     ['roupa', 'calcado', 'sapato', 'tenis', 'zara', 'hering', 'renner', 'c&a'],
  'Assinaturas':   ['assinatura', 'mensalidade', 'plano', 'subscription'],
  'Salário':       ['salario', 'pagamento', 'remuneracao', 'vencimento', 'folha'],
  'Investimentos': ['investimento', 'aplicacao', 'rendimento', 'dividendo', 'resgate'],
}

function suggestCategory(description: string): string | undefined {
  const lower = description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return category
  }
  return undefined
}

// ── parse de data flexível ─────────────────────────────────────────────────────
function parseDate(raw: string): string | null {
  if (!raw) return null
  const clean = raw.trim()

  // dd/mm/yyyy ou dd-mm-yyyy
  const br = clean.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`

  // yyyy-mm-dd
  const iso = clean.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/)
  if (iso) return clean.replace(/\//g, '-')

  return null
}

// ── parse de valor flexível ────────────────────────────────────────────────────
function parseAmount(raw: string): number | null {
  if (!raw) return null
  const clean = raw.trim()
    .replace(/R\$\s*/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.\-]/g, '')
  const num = parseFloat(clean)
  return isNaN(num) ? null : num
}

// ── componente principal ──────────────────────────────────────────────────────
export default function ImportarPage() {
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)
  const pdfRef   = useRef<HTMLInputElement>(null)

  const [tab,          setTab]          = useState<'csv' | 'pdf'>('csv')
  const [step,         setStep]         = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [rawHeaders,   setRawHeaders]   = useState<string[]>([])
  const [rawRows,      setRawRows]      = useState<Record<string, string>[]>([])
  const [mapping,      setMapping]      = useState<{ date: string; description: string; amount: string; type?: string }>({ date: '', description: '', amount: '' })
  const [parsed,       setParsed]       = useState<ParsedRow[]>([])
  const [accounts,     setAccounts]     = useState<Account[]>([])
  const [categories,   setCategories]   = useState<Category[]>([])
  const [selectedAcc,  setSelectedAcc]  = useState('')
  const [importing,    setImporting]    = useState(false)
  const [result,       setResult]       = useState<ImportResult | null>(null)
  const [fileName,     setFileName]     = useState('')
  const [pdfText,      setPdfText]      = useState('')
  const [pdfParsed,    setPdfParsed]    = useState<ParsedRow[]>([])
  const [pdfLoading,   setPdfLoading]   = useState(false)
  const [error,        setError]        = useState('')

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // ── carrega contas e categorias ───────────────────────────────────────────
  async function loadMeta() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: acc }, { data: cat }] = await Promise.all([
      supabase.from('accounts').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('id, name, type').eq('user_id', user.id).order('name'),
    ])
    setAccounts(acc ?? [])
    setCategories(cat ?? [])
    if (acc?.length) setSelectedAcc(acc[0].id)
  }

  // ── STEP 1: upload CSV ────────────────────────────────────────────────────
  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (results) => {
        const headers = results.meta.fields ?? []
        const rows    = results.data as Record<string, string>[]
        if (headers.length === 0 || rows.length === 0) {
          setError('CSV vazio ou sem cabeçalho reconhecido.')
          return
        }
        setRawHeaders(headers)
        setRawRows(rows)
        // auto-map por nome
        const autoMap = { date: '', description: '', amount: '', type: '' }
        headers.forEach(h => {
          const l = h.toLowerCase()
          if (!autoMap.date        && /data|date/.test(l))          autoMap.date = h
          if (!autoMap.description && /descri|hist|memo|desc/.test(l)) autoMap.description = h
          if (!autoMap.amount      && /valor|amount|value|cred|deb/.test(l)) autoMap.amount = h
          if (!autoMap.type        && /tipo|type/.test(l))           autoMap.type = h
        })
        setMapping(autoMap)
        loadMeta()
        setStep('map')
      },
      error: () => setError('Erro ao ler o arquivo. Verifique se é um CSV válido.'),
    })
  }

  // ── STEP 2: aplicar mapeamento → preview ──────────────────────────────────
  function applyMapping() {
    if (!mapping.date || !mapping.description || !mapping.amount) {
      setError('Mapeie os campos obrigatórios: Data, Descrição e Valor.')
      return
    }
    setError('')
    const rows: ParsedRow[] = rawRows.map((row, i) => {
      const rawDate   = row[mapping.date]        ?? ''
      const rawDesc   = row[mapping.description] ?? ''
      const rawAmount = row[mapping.amount]       ?? ''

      const date   = parseDate(rawDate)
      const amount = parseAmount(rawAmount)

      if (!date)   return { date: rawDate, description: rawDesc, amount: 0, type: 'expense', status: 'error', error: `Linha ${i + 2}: data inválida "${rawDate}"`, original: row }
      if (amount === null) return { date, description: rawDesc, amount: 0, type: 'expense', status: 'error', error: `Linha ${i + 2}: valor inválido "${rawAmount}"`, original: row }

      const type: 'income' | 'expense' = amount >= 0 ? 'income' : 'expense'
      const category_suggestion = suggestCategory(rawDesc)

      return { date, description: rawDesc.trim(), amount: Math.abs(amount), type, category_suggestion, status: 'ok', original: row }
    })
    setParsed(rows)
    setStep('preview')
  }

  // ── STEP 3: importar ─────────────────────────────────────────────────────
  async function handleImport() {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }

    // Busca transações existentes para deduplicação
    const { data: existing } = await supabase
      .from('transactions')
      .select('date, description, amount')
      .eq('user_id', user.id)

    const existingSet = new Set((existing ?? []).map(t => `${t.date}|${t.description}|${t.amount}`))

    let imported = 0, duplicates = 0, errors = 0
    const toInsert = []

    for (const row of parsed) {
      if (row.status === 'error') { errors++; continue }
      const key = `${row.date}|${row.description}|${row.amount}`
      if (existingSet.has(key)) { duplicates++; continue }

      // Tenta encontrar categoria por sugestão
      const cat = categories.find(c => c.name === row.category_suggestion && c.type === row.type)

      toInsert.push({
        user_id:     user.id,
        account_id:  selectedAcc || null,
        type:        row.type,
        description: row.description,
        amount:      row.amount,
        date:        row.date,
        status:      'paid',
        category_id: cat?.id ?? null,
      })
    }

    // Insere em lotes de 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100)
      const { error } = await supabase.from('transactions').insert(batch)
      if (error) errors += batch.length
      else imported += batch.length
    }

    setResult({ imported, duplicates, errors })
    setStep('done')
    setImporting(false)
  }

  // ── PDF: upload e extração ────────────────────────────────────────────────
  async function handlePDFFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setPdfLoading(true)
    setError('')

    try {
      // Lê o PDF como ArrayBuffer e usa pdfjs via dynamic import
      const arrayBuffer = await file.arrayBuffer()
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

      const pdf  = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let fullText = ''

      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i)
        const content = await page.getTextContent()
        const text    = content.items.map((item) => ('str' in item ? (item as { str: string }).str : '')).join(' ')
        fullText += text + '\n'
      }

      setPdfText(fullText)
      extractTransactionsFromText(fullText)
    } catch {
      setError('Erro ao ler o PDF. Tente um PDF com texto (não escaneado).')
    }

    setPdfLoading(false)
    await loadMeta()
  }

  // ── extrai transações do texto do PDF ────────────────────────────────────
  function extractTransactionsFromText(text: string) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const rows: ParsedRow[] = []

    // Regex para encontrar linhas com data + descrição + valor
    const lineRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})\s+(.+?)\s+([\-\+]?R?\$?\s?[\d.,]+)\s*$/

    for (const line of lines) {
      const match = line.match(lineRegex)
      if (!match) continue

      const date   = parseDate(match[1])
      const desc   = match[2].trim()
      const amount = parseAmount(match[3])

      if (!date || amount === null || desc.length < 2) continue

      const type: 'income' | 'expense' = amount >= 0 ? 'income' : 'expense'
      rows.push({
        date,
        description: desc,
        amount: Math.abs(amount),
        type,
        category_suggestion: suggestCategory(desc),
        status: 'ok',
        original: { line },
      })
    }

    setPdfParsed(rows)
  }

  // ── importar transações do PDF ────────────────────────────────────────────
  async function handlePDFImport() {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: existing } = await supabase
      .from('transactions')
      .select('date, description, amount')
      .eq('user_id', user.id)

    const existingSet = new Set((existing ?? []).map(t => `${t.date}|${t.description}|${t.amount}`))

    let imported = 0, duplicates = 0, errors = 0
    const toInsert = []

    for (const row of pdfParsed) {
      const key = `${row.date}|${row.description}|${row.amount}`
      if (existingSet.has(key)) { duplicates++; continue }
      const cat = categories.find(c => c.name === row.category_suggestion && c.type === row.type)
      toInsert.push({
        user_id: user.id, account_id: selectedAcc || null,
        type: row.type, description: row.description,
        amount: row.amount, date: row.date, status: 'paid',
        category_id: cat?.id ?? null,
      })
    }

    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100)
      const { error } = await supabase.from('transactions').insert(batch)
      if (error) errors += batch.length
      else imported += batch.length
    }

    setResult({ imported, duplicates, errors })
    setStep('done')
    setImporting(false)
  }

  // ── reset ─────────────────────────────────────────────────────────────────
  function reset() {
    setStep('upload')
    setRawHeaders([])
    setRawRows([])
    setParsed([])
    setPdfParsed([])
    setPdfText('')
    setResult(null)
    setFileName('')
    setError('')
    if (fileRef.current)  fileRef.current.value = ''
    if (pdfRef.current)   pdfRef.current.value  = ''
  }

  const okRows    = parsed.filter(r => r.status === 'ok')
  const errorRows = parsed.filter(r => r.status === 'error')

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</a>
        <h1 className="text-xl font-semibold mt-1">Importar dados</h1>
        <p className="text-sm text-gray-400 mt-0.5">Importe transações via CSV ou PDF de extratos bancários</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['csv', 'pdf'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); reset() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {t === 'csv' ? '📊 Importar CSV' : '📄 Importar PDF'}
          </button>
        ))}
      </div>

      {/* ── CSV ── */}
      {tab === 'csv' && (
        <>
          {/* STEP: upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Info bancos */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-sm font-medium text-indigo-700 mb-1">💡 Bancos suportados</p>
                <p className="text-xs text-indigo-500">Nubank, Itaú, Bradesco, Banco do Brasil, Sicredi, Inter e qualquer banco que exporte CSV com Data, Descrição e Valor.</p>
              </div>

              {/* Upload area */}
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 hover:border-indigo-400 rounded-xl p-10 text-center cursor-pointer transition-colors">
                <span className="text-4xl block mb-3">📊</span>
                <p className="text-sm font-medium text-gray-700">{fileName || 'Clique para selecionar o arquivo CSV'}</p>
                <p className="text-xs text-gray-400 mt-1">Arquivos .csv — UTF-8 ou Latin1</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSVFile} className="hidden" />
              </div>

              {/* Template download */}
              <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Não sabe o formato?</p>
                  <p className="text-xs text-gray-400 mt-0.5">Baixe o modelo padrão SaKel</p>
                </div>
                <button onClick={() => {
                  const csv = 'Data,Descricao,Valor\n01/05/2026,Supermercado,-150.50\n02/05/2026,Salario,5000.00'
                  const a = document.createElement('a')
                  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
                  a.download = 'modelo-sakel.csv'
                  a.click()
                }} className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                  Baixar modelo
                </button>
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
            </div>
          )}

          {/* STEP: mapeamento */}
          {step === 'map' && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Mapeie as colunas do seu CSV</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { key: 'date',        label: 'Data *',        placeholder: 'Coluna de data' },
                    { key: 'description', label: 'Descrição *',   placeholder: 'Coluna de descrição' },
                    { key: 'amount',      label: 'Valor *',       placeholder: 'Coluna de valor' },
                  ].map(field => (
                    <div key={field.key}>
                      <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                      <select
                        value={mapping[field.key as keyof typeof mapping] ?? ''}
                        onChange={e => setMapping({ ...mapping, [field.key]: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Selecione…</option>
                        {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Preview das primeiras linhas */}
                <div className="mt-5 overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>{rawHeaders.slice(0, 6).map(h => <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rawRows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          {rawHeaders.slice(0, 6).map(h => <td key={h} className="px-3 py-2 text-gray-600 truncate max-w-[120px]">{row[h]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

                <div className="flex gap-3 mt-5">
                  <button onClick={reset} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
                  <button onClick={applyMapping} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 transition-colors">Pré-visualizar →</button>
                </div>
              </div>
            </div>
          )}

          {/* STEP: preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-indigo-600">{okRows.length}</p>
                  <p className="text-xs text-gray-400 mt-1">Prontas</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-red-500">{errorRows.length}</p>
                  <p className="text-xs text-gray-400 mt-1">Com erro</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-gray-700">{parsed.length}</p>
                  <p className="text-xs text-gray-400 mt-1">Total</p>
                </div>
              </div>

              {/* Conta destino */}
              {accounts.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4">
                  <p className="text-sm font-medium text-gray-700 shrink-0">Conta destino:</p>
                  <select value={selectedAcc} onChange={e => setSelectedAcc(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Sem conta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              {/* Lista de transações */}
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">Pré-visualização</p>
                  <p className="text-xs text-gray-400">{okRows.length} transações válidas</p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {parsed.slice(0, 50).map((row, i) => (
                    <div key={i} className={`flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-0 ${row.status === 'error' ? 'bg-red-50' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${row.type === 'income' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                        {row.type === 'income' ? '↑' : '↓'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{row.description}</p>
                        <p className="text-xs text-gray-400">
                          {row.date}
                          {row.category_suggestion && ` · 🏷️ ${row.category_suggestion}`}
                          {row.error && ` · ⚠️ ${row.error}`}
                        </p>
                      </div>
                      <p className={`text-sm font-semibold shrink-0 ${row.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                        {row.type === 'income' ? '+' : '−'} {fmt(row.amount)}
                      </p>
                    </div>
                  ))}
                  {parsed.length > 50 && (
                    <p className="text-xs text-gray-400 text-center py-3">+ {parsed.length - 50} transações não exibidas</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('map')} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">← Voltar</button>
                <button onClick={handleImport} disabled={importing || okRows.length === 0}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  {importing ? 'Importando…' : `Importar ${okRows.length} transações`}
                </button>
              </div>
            </div>
          )}

          {/* STEP: done */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className={`rounded-xl p-6 text-center border ${result.errors === 0 ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                <span className="text-4xl block mb-3">{result.errors === 0 ? '✅' : '⚠️'}</span>
                <p className="text-lg font-semibold text-gray-800 mb-4">Importação concluída!</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xl font-bold text-green-600">{result.imported}</p>
                    <p className="text-xs text-gray-400">Importadas</p>
                  </div>
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xl font-bold text-amber-500">{result.duplicates}</p>
                    <p className="text-xs text-gray-400">Duplicatas</p>
                  </div>
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xl font-bold text-red-500">{result.errors}</p>
                    <p className="text-xs text-gray-400">Erros</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">Importar outro arquivo</button>
                <a href="/dashboard/transacoes" className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors text-center">Ver transações →</a>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── PDF ── */}
      {tab === 'pdf' && (
        <div className="space-y-4">
          {step !== 'done' && (
            <>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-sm font-medium text-amber-700 mb-1">⚠️ Sobre importação de PDF</p>
                <p className="text-xs text-amber-600">Funciona melhor com PDFs de texto (não escaneados). Faturas de cartão, extratos bancários digitais e boletos com texto têm melhor precisão.</p>
              </div>

              <div onClick={() => pdfRef.current?.click()}
                className="border-2 border-dashed border-gray-200 hover:border-indigo-400 rounded-xl p-10 text-center cursor-pointer transition-colors">
                <span className="text-4xl block mb-3">{pdfLoading ? '⏳' : '📄'}</span>
                <p className="text-sm font-medium text-gray-700">
                  {pdfLoading ? 'Lendo PDF…' : fileName || 'Clique para selecionar o PDF'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Extratos, faturas de cartão, boletos</p>
                <input ref={pdfRef} type="file" accept=".pdf" onChange={handlePDFFile} className="hidden" />
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

              {pdfParsed.length > 0 && (
                <>
                  <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4">
                    <p className="text-sm font-medium text-gray-700 shrink-0">Conta destino:</p>
                    <select value={selectedAcc} onChange={e => setSelectedAcc(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Sem conta</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>

                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700">Transações detectadas</p>
                      <p className="text-xs text-gray-400">{pdfParsed.length} encontradas</p>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {pdfParsed.map((row, i) => (
                        <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${row.type === 'income' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                            {row.type === 'income' ? '↑' : '↓'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{row.description}</p>
                            <p className="text-xs text-gray-400">
                              {row.date}
                              {row.category_suggestion && ` · 🏷️ ${row.category_suggestion}`}
                            </p>
                          </div>
                          <p className={`text-sm font-semibold shrink-0 ${row.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                            {row.type === 'income' ? '+' : '−'} {fmt(row.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={handlePDFImport} disabled={importing}
                    className="w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {importing ? 'Importando…' : `Importar ${pdfParsed.length} transações`}
                  </button>
                </>
              )}

              {pdfText && pdfParsed.length === 0 && !pdfLoading && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                  <p className="text-sm text-amber-700">Nenhuma transação detectada automaticamente.</p>
                  <p className="text-xs text-amber-500 mt-1">O PDF pode estar em formato de imagem (escaneado) ou com layout não reconhecido.</p>
                </div>
              )}
            </>
          )}

          {step === 'done' && result && (
            <div className="space-y-4">
              <div className={`rounded-xl p-6 text-center border ${result.errors === 0 ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                <span className="text-4xl block mb-3">{result.errors === 0 ? '✅' : '⚠️'}</span>
                <p className="text-lg font-semibold text-gray-800 mb-4">Importação concluída!</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xl font-bold text-green-600">{result.imported}</p>
                    <p className="text-xs text-gray-400">Importadas</p>
                  </div>
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xl font-bold text-amber-500">{result.duplicates}</p>
                    <p className="text-xs text-gray-400">Duplicatas</p>
                  </div>
                  <div className="bg-white rounded-xl p-3">
                    <p className="text-xl font-bold text-red-500">{result.errors}</p>
                    <p className="text-xs text-gray-400">Erros</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">Importar outro arquivo</button>
                <a href="/dashboard/transacoes" className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors text-center">Ver transações →</a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
