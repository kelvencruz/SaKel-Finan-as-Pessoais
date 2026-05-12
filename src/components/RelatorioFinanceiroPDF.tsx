import {
  Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer'

// ── tipos ─────────────────────────────────────────────────────────────────────
export interface ReportTransaction {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense' | 'transfer'
  category_name?: string
  account_name?: string
}

export interface CategorySummary {
  name: string
  total: number
  count: number
}

export interface AccountSummary {
  name: string
  balance: number
}

export interface ReportData {
  period_label: string
  generated_at: string
  user_email: string
  initial_balance: number
  final_balance: number
  total_income: number
  total_expense: number
  total_transfer: number
  categories: CategorySummary[]
  accounts: AccountSummary[]
  transactions: ReportTransaction[]
}

// ── Insights automáticos do Kal ───────────────────────────────────────────────
function generateKalInsights(data: ReportData): string[] {
  const insights: string[] = []
  const saldo = data.total_income - data.total_expense
  const taxaEconomia = data.total_income > 0 ? (saldo / data.total_income) * 100 : 0

  if (saldo > 0) {
    insights.push(`✦ Você ficou no positivo esse mês! Saldo de ${fmt(saldo)} — taxa de economia de ${taxaEconomia.toFixed(0)}%. Continue assim!`)
  } else if (saldo < 0) {
    insights.push(`✦ Atenção: as despesas superaram as receitas em ${fmt(Math.abs(saldo))} este período. Revise os gastos variáveis.`)
  } else {
    insights.push(`✦ Receitas e despesas empatadas este mês. Tente guardar pelo menos 10% da renda.`)
  }

  if (data.categories.length > 0) {
    const top = data.categories[0]
    const pct = data.total_expense > 0 ? ((top.total / data.total_expense) * 100).toFixed(0) : '0'
    insights.push(`✦ Sua maior despesa foi "${top.name}" com ${fmt(top.total)} (${pct}% do total gasto). Vale avaliar se há espaço para reduzir.`)
  }

  if (data.transactions.length > 50) {
    insights.push(`✦ ${data.transactions.length} lançamentos no período — você tem um ótimo hábito de registrar tudo. Organização é o primeiro passo para a liberdade financeira.`)
  }

  if (taxaEconomia >= 30) {
    insights.push(`✦ Taxa de economia de ${taxaEconomia.toFixed(0)}% — excelente! Considere direcionar esse excedente para investimentos.`)
  }

  if (data.total_income === 0) {
    insights.push(`✦ Nenhuma receita registrada neste período. Lembre-se de lançar seus rendimentos para ter uma visão completa das finanças.`)
  }

  if (data.categories.length >= 5) {
    insights.push(`✦ Você usou ${data.categories.length} categorias diferentes — ótima granularidade para análise dos seus hábitos de consumo.`)
  }

  return insights.slice(0, 4)
}

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: '#ffffff', padding: 40, fontSize: 9, color: '#1a1a2e' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerLeft: { flex: 1 },
  logoText: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#4f46e5', letterSpacing: -0.5 },
  logoSub: { fontSize: 7.5, color: '#9ca3af', marginTop: 2, letterSpacing: 0.5 },
  headerRight: { alignItems: 'flex-end' },
  reportTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' },
  reportPeriod: { fontSize: 9, color: '#6b7280', marginTop: 3 },
  reportDate: { fontSize: 7.5, color: '#9ca3af', marginTop: 2 },

  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 20 },

  cardsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  card: { flex: 1, borderRadius: 10, padding: 12 },
  cardLabel: { fontSize: 7, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6 },
  cardValue: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  cardSub: { fontSize: 6.5, color: '#9ca3af', marginTop: 3 },
  cardBlue:  { backgroundColor: '#eef2ff' },
  cardGreen: { backgroundColor: '#f0fdf4' },
  cardRed:   { backgroundColor: '#fff1f2' },
  cardGray:  { backgroundColor: '#f9fafb' },
  cardValueBlue:  { color: '#4f46e5' },
  cardValueGreen: { color: '#16a34a' },
  cardValueRed:   { color: '#dc2626' },
  cardValueGray:  { color: '#374151' },

  patrimonio: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#16a34a' },
  patrimonioNeg: { backgroundColor: '#fff1f2', borderLeftColor: '#dc2626' },
  patrimonioLabel: { fontSize: 9, color: '#374151', fontFamily: 'Helvetica-Bold' },
  patrimonioSub: { fontSize: 7.5, color: '#6b7280', marginTop: 2 },
  patrimonioValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#16a34a' },
  patrimonioValueNeg: { color: '#dc2626' },

  kalBox: { backgroundColor: '#f5f3ff', borderRadius: 10, padding: 14, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#7c3aed' },
  kalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  kalAvatar: { width: 28, height: 28, marginRight: 8 },
  kalTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#4f46e5' },
  kalBadge: { fontSize: 6.5, color: '#7c3aed', backgroundColor: '#ede9fe', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 99, marginLeft: 6 },
  kalInsight: { fontSize: 8, color: '#4b5563', marginBottom: 5, lineHeight: 1.5 },
  kalInsightLast: { fontSize: 8, color: '#4b5563', marginBottom: 0, lineHeight: 1.5 },

  sectionTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 10 },
  twoCol: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  colHalf: { flex: 1 },

  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  catName: { flex: 1, fontSize: 8, color: '#374151' },
  catBar: { width: 70, height: 4, backgroundColor: '#e5e7eb', borderRadius: 99, marginHorizontal: 6 },
  catBarFill: { height: 4, backgroundColor: '#4f46e5', borderRadius: 99 },
  catValue: { width: 58, fontSize: 8, color: '#374151', textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  catCount: { width: 24, fontSize: 7, color: '#9ca3af', textAlign: 'right' },

  accountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  accountName: { fontSize: 8, color: '#374151' },
  accountBalance: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#4f46e5' },
  accountBalanceNeg: { color: '#dc2626' },

  tableHeader: { flexDirection: 'row', backgroundColor: '#f9fafb', paddingVertical: 7, paddingHorizontal: 8, borderRadius: 4, marginBottom: 2 },
  tableHeaderText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  tableRowAlt: { backgroundColor: '#fafafa' },
  colDate:    { width: 52 },
  colDesc:    { flex: 1 },
  colCat:     { width: 68 },
  colAccount: { width: 58 },
  colAmount:  { width: 65, textAlign: 'right' },
  cellText:    { fontSize: 7.5, color: '#374151' },
  cellMuted:   { fontSize: 7, color: '#9ca3af' },
  cellIncome:   { fontSize: 7.5, color: '#16a34a', fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  cellExpense:  { fontSize: 7.5, color: '#dc2626', fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  cellTransfer: { fontSize: 7.5, color: '#4f46e5', fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  footer: { position: 'absolute', bottom: 28, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 7 },
  footerText: { fontSize: 7, color: '#d1d5db' },
})

const fmt = (v: number) =>
  (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function truncate(str: string, max: number): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

// ── Componente principal ──────────────────────────────────────────────────────
// kalAvatarSrc: string base64 "data:image/png;base64,..." passado via prop
// para evitar problemas de import estático com @react-pdf/renderer
export default function RelatorioFinanceiroPDF({
  data,
  kalAvatarSrc,
}: {
  data: ReportData
  kalAvatarSrc?: string
}) {
  const maxCat = Math.max(...data.categories.map(c => c.total), 1)
  const saldoLiquido = data.total_income - data.total_expense
  const isNeg = saldoLiquido < 0
  const kalInsights = generateKalInsights(data)

  return (
    <Document title={`SaKel Finanças — ${data.period_label}`} author="SaKel Finanças">

      {/* ── Página 1: Resumo ── */}
      <Page size="A4" style={S.page}>

        <View style={S.header}>
          <View style={S.headerLeft}>
            <Text style={S.logoText}>SaKel</Text>
            <Text style={S.logoSub}>FINANÇAS PESSOAIS</Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.reportTitle}>Relatório Financeiro</Text>
            <Text style={S.reportPeriod}>{data.period_label}</Text>
            <Text style={S.reportDate}>Gerado em {data.generated_at} · {data.user_email}</Text>
          </View>
        </View>
        <View style={S.divider} />

        <View style={S.cardsRow}>
          <View style={[S.card, S.cardGreen]}>
            <Text style={S.cardLabel}>Receitas</Text>
            <Text style={[S.cardValue, S.cardValueGreen]}>{fmt(data.total_income)}</Text>
            <Text style={S.cardSub}>entradas no período</Text>
          </View>
          <View style={[S.card, S.cardRed]}>
            <Text style={S.cardLabel}>Despesas</Text>
            <Text style={[S.cardValue, S.cardValueRed]}>{fmt(data.total_expense)}</Text>
            <Text style={S.cardSub}>saídas no período</Text>
          </View>
          <View style={[S.card, S.cardBlue]}>
            <Text style={S.cardLabel}>Transferências</Text>
            <Text style={[S.cardValue, S.cardValueBlue]}>{fmt(data.total_transfer)}</Text>
            <Text style={S.cardSub}>entre contas</Text>
          </View>
          <View style={[S.card, S.cardGray]}>
            <Text style={S.cardLabel}>Lançamentos</Text>
            <Text style={[S.cardValue, S.cardValueGray]}>{data.transactions.length}</Text>
            <Text style={S.cardSub}>transações</Text>
          </View>
        </View>

        <View style={[S.patrimonio, isNeg ? S.patrimonioNeg : {}]}>
          <View>
            <Text style={S.patrimonioLabel}>Saldo do período</Text>
            <Text style={S.patrimonioSub}>Receitas − Despesas</Text>
          </View>
          <Text style={[S.patrimonioValue, isNeg ? S.patrimonioValueNeg : {}]}>
            {fmt(saldoLiquido)}
          </Text>
        </View>

        {/* Kal Insights */}
        <View style={S.kalBox}>
          <View style={S.kalHeader}>
            {kalAvatarSrc
              ? <Image src={kalAvatarSrc} style={S.kalAvatar} />
              : <Text style={{ fontSize: 18, marginRight: 8 }}>🦎</Text>
            }
            <Text style={S.kalTitle}>Insights do Kal</Text>
            <Text style={S.kalBadge}>IA Financeira</Text>
          </View>
          {kalInsights.map((insight, i) => (
            <Text key={i} style={i === kalInsights.length - 1 ? S.kalInsightLast : S.kalInsight}>
              {insight}
            </Text>
          ))}
        </View>

        <View style={S.twoCol}>
          <View style={S.colHalf}>
            <Text style={S.sectionTitle}>Despesas por Categoria</Text>
            {data.categories.slice(0, 8).map((cat, i) => (
              <View key={i} style={S.catRow}>
                <Text style={S.catName}>{truncate(cat.name, 18)}</Text>
                <View style={S.catBar}>
                  <View style={[S.catBarFill, { width: `${(cat.total / maxCat) * 100}%` as any }]} />
                </View>
                <Text style={S.catValue}>{fmt(cat.total)}</Text>
                <Text style={S.catCount}>{cat.count}x</Text>
              </View>
            ))}
            {data.categories.length === 0 && (
              <Text style={S.cellMuted}>Nenhuma categoria neste período.</Text>
            )}
          </View>

          <View style={S.colHalf}>
            <Text style={S.sectionTitle}>Saldo por Conta</Text>
            {data.accounts.map((acc, i) => (
              <View key={i} style={S.accountRow}>
                <Text style={S.accountName}>{truncate(acc.name, 20)}</Text>
                <Text style={[S.accountBalance, acc.balance < 0 ? S.accountBalanceNeg : {}]}>
                  {fmt(acc.balance)}
                </Text>
              </View>
            ))}
            {data.accounts.length === 0 && (
              <Text style={S.cellMuted}>Nenhuma conta encontrada.</Text>
            )}
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>SaKel Finanças · Relatório gerado automaticamente</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>

      {/* ── Página 2+: Transações detalhadas ── */}
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <View style={S.headerLeft}>
            <Text style={S.logoText}>SaKel</Text>
            <Text style={S.logoSub}>FINANÇAS PESSOAIS</Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.reportTitle}>Lançamentos Detalhados</Text>
            <Text style={S.reportPeriod}>{data.period_label}</Text>
          </View>
        </View>
        <View style={S.divider} />

        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colDate]}>Data</Text>
          <Text style={[S.tableHeaderText, S.colDesc]}>Descrição</Text>
          <Text style={[S.tableHeaderText, S.colCat]}>Categoria</Text>
          <Text style={[S.tableHeaderText, S.colAccount]}>Conta</Text>
          <Text style={[S.tableHeaderText, S.colAmount]}>Valor</Text>
        </View>

        {data.transactions.map((tx, i) => (
          <View key={i} style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
            <Text style={[S.cellText, S.colDate]}>{fmtDate(tx.date)}</Text>
            <Text style={[S.cellText, S.colDesc]}>{truncate(tx.description, 34)}</Text>
            <Text style={[S.cellMuted, S.colCat]}>{truncate(tx.category_name ?? '—', 18)}</Text>
            <Text style={[S.cellMuted, S.colAccount]}>{truncate(tx.account_name ?? '—', 14)}</Text>
            <Text style={[
              tx.type === 'income' ? S.cellIncome : tx.type === 'expense' ? S.cellExpense : S.cellTransfer,
              S.colAmount,
            ]}>
              {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{fmt(tx.amount)}
            </Text>
          </View>
        ))}

        {data.transactions.length === 0 && (
          <Text style={[S.cellMuted, { marginTop: 20, textAlign: 'center' }]}>
            Nenhuma transação encontrada neste período.
          </Text>
        )}

        <View style={S.footer} fixed>
          <Text style={S.footerText}>SaKel Finanças · Relatório gerado automaticamente</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>

    </Document>
  )
}
