'use client'
import { PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'

export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Drink':        '#f97316',
  'Groceries':           '#10b981',
  'Shopping':            '#f59e0b',
  'Travel':              '#06b6d4',
  'Bills & Utilities':   '#6366f1',
  'Entertainment':       '#8b5cf6',
  'Health and Wellness': '#ec4899',
  'Investment':          '#14b8a6',
  'Internal Transfers':  '#64748b',
  'Credit Card Payment': '#94a3b8',
  'Income':              '#22c55e',
  'Uncategorized':       '#d1d5db',
}

interface CategoryDonutProps {
  data: { name: string; value: number }[]
  total: number
  loading: boolean
  monthLabel: string
}

function SkeletonDonut() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse shadow-sm flex flex-col">
      <div className="h-3 w-36 rounded bg-gray-200 mb-6" />
      <div className="flex-1 flex items-center justify-center">
        <div className="w-40 h-40 rounded-full bg-gray-100" />
      </div>
    </div>
  )
}

export default function CategoryDonut({ data, total, loading, monthLabel }: CategoryDonutProps) {
  if (loading) return <SkeletonDonut />

  const isEmpty = data.length === 0 || total === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col"
    >
      <p className="text-xs text-gray-400 mb-1">Spending by Category</p>
      <p className="text-sm font-semibold text-gray-800 mb-4">{monthLabel}</p>

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 text-center px-4">
          No spending in {monthLabel}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={data.map(entry => ({ ...entry, fill: CATEGORY_COLORS[entry.name] ?? '#6b7280' }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#111827' }}
                  formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, '']}
                  position={{ x: 8, y: 4 }}
                  allowEscapeViewBox={{ x: true, y: true }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">${total >= 1000 ? `${(total/1000).toFixed(1)}k` : total.toFixed(2)}</p>
                <p className="text-xs text-gray-400">total</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {data.slice(0, 8).map(entry => (
              <div key={entry.name} className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[entry.name] ?? '#6b7280' }} />
                <span className="text-xs text-gray-500 truncate">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
