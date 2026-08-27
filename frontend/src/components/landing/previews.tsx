'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { ArrowLeftRight } from 'lucide-react'
import { CATEGORY_COLORS } from '@/components/dashboard/CategoryDonut'

/**
 * Live previews of the real product surfaces, rendered with the same chart library
 * and category colors the app uses. Figures below are sample data, not real numbers.
 */

const MONTHLY = [
  { month: 'Mar', spend: 2140.55 },
  { month: 'Apr', spend: 1880.20 },
  { month: 'May', spend: 2410.85 },
  { month: 'Jun', spend: 2015.40 },
  { month: 'Jul', spend: 2690.15 },
  { month: 'Aug', spend: 1940.75 },
]

const BREAKDOWN = [
  { name: 'Food & Drink',      value: 668.40 },
  { name: 'Groceries',         value: 452.15 },
  { name: 'Shopping',          value: 361.90 },
  { name: 'Bills & Utilities', value: 248.30 },
  { name: 'Travel',            value: 210.00 },
]

const BREAKDOWN_TOTAL = BREAKDOWN.reduce((s, d) => s + d.value, 0)

/** Six-month spend trend, matching the dashboard's area chart. */
export function SpendPreview() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-semibold text-gray-800">Spending, last six months</p>
        <p className="text-sm tabular-nums text-gray-400">Sample data</p>
      </div>

      <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-gray-900">
        $1,940.75
      </p>
      <p className="mt-1 text-sm text-gray-500">
        August, down 27.9% from July
      </p>

      {/* Fixed height, no flex-1: in a flex column `flex-1` resolves basis to 0 and
          collapses the chart, leaving ResponsiveContainer nothing to measure. */}
      <div className="mt-5 -mx-1 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={MONTHLY} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="landingSpend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.30} />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eceaf5" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              dy={4}
            />
            <YAxis
              domain={[0, 3200]}
              ticks={[0, 800, 1600, 2400, 3200]}
              tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Area
              type="monotone"
              dataKey="spend"
              stroke="#4f46e5"
              strokeWidth={2}
              fill="url(#landingSpend)"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Category split for one month, matching the dashboard's donut. */
export function BreakdownPreview() {
  return (
    <div className="flex h-full flex-col">
      <p className="text-sm font-semibold text-gray-800">Where August went</p>

      <div className="mt-5 flex flex-1 flex-col items-center gap-7 sm:flex-row sm:gap-8">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={BREAKDOWN}
                dataKey="value"
                innerRadius={54}
                outerRadius={78}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {BREAKDOWN.map(d => (
                  <Cell key={d.name} fill={CATEGORY_COLORS[d.name]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg tabular-nums font-semibold tracking-tight text-gray-900">
              ${Math.round(BREAKDOWN_TOTAL).toLocaleString()}
            </span>
            <span className="text-[11px] text-gray-400">5 categories</span>
          </div>
        </div>

        <ul className="flex w-full min-w-0 flex-1 flex-col divide-y divide-gray-100">
          {BREAKDOWN.map(d => (
            <li key={d.name} className="flex items-center gap-3 py-2.5 text-sm">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[d.name] }}
              />
              <span className="min-w-0 flex-1 truncate text-gray-600">{d.name}</span>
              <span className="tabular-nums text-gray-900">${d.value.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const ROWS = [
  { desc: 'Trader Joes',            cat: 'Groceries',          amount: 62.18,  transfer: false, refund: false },
  { desc: 'Uniqlo return',          cat: 'Shopping',           amount: -45.00, transfer: false, refund: true  },
  { desc: 'Transfer to savings',    cat: 'Internal Transfers', amount: 400.00, transfer: true,  refund: false },
  { desc: 'Chase autopay',          cat: 'Credit Card Payment',amount: 812.44, transfer: true,  refund: false },
]

/** Transaction rows showing which ones reach the spending total. */
export function LedgerPreview() {
  return (
    <div className="flex h-full flex-col">
      <p className="text-sm font-semibold text-gray-800">What counts as spending</p>

      <ul className="mt-4 flex flex-col divide-y divide-gray-100">
        {ROWS.map(r => (
          <li key={r.desc} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{r.desc}</span>
            {r.transfer && (
              <ArrowLeftRight
                size={12}
                strokeWidth={1.5}
                className="shrink-0 text-gray-500"
                aria-label="Not counted in spending"
              />
            )}
            <span
              className={`shrink-0 tabular-nums text-xs ${
                r.transfer ? 'text-gray-400 line-through' : r.refund ? 'text-emerald-600' : 'text-gray-900'
              }`}
            >
              {r.refund ? '-' : ''}${Math.abs(r.amount).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-gray-500">
        Moving money between your own accounts is not spending, so it never reaches the
        total. A return subtracts.
      </p>
    </div>
  )
}
