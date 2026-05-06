'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Sidebar from '@/components/Sidebar'
import PageBanner from '@/components/PageBanner'
import { CATEGORY_COLORS } from '@/components/dashboard/CategoryDonut'
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

// All outflow categories in stack order (transfers/investments at bottom, spending on top)
const OUTFLOW_CATEGORIES = [
  'Investment',
  'Internal Transfers',
  'Credit Card Payment',
  'Food & Drink',
  'Groceries',
  'Shopping',
  'Travel',
  'Bills & Utilities',
  'Entertainment',
  'Health and Wellness',
  'Uncategorized',
]

type TxRow = { date: string; amount: number; category: string }

type MonthSummary = {
  month: string
  monthIndex: number
  income: number
  expenses: number
  net: number
  [cat: string]: string | number
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
        .select('date, amount, category')
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

      const TRANSFERS = ['Income', 'Investment', 'Internal Transfers', 'Credit Card Payment']
      const income   = txs.filter(tx => tx.category === 'Income' || tx.amount < 0)
                          .reduce((s, tx) => s + Math.abs(tx.amount), 0)
      const expenses = txs.filter(tx => !TRANSFERS.includes(tx.category) && tx.amount > 0)
                          .reduce((s, tx) => s + tx.amount, 0)

      // Per-category outflow amounts (debits only)
      const cats: Record<string, number> = {}
      for (const cat of OUTFLOW_CATEGORIES) {
        cats[cat] = Math.round(
          txs.filter(tx => tx.category === cat && tx.amount > 0)
             .reduce((s, tx) => s + tx.amount, 0) * 100
        ) / 100
      }

      return {
        month:      MONTH_LABELS[mi],
        monthIndex: mi,
        income:     Math.round(income   * 100) / 100,
        expenses:   Math.round(expenses * 100) / 100,
        net:        Math.round((income - expenses) * 100) / 100,
        ...cats,
      }
    })

  // Only render bars for categories that have any activity in the period
  const activeCats = OUTFLOW_CATEGORIES.filter(cat =>
    monthData.some(m => (m[cat] as number) > 0)
  )

  const totalIncome   = monthData.reduce((s, m) => s + m.income,   0)
  const totalExpenses = monthData.reduce((s, m) => s + m.expenses, 0)
  const totalNet      = totalIncome - totalExpenses

  const availableYears = [...new Set(allTx.map(tx => new Date(tx.date).getFullYear()))]
  if (!availableYears.includes(now.getFullYear())) availableYears.push(now.getFullYear())
  availableYears.sort((a, b) => b - a)

  const isEmpty = !loading && monthData.every(m => m.expenses === 0 && m.income === 0)

  return (
    <div className="min-h-screen bg-[#f4f4fb]">
      <PageBanner
        eyebrow="Finance Tracker"
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
        <main className="flex-1">
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
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Total Income</p>
              <p className="text-2xl font-bold text-emerald-600">${fmt(totalIncome)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Total Spending</p>
              <p className="text-2xl font-bold text-gray-900">${fmt(totalExpenses)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Net</p>
              <p className={`text-2xl font-bold ${totalNet >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {totalNet >= 0 ? '+' : '–'}${fmt(Math.abs(totalNet))}
              </p>
            </div>
          </div>

          {/* Income vs stacked outflows chart */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Monthly</p>
            <p className="text-sm font-semibold text-gray-900 mb-5">Income vs Where It Went</p>

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

                  {/* Income — left grouped bar */}
                  <Bar dataKey="income" name="Income" stackId="income" fill="#1e3a5f" radius={[4, 4, 0, 0]} maxBarSize={48} />

                  {/* All outflows — stacked together as one grouped bar (right) */}
                  {activeCats.map((cat, i) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="outflow"
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

          {/* Month-by-month cards */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Month by month</p>
            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {monthIndices.slice(0, 4).map(i => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-28" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {monthData.map(m => (
                  <div key={m.month} className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-800 mb-3">{m.month} {year}</p>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Income</span>
                        <span className="text-emerald-600 font-medium">+${m.income.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Spending</span>
                        <span className="text-gray-800 font-medium">–${m.expenses.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-gray-100 pt-1.5 flex justify-between text-xs">
                        <span className="text-gray-400">Net</span>
                        <span className={`font-semibold ${m.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {m.net >= 0 ? '+' : '–'}${Math.abs(m.net).toFixed(2)}
                        </span>
                      </div>
                    </div>
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
