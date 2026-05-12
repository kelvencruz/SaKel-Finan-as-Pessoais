import {
  Document, Page, Text, View, StyleSheet,
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

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: '#ffffff', padding: 40, fontSize: 9, color: '#1a1a2e' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  headerLeft: { flex: 1 },
  logoText: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#4f46e5', letterSpacing: -0.5 },
  logoSub: { fontSize: 8, color: '#9ca3af', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  reportTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111827' },
  reportPeriod: { fontSize: 9, color: '#6b7280', marginTop: 3 },
  reportDate: { fontSize: 8, color: '#9ca3af', marginTop: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 20 },
  cardsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  card: { flex: 1, borderRadius: 8, padding: 12 },
  cardLabel: { fontSize: 7.5, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  cardSub: { fontSize: 7, color: '#9ca3af', marginTop: 3 },
  cardBlue: { backgroundColor: '#eef2ff' },
  cardGreen: { backgroundColor: '#f0fdf4' },
  cardRed: { backgroundColor: '#fff1f2' },
  cardGray: { backgroundColor: '#f9fafb' },
  cardValueBlue: { color: '#4f46e5' },
  cardValueGreen: { color: '#16a34a' },
  cardValueRed: { color: '#dc2626' },
  cardValueGray: { color: '#374151' },
  patrimonio: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 8, padding: 14, marginBottom: 24, borderLeftWidth: 4, borderLeftColor: '#16a34a' },
  patrimonioLabel: { fontSize: 9, color: '#374151', fontFamily: 'Helvetica-Bold' },
  patrimonioSub: { fontSize: 7.5, color: '#6b7280', marginTop: 2 },
  patrimonioValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#16a34a' },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 10 },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  catName: { flex: 1, fontSize: 8.5, color: '#374151' },
  catBar: { width: 80, height: 5, backgroundColor: '#e5e7eb', borderRadius: 99, marginHorizontal: 8 },
  catBarFill: { height: 5, backgroundColor: '#4f46e5', borderRadius: 99 },
  catValue: { width: 60, fontSize: 8.5, color: '#374151', textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  catCount: { width: 30, fontSize: 7.5, color: '#9ca3af', textAlign: 'right' },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  accountName: { fontSize: 8.5, color: '#374151' },
  accountBalance: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#4f46e5' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f9fafb', padding: 8, borderRadius: 4, marginBottom: 2 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  tableRowAlt: { backgroundColor: '#fafafa' },
  colDate: { width: 55 },
  colDesc: { flex: 1 },
  colCat: { width: 70 },
  colAccount: { width: 60 },
  colAmount: { width: 65, textAlign: 'right' },
  cellText: { fontSize: 8, color: '#374151' },
  cellMuted: { fontSize: 7.5, color: '#9ca3af' },
  cellIncome: { fontSize: 8, color: '#16a34a', fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  cellExpense: { fontSize: 8, color: '#dc2626', fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  cellTransfer: { fontSize: 8, color: '#4f46e5', fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8 },
  footerText: { fontSize: 7, color: '#d1d5db' },
  twoCol: { flexDirection: 'row', gap: 20, marginBottom: 24 },
  colHalf: { flex: 1 },
})

const fmt = (v: number) =>
  (v < 0 ? '-' : '') + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export default function RelatorioFinanceiroPDF({ data }: { data: ReportData }) {
  const maxCat = Math.max(...data.categories.map(c => c.total), 1)
  const saldoLiquido = data.total_income - data.total_expense

  return (
    <Document title={`SaKel Finanças — ${data.period_label}`} author="SaKel Finanças">
      {/* Página 1: Resumo */}
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <View style={S.headerLeft}>
            <Text style={S.logoText}>SaKel</Text>
            <Text style={S.logoSub}>Finanças Pessoais</Text>
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
            <Text style={S.cardLabel}>Transações</Text>
            <Text style={[S.cardValue, S.cardValueGray]}>{data.transactions.length}</Text>
            <Text style={S.cardSub}>lançamentos</Text>
          </View>
        </View>

        <View style={[S.patrimonio, saldoLiquido < 0 ? { backgroundColor: '#fff1f2', borderLeftColor: '#dc2626' } : {}]}>
          <View>
            <Text style={S.patrimonioLabel}>Saldo do período</Text>
            <Text style={S.patrimonioSub}>Receitas − Despesas</Text>
          </View>
          <Text style={[S.patrimonioValue, saldoLiquido < 0 ? { color: '#dc2626' } : {}]}>
            {fmt(saldoLiquido)}
          </Text>
        </View>

        <View style={S.twoCol}>
          <View style={S.colHalf}>
            <Text style={S.sectionTitle}>Despesas por Categoria</Text>
            {data.categories.slice(0, 8).map((cat, i) => (
              <View key={i} style={S.catRow}>
                <Text style={S.catName}>{cat.name}</Text>
                <View style={S.catBar}>
                  <View style={[S.catBarFill, { width: `${(cat.total / maxCat) * 100}%` as any }]} />
                </View>
                <Text style={S.catValue}>{fmt(cat.total)}</Text>
                <Text style={S.catCount}>{cat.count}x</Text>
              </View>
            ))}
            {data.categories.length === 0 && <Text style={S.cellMuted}>Nenhuma categoria neste período.</Text>}
          </View>

          <View style={S.colHalf}>
            <Text style={S.sectionTitle}>Saldo por Conta</Text>
            {data.accounts.map((acc, i) => (
              <View key={i} style={S.accountRow}>
                <Text style={S.accountName}>{acc.name}</Text>
                <Text style={[S.accountBalance, acc.balance < 0 ? { color: '#dc2626' } : {}]}>{fmt(acc.balance)}</Text>
              </View>
            ))}
            {data.accounts.length === 0 && <Text style={S.cellMuted}>Nenhuma conta encontrada.</Text>}
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>SaKel Finanças</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>

      {/* Página 2+: Transações */}
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <View style={S.headerLeft}>
            <Text style={S.logoText}>SaKel</Text>
            <Text style={S.logoSub}>Finanças Pessoais</Text>
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
            <Text style={[S.cellText, S.colDesc]} numberOfLines={1}>{tx.description}</Text>
            <Text style={[S.cellMuted, S.colCat]} numberOfLines={1}>{tx.category_name ?? '—'}</Text>
            <Text style={[S.cellMuted, S.colAccount]} numberOfLines={1}>{tx.account_name ?? '—'}</Text>
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
          <Text style={S.footerText}>SaKel Finanças</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
