'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Sidebar from '@/components/Sidebar'
import PageBanner from '@/components/PageBanner'
import CategoryDonut, { CATEGORY_COLORS } from '@/components/dashboard/CategoryDonut'
import { sumSpend } from '@/utils/spend'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const QUARTERS: Record<string, number[]> = {
  All: [0,1,2,3,4,5,6,7,8,9,10,11],
  Q1:  [0,1,2],
  Q2:  [3,4,5],
  Q3:  [6,7,8],
  Q4:  [9,10,11],
}

// Categories that count as real spend (excludes transfers) — same definition used
// for "Total Spending" everywhere else in the app (dashboard, Transactions page).
const SPEND_CATEGORIES = [
  'Food & Drink',
  'Groceries',
  'Shopping',
  'Travel',
  'Bills & Utilities',
  'Entertainment',
  'Health and Wellness',
  'Uncategorized',
]


type TxRow = { date: string; amount: number; category: string; type?: string }

type MonthSummary = {
  month: string
  monthIndex: number
  expenses: number
  [cat: string]: string | number
}

// Total spend for a set of months in a given year — used to compute the same-months,
// year-over-year comparison (independent of the currently-selected year's monthData).
function spendForPeriod(txs: TxRow[], year: number, monthIndices: number[]): number {
  return monthIndices.reduce((total, mi) => {
    const key = `${year}-${String(mi + 1).padStart(2, '0')}`
    return total + sumSpend(txs.filter(tx => tx.date.startsWith(key)))
  }, 0)
}

// Month-card grid columns, keyed by how many months the period actually has, so a
// 3-month quarter stretches full width instead of leaving a 4th empty column.
// Static class strings (not interpolated) so Tailwind's JIT scanner picks them up.
const MONTH_GRID_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TrendsPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [allTx, setAllTx]     = useState<TxRow[]>([])
  const [quarter, setQuarter] = useState('All')
  const [year, setYear]       = useState(new Date().getFullYear())

  useEffect(() => {
    async function fetchData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data: rows } = await supabase
        .from('transactions')
        .select('date, amount, category, type')
        .eq('user_id', session.user.id)
        .order('date', { ascending: true })

      setAllTx(rows ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const now          = new Date()
  const monthIndices = QUARTERS[quarter]

  const monthData: MonthSummary[] = monthIndices
    .filter(mi => year < now.getFullYear() || mi <= now.getMonth())
    .map(mi => {
      const key = `${year}-${String(mi + 1).padStart(2, '0')}`
      const txs = allTx.filter(tx => tx.date.startsWith(key))

      const expenses = sumSpend(txs)

      // Per-category net spend, clamped at 0 since a stacked bar can't render a negative
      const cats: Record<string, number> = {}
      for (const cat of SPEND_CATEGORIES) {
        const net = sumSpend(txs.filter(tx => tx.category === cat))
        cats[cat] = Math.max(0, net)
      }

      return {
        month:      MONTH_LABELS[mi],
        monthIndex: mi,
        expenses,
        ...cats,
      }
    })

  // Only render bars for categories that have any activity in the period
  const activeCats = SPEND_CATEGORIES.filter(cat =>
    monthData.some(m => (m[cat] as number) > 0)
  )

  const totalExpenses = monthData.reduce((s, m) => s + m.expenses, 0)

  // Top category for the selected period
  const categoryTotals = SPEND_CATEGORIES.map(cat => ({
    cat,
    total: monthData.reduce((s, m) => s + ((m[cat] as number) ?? 0), 0),
  })).sort((a, b) => b.total - a.total)
  const topCategory = categoryTotals[0]?.total > 0 ? categoryTotals[0].cat : '—'

  // Same category totals, reshaped for the donut — a stacked bar is good at showing
  // trend over time but bad at comparing segment sizes once you're past the baseline
  // (thin slivers near the top are hard to size up against a dominant one below them).
  // The donut answers "what dominated this period" directly instead.
  const donutData = categoryTotals
    .filter(c => c.total > 0)
    .map(c => ({ name: c.cat, value: Math.round(c.total * 100) / 100 }))
  const periodLabel = quarter === 'All' ? `${year}` : `${quarter} ${year}`

  // Same months, one year earlier — for a year-over-year comparison that isn't skewed
  // by comparing a partial current year against a full prior year.
  const includedMonthIndices = monthData.map(m => m.monthIndex)
  const prevYearExpenses = spendForPeriod(allTx, year - 1, includedMonthIndices)
  const vsLastYearPercent = prevYearExpenses > 0
    ? Math.round(((totalExpenses - prevYearExpenses) / prevYearExpenses) * 100)
    : null
  const isOverLastYear = (vsLastYearPercent ?? 0) > 0

  const availableYears = [...new Set(allTx.map(tx => new Date(tx.date).getFullYear()))]
  if (!availableYears.includes(now.getFullYear())) availableYears.push(now.getFullYear())
  availableYears.sort((a, b) => b - a)

  const isEmpty = !loading && monthData.every(m => m.expenses === 0)

  const monthColsClass = MONTH_GRID_COLS[Math.min(Math.max(monthData.length, 1), 4)]

  return (
    <div className="min-h-screen bg-[#f4f4fb]">
      <PageBanner
        eyebrow="Expense Tracker"
        title="Spending Trends"
        right={
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
          >
            {availableYears.map(y => <option key={y} value={y} className="text-gray-900 bg-white">{y}</option>)}
          </select>
        }
      />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0 pt-14 lg:pt-0">
          <div className="px-6 py-6 flex flex-col gap-6">

          {/* Quarter tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {Object.keys(QUARTERS).map(q => (
              <button
                key={q}
                onClick={() => setQuarter(q)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  quarter === q
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Summary totals */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Total Spending</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums text-gray-900">${fmt(totalExpenses)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Top Category</p>
              <p className="text-2xl font-semibold tracking-tight text-gray-900 truncate">{topCategory}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">vs Last Year</p>
              {vsLastYearPercent === null ? (
                <p className="text-2xl font-semibold tracking-tight text-gray-300">—</p>
              ) : (
                <p className={`text-2xl font-semibold tracking-tight tabular-nums ${isOverLastYear ? 'text-red-400' : 'text-emerald-500'}`}>
                  {isOverLastYear ? '+' : ''}{vsLastYearPercent}%
                </p>
              )}
            </div>
          </div>

          {/* Left: spend trend over time. Right: this period's category breakdown. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Monthly</p>
            <p className="text-sm font-semibold text-gray-900 mb-5">Where It Went</p>

            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
              </div>
            ) : isEmpty ? (
              <div className="h-64 flex items-center justify-center text-sm text-gray-400">
                No data for this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={monthData}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  barCategoryGap="30%"
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`}
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(value, name) => [`$${Number(value).toFixed(2)}`, name as string]}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    cursor={{ fill: '#f9fafb' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />

                  {/* Spend categories stacked into one bar per month, so the bar's height
                      matches Total Spending. */}
                  {activeCats.map((cat, i) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="spend"
                      name={cat}
                      fill={CATEGORY_COLORS[cat] ?? '#6b7280'}
                      radius={i === activeCats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={48}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <CategoryDonut data={donutData} total={totalExpenses} loading={loading} monthLabel={periodLabel} />
          </div>

          {/* Month-by-month cards */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Month by month</p>
            {loading ? (
              <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${monthColsClass}`}>
                {monthIndices.slice(0, 4).map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse h-28" />
                ))}
              </div>
            ) : (
              <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${monthColsClass}`}>
                {monthData.map(m => (
                  <div key={m.month} className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-sm font-semibold text-gray-800 mb-2">{m.month} {year}</p>
                    <p className="text-lg font-bold text-gray-900">${m.expenses.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">spent</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pb-4" />
          </div>
        </main>
      </div>
    </div>
  )
}
