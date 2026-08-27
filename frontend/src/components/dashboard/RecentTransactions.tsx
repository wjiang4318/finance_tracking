'use client'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight } from 'lucide-react'
import { CATEGORY_COLORS } from './CategoryDonut'

// Categories excluded from spending totals, marked with a ↔ indicator on the row.
const TRANSFERS = ['Income', 'Investment', 'Internal Transfers', 'Credit Card Payment']

interface Transaction {
  date: string
  description: string
  amount: number
  category: string
}

interface RecentTransactionsProps {
  transactions: Transaction[]
  loading: boolean
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 animate-pulse">
      <div className="h-3 w-20 rounded bg-gray-100" />
      <div className="flex-1 h-3 rounded bg-gray-100" />
      <div className="h-5 w-20 rounded-full bg-gray-100" />
      <div className="h-3 w-16 rounded bg-gray-100" />
    </div>
  )
}

export default function RecentTransactions({ transactions, loading }: RecentTransactionsProps) {
  const router = useRouter()

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="rounded-2xl border border-gray-100 bg-white p-6"
      >
        <p className="text-[15px] font-semibold text-gray-900 mb-4">Recent transactions</p>
        <div className="divide-y divide-gray-100">
          {[0,1,2,3,4].map(i => <SkeletonRow key={i} />)}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="rounded-2xl border border-gray-100 bg-white p-6"
    >
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-[15px] font-semibold text-gray-900">Recent transactions</p>
        <button
          onClick={() => router.push('/transactions')}
          className="text-xs font-medium text-indigo-600 hover:underline shrink-0"
        >
          View all →
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          No transactions yet — upload a PDF to get started
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {transactions.map((tx, i) => {
            const color = CATEGORY_COLORS[tx.category] ?? '#6b7280'
            const isIncome = tx.category === 'Income'
            const isExpense = !TRANSFERS.includes(tx.category) && tx.amount > 0
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.04, duration: 0.3 }}
                className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-4 sm:py-3"
              >
                {/* Mobile: description + amount on one line, date + category on the next —
                    a single fixed-width row has no room left for the description once a
                    long category name (e.g. "Credit Card Payment") is in play. */}
                <div className="flex items-center justify-between gap-3 sm:hidden">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{tx.description}</span>
                  <span className={`shrink-0 text-sm font-medium tabular-nums ${isIncome ? 'text-emerald-500' : 'text-gray-800'}`}>
                    {isIncome ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:hidden">
                  <span className="shrink-0 text-xs text-gray-400">
                    {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span
                    className="truncate rounded-full px-2 py-0.5 text-xs"
                    style={{ backgroundColor: `${color}18`, color }}
                  >
                    {tx.category}
                  </span>
                  {!isExpense && (
                    <ArrowLeftRight
                      size={11}
                      className="shrink-0 text-gray-500"
                      aria-label="Excluded from spending totals"
                    >
                      <title>Excluded from spending totals — transfer, payment, or income, not new spending</title>
                    </ArrowLeftRight>
                  )}
                </div>

                {/* sm and up: single row, fixed date/amount columns */}
                <span className="hidden w-20 shrink-0 text-xs text-gray-400 sm:inline">
                  {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="hidden min-w-0 flex-1 truncate text-sm text-gray-700 sm:inline">{tx.description}</span>
                <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${color}18`, color }}
                  >
                    {tx.category}
                  </span>
                  {!isExpense && (
                    <ArrowLeftRight
                      size={11}
                      className="text-gray-500 shrink-0"
                      aria-label="Excluded from spending totals"
                    >
                      <title>Excluded from spending totals — transfer, payment, or income, not new spending</title>
                    </ArrowLeftRight>
                  )}
                </div>
                <span className={`hidden w-20 shrink-0 text-right text-sm font-medium tabular-nums sm:inline ${isIncome ? 'text-emerald-500' : 'text-gray-800'}`}>
                  {isIncome ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
