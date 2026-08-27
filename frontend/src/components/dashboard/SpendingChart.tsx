'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'

interface SpendingChartProps {
  data: { month: string; spend: number }[]
  loading: boolean
}

function SkeletonChart() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 animate-pulse">
      <div className="h-4 w-32 rounded bg-gray-100 mb-6" />
      <div className="h-48 rounded bg-gray-100" />
    </div>
  )
}

export default function SpendingChart({ data, loading }: SpendingChartProps) {
  if (loading) return <SkeletonChart />

  const isEmpty = data.every(d => d.spend === 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="rounded-2xl border border-gray-100 bg-white p-6"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-semibold text-gray-900">Monthly spend</p>
        <p className="text-xs text-gray-400">Last 6 months</p>
      </div>

      {isEmpty ? (
        <div className="h-52 flex items-center justify-center text-sm text-gray-400">
          Upload a statement to see your spending trend
        </div>
      ) : (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={208}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.16} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: '#6b7280' }}
                itemStyle={{ color: '#111827', fontVariantNumeric: 'tabular-nums' }}
                formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Spend']}
              />
              <Area
                type="monotone"
                dataKey="spend"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#spendGradient)"
                dot={false}
                activeDot={{ r: 5, fill: '#6366f1', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}
