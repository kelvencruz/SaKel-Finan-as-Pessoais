'use client'

import { useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'
import type { ReportData } from '@/components/RelatorioFinanceiroPDF'

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

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Alimentação':   ['mercado','supermercado','padaria','restaurante','lanche','ifood','rappi','delivery'],
  'Transporte':    ['uber','cabify','99','combustivel','gasolina','posto','onibus','metro','estacionamento'],
  'Saúde':         ['farmacia','drogaria','medico','clinica','hospital','exame','dentista'],
  'Educação':      ['escola','faculdade','curso','livro','udemy','alura','colegio'],
  'Lazer':         ['netflix','spotify','cinema','teatro','show','steam','playstation'],
  'Moradia':       ['aluguel','condominio','luz','agua','gas','internet','telefone','energia'],
  'Vestuário':     ['roupa','calcado','sapato','tenis','zara','hering','renner'],
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
  const br = clean.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/)
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

// ── Export Tab ────────────────────────────────────────────────────────────────
function ExportTab() {
  const supabase = createClient()
  const now = new Date()
  const [exportYear,    setExportYear]    = useState(now.getFullYear())
  const [exportMonth,   setExportMonth]   = useState(now.getMonth())
  const [exportLoading, setExportLoading] = useState(false)
  const [reportData,    setReportData]    = useState<ReportData | null>(null)
  const [PDFLink,       setPDFLink]       = useState<any>(null)
  const [PDFDoc,        setPDFDoc]        = useState<any>(null)
  const [pdfReady,      setPdfReady]      = useState(false)
  const [kalAvatarSrc,  setKalAvatarSrc]  = useState<string | undefined>(undefined)

  useEffect(() => {
    // Carrega o renderer e o componente PDF
    Promise.all([
      import('@react-pdf/renderer').then(m => m.PDFDownloadLink),
      import('@/components/RelatorioFinanceiroPDF').then(m => m.default),
    ]).then(([link, doc]) => {
      setPDFLink(() => link)
      setPDFDoc(() => doc)
      setPdfReady(true)
    }).catch(() => console.error('Erro ao carregar @react-pdf/renderer'))

    // Carrega o avatar via fetch → ArrayBuffer → base64
    // Mais confiável que import estático para o @react-pdf/renderer
    fetch('/kal-avatar.png')
      .then(res => res.arrayBuffer())
      .then(buffer => {
        const bytes = new Uint8Array(buffer)
        let binary = ''
        bytes.forEach(b => { binary += String.fromCharCode(b) })
        setKalAvatarSrc(`data:image/png;base64,${btoa(binary)}`)
      })
      .catch(() => console.warn('kal-avatar.png não encontrado em /public'))
  }, [])

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  async function handleGenerateReport() {
    setExportLoading(true)
    setReportData(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setExportLoading(false); return }

    const inicioMes = `${exportYear}-${String(exportMonth + 1).padStart(2,'0')}-01`
    const fimMes    = new Date(exportYear, exportMonth + 1, 0).toISOString().split('T')[0]

    const [{ data: txRaw }, { data: accRaw }, { data: catRaw }] = await Promise.all([
      supabase.from('transactions').select('id,type,description,amount,date,account_id,category_id')
        .eq('user_id', user.id).gte('date', inicioMes).lte('date', fimMes).order('date', { ascending: false }),
      supabase.from('accounts').select('id,name,current_balance').eq('user_id', user.id),
      supabase.from('categories').select('id,name').eq('user_id', user.id),
    ])

    const accList = (accRaw ?? []) as { id: string; name: string; current_balance: number }[]
    const catList = (catRaw ?? []) as { id: string; name: string }[]
    const txList  = (txRaw  ?? []) as { id: string; type: string; description: string; amount: number; date: string; account_id: string; category_id: string | null }[]

    const accMap = Object.fromEntries(accList.map(a => [a.id, a]))
    const catMap = Object.fromEntries(catList.map(c => [c.id, c]))

    const transactions = txList.map(t => ({
      date:          t.date,
      description:   t.description,
      amount:        Number(t.amount),
      type:          t.type as 'income' | 'expense' | 'transfer',
      account_name:  accMap[t.account_id]?.name,
      category_name: t.category_id ? catMap[t.category_id]?.name : undefined,
    }))

    const total_income   = txList.filter(t => t.type === 'income').reduce((s,t) => s + Number(t.amount), 0)
    const total_expense  = txList.filter(t => t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0)
    const total_transfer = txList.filter(t => t.type === 'transfer').reduce((s,t) => s + Number(t.amount), 0)

    const catTotals: Record<string, { total: number; count: number }> = {}
    txList.filter(t => t.type === 'expense').forEach(t => {
      const name = t.category_id ? (catMap[t.category_id]?.name ?? 'Outros') : 'Sem categoria'
      if (!catTotals[name]) catTotals[name] = { total: 0, count: 0 }
      catTotals[name].total += Number(t.amount)
      catTotals[name].count++
    })

    setReportData({
      period_label:    `${MONTH_NAMES[exportMonth]} de ${exportYear}`,
      generated_at:    new Date().toLocaleDateString('pt-BR'),
      user_email:      user.email ?? '',
      initial_balance: 0,
      final_balance:   total_income - total_expense,
      total_income,
      total_expense,
      total_transfer,
      categories: Object.entries(catTotals).map(([name, v]) => ({ name, ...v })).sort((a,b) => b.total - a.total),
      accounts:   accList.map(a => ({ name: a.name, balance: Number(a.current_balance) })),
      transactions,
    })
    setExportLoading(false)
  }

  const saldo = reportData ? reportData.total_income - reportData.total_expense : 0

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-2xl p-5 flex gap-4 items-start"
        style={{ background: 'var(--color-brand-light)', border: '1px solid var(--color-brand)20' }}>
        <span className="text-2xl">📊</span>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-brand)' }}>Relatório Financeiro PDF</p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Gera um relatório completo com resumo executivo, insights do Kal, despesas por categoria, saldo por conta e tabela detalhada de transações.
          </p>
        </div>
      </div>

      {/* Seletor de período */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Selecione o período</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Mês</label>
            <select
              value={exportMonth}
              onChange={e => { setExportMonth(Number(e.target.value)); setReportData(null) }}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
            >
              {MONTH_NAMES.map((m,i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Ano</label>
            <select
              value={exportYear}
              onChange={e => { setExportYear(Number(e.target.value)); setReportData(null) }}
              className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
            >
              {Array.from({length:5},(_,i) => now.getFullYear()-i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={handleGenerateReport}
          disabled={exportLoading}
          className="w-full rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'var(--color-brand)', color: '#fff' }}
        >
          {exportLoading ? '⏳ Carregando dados…' : '🔍 Gerar relatório'}
        </button>
      </div>

      {/* Preview + Download */}
      {reportData && (
        <div className="rounded-2xl p-5 space-y-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Prévia — {reportData.period_label}
            </p>
            <span className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)' }}>
              {reportData.transactions.length} transações
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-3 text-center" style={{ background: '#f0fdf4' }}>
              <p className="text-[10px] mb-1" style={{ color: '#6b7280' }}>Receitas</p>
              <p className="text-sm font-bold" style={{ color: '#16a34a' }}>{fmt(reportData.total_income)}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: '#fff1f2' }}>
              <p className="text-[10px] mb-1" style={{ color: '#6b7280' }}>Despesas</p>
              <p className="text-sm font-bold" style={{ color: '#dc2626' }}>{fmt(reportData.total_expense)}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-brand-light)' }}>
              <p className="text-[10px] mb-1" style={{ color: '#6b7280' }}>Saldo</p>
              <p className="text-sm font-bold" style={{ color: saldo >= 0 ? 'var(--color-brand)' : '#dc2626' }}>{fmt(saldo)}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-bg)' }}>
              <p className="text-[10px] mb-1" style={{ color: '#6b7280' }}>Categorias</p>
              <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{reportData.categories.length}</p>
            </div>
          </div>

          {reportData.categories.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
                Top despesas por categoria
              </p>
              <div className="space-y-2">
                {reportData.categories.slice(0,5).map((cat,i) => {
                  const pct = reportData.total_expense > 0 ? (cat.total / reportData.total_expense) * 100 : 0
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs w-28 truncate" style={{ color: 'var(--color-text-secondary)' }}>{cat.name}</span>
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--color-border)' }}>
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--color-brand)' }} />
                      </div>
                      <span className="text-xs font-semibold w-20 text-right" style={{ color: 'var(--color-text-primary)' }}>{fmt(cat.total)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl p-4 flex gap-3 items-start"
            style={{ background: '#f5f3ff', border: '1px solid #ede9fe' }}>
            <span className="text-xl">🦎</span>
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: '#4f46e5' }}>Insights do Kal incluídos no PDF</p>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                Análise automática do período com dicas personalizadas baseadas nos seus dados.
              </p>
            </div>
          </div>

          {/* Botão download — passa kalAvatarSrc como prop */}
          {pdfReady && PDFLink && PDFDoc ? (
            <PDFLink
              document={<PDFDoc data={reportData} kalAvatarSrc={kalAvatarSrc} />}
              fileName={`sakel-relatorio-${MONTH_NAMES[exportMonth].toLowerCase()}-${exportYear}.pdf`}
            >
              {({ loading }: { loading: boolean }) => (
                <button
                  disabled={loading}
                  className="w-full rounded-xl py-3.5 text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: '#16a34a', color: '#fff' }}
                >
                  {loading ? '⏳ Preparando PDF…' : '⬇ Baixar Relatório PDF'}
                </button>
              )}
            </PDFLink>
          ) : (
            <div className="w-full rounded-xl py-3.5 text-sm text-center"
              style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              Carregando gerador de PDF…
            </div>
          )}

          <p className="text-[11px] text-center" style={{ color: 'var(--color-text-muted)' }}>
            🔒 PDF gerado localmente — nenhum dado é enviado para servidores externos.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ImportarPage() {
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [tab,         setTab]         = useState<'csv' | 'export'>('csv')
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
  const [error,       setError]       = useState('')

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  async function loadMeta() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: acc }, { data: cat }] = await Promise.all([
      supabase.from('accounts').select('id,name,current_balance').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('id,name,type').eq('user_id', user.id).order('name'),
    ])
    setAccounts(acc ?? [])
    setCategories(cat ?? [])
    if (acc?.length) setSelectedAcc(acc[0].id)
  }

  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setFileName(file.name); setError('')
    Papa.parse(file, {
      header: true, skipEmptyLines: true, encoding: 'UTF-8',
      complete: (results) => {
        const headers = results.meta.fields ?? []; const rows = results.data as Record<string,string>[]
        if (!headers.length || !rows.length) { setError('CSV vazio ou sem cabeçalho.'); return }
        setRawHeaders(headers); setRawRows(rows)
        const autoMap = { date:'', description:'', amount:'', type:'' }
        headers.forEach(h => {
          const l = h.toLowerCase()
          if (!autoMap.date        && /data|date/.test(l))                   autoMap.date = h
          if (!autoMap.description && /descri|hist|memo|desc/.test(l))       autoMap.description = h
          if (!autoMap.amount      && /valor|amount|value|cred|deb/.test(l)) autoMap.amount = h
          if (!autoMap.type        && /tipo|type/.test(l))                   autoMap.type = h
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
      if (!date)           return { date: row[mapping.date]??'', description:desc, amount:0, type:'expense', status:'error', error:`Linha ${i+2}: data inválida`, original:row }
      if (amount === null) return { date, description:desc, amount:0, type:'expense', status:'error', error:`Linha ${i+2}: valor inválido`, original:row }
      const type: 'income'|'expense' = amount >= 0 ? 'income' : 'expense'
      return { date, description:desc.trim(), amount:Math.abs(amount), type, category_suggestion:suggestCategory(desc), status:'ok', original:row }
    })
    setParsed(rows); setStep('preview')
  }

  async function handleImport() {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/auth/login'; return }
    const { data: existing } = await supabase.from('transactions').select('date,description,amount').eq('user_id', user.id)
    const existingSet = new Set((existing??[]).map((t:any) => `${t.date}|${t.description}|${t.amount}`))
    let imported=0, duplicates=0, errors=0; const toInsert: any[] = []
    for (const row of parsed) {
      if (row.status==='error') { errors++; continue }
      if (existingSet.has(`${row.date}|${row.description}|${row.amount}`)) { duplicates++; continue }
      const cat = categories.find(c => c.name===row.category_suggestion && c.type===row.type)
      toInsert.push({ user_id:user.id, account_id:selectedAcc||null, type:row.type, description:row.description, amount:row.amount, date:row.date, status:'paid', category_id:cat?.id??null })
    }
    for (let i=0; i<toInsert.length; i+=100) {
      const { error } = await supabase.from('transactions').insert(toInsert.slice(i,i+100))
      if (error) errors+=Math.min(100,toInsert.length-i); else imported+=Math.min(100,toInsert.length-i)
    }
    setResult({ imported, duplicates, errors }); setStep('done'); setImporting(false)
  }

  function reset() {
    setStep('upload'); setRawHeaders([]); setRawRows([]); setParsed([])
    setResult(null); setFileName(''); setError('')
    if (fileRef.current) fileRef.current.value=''
  }

  const okRows    = parsed.filter(r => r.status === 'ok')
  const errorRows = parsed.filter(r => r.status === 'error')

  const DoneCard = ({ r }: { r: ImportResult }) => (
    <div className="space-y-4">
      <div className={`rounded-2xl p-6 text-center border ${r.errors===0 ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
        <span className="text-4xl block mb-3">{r.errors===0 ? '✅' : '⚠️'}</span>
        <p className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Importação concluída!</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3" style={{ background: 'var(--color-surface)' }}>
            <p className="text-xl font-bold text-green-600">{r.imported}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Importadas</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--color-surface)' }}>
            <p className="text-xl font-bold text-amber-500">{r.duplicates}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Duplicatas</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--color-surface)' }}>
            <p className="text-xl font-bold text-red-500">{r.errors}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Erros</p>
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={reset}
          className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', background: 'var(--color-surface)' }}>
          Importar outro
        </button>
        <a href="/dashboard/transacoes"
          className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-center transition-colors"
          style={{ background: 'var(--color-brand)', color: '#fff' }}>
          Ver transações →
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-3xl mx-auto" style={{ background: 'var(--color-bg)' }}>

      {/* Cabeçalho */}
      <div className="mb-6">
        <a href="/dashboard" className="text-sm transition-colors"
          style={{ color: 'var(--color-text-muted)' }}>← Dashboard</a>
        <h1 className="text-xl font-semibold mt-2" style={{ color: 'var(--color-text-primary)' }}>
          Importar &amp; Exportar
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          Importe extratos CSV ou exporte relatórios financeiros em PDF
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-1 rounded-2xl w-fit" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {([
          { id: 'csv',    label: 'Importar CSV', emoji: '📊' },
          { id: 'export', label: 'Exportar PDF', emoji: '📤' },
        ] as const).map(t => (
          <button key={t.id}
            onClick={() => { setTab(t.id); reset() }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={tab === t.id
              ? { background: 'var(--color-brand)', color: '#fff', boxShadow: '0 1px 4px rgba(79,70,229,.25)' }
              : { color: 'var(--color-text-muted)', background: 'transparent' }
            }
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* Export */}
      {tab === 'export' && <ExportTab />}

      {/* CSV */}
      {tab === 'csv' && (
        <>
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 flex gap-3 items-start"
                style={{ background: 'var(--color-brand-light)', border: '1px solid var(--color-brand)20' }}>
                <span className="text-xl">💡</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-brand)' }}>Bancos suportados</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Nubank, Itaú, Bradesco, BB, Sicredi, Inter e qualquer banco que exporte CSV com Data, Descrição e Valor.
                  </p>
                </div>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className="rounded-2xl p-10 text-center cursor-pointer transition-all group"
                style={{ border: '2px dashed var(--color-border)', background: 'var(--color-surface)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-brand)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'}
              >
                <span className="text-4xl block mb-3">📊</span>
                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {fileName || 'Clique para selecionar o arquivo CSV'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Arquivos .csv — UTF-8 ou Latin1</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSVFile} className="hidden" />
              </div>

              <div className="rounded-2xl p-4 flex items-center justify-between"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Não sabe o formato?</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Baixe o modelo padrão SaKel</p>
                </div>
                <button
                  onClick={() => {
                    const csv = 'Data,Descricao,Valor\n01/05/2026,Supermercado,-150.50\n02/05/2026,Salario,5000.00'
                    const a = document.createElement('a')
                    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
                    a.download = 'modelo-sakel.csv'; a.click()
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                  style={{ color: 'var(--color-brand)', border: '1px solid var(--color-brand)', background: 'var(--color-brand-light)' }}
                >
                  Baixar modelo
                </button>
              </div>
              {error && <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
            </div>
          )}

          {step === 'map' && (
            <div className="rounded-2xl p-5 space-y-5"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Mapeie as colunas do seu CSV
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[{key:'date',label:'Data *'},{key:'description',label:'Descrição *'},{key:'amount',label:'Valor *'}].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{f.label}</label>
                    <select
                      value={mapping[f.key as keyof typeof mapping] ?? ''}
                      onChange={e => setMapping({...mapping, [f.key]: e.target.value})}
                      className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="">Selecione…</option>
                      {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--color-bg)' }}>
                    <tr>{rawHeaders.slice(0,6).map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>{rawRows.slice(0,3).map((row,i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                      {rawHeaders.slice(0,6).map(h => (
                        <td key={h} className="px-3 py-2 truncate max-w-[120px]" style={{ color: 'var(--color-text-secondary)' }}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3">
                <button onClick={reset}
                  className="flex-1 rounded-xl py-2.5 text-sm font-medium"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', background: 'var(--color-surface)' }}>
                  Cancelar
                </button>
                <button onClick={applyMapping}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                  style={{ background: 'var(--color-brand)', color: '#fff' }}>
                  Pré-visualizar →
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Prontas', value: okRows.length, color: 'var(--color-brand)' },
                  { label: 'Com erro', value: errorRows.length, color: '#dc2626' },
                  { label: 'Total', value: parsed.length, color: 'var(--color-text-primary)' },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl p-4 text-center"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {accounts.length > 0 && (
                <div className="rounded-2xl p-4 flex items-center gap-4"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <p className="text-sm font-medium shrink-0" style={{ color: 'var(--color-text-primary)' }}>Conta destino:</p>
                  <select value={selectedAcc} onChange={e => setSelectedAcc(e.target.value)}
                    className="flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
                    style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
                    <option value="">Sem conta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="px-5 py-3 flex items-center justify-between"
                  style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Pré-visualização</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{okRows.length} válidas</p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {parsed.slice(0,50).map((row,i) => (
                    <div key={i}
                      className="flex items-center gap-3 px-5 py-3"
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        background: row.status==='error' ? '#fff1f2' : 'transparent',
                      }}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${row.type==='income'?'bg-green-50 text-green-600':'bg-red-50 text-red-500'}`}>
                        {row.type==='income'?'↑':'↓'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{row.description}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {row.date}
                          {row.category_suggestion && ` · 🏷️ ${row.category_suggestion}`}
                          {row.error && ` · ⚠️ ${row.error}`}
                        </p>
                      </div>
                      <p className={`text-sm font-semibold shrink-0 ${row.type==='income'?'text-green-600':'text-red-500'}`}>
                        {row.type==='income'?'+':'−'} {fmt(row.amount)}
                      </p>
                    </div>
                  ))}
                  {parsed.length > 50 && (
                    <p className="text-xs text-center py-3" style={{ color: 'var(--color-text-muted)' }}>
                      + {parsed.length-50} não exibidas
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('map')}
                  className="flex-1 rounded-xl py-2.5 text-sm font-medium"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', background: 'var(--color-surface)' }}>
                  ← Voltar
                </button>
                <button onClick={handleImport} disabled={importing || okRows.length === 0}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 transition-all"
                  style={{ background: 'var(--color-brand)', color: '#fff' }}>
                  {importing ? 'Importando…' : `Importar ${okRows.length} transações`}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && result && <DoneCard r={result} />}
        </>
      )}
    </div>
  )
}
