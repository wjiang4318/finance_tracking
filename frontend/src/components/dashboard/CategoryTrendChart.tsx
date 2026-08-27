'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'
import { CATEGORY_COLORS } from './CategoryDonut'

type MonthCatRow = { month: string; [category: string]: number | string }

interface CategoryTrendChartProps {
  data: MonthCatRow[]
  categories: string[]
  loading: boolean
}

function SkeletonChart() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse shadow-sm">
      <div className="h-3 w-36 rounded bg-gray-200 mb-6" />
      <div className="h-48 rounded bg-gray-100" />
    </div>
  )
}

export default function CategoryTrendChart({ data, categories, loading }: CategoryTrendChartProps) {
  if (loading) return <SkeletonChart />

  const isEmpty = categories.length === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <p className="text-xs text-gray-400 mb-1">Category Trend</p>
      <p className="text-sm font-semibold text-gray-800 mb-4">Spending by category — last 6 months</p>

      {isEmpty ? (
        <div className="h-52 flex items-center justify-center text-sm text-gray-400">
          Upload a statement to see category trends
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={208}>
          <AreaChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              formatter={(v: unknown, name) => [`$${Number(v).toFixed(2)}`, name as string]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {categories.map(cat => (
              <Area
                key={cat}
                type="monotone"
                dataKey={cat}
                name={cat}
                stackId="spend"
                stroke={CATEGORY_COLORS[cat] ?? '#6b7280'}
                fill={CATEGORY_COLORS[cat] ?? '#6b7280'}
                fillOpacity={0.55}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  )
}
