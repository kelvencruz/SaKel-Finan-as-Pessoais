'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'
import type { ReportData } from '@/components/RelatorioFinanceiroPDF'

// ── @react-pdf/renderer só funciona client-side ───────────────────────────────
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then(m => m.PDFDownloadLink),
  { ssr: false }
)
const RelatorioFinanceiroPDF = dynamic(
  () => import('@/components/RelatorioFinanceiroPDF'),
  { ssr: false }
)

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

interface ImportResult { imported: number; duplicates: number; errors: number }
interface Account  { id: string; name: string; current_balance?: number }
interface Category { id: string; name: string; type: string }

// ── categorização automática ──────────────────────────────────────────────────
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Alimentação':   ['mercado','supermercado','padaria','restaurante','lanche','ifood','rappi','delivery','açougue','hortifruti'],
  'Transporte':    ['uber','cabify','99','combustivel','gasolina','posto','onibus','metro','estacionamento','pedagio','transporte'],
  'Saúde':         ['farmacia','drogaria','medico','clinica','hospital','exame','plano saude','dentista'],
  'Educação':      ['escola','faculdade','curso','livro','udemy','alura','mensalidade','colegio'],
  'Lazer':         ['netflix','spotify','cinema','teatro','show','steam','playstation','amazon prime'],
  'Moradia':       ['aluguel','condominio','luz','agua','gas','internet','telefone','energia'],
  'Vestuário':     ['roupa','calcado','sapato','tenis','zara','hering','renner','c&a'],
  'Assinaturas':   ['assinatura','mensalidade','plano','subscription'],
  'Salário':       ['salario','pagamento','remuneracao','vencimento','folha'],
  'Investimentos': ['investimento','aplicacao','rendimento','dividendo','resgate'],
}

function suggestCategory(description: string) {
  const lower = description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some(k => lower.includes(k))) return cat
  }
  return undefined
}

function parseDate(raw: string): string | null {
  if (!raw) return null
  const clean = raw.trim()
  const br  = clean.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = clean.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/)
  if (iso) return clean.replace(/\//g, '-')
  return null
}

function parseAmount(raw: string): number | null {
  if (!raw) return null
  const clean = raw.trim().replace(/R\$\s*/g,'').replace(/\./g,'').replace(',','.').replace(/[^\d.\-]/g,'')
  const num = parseFloat(clean)
  return isNaN(num) ? null : num
}

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── componente principal ──────────────────────────────────────────────────────
export default function ImportarPage() {
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)
  const pdfRef   = useRef<HTMLInputElement>(null)

  const [tab,         setTab]         = useState<'csv' | 'pdf' | 'export'>('csv')
  const [step,        setStep]        = useState<'upload'|'map'|'preview'|'done'>('upload')
  const [rawHeaders,  setRawHeaders]  = useState<string[]>([])
  const [rawRows,     setRawRows]     = useState<Record<string,string>[]>([])
  const [mapping,     setMapping]     = useState<{date:string;description:string;amount:string;type?:string}>({date:'',description:'',amount:''})
  const [parsed,      setParsed]      = useState<ParsedRow[]>([])
  const [accounts,    setAccounts]    = useState<Account[]>([])
  const [categories,  setCategories]  = useState<Category[]>([])
  const [selectedAcc, setSelectedAcc] = useState('')
  const [importing,   setImporting]   = useState(false)
  const [result,      setResult]      = useState<ImportResult|null>(null)
  const [fileName,    setFileName]    = useState('')
  const [pdfText,     setPdfText]     = useState('')
  const [pdfParsed,   setPdfParsed]   = useState<ParsedRow[]>([])
  const [pdfLoading,  setPdfLoading]  = useState(false)
  const [error,       setError]       = useState('')

  // ── Export state ──────────────────────────────────────────────────────────
  const now = new Date()
  const [exportYear,    setExportYear]    = useState(now.getFullYear())
  const [exportMonth,   setExportMonth]   = useState(now.getMonth())
  const [exportLoading, setExportLoading] = useState(false)
  const [reportData,    setReportData]    = useState<ReportData | null>(null)
  const [userEmail,     setUserEmail]     = useState('')
  const [isClient,      setIsClient]      = useState(false)

  useEffect(() => { setIsClient(true) }, [])

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  async function loadMeta() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email ?? '')
    const [{ data: acc }, { data: cat }] = await Promise.all([
      supabase.from('accounts').select('id, name, current_balance').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('id, name, type').eq('user_id', user.id).order('name'),
    ])
    setAccounts(acc ?? [])
    setCategories(cat ?? [])
    if (acc?.length) setSelectedAcc(acc[0].id)
  }

  // ── Gera dados para o relatório PDF ──────────────────────────────────────
  async function handleGenerateReport() {
    setExportLoading(true)
    setReportData(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setExportLoading(false); return }

    const inicioMes = `${exportYear}-${String(exportMonth + 1).padStart(2,'0')}-01`
    const fimMes    = new Date(exportYear, exportMonth + 1, 0).toISOString().split('T')[0]

    // Transações do período
    const { data: txRaw } = await supabase
      .from('transactions')
      .select('id, type, description, amount, date, account_id, category_id')
      .eq('user_id', user.id)
      .gte('date', inicioMes)
      .lte('date', fimMes)
      .order('date', { ascending: false })

    // Contas e categorias para resolver nomes
    const { data: accRaw } = await supabase
      .from('accounts').select('id, name, current_balance').eq('user_id', user.id)
    const { data: catRaw } = await supabase
      .from('categories').select('id, name').eq('user_id', user.id)

    const accList = (accRaw ?? []) as { id: string; name: string; current_balance: number }[]
    const catList = (catRaw ?? []) as { id: string; name: string }[]
    const txList  = (txRaw  ?? []) as { id: string; type: string; description: string; amount: number; date: string; account_id: string; category_id: string | null }[]

    const accMap = Object.fromEntries(accList.map(a => [a.id, a]))
    const catMap = Object.fromEntries(catList.map(c => [c.id, c]))

    // Monta transações enriquecidas
    const transactions = txList.map(t => ({
      date:          t.date,
      description:   t.description,
      amount:        Number(t.amount),
      type:          t.type as 'income' | 'expense' | 'transfer',
      account_name:  accMap[t.account_id]?.name,
      category_name: t.category_id ? catMap[t.category_id]?.name : undefined,
    }))

    // Totais
    const total_income   = txList.filter(t => t.type === 'income').reduce((s,t) => s + Number(t.amount), 0)
    const total_expense  = txList.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0)
    const total_transfer = txList.filter(t => t.type === 'transfer').reduce((s,t) => s + Number(t.amount), 0)

    // Categorias resumidas
    const catTotals: Record<string, { total: number; count: number }> = {}
    txList.filter(t => t.type === 'expense').forEach(t => {
      const name = t.category_id ? (catMap[t.category_id]?.name ?? 'Outros') : 'Sem categoria'
      if (!catTotals[name]) catTotals[name] = { total: 0, count: 0 }
      catTotals[name].total += Number(t.amount)
      catTotals[name].count += 1
    })
    const categories = Object.entries(catTotals)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)

    // Contas
    const accounts = accList.map(a => ({ name: a.name, balance: Number(a.current_balance) }))

    const periodLabel = `${MONTH_NAMES[exportMonth]} de ${exportYear}`

    setReportData({
      period_label:    periodLabel,
      generated_at:    new Date().toLocaleDateString('pt-BR'),
      user_email:      user.email ?? '',
      initial_balance: 0,
      final_balance:   total_income - total_expense,
      total_income,
      total_expense,
      total_transfer,
      categories,
      accounts,
      transactions,
    })

    setExportLoading(false)
  }

  // ── CSV ───────────────────────────────────────────────────────────────────
  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setError('')
    Papa.parse(file, {
      header: true, skipEmptyLines: true, encoding: 'UTF-8',
      complete: (results) => {
        const headers = results.meta.fields ?? []
        const rows    = results.data as Record<string,string>[]
        if (!headers.length || !rows.length) { setError('CSV vazio ou sem cabeçalho.'); return }
        setRawHeaders(headers); setRawRows(rows)
        const autoMap = { date:'', description:'', amount:'', type:'' }
        headers.forEach(h => {
          const l = h.toLowerCase()
          if (!autoMap.date        && /data|date/.test(l))             autoMap.date = h
          if (!autoMap.description && /descri|hist|memo|desc/.test(l)) autoMap.description = h
          if (!autoMap.amount      && /valor|amount|value|cred|deb/.test(l)) autoMap.amount = h
          if (!autoMap.type        && /tipo|type/.test(l))             autoMap.type = h
        })
        setMapping(autoMap); loadMeta(); setStep('map')
      },
      error: () => setError('Erro ao ler o arquivo CSV.'),
    })
  }

  function applyMapping() {
    if (!mapping.date || !mapping.description || !mapping.amount) { setError('Mapeie Data, Descrição e Valor.'); return }
    setError('')
    const rows: ParsedRow[] = rawRows.map((row, i) => {
      const date   = parseDate(row[mapping.date] ?? '')
      const amount = parseAmount(row[mapping.amount] ?? '')
      const desc   = row[mapping.description] ?? ''
      if (!date)          return { date: row[mapping.date]??'', description: desc, amount:0, type:'expense', status:'error', error:`Linha ${i+2}: data inválida`, original: row }
      if (amount === null) return { date, description: desc, amount:0, type:'expense', status:'error', error:`Linha ${i+2}: valor inválido`, original: row }
      const type: 'income'|'expense' = amount >= 0 ? 'income' : 'expense'
      return { date, description: desc.trim(), amount: Math.abs(amount), type, category_suggestion: suggestCategory(desc), status:'ok', original: row }
    })
    setParsed(rows); setStep('preview')
  }

  async function handleImport() {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    const { data: existing } = await supabase.from('transactions').select('date,description,amount').eq('user_id', user.id)
    const existingSet = new Set((existing??[]).map((t:any) => `${t.date}|${t.description}|${t.amount}`))
    let imported=0, duplicates=0, errors=0
    const toInsert: any[] = []
    for (const row of parsed) {
      if (row.status === 'error') { errors++; continue }
      const key = `${row.date}|${row.description}|${row.amount}`
      if (existingSet.has(key)) { duplicates++; continue }
      const cat = categories.find(c => c.name === row.category_suggestion && c.type === row.type)
      toInsert.push({ user_id: user.id, account_id: selectedAcc||null, type: row.type, description: row.description, amount: row.amount, date: row.date, status:'paid', category_id: cat?.id??null })
    }
    for (let i=0; i<toInsert.length; i+=100) {
      const { error } = await supabase.from('transactions').insert(toInsert.slice(i, i+100))
      if (error) errors += Math.min(100, toInsert.length-i)
      else imported += Math.min(100, toInsert.length-i)
    }
    setResult({ imported, duplicates, errors }); setStep('done'); setImporting(false)
  }

  // ── PDF import ────────────────────────────────────────────────────────────
  async function handlePDFFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setPdfLoading(true); setError('')
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let fullText = ''
      for (let i=1; i<=pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        fullText += content.items.map((item:any) => item.str||'').join(' ') + '\n'
      }
      setPdfText(fullText)
      const lines = fullText.split('\n').map(l=>l.trim()).filter(Boolean)
      const rows: ParsedRow[] = []
      const lineRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})\s+(.+?)\s+([\-\+]?R?\$?\s?[\d.,]+)\s*$/
      for (const line of lines) {
        const match = line.match(lineRegex)
        if (!match) continue
        const date = parseDate(match[1]); const amount = parseAmount(match[3]); const desc = match[2].trim()
        if (!date || amount === null || desc.length < 2) continue
        const type: 'income'|'expense' = amount >= 0 ? 'income' : 'expense'
        rows.push({ date, description: desc, amount: Math.abs(amount), type, category_suggestion: suggestCategory(desc), status:'ok', original:{ line } })
      }
      setPdfParsed(rows)
    } catch { setError('Erro ao ler o PDF.') }
    setPdfLoading(false); await loadMeta()
  }

  async function handlePDFImport() {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: existing } = await supabase.from('transactions').select('date,description,amount').eq('user_id', user.id)
    const existingSet = new Set((existing??[]).map((t:any) => `${t.date}|${t.description}|${t.amount}`))
    let imported=0, duplicates=0, errors=0
    const toInsert: any[] = []
    for (const row of pdfParsed) {
      const key = `${row.date}|${row.description}|${row.amount}`
      if (existingSet.has(key)) { duplicates++; continue }
      const cat = categories.find(c => c.name === row.category_suggestion && c.type === row.type)
      toInsert.push({ user_id: user.id, account_id: selectedAcc||null, type: row.type, description: row.description, amount: row.amount, date: row.date, status:'paid', category_id: cat?.id??null })
    }
    for (let i=0; i<toInsert.length; i+=100) {
      const { error } = await supabase.from('transactions').insert(toInsert.slice(i, i+100))
      if (error) errors += Math.min(100, toInsert.length-i)
      else imported += Math.min(100, toInsert.length-i)
    }
    setResult({ imported, duplicates, errors }); setStep('done'); setImporting(false)
  }

  function reset() {
    setStep('upload'); setRawHeaders([]); setRawRows([]); setParsed([]); setPdfParsed([])
    setPdfText(''); setResult(null); setFileName(''); setError(''); setReportData(null)
    if (fileRef.current) fileRef.current.value = ''
    if (pdfRef.current)  pdfRef.current.value  = ''
  }

  const okRows    = parsed.filter(r => r.status === 'ok')
  const errorRows = parsed.filter(r => r.status === 'error')
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <a href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</a>
        <h1 className="text-xl font-semibold mt-1">Importar / Exportar</h1>
        <p className="text-sm text-gray-400 mt-0.5">Importe extratos ou exporte relatórios financeiros em PDF</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { id: 'csv',    label: '📊 Importar CSV' },
          { id: 'pdf',    label: '📄 Importar PDF' },
          { id: 'export', label: '📤 Exportar PDF' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); reset() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── EXPORT PDF ── */}
      {tab === 'export' && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p className="text-sm font-medium text-indigo-700 mb-1">📊 Relatório Financeiro em PDF</p>
            <p className="text-xs text-indigo-500">Gera um relatório completo com resumo executivo, despesas por categoria, saldo por conta e tabela de transações detalhadas.</p>
          </div>

          {/* Seletor de período */}
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Selecione o período</p>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mês</label>
                <select value={exportMonth} onChange={e => { setExportMonth(Number(e.target.value)); setReportData(null) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ano</label>
                <select value={exportYear} onChange={e => { setExportYear(Number(e.target.value)); setReportData(null) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <button onClick={handleGenerateReport} disabled={exportLoading}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {exportLoading ? '⏳ Carregando dados…' : '🔍 Gerar relatório'}
            </button>
          </div>

          {/* Preview e download */}
          {reportData && isClient && (
            <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Prévia do relatório</p>

              {/* Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Receitas</p>
                  <p className="text-sm font-bold text-green-600">{fmt(reportData.total_income)}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Despesas</p>
                  <p className="text-sm font-bold text-red-500">{fmt(reportData.total_expense)}</p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Saldo</p>
                  <p className={`text-sm font-bold ${reportData.total_income - reportData.total_expense >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
                    {fmt(reportData.total_income - reportData.total_expense)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Transações</p>
                  <p className="text-sm font-bold text-gray-700">{reportData.transactions.length}</p>
                </div>
              </div>

              {/* Categorias top 5 */}
              {reportData.categories.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Top categorias de despesa</p>
                  <div className="space-y-1.5">
                    {reportData.categories.slice(0,5).map((cat, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">{cat.name}</span>
                        <span className="font-medium text-gray-700">{fmt(cat.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botão de download */}
              <PDFDownloadLink
                document={<RelatorioFinanceiroPDF data={reportData} />}
                fileName={`sakel-relatorio-${MONTH_NAMES[exportMonth].toLowerCase()}-${exportYear}.pdf`}
              >
                {({ loading }: { loading: boolean }) => (
                  <button
                    disabled={loading}
                    className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? '⏳ Preparando PDF…' : '⬇ Baixar Relatório PDF'}
                  </button>
                )}
              </PDFDownloadLink>

              <p className="text-[11px] text-gray-400 text-center">
                O PDF é gerado localmente no seu navegador — nenhum dado é enviado para servidores externos.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── CSV ── */}
      {tab === 'csv' && (
        <>
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-sm font-medium text-indigo-700 mb-1">💡 Bancos suportados</p>
                <p className="text-xs text-indigo-500">Nubank, Itaú, Bradesco, BB, Sicredi, Inter e qualquer banco que exporte CSV com Data, Descrição e Valor.</p>
              </div>
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 hover:border-indigo-400 rounded-xl p-10 text-center cursor-pointer transition-colors">
                <span className="text-4xl block mb-3">📊</span>
                <p className="text-sm font-medium text-gray-700">{fileName || 'Clique para selecionar o arquivo CSV'}</p>
                <p className="text-xs text-gray-400 mt-1">Arquivos .csv — UTF-8 ou Latin1</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSVFile} className="hidden" />
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Não sabe o formato?</p>
                  <p className="text-xs text-gray-400 mt-0.5">Baixe o modelo padrão SaKel</p>
                </div>
                <button onClick={() => {
                  const csv = 'Data,Descricao,Valor\n01/05/2026,Supermercado,-150.50\n02/05/2026,Salario,5000.00'
                  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = 'modelo-sakel.csv'; a.click()
                }} className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                  Baixar modelo
                </button>
              </div>
              {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
            </div>
          )}

          {step === 'map' && (
            <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">Mapeie as colunas do seu CSV</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[{key:'date',label:'Data *'},{key:'description',label:'Descrição *'},{key:'amount',label:'Valor *'}].map(field => (
                  <div key={field.key}>
                    <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                    <select value={mapping[field.key as keyof typeof mapping]??''} onChange={e => setMapping({...mapping,[field.key]:e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Selecione…</option>
                      {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50"><tr>{rawHeaders.slice(0,6).map(h => <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>)}</tr></thead>
                  <tbody>{rawRows.slice(0,3).map((row,i) => <tr key={i} className="border-t border-gray-50">{rawHeaders.slice(0,6).map(h => <td key={h} className="px-3 py-2 text-gray-600 truncate max-w-[120px]">{row[h]}</td>)}</tr>)}</tbody>
                </table>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50">Cancelar</button>
                <button onClick={applyMapping} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700">Pré-visualizar →</button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-gray-100 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-indigo-600">{okRows.length}</p><p className="text-xs text-gray-400 mt-1">Prontas</p></div>
                <div className="bg-white border border-gray-100 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-red-500">{errorRows.length}</p><p className="text-xs text-gray-400 mt-1">Com erro</p></div>
                <div className="bg-white border border-gray-100 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-gray-700">{parsed.length}</p><p className="text-xs text-gray-400 mt-1">Total</p></div>
              </div>
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
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">Pré-visualização</p>
                  <p className="text-xs text-gray-400">{okRows.length} válidas</p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {parsed.slice(0,50).map((row,i) => (
                    <div key={i} className={`flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-0 ${row.status==='error'?'bg-red-50':''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${row.type==='income'?'bg-green-50 text-green-600':'bg-red-50 text-red-500'}`}>{row.type==='income'?'↑':'↓'}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{row.description}</p>
                        <p className="text-xs text-gray-400">{row.date}{row.category_suggestion&&` · 🏷️ ${row.category_suggestion}`}{row.error&&` · ⚠️ ${row.error}`}</p>
                      </div>
                      <p className={`text-sm font-semibold shrink-0 ${row.type==='income'?'text-green-600':'text-red-500'}`}>{row.type==='income'?'+':'−'} {fmt(row.amount)}</p>
                    </div>
                  ))}
                  {parsed.length > 50 && <p className="text-xs text-gray-400 text-center py-3">+ {parsed.length-50} não exibidas</p>}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('map')} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50">← Voltar</button>
                <button onClick={handleImport} disabled={importing||okRows.length===0}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {importing ? 'Importando…' : `Importar ${okRows.length} transações`}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && result && (
            <div className="space-y-4">
              <div className={`rounded-xl p-6 text-center border ${result.errors===0?'bg-green-50 border-green-100':'bg-amber-50 border-amber-100'}`}>
                <span className="text-4xl block mb-3">{result.errors===0?'✅':'⚠️'}</span>
                <p className="text-lg font-semibold text-gray-800 mb-4">Importação concluída!</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl p-3"><p className="text-xl font-bold text-green-600">{result.imported}</p><p className="text-xs text-gray-400">Importadas</p></div>
                  <div className="bg-white rounded-xl p-3"><p className="text-xl font-bold text-amber-500">{result.duplicates}</p><p className="text-xs text-gray-400">Duplicatas</p></div>
                  <div className="bg-white rounded-xl p-3"><p className="text-xl font-bold text-red-500">{result.errors}</p><p className="text-xs text-gray-400">Erros</p></div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50">Importar outro</button>
                <a href="/dashboard/transacoes" className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 text-center">Ver transações →</a>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── PDF import ── */}
      {tab === 'pdf' && (
        <div className="space-y-4">
          {step !== 'done' && (
            <>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-sm font-medium text-amber-700 mb-1">⚠️ Sobre importação de PDF</p>
                <p className="text-xs text-amber-600">Funciona melhor com PDFs de texto (não escaneados).</p>
              </div>
              <div onClick={() => pdfRef.current?.click()}
                className="border-2 border-dashed border-gray-200 hover:border-indigo-400 rounded-xl p-10 text-center cursor-pointer transition-colors">
                <span className="text-4xl block mb-3">{pdfLoading?'⏳':'📄'}</span>
                <p className="text-sm font-medium text-gray-700">{pdfLoading?'Lendo PDF…':fileName||'Clique para selecionar o PDF'}</p>
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
                      {pdfParsed.map((row,i) => (
                        <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${row.type==='income'?'bg-green-50 text-green-600':'bg-red-50 text-red-500'}`}>{row.type==='income'?'↑':'↓'}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{row.description}</p>
                            <p className="text-xs text-gray-400">{row.date}{row.category_suggestion&&` · 🏷️ ${row.category_suggestion}`}</p>
                          </div>
                          <p className={`text-sm font-semibold shrink-0 ${row.type==='income'?'text-green-600':'text-red-500'}`}>{row.type==='income'?'+':'−'} {fmt(row.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={handlePDFImport} disabled={importing}
                    className="w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {importing?'Importando…':`Importar ${pdfParsed.length} transações`}
                  </button>
                </>
              )}
              {pdfText && pdfParsed.length===0 && !pdfLoading && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                  <p className="text-sm text-amber-700">Nenhuma transação detectada automaticamente.</p>
                  <p className="text-xs text-amber-500 mt-1">O PDF pode estar em formato de imagem ou layout não reconhecido.</p>
                </div>
              )}
            </>
          )}
          {step==='done' && result && (
            <div className="space-y-4">
              <div className={`rounded-xl p-6 text-center border ${result.errors===0?'bg-green-50 border-green-100':'bg-amber-50 border-amber-100'}`}>
                <span className="text-4xl block mb-3">{result.errors===0?'✅':'⚠️'}</span>
                <p className="text-lg font-semibold text-gray-800 mb-4">Importação concluída!</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl p-3"><p className="text-xl font-bold text-green-600">{result.imported}</p><p className="text-xs text-gray-400">Importadas</p></div>
                  <div className="bg-white rounded-xl p-3"><p className="text-xl font-bold text-amber-500">{result.duplicates}</p><p className="text-xs text-gray-400">Duplicatas</p></div>
                  <div className="bg-white rounded-xl p-3"><p className="text-xl font-bold text-red-500">{result.errors}</p><p className="text-xs text-gray-400">Erros</p></div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={reset} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50">Importar outro</button>
                <a href="/dashboard/transacoes" className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 text-center">Ver transações →</a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
