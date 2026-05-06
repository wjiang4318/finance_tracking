'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'

interface NetAccumulatedChartProps {
  data: { month: string; cumulative: number }[]
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

export default function NetAccumulatedChart({ data, loading }: NetAccumulatedChartProps) {
  if (loading) return <SkeletonChart />

  const isEmpty = data.every(d => d.cumulative === 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <p className="text-xs text-gray-400 mb-1">Net Accumulated</p>
      <p className="text-sm font-semibold text-gray-800 mb-4">Income minus spending</p>

      {isEmpty ? (
        <div className="h-52 flex items-center justify-center text-sm text-gray-400">
          Upload a statement to see your net trend
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={208}>
          <AreaChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
              contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#6b7280' }}
              itemStyle={{ color: '#10b981' }}
              formatter={(v) => [`$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Accumulated']}
            />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#netGradient)"
              dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#10b981' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  )
}
